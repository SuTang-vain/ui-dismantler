"""test_aggregation.py — 垂类 manifest 归并与变体提取测试

覆盖:
- merge_manifests: theme 去重 / tabs 并集 / views 去重+类型升级 / modals 去重 /
  data schema / responsive / a11y / warnings / 空输入
- extract_variant: 提取 caseName + theme + data
"""

import os
import sys
import unittest

_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "src")
sys.path.insert(0, os.path.abspath(_SRC))

from ui_dismantler.aggregation.vertical import merge_manifests, extract_variant  # noqa: E402


def _make_manifest(
    case: str = "test",
    tokens: list[dict] | None = None,
    tabs: list[dict] | None = None,
    views: list[dict] | None = None,
    modals: list[dict] | None = None,
    data: dict | None = None,
    warnings: list[str] | None = None,
) -> dict:
    """构造一个最小 manifest 用于测试。"""
    return {
        "meta": {"caseName": case, "title": case},
        "theme": {"tokens": tokens or [], "gradients": []},
        "structure": {"tabs": tabs or [], "views": views or [], "modals": modals or []},
        "data": data or {},
        "responsive": [],
        "a11y": {},
        "warnings": warnings or [],
    }


class TestMergeManifests(unittest.TestCase):
    """merge_manifests: 多案例归并。"""

    def test_empty_input_returns_empty(self):
        """空列表 -> 空字典。"""
        self.assertEqual(merge_manifests([], "test"), {})

    def test_single_manifest_passes_through(self):
        """单个 manifest -> 深拷贝 + vertical 标注。"""
        m = _make_manifest("only", tokens=[{"name": "primary", "value": "#f00"}])
        result = merge_manifests([m], "star-group")
        self.assertEqual(result["meta"]["vertical"], "star-group")
        self.assertEqual(result["meta"]["caseCount"], 1)
        self.assertEqual(len(result["theme"]["tokens"]), 1)

    def test_meta_aggregation(self):
        """meta 记录 vertical + aggregatedFrom + caseCount。"""
        m1 = _make_manifest("caseA")
        m2 = _make_manifest("caseB")
        result = merge_manifests([m1, m2], "star-group")
        self.assertEqual(result["meta"]["vertical"], "star-group")
        self.assertEqual(result["meta"]["caseCount"], 2)
        self.assertEqual(result["meta"]["aggregatedFrom"], ["caseA", "caseB"])

    def test_theme_tokens_dedup_by_name(self):
        """theme.tokens 按 name 去重并集。"""
        m1 = _make_manifest("a", tokens=[{"name": "primary", "value": "#f00"}, {"name": "ink", "value": "#000"}])
        m2 = _make_manifest("b", tokens=[{"name": "primary", "value": "#f00"}, {"name": "accent", "value": "#0f0"}])
        result = merge_manifests([m1, m2], "test")
        names = [t["name"] for t in result["theme"]["tokens"]]
        self.assertEqual(sorted(names), ["accent", "ink", "primary"])

    def test_theme_gradients_dedup_by_selector_value(self):
        """theme.gradients 按 (selector, value) 去重。"""
        m1 = _make_manifest("a")
        m1["theme"]["gradients"] = [
            {"selector": ".card", "value": "linear-gradient(red, blue)"},
            {"selector": ".bg", "value": "linear-gradient(#fff, #eee)"},
        ]
        m2 = _make_manifest("b")
        m2["theme"]["gradients"] = [
            {"selector": ".card", "value": "linear-gradient(red, blue)"},  # 重复
            {"selector": ".overlay", "value": "rgba(0,0,0,0.5)"},
        ]
        result = merge_manifests([m1, m2], "test")
        self.assertEqual(len(result["theme"]["gradients"]), 3)  # card 去重，新增 overlay

    def test_tabs_union_by_id(self):
        """structure.tabs 按 id 去重并集。"""
        m1 = _make_manifest("a", tabs=[{"id": "members", "label": "成员"}, {"id": "timeline", "label": "时间线"}])
        m2 = _make_manifest("b", tabs=[{"id": "members", "label": "成员"}, {"id": "works", "label": "作品"}])
        result = merge_manifests([m1, m2], "test")
        tab_ids = [t["id"] for t in result["structure"]["tabs"]]
        self.assertEqual(sorted(tab_ids), ["members", "timeline", "works"])

    def test_views_dedup_by_tabid(self):
        """structure.views 按 tabId 去重。"""
        m1 = _make_manifest("a", views=[{"id": "v1", "tabId": "members", "type": "member-grid"}])
        m2 = _make_manifest("b", views=[{"id": "v1", "tabId": "members", "type": "member-grid"}])
        result = merge_manifests([m1, m2], "test")
        self.assertEqual(len(result["structure"]["views"]), 1)

    def test_views_type_upgrade_from_generic(self):
        """views 已有 generic 类型时，后续案例的非 generic 类型升级。"""
        m1 = _make_manifest("a", views=[{"id": "v1", "tabId": "t1", "type": "generic"}])
        m2 = _make_manifest("b", views=[{"id": "v1", "tabId": "t1", "type": "member-grid"}])
        result = merge_manifests([m1, m2], "test")
        self.assertEqual(result["structure"]["views"][0]["type"], "member-grid")

    def test_views_generic_without_id_kept_per_case(self):
        """无 tabId/id 的 generic view 各案例独立保留。"""
        m1 = _make_manifest("a", views=[{"type": "generic"}])
        m2 = _make_manifest("b", views=[{"type": "generic"}])
        result = merge_manifests([m1, m2], "test")
        self.assertEqual(len(result["structure"]["views"]), 2)

    def test_modals_dedup_by_layout(self):
        """structure.modals 按 layout 去重。"""
        m1 = _make_manifest("a", modals=[{"layout": "fact-grid"}, {"layout": "image-text"}])
        m2 = _make_manifest("b", modals=[{"layout": "fact-grid"}, {"layout": "relation-list"}])
        result = merge_manifests([m1, m2], "test")
        layouts = [m["layout"] for m in result["structure"]["modals"]]
        self.assertEqual(sorted(layouts), ["fact-grid", "image-text", "relation-list"])

    def test_data_schema_union(self):
        """data 保留 schema 字段名（首案例数据作为底，不合并其他案例数据）。"""
        m1 = _make_manifest("a", data={"members": [{"name": "A"}], "timeline": []})
        m2 = _make_manifest("b", data={"members": [{"name": "B"}], "works": []})
        result = merge_manifests([m1, m2], "test")
        # data 应有 schema 字段
        self.assertIn("members", result["data"])
        self.assertIn("timeline", result["data"])
        self.assertIn("works", result["data"])
        # 保留首案例数据（不合并其他案例的具体数据）
        self.assertEqual(result["data"]["members"], [{"name": "A"}])
        # works 来自第二案例但 setdefault 不覆盖已有字段
        # timeline 是首案例的空数组

    def test_warnings_aggregated_with_source(self):
        """warnings 汇总并标注来源案例。"""
        m1 = _make_manifest("a", warnings=["view x: unknown type"])
        m2 = _make_manifest("b", warnings=["missing resource"])
        result = merge_manifests([m1, m2], "test")
        self.assertEqual(len(result["warnings"]), 2)
        self.assertTrue(any("[a]" in w for w in result["warnings"]))
        self.assertTrue(any("[b]" in w for w in result["warnings"]))

    def test_a11y_or_merge(self):
        """a11y 布尔值取或合并。"""
        m1 = _make_manifest("a")
        m1["a11y"] = {"hasTablist": True, "hasDialog": False}
        m2 = _make_manifest("b")
        m2["a11y"] = {"hasTablist": False, "hasDialog": True}
        result = merge_manifests([m1, m2], "test")
        self.assertTrue(result["a11y"]["hasTablist"])
        self.assertTrue(result["a11y"]["hasDialog"])

    def test_does_not_mutate_input(self):
        """归并不应修改输入 manifest。"""
        m1 = _make_manifest("a", tokens=[{"name": "primary"}])
        original = {"name": "primary"}
        merge_manifests([m1], "test")
        # 输入 manifest 的 tokens 不应被修改
        self.assertEqual(m1["theme"]["tokens"][0], original)


class TestExtractVariant(unittest.TestCase):
    """extract_variant: 从案例 manifest 提取变体配置。"""

    def test_extracts_case_name(self):
        manifest = _make_manifest("my-case")
        variant = extract_variant(manifest)
        self.assertEqual(variant["caseName"], "my-case")

    def test_extracts_theme(self):
        manifest = _make_manifest("a", tokens=[{"name": "primary", "value": "#f00"}])
        manifest["theme"]["gradients"] = [{"selector": ".card", "value": "gradient"}]
        variant = extract_variant(manifest)
        self.assertEqual(len(variant["theme"]["tokens"]), 1)
        self.assertEqual(len(variant["theme"]["gradients"]), 1)

    def test_extracts_data(self):
        manifest = _make_manifest("a", data={"members": [{"name": "X"}], "works": []})
        variant = extract_variant(manifest)
        self.assertEqual(variant["data"]["members"], [{"name": "X"}])
        self.assertEqual(variant["data"]["works"], [])

    def test_empty_manifest(self):
        """空 manifest -> 空 variant（不报错）。"""
        variant = extract_variant({})
        self.assertEqual(variant["caseName"], "")
        self.assertEqual(variant["theme"]["tokens"], [])
        self.assertEqual(variant["data"], {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
