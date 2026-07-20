#!/usr/bin/env python3
"""validate_lib.py — 组件库强约束校验

检查生成组件库是否符合 references/spec.md 的 8 项强约束。

用法：
    python3 validate_lib.py <组件库目录>

退出码：全过 0，有失败 1。
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import extract_root_vars, split_media_blocks, parse_rules  # noqa: E402


# ============================================================
# 校验器
# ============================================================
class LibValidator:
    def __init__(self, lib_dir: str):
        self.dir = Path(lib_dir).resolve()
        self.results: list[tuple[str, bool, str]] = []  # (name, pass, detail)
        self.css_files = list(self.dir.glob("src/*.css"))
        self.js_files = list(self.dir.glob("src/*.js"))
        self.html_files = list(self.dir.glob("examples/*.html"))
        self.css = "\n".join(f.read_text(encoding="utf-8", errors="replace") for f in self.css_files)
        self.js = "\n".join(f.read_text(encoding="utf-8", errors="replace") for f in self.js_files)
        # 加载 manifest（用于 A11y 按需校验：有无 tab/modal）
        mf_path = self.dir / "manifest.json"
        self.manifest = None
        if mf_path.exists():
            try:
                self.manifest = json.loads(mf_path.read_text(encoding="utf-8", errors="replace"))
            except Exception:
                self.manifest = None

    def record(self, name: str, passed: bool, detail: str = ""):
        self.results.append((name, passed, detail))

    # ---------- 1. 命名前缀 ----------
    def check_naming(self):
        issues = []
        # CSS 类名应有 sg- 前缀：只检查规则的主体（最右侧选择器段），
        # 不检查后代/祖先类（如 .sg-modal .member 里的 .member 是数据驱动类，非本库定义）
        # 名单覆盖 UI 组件库常见结构词，agent 写 .card/.btn 等裸类名应被告警
        generic_words = {
            # 原 14 词（视图/容器/导航）
            "tab", "member", "modal", "view", "panel", "avatar", "arrow", "dot",
            "frame", "carousel", "timeline", "story", "detail", "relation",
            # 卡片/按钮/图标/标题类
            "card", "btn", "button", "icon", "title", "subtitle", "kicker", "badge",
            "chip", "tag", "label", "value",
            # 容器/布局类
            "head", "header", "body", "foot", "footer", "content", "overlay",
            "wrap", "wrapper", "container", "grid", "row", "col", "cell", "item",
            "list", "section", "nav", "bar",
            # 媒体类
            "cover", "photo", "img", "image", "thumb", "thumbnail", "video",
            "prev", "next", "close",
        }
        for sel, _ in parse_rules(self.css):
            # 按逗号分组，取每段主体（最后一段联合选择器）
            for part in sel.split(","):
                part = part.strip()
                if not part:
                    continue
                # 取主体：最后一个组合器（空格/>+~）之后的部分
                subject = re.split(r"[\s>+~]+", part)[-1] if part else part
                # 只检查主体里的类
                for cls in re.findall(r"\.([a-z][\w-]*)", subject):
                    if cls.lower() in generic_words:
                        issues.append(f"无前缀类 .{cls}（应改为 .sg-{cls}）")
        # JS 全局对象 window.<X>
        if not re.search(r"global\.\w+\s*=\s*API", self.js) and not re.search(r"window\.\w+\s*=", self.js):
            issues.append("JS 未暴露全局对象 window.<LibName>")
        # DOM id 前缀（认单/双引号）
        for html in self.html_files:
            t = html.read_text(encoding="utf-8", errors="replace")
            for mid in re.findall(r'id=["\']([^"\']+)["\']', t):
                if mid and not mid.startswith("sg-") and mid != "mount":
                    issues.append(f"DOM id '{mid}' 缺 sg- 前缀（{html.name}）")
        self.record("1. 命名前缀", not issues, "；".join(issues[:3]) if issues else "所有类名/id/全局对象均带 sg- 前缀")

    # ---------- 2. CSS 变量归一化 ----------
    def check_vars(self):
        issues = []
        root_vars = extract_root_vars(self.css)
        # 应有 --sg-primary, --sg-ink 等核心变量
        required = ["--sg-primary", "--sg-ink", "--sg-muted", "--sg-line", "--sg-paper"]
        for v in required:
            if v not in root_vars:
                issues.append(f"缺少核心变量 {v}")
        # 不应有未归一化的旧变量名（--primary, --text-main 等）
        legacy_patterns = [r"^--primary$", r"^--text-main$", r"^--bg-white$", r"^--accent-color$"]
        for v in root_vars:
            for pat in legacy_patterns:
                if re.match(pat, v, re.I):
                    issues.append(f"存在未归一化变量 {v}（应映射为 --sg-*）")
        self.record("2. CSS 变量归一化", not issues, "；".join(issues[:3]) if issues else f"{len(root_vars)} 个 --sg-* 变量，核心变量齐全")

    # ---------- 3. 数据分离 ----------
    def check_data_separation(self):
        issues = []
        # 1) JS 中不应硬编码业务 URL（http）
        # 排除注释和模板字符串里的 src 拼接
        for m in re.finditer(r'https?://[^\s"\'`]+', self.js):
            ctx = self.js[max(0, m.start()-30):m.end()+10]
            # 允许：在 .src = 赋值中从 options 取值的模板，或注释
            if "//" in ctx[:30] or "/*" in ctx[:30]:
                continue
            # 检查是否是硬编码（非 w.img / m.img 等变量引用）
            if not re.search(r"[\w.]+\.(img|src)\s*[,;)]", ctx):
                issues.append(f"JS 疑似硬编码 URL: {m.group()[:50]}...")
                if len(issues) >= 5:
                    break
        # 2) examples HTML 的 DOM 不应硬编码业务文案
        # 规范：可变内容（成员/作品/时间线/事实）必须走 <script> options/JSON，
        # 不应直接写在 DOM 可见文本里。剥离所有 <script> 块后检查 DOM 残留。
        # 强业务特征（避免误伤"下一题/成员"等结构性文本，以及品牌名 BLACKPINK）：
        # - 连续 4 位年份（如 2016、2022）：业务时间数据最可靠信号
        # - 长描述段落（≥15 连续中文字符，含具体业务信息）
        # 注：全大写人名易误伤品牌名/缩写，故不查；改靠年份+长描述定位硬编码业务文案
        for html in self.html_files:
            t = html.read_text(encoding="utf-8", errors="replace")
            # 剥离所有 <script>...</script> 块
            dom_only = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", t, flags=re.I)
            # 剥离 HTML 标签，只看可见文本
            dom_text = re.sub(r"<[^>]+>", " ", dom_only)
            dom_text = re.sub(r"\s+", " ", dom_text).strip()
            # 查 4 位年份（排除页脚版权年如 © 2024，只查明显业务年份：带月份或事件上下文）
            # 简化：查 19xx/20xx 年份，但允许单一年份（可能是版权声明），只告警 ≥2 个年份
            # 用前后非数字断言（不用 \b，因中文不是 \w，"2016年" 的 \b 不生效）
            years = re.findall(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", dom_text)
            if len(years) >= 2:
                issues.append(f"{html.name}: DOM 硬编码 {len(years)} 个年份 {years[:3]}（业务时间应走 options）")
            # 查长描述段落（≥15 连续中文，排除纯结构性短语）
            long_descs = re.findall(r"[\u4e00-\u9fff，。、]{15,}", dom_text)
            # 排除常见结构性长文本（如"点击成员卡片查看详情"）
            struct_phrases = {"点击成员卡片查看详情", "请选择一个成员查看详情", "暂无数据"}
            biz_descs = [d for d in long_descs if d not in struct_phrases][:2]
            for d in biz_descs:
                issues.append(f"{html.name}: DOM 硬编码长描述「{d[:20]}...」（应走 options）")
            if len(issues) >= 5:
                break
        self.record("3. 数据分离", not issues, "；".join(issues[:3]) if issues else "JS 无硬编码业务数据，examples HTML 业务文案经 options 传入")

    # ---------- 4. 响应式三档 ----------
    def check_responsive(self):
        issues = []
        media_queries = [q for q, _ in split_media_blocks(self.css)]
        # 解析每个 media query 的 max-width / max-height 数值（px）
        def max_widths(q: str) -> list[float]:
            return [float(m.group(1)) for m in re.finditer(r"max-width\s*:\s*(\d+(?:\.\d+)?)\s*px", q, re.I)]
        def max_heights(q: str) -> list[float]:
            return [float(m.group(1)) for m in re.finditer(r"max-height\s*:\s*(\d+(?:\.\d+)?)\s*px", q, re.I)]
        all_mw = [w for q in media_queries for w in max_widths(q)]
        all_mh = [h for q in media_queries for h in max_heights(q)]
        # WISE 档：max-width ≤ 500
        has_wise = any(w <= 500 for w in all_mw)
        # 极端档：max-width ≤ 320 或 max-height ≤ 380
        has_extreme = any(w <= 320 for w in all_mw) or any(h <= 380 for h in all_mh)
        if not has_wise:
            issues.append("缺少 WISE 断点（max-width ≤ 500px）")
        if not has_extreme:
            issues.append("缺少极端断点（max-width ≤ 320px 或 max-height ≤ 380px）")
        detail = f"含 {len(media_queries)} 个 @media 断点（max-width 值: {sorted(set(all_mw))}）"
        self.record("4. 响应式三档", not issues, "；".join(issues) if issues else detail)

    # ---------- 5. A11y ----------
    def check_a11y(self):
        issues = []
        blob = self.css + "\n" + self.js

        # 从 blob 自身探测结构（不依赖外部 manifest）：
        # 库声明了 tab/modal 结构才强制对应 role，避免对纯展示库误报，
        # 也避免 manifest 缺失时检查被全跳过（gold-standard 库无 manifest）。
        def _has_tab_switch():
            """有 Tab 切换的信号：role=tab/tablist、.sg-tab* 类、JS 里 tablist 关键字。"""
            if re.search(r"role[=:]\s*['\"]?tab(list)?['\"]?", blob):
                return True
            if re.search(r"\.sg-tab[a-z-]*", self.css):
                return True
            if "tablist" in self.js or "tabpanel" in self.js:
                return True
            # manifest 兜底（若有则也采信）
            tabs = (self.manifest or {}).get("structure", {}).get("tabs", [])
            return bool([t for t in tabs if not t.get("more")])

        def _has_modal():
            """有 Modal 的信号：role=dialog、aria-modal、.sg-modal* 类、JS 里 dialog 关键字。"""
            if re.search(r"role[=:]\s*['\"]?dialog['\"]?", blob):
                return True
            if "aria-modal" in blob:
                return True
            if re.search(r"\.sg-modal[a-z-]*", self.css):
                return True
            if "dialog" in self.js:
                return True
            # manifest 兜底
            modals = (self.manifest or {}).get("structure", {}).get("modals", [])
            return bool(modals)

        # tablist/tabpanel 仅在有 tab 切换时强制
        if _has_tab_switch():
            if not re.search(r"role[=:]\s*['\"]tablist['\"]", blob):
                issues.append("缺少 role=tablist")
            if not re.search(r"role[=:]\s*['\"]tabpanel['\"]", blob):
                issues.append("缺少 role=tabpanel")
        # 有 modal 就必须 role=dialog + ESC 关闭
        if _has_modal():
            if not re.search(r"role[=:]\s*['\"]dialog['\"]", blob):
                issues.append("缺少 role=dialog")
            if "Escape" not in self.js:
                issues.append("缺少 ESC 关闭")
        # 任何组件库的基线
        if "aria-live" not in blob:
            issues.append("缺少 aria-live")
        if "aria-label" not in blob:
            issues.append("缺少 aria-label")
        detail_parts = []
        if _has_tab_switch():
            detail_parts.append("tablist/tabpanel")
        if _has_modal():
            detail_parts.append("dialog/ESC")
        detail_parts.extend(["aria-live", "aria-label"])
        self.record("5. A11y", not issues,
                    "；".join(issues[:3]) if issues else
                    f"A11y 达标（按需检查 {'/'.join(detail_parts)}）")

    # ---------- 6. 主题可定制 ----------
    def check_theme(self):
        issues = []
        # 扫描 CSS 中硬编码 #hex，排除：:root{...} 块内、var() fallback、rgba() 内、注释
        # 先定位所有 :root { ... } 块的字符区间（含选择器组 :root, .xx { ... }）
        root_spans = []
        for m in re.finditer(r":root[^{]*\{([^{}]*)\}", self.css):
            root_spans.append((m.start(), m.end()))
        # 逐行扫描，判断该行的 #hex 是否落在 :root 块内
        pos = 0
        for line in self.css.split("\n"):
            line_start = pos
            line_end = pos + len(line)
            pos = line_end + 1  # +1 for \n
            stripped = line.strip()
            if not stripped or stripped.startswith("/*") or stripped.startswith("*"):
                continue
            # 该行是否完全在某个 :root 块内
            in_root = any(rs <= line_start and line_end <= re_ for rs, re_ in root_spans)
            if in_root:
                continue
            for m in re.finditer(r"#[0-9a-fA-F]{3,8}\b", stripped):
                hex_val = m.group()
                # 允许：var(--xxx, #fallback) 形式
                if re.search(r"var\([^)]*,\s*" + re.escape(hex_val), stripped):
                    continue
                issues.append(f"硬编码颜色 {hex_val}（应走变量）: {stripped[:60]}")
                if len(issues) >= 5:
                    break
            if len(issues) >= 5:
                break
        self.record("6. 主题可定制", not issues, "；".join(issues[:3]) if issues else "所有颜色经变量，无硬编码 #hex（:root 与 var fallback 除外）")

    # ---------- 7. 零依赖 ----------
    def check_no_deps(self):
        issues = []
        # HTML 中不应有外部 <script src> 或 <link href=https>
        for html in self.html_files:
            t = html.read_text(encoding="utf-8", errors="replace")
            # 外部 script（排除字体）
            for m in re.finditer(r'<script\s+src="(https?://[^"]+)"', t):
                issues.append(f"{html.name}: 外部脚本 {m.group(1)[:50]}")
            # 外部 CSS（字体 CDN 例外）
            for m in re.finditer(r'<link[^>]+href="(https?://[^"]+)"', t):
                url = m.group(1)
                if "font" not in url.lower() and "googleapis" not in url.lower():
                    issues.append(f"{html.name}: 外部样式 {url[:50]}")
        self.record("7. 零依赖", not issues, "；".join(issues[:3]) if issues else "无外部 JS/CSS 依赖（字体 CDN 除外）")

    # ---------- 8. 文档完备 ----------
    def check_docs(self):
        issues = []
        readme = self.dir / "README.md"
        spec = self.dir / "docs" / "设计规范.md"
        if not readme.exists():
            issues.append("缺少 README.md")
        elif "mount" not in readme.read_text(encoding="utf-8", errors="replace"):
            issues.append("README.md 缺少 API 说明")
        if not spec.exists():
            issues.append("缺少 docs/设计规范.md")
        elif "主题色" not in spec.read_text(encoding="utf-8", errors="replace"):
            issues.append("设计规范.md 缺少主题色章节")
        self.record("8. 文档完备", not issues, "；".join(issues) if issues else "README.md + docs/设计规范.md 齐全")

    # ---------- 运行 ----------
    def run(self) -> int:
        if not self.css_files:
            print(f"ERROR: {self.dir} 下未找到 src/*.css", file=sys.stderr)
            return 1
        if not self.js_files:
            print(f"ERROR: {self.dir} 下未找到 src/*.js", file=sys.stderr)
            return 1
        self.check_naming()
        self.check_vars()
        self.check_data_separation()
        self.check_responsive()
        self.check_a11y()
        self.check_theme()
        self.check_no_deps()
        self.check_docs()
        # 输出
        print(f"校验目标: {self.dir}\n")
        passed = 0
        failed = 0
        for name, ok, detail in self.results:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name}")
            if detail:
                print(f"      {detail}")
            if ok:
                passed += 1
            else:
                failed += 1
        print(f"\n结果: {passed} 通过 / {failed} 失败 / 共 {len(self.results)} 项")
        return 0 if failed == 0 else 1


def main():
    ap = argparse.ArgumentParser(description="组件库强约束校验")
    ap.add_argument("lib_dir", help="组件库目录")
    args = ap.parse_args()
    if not os.path.isdir(args.lib_dir):
        print(f"ERROR: 目录不存在: {args.lib_dir}", file=sys.stderr)
        sys.exit(1)
    v = LibValidator(args.lib_dir)
    sys.exit(v.run())


if __name__ == "__main__":
    main()
