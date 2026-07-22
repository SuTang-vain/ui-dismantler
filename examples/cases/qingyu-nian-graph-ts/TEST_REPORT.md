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
| computed style | 0.9984 |
| pixel diff | 0.2481% |
| visual score | 0.9983 |
| final overall | 0.999 |
| 正式交互场景 | 4/4 PASS |
| runtime errors | 0 |

## 交互场景

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
