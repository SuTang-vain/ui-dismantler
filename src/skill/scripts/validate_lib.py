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
        generic_words = {"tab", "member", "modal", "view", "panel", "avatar", "arrow", "dot",
                         "frame", "carousel", "timeline", "story", "detail", "relation"}
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
        # JS 中不应硬编码业务 URL（http）
        # 排除注释和模板字符串里的 src 拼接
        for m in re.finditer(r'https?://[^\s"\'`]+', self.js):
            ctx = self.js[max(0, m.start()-30):m.end()+10]
            # 允许：在 .src = 赋值中从 options 取值的模板，或注释
            if "//" in ctx[:30] or "/*" in ctx[:30]:
                continue
            # 检查是否是硬编码（非 w.img / m.img 等变量引用）
            if not re.search(r"[\w.]+\.(img|src)\s*[,;)]", ctx):
                issues.append(f"JS 疑似硬编码 URL: {m.group()[:50]}...")
                if len(issues) >= 3:
                    break
        self.record("3. 数据分离", not issues, "；".join(issues) if issues else "JS 无硬编码业务数据，数据经 options 传入")

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
        structure = (self.manifest or {}).get("structure", {})
        tabs = structure.get("tabs", [])
        modals = structure.get("modals", [])
        has_tab_switch = bool([t for t in tabs if not t.get("more")])
        # tablist/tabpanel 仅在有 tab 切换时强制
        if has_tab_switch:
            if not re.search(r"role[=:]\s*['\"]tablist['\"]", blob):
                issues.append("缺少 role=tablist")
            if not re.search(r"role[=:]\s*['\"]tabpanel['\"]", blob):
                issues.append("缺少 role=tabpanel")
        # 有 modal 就必须 role=dialog + ESC 关闭
        if modals:
            if not re.search(r"role[=:]\s*['\"]dialog['\"]", blob):
                issues.append("缺少 role=dialog")
            if "Escape" not in self.js:
                issues.append("缺少 ESC 关闭")
        # 任何组件库的基线
        if "aria-live" not in blob:
            issues.append("缺少 aria-live")
        if "aria-label" not in blob:
            issues.append("缺少 aria-label")
        self.record("5. A11y", not issues, "；".join(issues[:3]) if issues else "A11y 基线达标（tablist/tabpanel/dialog/aria-live/aria-label/ESC 按需）")

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
