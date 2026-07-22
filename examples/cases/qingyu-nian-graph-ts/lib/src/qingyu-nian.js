/* Parser-backed decomposition from original.html. */
(function(global){
  'use strict';
  var TEMPLATE = `<div id="sg-app-container">
      <div class="sg-main">
        <!-- 视图 1：关系图谱 -->
        <div class="sg-view sg-active" data-view="graph" role="tabpanel" id="sg-view-graph">
          <div class="sg-graph-wrap" id="sg-graphWrap">
            <div class="sg-graph-legend">
              <div class="sg-legend-item">
                <svg class="sg-lg-svg family" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>血缘
              </div>
              <div class="sg-legend-item">
                <svg class="sg-lg-svg romance" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>情感
              </div>
              <div class="sg-legend-item">
                <svg class="sg-lg-svg master" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>师徒
              </div>
              <div class="sg-legend-item">
                <svg class="sg-lg-svg friend" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>盟友
              </div>
              <div class="sg-legend-item">
                <svg class="sg-lg-svg enemy" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>对立
              </div>
            </div>
            <div class="sg-graph-canvas" id="sg-graphCanvas">
              <svg class="sg-edges" id="sg-graphEdges"></svg>
            </div>
            <!-- 角色详情：右侧面板 -->
            <div class="sg-char-panel" id="sg-charPanel">
              <button class="sg-close" id="sg-charClose" title="关闭">×</button>
              <div class="sg-char-head">
                <div class="sg-avt" id="sg-cAvt"></div>
                <div class="sg-char-head-info">
                  <div class="sg-p-name" id="sg-cName"></div>
                  <div class="sg-p-actor" id="sg-cActor"></div>
                </div>
              </div>
              <div class="sg-p-section-title" id="sg-cRelTitle">与主角的关系</div>
              <div class="sg-p-rel-tags" id="sg-cRelTags"></div>
              <div class="sg-p-section-title" id="sg-cDescTitle">人物简介</div>
              <div class="sg-p-desc" id="sg-cDesc"></div>
            </div>
          </div>
        </div>

        <!-- 视图 3：作品推荐 -->
        <div class="sg-view" data-view="works" role="tabpanel" id="sg-view-works">
          <div class="sg-works-wrap">
            <div class="sg-works-head">
              <div class="sg-works-tabs" id="sg-worksTabs" role="tablist">
                <button class="sg-works-tab sg-active" data-cat="series" role="tab">
                  同系列
                </button>
                <button class="sg-works-tab" data-cat="theme" role="tab">同题材</button>
                <button class="sg-works-tab" data-cat="cast" role="tab">同主演</button>
                <button class="sg-works-tab" data-cat="ip" role="tab">同作者</button>
              </div>
              <div class="sg-works-pager">
                <button class="sg-works-btn" id="sg-worksPrev">← 上一页</button>
                <span class="sg-works-pageinfo" id="sg-worksPageInfo">1/1</span>
                <button class="sg-works-btn" id="sg-worksNext">下一页 →</button>
              </div>
            </div>
            <div class="sg-works-viewport">
              <div class="sg-works-grid" id="sg-worksGrid"></div>
              <div class="sg-works-scroll-hint" id="sg-worksScrollHint" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 5l7 7-7 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Tabs -->
      <div class="sg-tabs" role="tablist">
        <button class="sg-tab-btn sg-active" data-tab="graph" role="tab" aria-controls="sg-view-graph" aria-selected="true">关系图谱</button>
        <button class="sg-tab-btn" data-tab="works" role="tab" aria-controls="sg-view-works" aria-selected="false">作品推荐</button>
      </div>
    </div>`;
  function mount(root, options) {
    if (!root) throw new Error('mount root is required');

    root.innerHTML = TEMPLATE;

          /* ========= 数据 ========= */
          const IMG = "../assets/";
          const chars = {
            fanxian: {
              name: "范闲",
              actor: "张若昀 饰",
              img: IMG + "角色_范闲.webp",
              hero: true,
              big: true,
              desc: "穿越至南庆的现代人。表面为户部尚书范建之子，实为叶轻眉之子。以监察院提司身份周旋于皇权、长公主与二皇子势力之间。",
            },
            qingdi: {
              name: "庆帝",
              actor: "陈道明 饰",
              img: IMG + "角色_庆帝.webp",
              big: true,
              desc: "南庆开国之君，深不可测。既是范闲生父（隐秘线），也是叶轻眉之死的最终推手。以帝王之术布局天下。",
            },
            fanjian: {
              name: "范建",
              actor: "高曙光 饰",
              img: IMG + "角色_范建.webp",
              desc: "户部尚书，范闲名义上的父亲。为叶轻眉挚友，暗中守护范闲。",
            },
            chenpingping: {
              name: "陈萍萍",
              actor: "吴刚 饰",
              img: IMG + "角色_陈萍萍.webp",
              desc: "监察院院长，坐轮椅的黑衣人。叶轻眉旧部，多年隐忍布局，是范闲最重要的靠山。",
            },
            feijie: {
              name: "费介",
              actor: "刘桦 饰",
              img: IMG + "角色_费介.webp",
              desc: "监察院三处提司，毒理宗师。范闲的启蒙师父，教其用毒与暗器技艺。",
            },
            wuzhu: {
              name: "五竹",
              actor: "佟梦实 饰",
              img: IMG + "角色_五竹.webp",
              desc: "蒙眼客，神秘刺客。叶轻眉留给范闲的守护者，绝对武力值天花板。",
            },
            linwan: {
              name: "林婉儿",
              actor: "李沁 饰",
              img: IMG + "角色_林婉儿.webp",
              desc: "鸡腿姑娘，长公主之女，范闲挚爱与妻子。夹在母亲与丈夫的斗争之间。",
            },
            changgong: {
              name: "长公主",
              actor: "李小冉 饰",
              img: IMG + "角色_长公主.webp",
              desc: "李云睿，庆帝之妹。掌控内库多年，与二皇子结盟，是范闲入京后最主要的对手。",
            },
            li2: {
              name: "二皇子",
              actor: "刘端端 饰",
              img: IMG + "角色_二皇子.webp",
              desc: "李承泽，风流才子式反派。表面温和，暗中与长公主合谋争位。",
            },
            li3: {
              name: "太子",
              actor: "张昊唯 饰",
              img: IMG + "角色_太子.webp",
              desc: "李承乾，庆帝长子。看似占据储位却常被架空。",
            },
            yeqingmei: {
              name: "叶轻眉",
              actor: "袁泉 饰",
              img: IMG + "角色_叶轻眉.webp",
              desc: "范闲生母，来自更高文明的先驱者。留下神庙与内库遗产，其死是全剧核心因果起点。",
            },
            haitang: {
              name: "海棠朵朵",
              actor: "辛芷蕾 饰",
              img: IMG + "角色_海棠朵朵.webp",
              desc: "北齐圣女，天一道弟子。与范闲相识于出使北齐，是知己式的红颜。",
            },
            xiaoen: {
              name: "肖恩",
              actor: "于荣光 饰",
              img: IMG + "剧情_06_肖恩临终.webp",
              desc: "北齐暗线关键人物，背负旧年恩怨与秘密。他临终吐露的真相，成为范闲逼近叶轻眉旧案的关键一环。",
            },
            yanbingyun: {
              name: "言冰云",
              actor: "肖战 饰",
              img: IMG + "角色_言冰云.webp",
              desc: "监察院四处提司，冷静聪慧。与范闲共同处理南北谍战事宜。",
            },
          };

          function detectHeroKey() {
            const entries = Object.entries(chars);
            return (
              entries.find(([, c]) => c.hero)?.[0] ||
              entries.find(([, c]) => c.big)?.[0] ||
              entries[0]?.[0] ||
              ""
            );
          }
          const HERO = detectHeroKey();
          const RELN = {
            family: "血缘",
            romance: "情感",
            master: "师徒",
            friend: "盟友",
            enemy: "对立",
          };
          var edges = (options && options.edges) || [
            { a: "qingdi", b: "fanxian", type: "family", label: "生父·隐线" },
            { a: "fanjian", b: "fanxian", type: "family", label: "名父" },
            { a: "yeqingmei", b: "fanxian", type: "family", label: "生母" },
            { a: "yeqingmei", b: "qingdi", type: "enemy", label: "旧怨" },
            { a: "chenpingping", b: "yeqingmei", type: "friend", label: "旧部" },
            { a: "chenpingping", b: "fanxian", type: "friend", label: "扶持" },
            { a: "feijie", b: "fanxian", type: "master", label: "师徒" },
            { a: "wuzhu", b: "fanxian", type: "friend", label: "守护" },
            { a: "linwan", b: "fanxian", type: "romance", label: "夫妻" },
            { a: "changgong", b: "linwan", type: "family", label: "母女" },
            { a: "changgong", b: "fanxian", type: "enemy", label: "政敌" },
            { a: "changgong", b: "li2", type: "friend", label: "结盟" },
            { a: "li2", b: "fanxian", type: "enemy", label: "对峙" },
            { a: "li3", b: "fanxian", type: "enemy", label: "对立" },
            { a: "li3", b: "li2", type: "enemy", label: "储位" },
            { a: "haitang", b: "fanxian", type: "friend", label: "知己" },
            { a: "yanbingyun", b: "fanxian", type: "friend", label: "挚友" },
            { a: "fanjian", b: "yeqingmei", type: "friend", label: "挚友" },
          ];

          /* 与主角的直接关系标签（用于右侧面板） */
          const heroRel = {
            qingdi: { type: "family", text: "生父（隐线）" },
            fanjian: { type: "family", text: "名义之父" },
            yeqingmei: { type: "family", text: "生母" },
            chenpingping: { type: "friend", text: "最重要的靠山" },
            feijie: { type: "master", text: "启蒙师父" },
            wuzhu: { type: "friend", text: "守护者" },
            linwan: { type: "romance", text: "挚爱 · 妻子" },
            changgong: { type: "enemy", text: "头号政敌" },
            li2: { type: "enemy", text: "夺位对手" },
            li3: { type: "enemy", text: "储位相关" },
            haitang: { type: "friend", text: "红颜知己" },
            xiaoen: { type: "friend", text: "北齐旧案关键证人" },
            yanbingyun: { type: "friend", text: "挚友 · 同僚" },
          };

          function shortRelationLabel(edge) {
            const raw = (edge.label || heroRel[edge.a === HERO ? edge.b : edge.a]?.text || RELN[edge.type] || "关系")
              .replace(/[·\s（）()]/g, "")
              .replace(/隐线/g, "")
              .replace(/关键证人/g, "证人")
              .replace(/头号/g, "");
            return raw.slice(0, Math.min(4, Math.max(2, raw.length)));
          }
          function edgeColor(type) {
            return {
              family: "var(--sg-red)",
              romance: "var(--sg-pink)",
              master: "var(--sg-gold)",
              friend: "var(--sg-green)",
              enemy: "var(--sg-text-main)",
            }[type] || "var(--sg-primary)";
          }
          function isHeroEdge(edge) {
            return edge.a === HERO || edge.b === HERO;
          }

          function normalizeRelationType(type) {
            return RELN[type] ? type : "friend";
          }
          function completeEdges(baseEdges) {
            const seen = new Set();
            const completed = [];
            (baseEdges || []).forEach((edge) => {
              if (!edge || !chars[edge.a] || !chars[edge.b] || edge.a === edge.b) return;
              const edgeKey = [edge.a, edge.b].sort().join("::");
              if (seen.has(edgeKey)) return;
              seen.add(edgeKey);
              completed.push({
                ...edge,
                type: normalizeRelationType(edge.type),
                label: edge.label || RELN[normalizeRelationType(edge.type)],
              });
            });
            Object.entries(heroRel || {}).forEach(([key, rel]) => {
              if (!chars[key] || key === HERO) return;
              const edgeKey = [HERO, key].sort().join("::");
              if (seen.has(edgeKey)) return;
              seen.add(edgeKey);
              const type = normalizeRelationType(rel.type);
              completed.push({
                a: HERO,
                b: key,
                type,
                label: rel.text || RELN[type] || "关系",
                auto: true,
              });
            });
            return completed;
          }
          const graphEdgesData = completeEdges(edges);

          /* 作品推荐：四类 tab，统一字段 { n 名称, m 主演, r 推荐理由, cover, ep?, up? } */
          const works = {
            series: [
              {
                n: "庆余年 第一季",
                m: "张若昀 / 李沁 / 陈道明",
                r: "范闲入京 · 权谋开篇",
                cover: "季_第一季.webp",
                ep: "46集",
              },
              {
                n: "庆余年 第二季",
                m: "张若昀 / 李沁 / 吴刚",
                r: "鉴查院风云 · 三方对峙",
                cover: "季_第二季.webp",
                ep: "36集",
              },
              {
                n: "庆余年 第三季",
                m: "原班人马",
                r: "神庙终局 · 待续大结局",
                cover: "季_第三季.webp",
                up: true,
                ep: "待播",
              },
            ],
            theme: [
              {
                n: "琅琊榜",
                m: "胡歌 / 刘涛 / 王凯",
                r: "权谋回归 · 复仇布局",
                cover: "推荐_琅琊榜.webp",
              },
              {
                n: "鹤唳华亭",
                m: "罗晋 / 李一桐",
                r: "储位之争与父子博弈",
                cover: "推荐_鹤唳华亭.webp",
              },
              {
                n: "雪中悍刀行",
                m: "张若昀 / 李庚希",
                r: "同主演的架空古装",
                cover: "推荐_雪中悍刀行.webp",
              },
              {
                n: "知否知否",
                m: "赵丽颖 / 冯绍峰",
                r: "家宅权谋交织朝堂",
                cover: "推荐_知否知否.webp",
              },
            ],
            cast: [
              {
                n: "雪中悍刀行",
                m: "张若昀 / 李庚希",
                r: "延续硬核古装侠气",
                cover: "推荐_雪中悍刀行_张若昀.webp",
              },
              {
                n: "警察荣誉",
                m: "张若昀 / 白鹿",
                r: "张若昀刑侦反差戏路",
                cover: "推荐_警察荣誉.webp",
              },
              {
                n: "狼殿下",
                m: "李沁 / 王大陆",
                r: "林婉儿演员古装奇幻",
                cover: "推荐_狼殿下.webp",
              },
              {
                n: "流金岁月",
                m: "李沁 / 刘诗诗",
                r: "李沁都市情感戏路",
                cover: "推荐_流金岁月.webp",
              },
            ],
            ip: [
              {
                n: "将夜",
                m: "陈飞宇 / 宋伊人",
                r: "猫腻改编 · 少年成长",
                cover: "推荐_将夜.webp",
              },
              {
                n: "择天记",
                m: "鹿晗 / 古力娜扎",
                r: "猫腻改编 · 修行权谋",
                cover: "推荐_择天记.webp",
              },
            ],
          };
          /* =========================================================
             视图 1：关系图谱 —— 放射式布局 + 可拖动 + 摆动
             ========================================================= */
          const graphWrap = document.getElementById("sg-graphWrap");
          const graphCanvas = document.getElementById("sg-graphCanvas");
          const graphEdges = document.getElementById("sg-graphEdges");

          /* ===== 真实视口适配：移动端只按 window.innerWidth <= 768 判断 ===== */
          const MOBILE_BREAKPOINT = 768;
          let viewportKey = "";
          function isMobileViewport() {
            return window.innerWidth <= MOBILE_BREAKPOINT;
          }
          function isSmallCanvas() {
            return isMobileViewport();
          }
          function getViewportKey() {
            const w = window.innerWidth;
            if (w <= MOBILE_BREAKPOINT) return "mobile";
            if (w <= 900) return "tablet";
            return "desktop";
          }
          function syncViewport() {
            const h = Math.round(
              (window.visualViewport && window.visualViewport.height) ||
                window.innerHeight ||
                document.documentElement.clientHeight ||
                0,
            );
            document.documentElement.style.setProperty(
              "--sg-app-height",
              Math.max(320, h) + "px",
            );
            viewportKey = getViewportKey();
            document.documentElement.dataset.viewport = viewportKey;
            document.body.dataset.viewport = viewportKey;
          }
          syncViewport();

          const nodeState = {};
          let bounds = { w: 0, h: 0 };

          /* 母模板硬规则：主角永远位于“图例横条下方到图谱底部”的有效区域中心。 */
          const TEMPLATE_LAYOUT_RULES = Object.freeze({
            heroCenterMode: "legend-bottom-to-graph-bottom",
            maxLegendTopRatio: 0.45,
            heroVerticalRatio: 0.5,
          });

          /* 母模板级稳定布局：主角锁定中心，配角按屏幕边框自动分散。 */
          const layoutRel = {
            fanxian: [0.5, 0.5], // 仅为当前内容参考；主角实际位置会被 getHeroCenter 强制覆盖
            // 这些坐标只作为非主角的轻微方向参考；运行时会由边框槽位算法纠偏
            wuzhu: [0.4, 0.08],
            linwan: [0.62, 0.06],
            chenpingping: [0.22, 0.1],
            yeqingmei: [0.05, 0.24],
            fanjian: [0.03, 0.66],
            qingdi: [0.16, 0.82],
            changgong: [0.94, 0.16],
            li2: [0.8, 0.45],
            li3: [0.95, 0.8],
            feijie: [0.34, 0.92],
            yanbingyun: [0.55, 0.94],
            haitang: [0.74, 0.86],
          };

          const RELATION_WEIGHT = {
            family: 0,
            romance: 1,
            master: 2,
            friend: 3,
            enemy: 4,
          };
          function relationRank(key) {
            const rel = heroRel[key]?.type;
            if (rel && RELATION_WEIGHT[rel] !== undefined) return RELATION_WEIGHT[rel];
            const edge = graphEdgesData.find((e) =>
              e.a === HERO ? e.b === key : e.b === HERO && e.a === key,
            );
            return edge && RELATION_WEIGHT[edge.type] !== undefined
              ? RELATION_WEIGHT[edge.type]
              : 9;
          }
          function isUsableRelPoint(point) {
            return (
              Array.isArray(point) &&
              point.length >= 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1])
            );
          }
          function getHeroCenter(w, h, legendClearY) {
            const top = Math.max(
              0,
              Math.min(h * TEMPLATE_LAYOUT_RULES.maxLegendTopRatio, legendClearY || 0),
            );
            return [
              w / 2,
              top + (h - top) * TEMPLATE_LAYOUT_RULES.heroVerticalRatio,
            ];
          }
          function createPeripheralLayout(keys, w, h, ext, isMobile, legendClearY) {
            const heroPos = getHeroCenter(w, h, legendClearY);
            const roleKeys = keys
              .filter((k) => k !== HERO)
              .sort((a, b) => relationRank(a) - relationRank(b) || a.localeCompare(b));
            if (!roleKeys.length) return { [HERO]: heroPos };
            const tinyCanvas = w <= 340 || h <= 400;
            const maxHalfW = Math.max(
              ...roleKeys.map((k) => ext[k]?.[0] || 40),
              tinyCanvas ? 24 : 40,
            );
            const maxHalfH = Math.max(
              ...roleKeys.map((k) => ext[k]?.[1] || 40),
              tinyCanvas ? 26 : 40,
            );
            const edgeGap = tinyCanvas ? 2 : isMobile ? 6 : 18;
            const left = maxHalfW + edgeGap;
            const right = Math.max(w - maxHalfW - edgeGap, left + 40);
            const top = Math.max(maxHalfH + edgeGap, legendClearY + maxHalfH + 4);
            const bottom = Math.max(h - maxHalfH - edgeGap, top + 40);
            const path = [
              [left, top],
              [right, top],
              [right, bottom],
              [left, bottom],
            ];
            const segments = path.map((p, i) => {
              const q = path[(i + 1) % path.length];
              return { from: p, to: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
            });
            const totalLen = segments.reduce((sum, s) => sum + s.len, 0) || 1;
            const startOffset = totalLen * (isMobile ? 0.03 : 0.06);
            const layout = { [HERO]: heroPos };
            roleKeys.forEach((key, index) => {
              let d = (startOffset + (totalLen * index) / roleKeys.length) % totalLen;
              let seg = segments[0];
              for (const candidate of segments) {
                if (d <= candidate.len) {
                  seg = candidate;
                  break;
                }
                d -= candidate.len;
              }
              const t = seg.len ? d / seg.len : 0;
              let x = seg.from[0] + (seg.to[0] - seg.from[0]) * t;
              let y = seg.from[1] + (seg.to[1] - seg.from[1]) * t;
              const rel = isUsableRelPoint(layoutRel[key]) ? layoutRel[key] : [0.5, 0.5];
              const outwardX = x - heroPos[0];
              const outwardY = y - heroPos[1];
              const dist = Math.hypot(outwardX, outwardY) || 1;
              const bias = Math.min(tinyCanvas ? 3 : isMobile ? 8 : 18, dist * 0.06);
              const relBias = tinyCanvas ? 2 : isMobile ? 5 : 12;
              x += (outwardX / dist) * bias + (rel[0] - 0.5) * relBias;
              y += (outwardY / dist) * bias + (rel[1] - 0.5) * relBias;
              layout[key] = [x, y];
            });
            return layout;
          }

          function measure() {
            const rect = graphWrap.getBoundingClientRect();
            const panel = graphWrap.querySelector(".sg-char-panel");
            const panelW =
              graphWrap.classList.contains("sg-panel-open") && !isMobileViewport() && panel
                ? panel.getBoundingClientRect().width
                : 0;
            bounds = {
              w: Math.max(rect.width - panelW, 120),
              h: Math.max(rect.height, 120),
            };
          }

          /* 根据当前画布尺寸计算像素坐标（画布让位收窄时自动压缩到左侧） */
          function computeLayout() {
            measure();
            const isMobile = isSmallCanvas();
            // 移动端用画布真实尺寸（floor 更小），避免小屏被强行拉到 320 导致右侧/底部节点溢出裁切
            const w = Math.max(bounds.w, isMobile ? 200 : 320);
            const h = Math.max(bounds.h, isMobile ? 200 : 320);
            const roleCount = Math.max(0, Object.keys(chars).length - 1);
            const denseGraph = roleCount >= 10 || isMobile;
            const crowdedGraph = roleCount >= 14 || (isMobile && (w < 390 || h < 520));
            graphWrap.classList.toggle("sg-dense-graph", denseGraph);
            graphWrap.classList.toggle("sg-crowded-graph", crowdedGraph);
            // 图例大致占用的矩形（左上角），落入其中的节点下移避让
            const legendRight = 400;
            const legendBottom = 58;
            let layout = {};

            // 防遮挡：尺寸估算读取 CSS 变量，保证布局计算与实际头像等比一致。
            const graphStyle = getComputedStyle(graphWrap);
            const cssPx = (name, fallback) =>
              parseFloat(graphStyle.getPropertyValue(name)) || fallback;
            const av = cssPx("--sg-avatar-size", 82);
            const avBig = cssPx("--sg-avatar-big-size", 104);
            const heroScale = cssPx("--sg-hero-scale", 1.1);
            const nameF = isMobile && w <= 400 && h <= 420 ? 9.5 : isMobile && w <= 400 ? 10 : isMobile ? 11 : 13;
            const ext = {};
            Object.keys(chars).forEach((k) => {
              const c = chars[k];
              const aw = k === HERO ? avBig * heroScale : c.big ? avBig : av;
              const nameW = c.name.length * nameF * 0.92 + 12;
              const halfW = Math.max(aw, nameW) / 2;
              const nameH = nameF * 1.2 + 6;
              const halfH = (aw + 4 + nameH) / 2;
              ext[k] = [halfW, halfH];
            });
            // 额外留白：拥挤布局下收紧碰撞边距，避免节点被推回中心区域。
            const marginX = crowdedGraph ? 4 : denseGraph ? 7 : 10;
            const marginY = crowdedGraph ? 6 : denseGraph ? 9 : 14;
            // 顶部图例实际底部（画布坐标）：主角中心从图例下方有效区域开始计算。
            let legendClearY = 0;
            const legendEl = document.querySelector(".sg-graph-legend");
            if (legendEl && getComputedStyle(legendEl).display !== "none") {
              const lr = legendEl.getBoundingClientRect();
              const cr = graphCanvas.getBoundingClientRect();
              if (lr.height > 0)
                legendClearY = Math.max(0, lr.bottom - cr.top) + 12;
            }
            layout = createPeripheralLayout(
              Object.keys(chars),
              w,
              h,
              ext,
              isMobile,
              legendClearY,
            );
            const keys = Object.keys(layout);
            const lockHero = () => {
              if (layout[HERO]) layout[HERO] = getHeroCenter(w, h, legendClearY);
            };
            lockHero();
            const clamp = (k) => {
              if (k === HERO) {
                lockHero();
                return;
              }
              layout[k][0] = Math.max(
                ext[k][0] + 2,
                Math.min(w - ext[k][0] - 2, layout[k][0]),
              );
              const yMin = Math.max(ext[k][1] + 4, legendClearY + ext[k][1]);
              layout[k][1] = Math.max(
                yMin,
                Math.min(h - ext[k][1] - 4, layout[k][1]),
              );
            };
            for (let it = 0; it < 80; it++) {
              let moved = false;
              for (let i = 0; i < keys.length; i++) {
                for (let j = i + 1; j < keys.length; j++) {
                  const a = keys[i],
                    b = keys[j];
                  const dx = layout[b][0] - layout[a][0];
                  const dy = layout[b][1] - layout[a][1];
                  const ox = ext[a][0] + ext[b][0] + marginX - Math.abs(dx);
                  const oy = ext[a][1] + ext[b][1] + marginY - Math.abs(dy);
                  if (ox > 0 && oy > 0) {
                    moved = true;
                    const heroA = a === HERO;
                    const heroB = b === HERO;
                    if (ox <= oy) {
                      const s = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
                      const p = ox * s;
                      if (heroA) layout[b][0] += p;
                      else if (heroB) layout[a][0] -= p;
                      else {
                        layout[a][0] -= p / 2;
                        layout[b][0] += p / 2;
                      }
                    } else {
                      const s = dy === 0 ? 1 : Math.sign(dy);
                      const p = oy * s;
                      if (heroA) layout[b][1] += p;
                      else if (heroB) layout[a][1] -= p;
                      else {
                        layout[a][1] -= p / 2;
                        layout[b][1] += p / 2;
                      }
                    }
                    clamp(a);
                    clamp(b);
                    lockHero();
                  }
                }
              }
              if (!moved) break;
            }
            // 收边 + PC 端图例避让
            keys.forEach((k) => {
              clamp(k);
              if (
                k !== HERO &&
                !isMobile &&
                layout[k][0] - ext[k][0] < legendRight &&
                layout[k][1] - ext[k][1] < legendBottom + 8
              ) {
                layout[k][1] = legendBottom + 8 + ext[k][1];
              }
            });
            lockHero();
            return layout;
          }

          function buildGraph() {
            graphCanvas.querySelectorAll(".sg-node").forEach((n) => n.remove());
            graphEdges.innerHTML = "";
            const layout = computeLayout();

            Object.entries(chars).forEach(([k, c]) => {
              const pos = layout[k];
              if (!pos) return;
              const [x, y] = pos;
              const el = document.createElement("div");
              el.className =
                "sg-node" +
                (c.big ? " sg-big" : "") +
                (k === HERO ? " sg-hero-node" : "");
              el.dataset.key = k;
              el.innerHTML = `
                <div class="sg-float-inner">
                  <div class="sg-avatar" style="${safeBg(c.img)}"></div>
                  <div class="sg-name">${c.name}</div>
                </div>`;
              const inner = el.querySelector(".sg-float-inner");
              const dur = k === HERO ? 5.8 : 6 + Math.random() * 4;
              inner.style.animationDuration = dur + "s";
              inner.style.animationDelay = k === HERO ? "0s" : -Math.random() * dur + "s";
              el.style.left = x + "px";
              el.style.top = y + "px";
              graphCanvas.appendChild(el);
              nodeState[k] = { x, y, el, inner };
              attachDrag(el, k);
              el.addEventListener("click", () => {
                if (!el.dataset.dragged) showChar(k);
                delete el.dataset.dragged;
              });
            });

            graphEdgesData.forEach((e) => {
              const line = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line",
              );
              line.setAttribute("class", "sg-edge " + e.type);
              line.dataset.a = e.a;
              line.dataset.b = e.b;
              graphEdges.appendChild(line);
              if (isHeroEdge(e)) {
                const label = document.createElementNS("http://www.w3.org/2000/svg", "g");
                const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                label.setAttribute("class", "sg-edge-label " + e.type);
                label.dataset.a = e.a;
                label.dataset.b = e.b;
                label.dataset.type = e.type;
                bg.setAttribute("class", "sg-edge-label-bg");
                bg.setAttribute("fill", edgeColor(e.type));
                bg.setAttribute("rx", "7");
                bg.setAttribute("ry", "7");
                text.setAttribute("class", "sg-edge-label-text");
                text.textContent = shortRelationLabel(e);
                label.appendChild(bg);
                label.appendChild(text);
                graphEdges.appendChild(label);
              }
            });
            updateEdgesFromDOM();
          }

          /* 重新布局（面板开合时头像让位移动，带过渡动画） */
          function relayout() {
            const layout = computeLayout();
            Object.entries(layout).forEach(([k, [x, y]]) => {
              const s = nodeState[k];
              if (!s) return;
              s.x = x;
              s.y = y;
              s.el.style.left = x + "px";
              s.el.style.top = y + "px";
            });
          }

          function updateEdgeLabelPosition(line, x1, y1, x2, y2, stableDist) {
            const label = graphEdges.querySelector(
              `.sg-edge-label[data-a="${line.dataset.a}"][data-b="${line.dataset.b}"]`,
            );
            if (!label) return;
            const text = label.querySelector(".sg-edge-label-text");
            const bg = label.querySelector(".sg-edge-label-bg");
            const textLen = text.textContent.length;
            const rect = graphCanvas.getBoundingClientRect();
            const tinyLabel = rect.width <= 340 || rect.height <= 420;
            const crowdedLabel = tinyLabel || graphWrap.classList.contains("sg-crowded-graph");
            const fontSize = tinyLabel ? 8.5 : crowdedLabel ? 9.5 : 11;
            const padX = tinyLabel ? 16 : crowdedLabel ? 18 : 20;
            const labelW = Math.ceil(textLen * fontSize * 1.18 + padX);
            const labelH = tinyLabel ? 17 : crowdedLabel ? 18 : 21;
            text.setAttribute("font-size", fontSize);
            const wasVisible = label.dataset.visible === "1";
            const showThreshold = labelW + (tinyLabel ? 2 : isMobileViewport() ? 8 : 18);
            const hideThreshold = labelW - (tinyLabel ? 4 : isMobileViewport() ? 2 : 0);
            const canShow = stableDist >= (wasVisible ? hideThreshold : showThreshold);
            label.dataset.visible = canShow ? "1" : "0";
            label.classList.toggle("sg-hidden", !canShow);
            if (!canShow) return;
            const heroIsA = line.dataset.a === HERO;
            const heroIsB = line.dataset.b === HERO;
            const outward = heroIsA ? 0.62 : heroIsB ? 0.38 : 0.5;
            const px = x1 + (x2 - x1) * outward;
            const py = y1 + (y2 - y1) * outward;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lineLen = Math.hypot(dx, dy) || 1;
            const offset = tinyLabel ? 3 : crowdedLabel ? 4 : 0;
            const mx = px + (-dy / lineLen) * offset;
            const my = py + (dx / lineLen) * offset;
            bg.setAttribute("x", mx - labelW / 2);
            bg.setAttribute("y", my - labelH / 2);
            bg.setAttribute("width", labelW);
            bg.setAttribute("height", labelH);
            text.setAttribute("x", mx);
            text.setAttribute("y", my + (tinyLabel ? 0.8 : 1));
          }

          /* 连线端点收缩到头像边缘：不遮挡头像 */
          function updateEdgesFromDOM() {
            const cr = graphCanvas.getBoundingClientRect();
            graphEdges.querySelectorAll(".sg-edge").forEach((line) => {
              const A = nodeState[line.dataset.a];
              const B = nodeState[line.dataset.b];
              if (!A || !B) return;
              const target = (el) => el.querySelector(".sg-avatar") || el;
              const ar = target(A.el).getBoundingClientRect();
              const br = target(B.el).getBoundingClientRect();
              let ax = ar.left + ar.width / 2 - cr.left;
              let ay = ar.top + ar.height / 2 - cr.top;
              let bx = br.left + br.width / 2 - cr.left;
              let by = br.top + br.height / 2 - cr.top;
              // 端点后退到各自头像半径之外，避免线压在头像上
              const dx = bx - ax,
                dy = by - ay;
              const dist = Math.hypot(dx, dy) || 1;
              const ux = dx / dist,
                uy = dy / dist;
              const rA = ar.width / 2 + 3;
              const rB = br.width / 2 + 3;
              const x1 = ax + ux * rA;
              const y1 = ay + uy * rA;
              const x2 = bx - ux * rB;
              const y2 = by - uy * rB;
              line.setAttribute("x1", x1);
              line.setAttribute("y1", y1);
              line.setAttribute("x2", x2);
              line.setAttribute("y2", y2);
              const stableDist = Math.hypot(B.x - A.x, B.y - A.y);
              updateEdgeLabelPosition(line, x1, y1, x2, y2, stableDist);
            });
          }

          /* 拖拽 */
          function attachDrag(el, key) {
            let startX = 0,
              startY = 0,
              origX = 0,
              origY = 0,
              moved = false;
            const state = () => nodeState[key];
            function onDown(clientX, clientY) {
              moved = false;
              startX = clientX;
              startY = clientY;
              origX = state().x;
              origY = state().y;
              el.classList.add("sg-grabbing", "sg-dragging-now");
              document.addEventListener("mousemove", onMouseMove);
              document.addEventListener("mouseup", onUp);
              document.addEventListener("touchmove", onTouchMove, {
                passive: false,
              });
              document.addEventListener("touchend", onUp);
            }
            function onMove(clientX, clientY) {
              const dx = clientX - startX,
                dy = clientY - startY;
              if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
              let nx = Math.max(40, Math.min(bounds.w - 40, origX + dx));
              let ny = Math.max(40, Math.min(bounds.h - 40, origY + dy));
              state().x = nx;
              state().y = ny;
              el.style.left = nx + "px";
              el.style.top = ny + "px";
              updateEdgesFromDOM();
            }
            function onUp() {
              el.classList.remove("sg-grabbing", "sg-dragging-now");
              if (moved) el.dataset.dragged = "1";
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onUp);
              document.removeEventListener("touchmove", onTouchMove);
              document.removeEventListener("touchend", onUp);
            }
            const onMouseMove = (e) => onMove(e.clientX, e.clientY);
            const onTouchMove = (e) => {
              e.preventDefault();
              const t = e.touches[0];
              onMove(t.clientX, t.clientY);
            };
            el.addEventListener("mousedown", (e) => {
              e.preventDefault();
              onDown(e.clientX, e.clientY);
            });
            el.addEventListener(
              "touchstart",
              (e) => {
                const t = e.touches[0];
                onDown(t.clientX, t.clientY);
              },
              { passive: true },
            );
          }

          /* 摆动 + 连线跟随 */
          let reqId = null;
          function edgeSyncLoop() {
            updateEdgesFromDOM();
            reqId = requestAnimationFrame(edgeSyncLoop);
          }
          function startPhysics() {
            document
              .querySelectorAll(".sg-float-inner")
              .forEach((n) => (n.style.animationPlayState = "running"));
            if (!reqId) reqId = requestAnimationFrame(edgeSyncLoop);
          }
          function stopPhysics() {
            document
              .querySelectorAll(".sg-float-inner")
              .forEach((n) => (n.style.animationPlayState = "paused"));
            if (reqId) {
              cancelAnimationFrame(reqId);
              reqId = null;
            }
          }

          /* 右侧角色面板 */
          function highlightRelated(k) {
            const related = new Set([k]);
            graphEdgesData.forEach((e) => {
              if (e.a === k) related.add(e.b);
              if (e.b === k) related.add(e.a);
            });
            Object.entries(nodeState).forEach(([key, s]) => {
              s.el.classList.toggle("sg-active", key === k);
              s.el.classList.toggle("sg-dim", !related.has(key));
            });
            graphEdges.querySelectorAll(".sg-edge, .sg-edge-label").forEach((item) => {
              const on = item.dataset.a === k || item.dataset.b === k;
              item.classList.toggle("sg-hl", on);
              item.classList.toggle("sg-dim", !on);
            });
          }
          function clearHighlight() {
            Object.values(nodeState).forEach((s) =>
              s.el.classList.remove("sg-active", "sg-dim"),
            );
            graphEdges
              .querySelectorAll(".sg-edge, .sg-edge-label")
              .forEach((item) => item.classList.remove("sg-hl", "sg-dim"));
          }

          function showChar(k) {
            const c = chars[k];
            if (!c) return;
            document.getElementById("sg-cAvt").style.backgroundImage =
              `url('${c.img}')`;
            document.getElementById("sg-cName").textContent = c.name;
            document.getElementById("sg-cActor").textContent = c.actor;
            document.getElementById("sg-cDesc").textContent = c.desc;
            // 与主角关系标签
            const tagBox = document.getElementById("sg-cRelTags");
            if (k === HERO) {
              tagBox.innerHTML = `<span class="sg-rel-tag sg-self">本人 · 主角</span>`;
            } else {
              const r = heroRel[k];
              const html = [];
              if (r)
                html.push(
                  `<span class="sg-rel-tag ${r.type}">${RELN[r.type]} · ${r.text}</span>`,
                );
              // 附带该角色其它主要关系
              graphEdgesData.forEach((e) => {
                const other = e.a === k ? e.b : e.b === k ? e.a : null;
                if (other && other !== HERO && chars[other]) {
                  html.push(
                    `<span class="sg-rel-tag ${e.type}">${chars[other].name} · ${e.label}</span>`,
                  );
                }
              });
              tagBox.innerHTML = html.join("");
            }
            graphWrap.classList.add("sg-panel-open");
            highlightRelated(k);
            // 画布让位后重新测量并重排头像（带过渡）
            setTimeout(() => {
              relayout();
            }, 60);
          }
          function closeChar() {
            graphWrap.classList.remove("sg-panel-open");
            clearHighlight();
            setTimeout(() => {
              relayout();
            }, 60);
          }
          document.getElementById("sg-charClose").addEventListener("click", closeChar);
          /* =========================================================
             视图 3：作品推荐 —— 4 tab + 每页4个 + 翻页
             ========================================================= */
          const worksGrid = document.getElementById("sg-worksGrid");
          const worksPageInfo = document.getElementById("sg-worksPageInfo");
          const worksPrev = document.getElementById("sg-worksPrev");
          const worksNext = document.getElementById("sg-worksNext");
          const worksScrollHint = document.getElementById("sg-worksScrollHint");
          let worksCat = "series";
          let worksPage = 0;
          const WORKS_PER_PAGE = 4;

          function safeText(value, fallback = "") {
            return value == null ? fallback : String(value);
          }
          function safeBg(value) {
            const src = safeText(value).trim();
            return src ? `background-image:url('${src}')` : "";
          }
          function workPeople(value) {
            return safeText(value)
              .split("/")
              .slice(0, 2)
              .map((s) => s.trim())
              .filter(Boolean)
              .join(" / ");
          }

          function renderWorks() {
            const list = works[worksCat] || [];
            const pageCount = Math.max(1, Math.ceil(list.length / WORKS_PER_PAGE));
            worksPage = Math.min(worksPage, pageCount - 1);
            worksGrid.dataset.cat = worksCat;
            const items = list.slice(
              worksPage * WORKS_PER_PAGE,
              worksPage * WORKS_PER_PAGE + WORKS_PER_PAGE,
            );
            worksGrid.innerHTML = items
              .map((w) => {
                const cover = safeText(w.cover).trim();
                const coverStyle = cover ? safeBg(IMG + cover) : "";
                return `
                <div class="sg-work-card ${w.up ? "sg-upcoming" : ""}">
                  <div class="sg-cover" style="${coverStyle}">
                    ${w.ep ? `<div class="sg-tag">${safeText(w.ep)}</div>` : ""}
                  </div>
                  <div class="sg-info">
                    <div class="sg-n">${safeText(w.n, "作品")}</div>
                    <div class="sg-m">${workPeople(w.m)}</div>
                    <div class="sg-r">▸ ${safeText(w.r, "相关推荐")}</div>
                  </div>
                </div>`;
              })
              .join("");
            worksPageInfo.textContent = `${worksPage + 1}/${pageCount}`;
            const showPager = pageCount > 1;
            worksPrev.classList.toggle("sg-hidden", !showPager);
            worksNext.classList.toggle("sg-hidden", !showPager);
            worksPageInfo.classList.toggle("sg-hidden", !showPager);
            worksPrev.disabled = worksPage === 0;
            worksNext.disabled = worksPage === pageCount - 1;
            // 重置横向滚动并按是否有右侧内容更新提示箭头（移动端）
            worksGrid.scrollLeft = 0;
            requestAnimationFrame(updateWorksHint);
          }
          worksPrev.addEventListener("click", () => {
            worksPage--;
            renderWorks();
          });
          worksNext.addEventListener("click", () => {
            worksPage++;
            renderWorks();
          });
          // 更新向右提示箭头：右侧仍有内容时显示，已滚动到最右端则隐藏
          function updateWorksHint() {
            if (!worksScrollHint) return;
            const canScrollRight =
              worksGrid.scrollLeft + worksGrid.clientWidth <
              worksGrid.scrollWidth - 4;
            worksScrollHint.classList.toggle("sg-hide", !canScrollRight);
          }
          // 滚动时实时更新箭头显隐
          worksGrid.addEventListener("scroll", updateWorksHint, { passive: true });
          // 点击向右提示箭头：平滑向右滚动半个窗口宽度
          if (worksScrollHint) {
            worksScrollHint.addEventListener("click", () => {
              worksGrid.scrollBy({
                left: worksGrid.clientWidth / 2,
                behavior: "smooth",
              });
            });
          }
          document.querySelectorAll(".sg-works-tab").forEach((t) => {
            t.addEventListener("click", () => {
              document
                .querySelectorAll(".sg-works-tab")
                .forEach((x) => x.classList.remove("sg-active"));
              t.classList.add("sg-active");
              worksCat = t.dataset.cat;
              worksPage = 0;
              renderWorks();
            });
          });

          /* =========================================================
             Tab 切换
             ========================================================= */
          document.querySelectorAll(".sg-tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              const target = btn.dataset.tab;
              document
                .querySelectorAll(".sg-tab-btn")
                .forEach((b) => b.classList.toggle("sg-active", b === btn));
              document
                .querySelectorAll(".sg-view")
                .forEach((v) =>
                  v.classList.toggle("sg-active", v.dataset.view === target),
                );
              if (target === "graph") {
                measure();
                relayout();
                startPhysics();
              } else {
                stopPhysics();
              }
            });
          });

          /* resize：同步真实视口 + debounce 重排 */
          let rzT;
          let prevViewportKey = viewportKey;
          let prevViewportSize = `${window.innerWidth}x${window.innerHeight}`;
          function handleViewportResize() {
            syncViewport();
            clearTimeout(rzT);
            rzT = setTimeout(() => {
              const nextSize = `${window.innerWidth}x${window.innerHeight}`;
              const viewportChanged =
                prevViewportKey !== viewportKey || prevViewportSize !== nextSize;
              prevViewportKey = viewportKey;
              prevViewportSize = nextSize;
              if (viewportChanged) {
                buildGraph();
                if (graphWrap.classList.contains("sg-panel-open")) relayout();
                renderWorks();
              }
            }, 120);
          }
          window.addEventListener("resize", handleViewportResize);
          window.addEventListener("orientationchange", handleViewportResize);
          if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", handleViewportResize);
          }

          /* 初始化 */
          window.addEventListener("load", () => {
            buildGraph();
            renderWorks();
            startPhysics();
            // 预热角色头像 + 作品封面，避免切换视图时首次加载闪烁
            const preload = new Set();
            Object.values(chars).forEach((c) => preload.add(c.img));
            Object.values(works)
              .flat()
              .forEach((w) => w.cover && preload.add(IMG + w.cover));
            preload.forEach((src) => {
              const im = new Image();
              im.src = src;
            });
            // 首次进入：主角头像脉冲提示"可点击"，播放结束后移除
            const heroNode = nodeState[HERO] && nodeState[HERO].el;
            if (heroNode) {
              heroNode.classList.add("sg-tap-hint");
              setTimeout(() => heroNode.classList.remove("sg-tap-hint"), 5600);
            }
          });

    return { root: root, destroy: function(){ root.innerHTML = ''; } };
  }
  function create(options) {
    var root = document.createElement('div');
    root.className = 'sg-library-host';
    mount(root, options || {});
    return root;
  }
  global.QingyuNianAtlas = { mount: mount, create: create };
})(window);
