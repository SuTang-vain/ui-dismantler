"""Large-page section chunk extraction and optional browser CSS evidence.

The output is an analysis artifact, not a component library. It deliberately
keeps page-plan/inventory separate from each bounded section fragment so a
later agent can analyze or generate one section without reopening the full HTML.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import subprocess
from typing import Any

from bs4 import BeautifulSoup

from ui_dismantler.analysis.sections import build_section_inventory
from ui_dismantler.analysis.strategy import choose_analysis_strategy, inspect_html
from ui_dismantler.paths import PROJECT_ROOT


CDP_PROBE = PROJECT_ROOT / "scripts" / "cdp_css_probe.mjs"


@dataclass(frozen=True)
class ChunkExtractionResult:
    output_dir: Path
    page_plan: dict
    inventory: dict
    cdp_evidence: dict | None

    def to_dict(self) -> dict:
        return {
            "outputDir": str(self.output_dir),
            "pagePlan": self.page_plan,
            "inventory": self.inventory,
            "cdpEvidence": self.cdp_evidence,
        }


def _decode_html(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8", errors="replace")
    for encoding in ("utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _safe_name(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")
    return text or fallback


def _evidence_summary(item: dict | None, default_status: str = "not-requested") -> dict:
    if not item:
        return {"status": default_status, "matchedRuleCount": 0, "matchedSelectors": []}
    if item.get("status") != "ok":
        return {"status": item.get("status", "unavailable"), "matchedRuleCount": 0, "matchedSelectors": []}
    nodes = item.get("nodes", [])
    node = nodes[0] if nodes else {}
    matched = node.get("matchedStyles", {})
    rules = matched.get("matchedRules", [])
    matched_selectors = sorted({
        selector
        for rule in rules
        for selector in rule.get("selectors", [])
        if selector
    })
    sample_summaries = []
    for sample in node.get("samples", [])[:12]:
        sample_summaries.append({
            "node": sample.get("node", {}).get("localName"),
            "class": sample.get("node", {}).get("attributes", {}).get("class"),
            "computedStyle": sample.get("computedStyle", {}),
            "matchedRuleCount": sample.get("matchedRuleCount", 0),
            "matchedSelectors": sample.get("matchedSelectors", [])[:80],
        })
    return {
        "status": "ok",
        "matchedNodeCount": item.get("matchedNodeCount", 0),
        "matchedRuleCount": len(rules),
        "matchedSelectors": matched_selectors[:200],
        "computedStyle": node.get("computedStyle", {}),
        "sampleCount": len(node.get("samples", [])),
        "samples": sample_summaries,
    }


def _run_cdp_probe(
    html_path: Path,
    inventory_path: Path,
    output_path: Path,
    chrome: str | None,
    max_samples: int,
) -> dict:
    command = [
        "node", str(CDP_PROBE), str(html_path),
        "--selectors-file", str(inventory_path),
        "--out", str(output_path),
        "--max-samples", str(max_samples),
    ]
    if chrome:
        command.extend(["--chrome", chrome])
    proc = subprocess.run(command, capture_output=True, text=True)
    if not output_path.exists():
        return {
            "schemaVersion": "1.0",
            "status": "error",
            "comparable": False,
            "error": proc.stderr.strip() or f"CDP probe exit code {proc.returncode}",
        }
    try:
        return json.loads(output_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {
            "schemaVersion": "1.0",
            "status": "error",
            "comparable": False,
            "error": f"CDP 结果 JSON 无效: {exc}",
        }


def extract_section_chunks(
    html_path: str | Path,
    output_dir: str | Path,
    *,
    strategy: str = "auto",
    with_cdp: bool = False,
    chrome: str | None = None,
    max_samples: int = 12,
) -> ChunkExtractionResult:
    """提取 page-plan、inventory、section fragments 和可选 CDP 证据。"""
    html = Path(html_path).resolve()
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    sections_dir = out / "sections"
    sections_dir.mkdir(parents=True, exist_ok=True)

    metrics = inspect_html(html)
    selected = choose_analysis_strategy(metrics, strategy)
    soup = BeautifulSoup(_decode_html(html), "html.parser")
    inventory = build_section_inventory(soup)
    page_plan = {
        "schemaVersion": "1.0",
        "source": str(html),
        "metrics": metrics.to_dict(),
        "strategy": selected.to_dict(),
        "sectionCount": len(inventory),
        "chunkableSectionCount": sum(1 for item in inventory if item.get("chunkable")),
    }
    inventory_doc = {
        "schemaVersion": "1.0",
        "source": str(html),
        "strategy": selected.name,
        "sections": inventory,
    }
    page_plan_path = out / "page-plan.json"
    inventory_path = out / "inventory.json"
    page_plan_path.write_text(json.dumps(page_plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inventory_path.write_text(json.dumps(inventory_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    cdp_evidence = None
    if with_cdp:
        cdp_path = out / "cdp-css-evidence.json"
        cdp_evidence = _run_cdp_probe(html, inventory_path, cdp_path, chrome, max_samples)
    evidence_by_selector = {
        item.get("selector"): item
        for item in (cdp_evidence or {}).get("selectors", [])
        if item.get("selector")
    }
    evidence_default_status = (
        cdp_evidence.get("status", "unavailable")
        if with_cdp and cdp_evidence
        else "not-requested"
    )

    chunk_records = []
    for index, item in enumerate(inventory, start=1):
        record = {
            **item,
            "source": str(html),
            "chunkFile": None,
            "metadataFile": None,
            "cssEvidence": _evidence_summary(
                evidence_by_selector.get(item["selector"]),
                evidence_default_status,
            ),
        }
        if not item.get("chunkable"):
            record["skipReason"] = "页面主骨架只用于上下文锚定，避免与子 section 重复复制"
            chunk_records.append(record)
            continue
        node = soup.select_one(item["selector"])
        if node is None:
            record["status"] = "not-found"
            record["skipReason"] = "inventory selector 未命中静态 HTML"
            chunk_records.append(record)
            continue
        fragment = str(node)
        slug = _safe_name(item["id"], f"section-{index}")
        html_file = sections_dir / f"{index:03d}-{slug}.html"
        metadata_file = sections_dir / f"{index:03d}-{slug}.json"
        html_file.write_text(fragment + "\n", encoding="utf-8")
        record.update({
            "status": "ok",
            "chunkFile": str(html_file.relative_to(out)),
            "metadataFile": str(metadata_file.relative_to(out)),
            "htmlBytes": len(fragment.encode("utf-8")),
        })
        metadata_file.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        chunk_records.append(record)

    inventory_doc["chunks"] = chunk_records
    inventory_path.write_text(json.dumps(inventory_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ChunkExtractionResult(out, page_plan, inventory_doc, cdp_evidence)
