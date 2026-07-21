"""Deterministic section-level component contract inference.

Contracts are evidence-bounded hints for a later generator. They never claim
that an interaction or a visual match is verified; each inference carries a
heuristic evidence list and a verification target.
"""
from __future__ import annotations

from bs4 import BeautifulSoup
import re


def _pascal(value: str, fallback: str = "Section") -> str:
    words = re.findall(r"[A-Za-z0-9]+", value or "")
    return "".join(word[:1].upper() + word[1:] for word in words) or fallback


def _text(node) -> str:
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def _component_name(meta: dict, soup: BeautifulSoup) -> tuple[str, list[str]]:
    haystack = " ".join([
        str(meta.get("id", "")),
        str(meta.get("heading", "")),
        " ".join(meta.get("classes", []) or []),
    ]).lower()
    rules = [
        (("faq", "question", "asked"), "FAQSection"),
        (("tab", "feature", "workflow", "harness", "memory"), "FeatureTabs"),
        (("customer", "story", "stories", "case"), "CustomerStories"),
        (("observability", "metric", "trace", "monitor"), "ObservabilitySection"),
        (("resource", "book", "documentation"), "ResourcesSection"),
        (("cta", "empower", "get-started", "subscribe"), "CTASection"),
        (("footer",), "Footer"),
        (("header", "nav", "navigation"), "Header"),
    ]
    for keywords, name in rules:
        if any(keyword in haystack for keyword in keywords):
            return name, [f"keyword:{keyword}" for keyword in keywords if keyword in haystack]
    return _pascal(meta.get("heading") or meta.get("id"), "ContentSection"), ["fallback:semantic-heading-or-id"]


def _layout_contract(evidence: dict) -> dict:
    computed = evidence.get("computedStyle", {}) if evidence.get("status") == "ok" else {}
    keys = (
        "display", "position", "width", "height", "gap", "grid-template-columns",
        "grid-template-rows", "flex-direction", "align-items", "justify-content",
        "padding-top", "padding-right", "padding-bottom", "padding-left",
        "margin-top", "margin-right", "margin-bottom", "margin-left",
        "background-color", "border-radius", "z-index",
    )
    return {key: computed[key] for key in keys if key in computed}


def _css_tokens(evidence: dict) -> list[str]:
    if evidence.get("status") != "ok":
        return []
    tokens = set(evidence.get("cssCustomProperties", []))
    for value in evidence.get("computedStyle", {}).values():
        tokens.update(re.findall(r"var\((--[A-Za-z0-9_-]+)", str(value)))
    return sorted(tokens)


def _data_contract(soup: BeautifulSoup, component: str) -> dict:
    fields: list[str] = []
    evidence: list[str] = []
    if soup.find(["button"], attrs={"role": "tab"}) or soup.find(attrs={"role": "tablist"}):
        fields.extend(["tabs", "activeTab"])
        evidence.append("dom:tablist-or-tab")
    if soup.find("details") or "FAQ" in component:
        fields.append("faq")
        evidence.append("dom:details-or-faq-component")
    if soup.find("form"):
        fields.append("form")
        evidence.append("dom:form")
    if soup.find("input"):
        fields.append("inputValues")
        evidence.append("dom:input")
    repeated = []
    for tag in ("article", "li", "a"):
        count = len(soup.find_all(tag))
        if count >= 3:
            repeated.append(tag)
    if repeated:
        fields.append("items")
        evidence.append(f"dom:repeated-elements:{','.join(repeated)}")
    return {"fields": list(dict.fromkeys(fields)), "evidence": evidence}


def _interaction_contract(soup: BeautifulSoup, component: str) -> list[dict]:
    interactions: list[dict] = []
    tabs = soup.find_all("button", attrs={"role": "tab"})
    if tabs:
        interactions.append({
            "id": "tab-click",
            "trigger": "click",
            "target": "[role=tab]",
            "status": "candidate",
            "evidence": ["dom:role=tab"],
        })
        interactions.append({
            "id": "tab-keyboard",
            "trigger": "ArrowLeft/ArrowRight",
            "target": "[role=tab]",
            "status": "candidate",
            "evidence": ["dom:role=tab", "a11y:keyboard-navigation-required"],
        })
    if soup.find("details"):
        interactions.append({
            "id": "native-details-toggle",
            "trigger": "summary-click",
            "target": "details",
            "status": "candidate",
            "evidence": ["dom:details-summary"],
        })
    if soup.find("form"):
        interactions.append({
            "id": "form-submit",
            "trigger": "submit",
            "target": "form",
            "status": "candidate",
            "evidence": ["dom:form"],
        })
    if soup.find("input"):
        interactions.append({
            "id": "input-change",
            "trigger": "input/change",
            "target": "input",
            "status": "candidate",
            "evidence": ["dom:input"],
        })
    return interactions


def _a11y_contract(soup: BeautifulSoup) -> dict:
    requirements: list[str] = []
    evidence: list[str] = []
    if soup.find(attrs={"role": "tablist"}) or soup.find("button", attrs={"role": "tab"}):
        requirements.extend(["role=tablist", "role=tab", "role=tabpanel", "aria-selected", "keyboard navigation"])
        evidence.append("dom:tab-roles")
    if soup.find("details"):
        requirements.append("summary remains keyboard accessible")
        evidence.append("dom:details")
    if soup.find("form") or soup.find("input"):
        requirements.append("label-or-aria-label-for-inputs")
        evidence.append("dom:form-or-input")
    if soup.find(attrs={"role": "dialog"}):
        requirements.extend(["role=dialog", "Escape close"])
        evidence.append("dom:dialog")
    return {"requirements": list(dict.fromkeys(requirements)), "evidence": evidence}


def infer_component_contract(meta: dict, fragment_html: str, css_evidence: dict | None = None) -> dict:
    """从 section HTML 与 CDP 摘要推导一个可审查的组件契约。"""
    soup = BeautifulSoup(fragment_html, "html.parser")
    component, component_evidence = _component_name(meta, soup)
    evidence = css_evidence or {"status": "not-requested"}
    data = _data_contract(soup, component)
    interactions = _interaction_contract(soup, component)
    a11y = _a11y_contract(soup)
    text_chars = len(_text(soup))
    verification = ["section-selector-visible", "text-preservation", "computed-style-snapshot"]
    if interactions:
        verification.append("interaction-assertions-before-promotion")
    return {
        "component": component,
        "confidence": "heuristic",
        "evidence": component_evidence,
        "props": {
            "required": data["fields"],
            "optional": ["className", "styleTokens"],
        },
        "dataContract": data,
        "layout": _layout_contract(evidence),
        "cssTokens": _css_tokens(evidence),
        "matchedSelectors": evidence.get("matchedSelectors", [])[:120],
        "interactions": interactions,
        "a11y": a11y,
        "verification": verification,
        "textChars": text_chars,
    }
