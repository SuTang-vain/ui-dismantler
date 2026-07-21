"""One-command component-library delivery verification.

The delivery gate combines artifact generation, strict library validation, JS
syntax, runtime roundtrip and optional interaction coverage. It also records
stage timings so quality regressions and slowdowns are visible together.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
from time import perf_counter

from ui_dismantler.generation.showcase import generate_showcase
from ui_dismantler.validation.library import LibValidator
from ui_dismantler.evaluation.roundtrip import (
    compute_interaction_coverage,
    evaluate_scenario_matrix,
    load_manifest_interactions,
    load_scenario_matrix,
    render_generated_dom,
    resolve_reference_dom,
    score_comparison,
)


def _timed(timings: dict[str, int], name: str, fn):
    started = perf_counter()
    try:
        return fn()
    finally:
        timings[name] = round((perf_counter() - started) * 1000)


def verify_delivery(
    html_path: Path,
    lib_dir: Path,
    example_path: Path,
    *,
    scenarios_path: Path | None = None,
    manifest_path: Path | None = None,
    overall_threshold: float = 0.98,
    state_threshold: float = 0.85,
    coverage_threshold: float | None = None,
    class_coverage_threshold: float | None = None,
    width: int = 1024,
    height: int = 768,
    generate_showcase_artifact: bool = True,
    baseline_report: Path | None = None,
    max_score_drop: float = 0.0,
    max_time_ratio: float = 1.5,
) -> dict:
    html_path = Path(html_path).resolve()
    lib_dir = Path(lib_dir).resolve()
    example_path = Path(example_path)
    if not example_path.is_absolute():
        example_path = lib_dir / example_path
    example_path = example_path.resolve()
    timings: dict[str, int] = {}
    errors: list[str] = []

    if generate_showcase_artifact:
        def write_showcase():
            output = generate_showcase(lib_dir)
            (lib_dir / "showcase.html").write_text(output, encoding="utf-8")
            return len(output)
        showcase_bytes = _timed(timings, "showcase", write_showcase)
    else:
        showcase_bytes = (lib_dir / "showcase.html").stat().st_size if (lib_dir / "showcase.html").exists() else 0

    validator = LibValidator(lib_dir, require_showcase=True, quality_profile="gold")
    validation_results = _timed(timings, "validate", validator.evaluate)
    validation_passed = all(ok for _, ok, _ in validation_results)

    def check_js():
        results = []
        for js_file in sorted((lib_dir / "src").glob("*.js")):
            proc = subprocess.run(
                ["node", "--check", str(js_file)],
                capture_output=True,
                text=True,
            )
            results.append({
                "file": str(js_file),
                "passed": proc.returncode == 0,
                "error": proc.stderr.strip(),
            })
        return results
    js_results = _timed(timings, "nodeCheck", check_js)
    js_passed = bool(js_results) and all(item["passed"] for item in js_results)

    ref = _timed(
        timings,
        "reference",
        lambda: resolve_reference_dom(html_path, mode="rendered", width=width, height=height),
    )
    got = _timed(
        timings,
        "libraryRender",
        lambda: render_generated_dom(lib_dir, width=width, height=height, example=example_path),
    )
    template_path = lib_dir / "examples" / "template.html"
    if template_path.is_file():
        template_render = _timed(
            timings,
            "templateRender",
            lambda: render_generated_dom(lib_dir, width=width, height=height, example=template_path),
        )
    else:
        template_render = {"ok": False, "error": "examples/template.html missing"}
    template_passed = bool(template_render.get("ok") and template_render.get("childCount", 0) > 0)
    if not template_passed:
        errors.append(template_render.get("error") or "template.html did not mount a visible component root")
    if ref.get("ok") and got.get("ok"):
        initial = score_comparison(ref, got)
    else:
        initial = {
            "structure": {"error": ref.get("error") or got.get("error")},
            "text": {"text_match_rate": 0.0},
            "scores": {"structure": 0.0, "text": 0.0, "overall": 0.0},
        }
        errors.append(ref.get("error") or got.get("error") or "render failed")

    scenarios = load_scenario_matrix(scenarios_path) if scenarios_path else []
    scenario_matrix = None
    if scenarios_path:
        scenario_matrix = _timed(
            timings,
            "scenarios",
            lambda: evaluate_scenario_matrix(
                html_path,
                lib_dir,
                scenarios_path,
                scenarios,
                width,
                height,
                state_threshold,
                example=example_path,
            ),
        )

    interaction_coverage = None
    if manifest_path:
        manifest_interactions = load_manifest_interactions(manifest_path)
        interaction_coverage = compute_interaction_coverage(
            manifest_interactions,
            scenarios,
            scenario_matrix=scenario_matrix,
        )
        if coverage_threshold is not None:
            interaction_coverage["threshold"] = coverage_threshold
            interaction_coverage["gateMetric"] = "verifiedCoverage.rate"
            interaction_coverage["passed"] = (
                interaction_coverage["verifiedCoverage"]["rate"] >= coverage_threshold
            )

    scenario_passed = (
        scenario_matrix is None
        or scenario_matrix.get("passed") == scenario_matrix.get("total")
    )
    coverage_passed = (
        coverage_threshold is None
        or bool(interaction_coverage and interaction_coverage.get("passed"))
    )
    class_coverage = initial.get("class_coverage")
    class_coverage_passed = (
        class_coverage_threshold is None
        or bool(
            class_coverage
            and float(class_coverage.get("rate", 0.0)) >= class_coverage_threshold
        )
    )
    if class_coverage is not None:
        class_coverage = dict(class_coverage)
        class_coverage["threshold"] = class_coverage_threshold
        class_coverage["passed"] = class_coverage_passed
        initial["class_coverage"] = class_coverage
    score_passed = initial["scores"]["overall"] >= overall_threshold
    total_ms = sum(timings.values())
    regression = {"compared": False, "passed": True}
    if baseline_report:
        baseline_path = Path(baseline_report).resolve()
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        baseline_scores = baseline.get("scores", {})
        score_checks = {}
        score_regression_passed = True
        for metric in ("structure", "text", "overall"):
            previous = float(baseline_scores.get(metric, 0.0))
            current = float(initial["scores"].get(metric, 0.0))
            delta = round(current - previous, 3)
            metric_passed = delta >= -max_score_drop
            score_regression_passed = score_regression_passed and metric_passed
            score_checks[metric] = {
                "baseline": previous,
                "current": current,
                "delta": delta,
                "passed": metric_passed,
            }
        baseline_total = float(baseline.get("timingsMs", {}).get("total", 0.0))
        time_limit = baseline_total * max_time_ratio if baseline_total > 0 else None
        time_passed = time_limit is None or total_ms <= time_limit
        regression = {
            "compared": True,
            "baseline": str(baseline_path),
            "maxScoreDrop": max_score_drop,
            "maxTimeRatio": max_time_ratio,
            "scores": score_checks,
            "timing": {
                "baselineMs": baseline_total,
                "currentMs": total_ms,
                "limitMs": round(time_limit) if time_limit is not None else None,
                "passed": time_passed,
            },
            "passed": score_regression_passed and time_passed,
        }

    passed = (
        validation_passed
        and js_passed
        and template_passed
        and score_passed
        and scenario_passed
        and coverage_passed
        and class_coverage_passed
        and regression["passed"]
    )
    return {
        "schemaVersion": "1.0",
        "passed": passed,
        "inputs": {
            "html": str(html_path),
            "lib": str(lib_dir),
            "example": str(example_path),
            "scenarios": str(scenarios_path) if scenarios_path else None,
            "manifest": str(manifest_path) if manifest_path else None,
            "viewport": {"width": width, "height": height},
        },
        "thresholds": {
            "overall": overall_threshold,
            "state": state_threshold,
            "coverage": coverage_threshold,
            "classCoverage": class_coverage_threshold,
        },
        "timingsMs": {**timings, "total": total_ms},
        "showcaseBytes": showcase_bytes,
        "validation": {
            "passed": validation_passed,
            "results": [
                {"name": name, "passed": ok, "detail": detail}
                for name, ok, detail in validation_results
            ],
        },
        "nodeCheck": {"passed": js_passed, "results": js_results},
        "renderOk": bool(ref.get("ok") and got.get("ok")),
        "templateRender": {"passed": template_passed, **template_render},
        **initial,
        "scenarioMatrix": scenario_matrix,
        "interactionCoverage": interaction_coverage,
        "regression": regression,
        "errors": errors,
    }
