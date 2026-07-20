# 交互状态矩阵协议

Roundtrip 的初始 DOM 对比只能证明页面在首次渲染时相似。交互状态矩阵用于对称执行同一组用户操作，验证原页面与组件库在 Tab、Dialog、表单和响应式状态下仍保持等价。

## 执行模型

每个场景都从全新的原页面实例和组件库实例开始：

```text
原页面 fresh instance  ──相同场景──▶ reference state
组件库 fresh instance  ──相同场景──▶ library state
                                   ↓
                        assertions + DOM/text score
```

场景之间不共享 DOM、定时器、输入值或选中状态，避免顺序依赖。

## JSON 格式

```json
{
  "schemaVersion": "1.0",
  "scenarios": [
    {
      "id": "open-dialog",
      "label": "Open dialog",
      "viewport": { "width": 390, "height": 844 },
      "steps": [
        {
          "action": "click",
          "target": {
            "reference": ".open-dialog",
            "library": ".sg-open-dialog"
          }
        }
      ],
      "assertions": [
        {
          "target": {
            "reference": ".dialog-overlay",
            "library": ".sg-dialog-overlay"
          },
          "visible": true,
          "classIncludes": ["open"]
        }
      ]
    }
  ]
}
```

## Actions

| action | 必填字段 | 行为 |
|---|---|---|
| `click` | `target` | 调用命中元素的 `click()` |
| `input` | `target`, `value` | 设置 value，派发 `input` 与 `change` |
| `key` | `key`，`target` 可选 | 向目标或 document 派发 keydown/keyup |
| `wait` | `ms` | 等待 0–5000ms |

协议不支持任意 JavaScript 或 `evaluate`，确保场景文件没有代码执行能力。

## Assertions

每个场景至少需要一条 assertion，先证明目标状态确实发生，再进行 DOM/文本评分。可组合：

- `visible`
- `text`
- `textContains`
- `value`
- `focused`
- `classIncludes`
- `classExcludes`
- `attributes`

动作成功但 assertion 失败时，该状态记为执行失败，综合分为 0，不允许“两侧都没响应”得到高分。

## Selector 映射

原页面与组件库可使用不同 selector：

```json
{
  "reference": ".tab[data-panel='details']",
  "library": ".sg-tab[data-panel='details']"
}
```

如果两侧 selector 相同，可直接使用字符串或 `default`。

## CLI

```bash
python3 scripts/roundtrip.py original.html \
  --lib component-lib \
  --reference-mode rendered \
  --scenarios scenarios.json \
  --state-threshold 0.85
```

只要任一场景执行失败或低于门槛，报告仍会写出，但命令退出码为 `1`。协议、资源或渲染流程错误使用退出码 `2`。

批量验证需要明确单案例：

```bash
python3 scripts/verify_all.py \
  --case case-name \
  --lib-dir component-lib \
  --scenarios scenarios.json
```

## 边界

这是通用行为等价性验证，不是 DesignRepair 的质量 finding 或修复场景。场景只描述确定性用户操作和状态断言，不包含设计规范、缺陷判断或自动修复逻辑。
