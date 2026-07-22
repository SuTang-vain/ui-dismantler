# 庆余年人物关系与剧情脉络 TypeScript 拆分测试报告

## 输入

原始目录：`/Users/tangyaoyue/Downloads/超绝最稳版本-《庆余年》人物图谱与剧情脉络-（人物关系图谱）-1`

测试副本：`examples/cases/qingyu-nian-graph-ts/original.html`

## 拆分内容

- 人物关系图谱；
- SVG 关系边和关系标签；
- 人物节点与人物详情面板；
- 关系图谱/作品推荐主 Tab；
- 同系列/同题材/同主演/同作者分类 Tab；
- 作品推荐分页；
- 响应式媒体查询；
- 本地图片资源；
- `edges` 业务数据通过 `mount(options.edges)` 可覆盖。

## 最终质量结果

| 门禁 | 结果 |
|---|---:|
| validate | 10/10 PASS |
| node --check | PASS |
| DOM structure | 1.000 |
| text | 1.000 |
| DOM overall | 1.000 |
| selector coverage | 1.000 |
| computed style（四视口最差） | 0.9871 |
| pixel diff（四视口最差） | 0.0000% |
| visual score（四视口最差） | 0.9929 |
| final overall | 0.9957 |
| 正式交互场景 | 4/4 PASS |
| 可验证交互覆盖 | 6/6（100%，2 个分页指纹显式 waiver） |
| runtime errors | 0 |
| 多视口矩阵 | 4/4 PASS |
| 关键交互状态矩阵 | 1/1 PASS |
| 关键交互最差视口 | mobile |
| 交互后 computed style | 0.9872 |
| 交互后 visual score | 0.9930 |
| 最差视口 | mobile |

## 多视口质量矩阵

- Desktop：`1024×768`；
- Tablet portrait：`768×1024`；
- Mobile：`390×844`；
- Extreme mobile：`320×568`。

四个视口均执行 selector coverage、computed style、pixel diff 和 runtime error 检查；最终 visual score 采用最差视口结果，而不是平均值。桌面截图继续位于 `artifacts/`，其他视口位于 `artifacts/tablet/`、`artifacts/mobile/` 和 `artifacts/tiny/`。

## 关键交互状态多视口验证

场景 `open-character-panel` 已标记为 `critical`，在 Desktop、Tablet portrait、Mobile、Extreme mobile 四个视口中分别执行原页面与组件库交互，然后比较交互后的 DOM、computed style 和 screenshot。

- 关键状态矩阵：`1/1 PASS`；
- 最差视口：`mobile`；
- 交互后 computed style：`0.9872`；
- 交互后 pixel diff：`0%`；
- 交互截图：`artifacts/scenarios/open-character-panel/`。

## 交互场景

分页按钮在基线数据规模下处于隐藏状态，`#worksPrev` 和 `#worksNext` 以明确原因登记为 coverage waiver，不计入当前可验证交互分母。


- 打开庆帝人物详情；
- 关闭人物详情；
- 切换到作品推荐；
- 切换作品推荐分类到同题材。

## 中间问题及修复

1. `images/` 资源目录最初未被转译工具识别，已扩展为同时支持 `image/` 和 `images/`。
2. 生成器最初硬编码刘浩存文件名和全局 API，已改为显式 `GlobalName` 和 `fileStem`。
3. `family/friend/enemy` 同时是业务枚举和 CSS modifier，不能全局加 `sg-` 前缀；已保留业务枚举值并同步 CSS modifier。
4. `const edges` 已改为 `mount(options.edges)` 可覆盖的数据入口。
5. 场景协议增加 reference/library 双分支 class assertion，支持原页面与组件库类名前缀不同的状态断言。
