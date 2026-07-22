/* Parser-backed decomposition from original.html. */
(function(global){
  'use strict';
  var TEMPLATE = `<div id="sg-app-frame">
    <div id="sg-app-container" aria-label="刘浩存演员动态百科">
      <main class="sg-stage">
        <section class="sg-view sg-costar-view sg-active" id="sg-view-costars" aria-label="同框演员">
          <div class="sg-radar-stage sg-graph-wrap" id="sg-costarGraphWrap">
            <div class="sg-graph-legend" aria-hidden="true">
              <div class="sg-legend-item">
                <i class="sg-legend-line sg-multi"></i>
                <span>多次合作</span>
              </div>
              <div class="sg-legend-item">
                <i class="sg-legend-line sg-film"></i>
                <span>电影合作</span>
              </div>
              <div class="sg-legend-item">
                <i class="sg-legend-line sg-series"></i>
                <span>剧集合作</span>
              </div>
            </div>
            <div class="sg-graph-canvas" id="sg-costarGraphCanvas">
              <svg class="sg-edges" id="sg-costarGraphEdges" aria-hidden="true"></svg>
            </div>
          </div>
        </section>
        <section class="sg-view sg-identity-view" id="sg-view-identity" aria-label="艺人身份"></section>
        <div class="sg-modal" id="sg-modal" aria-hidden="true"></div>
      </main>

      <nav class="sg-nav" aria-label="底部导航">
        <button class="sg-nav-btn sg-active" type="button" data-view="costars" aria-current="page">
          同框演员
        </button>
        <button class="sg-nav-btn" type="button" data-view="identity">
          艺人身份
        </button>
      </nav>
    </div>
    </div>`;
  function mount(root, options) {
    if (!root) throw new Error('mount root is required');
    root.classList.add('sg-is-scaled-canvas');
    root.innerHTML = TEMPLATE;

          (function () {
            var BASE_SMALL = { w: 380, h: 456 };
            var BASE_LARGE = { w: 788, h: 492 };
            var scaleFactor = 1;
            var currentBase = BASE_LARGE;
            var currentBaseKey = "large";
            var resizeTimer = null;

            function isSmallCanvas() {
              return currentBaseKey === "small";
            }

            // 基准选择只看运行容器尺寸/比例，不用 UA/screen/触控（Skill §4.2/§5.2）
            function shouldUseSmallBase(w, h) {
              var ratio = w / h;
              var isPortraitLike = ratio < 1; // 竖向容器
              var isCompactCard = w < 415 || h < 456; // 手机视口/紧凑卡片
              var isNarrowMobileCard = w <= 768 && isPortraitLike; // 窄且竖 → 移动端
              return isCompactCard || isNarrowMobileCard;
            }

            function applyScale() {
              var frame = document.getElementById("sg-app-frame");
              var app = document.getElementById("sg-app-container");
              if (!frame || !app) return;
              // 宽度取运行容器实际宽度（嵌入百度 App 卡片时即卡片宽度）
              var w = Math.round(frame.getBoundingClientRect().width) || window.innerWidth;
              var winH = window.innerHeight;
              var base = shouldUseSmallBase(w, winH) ? BASE_SMALL : BASE_LARGE;
              // 移动端严格保持基准宽高比（小画布 380:456 = 1:1.2）：
              // 容器高度 = 宽度 × 基准比例，并以视口高度封顶，避免超出一屏
              var ratioHeight = Math.round((w * base.h) / base.w);
              var h = Math.min(ratioHeight, winH);
              var scale = Math.min(w / base.w, h / base.h);
              var offsetX = (w - base.w * scale) / 2;
              var offsetY = (h - base.h * scale) / 2;
              scaleFactor = scale;
              currentBase = base;
              currentBaseKey = base === BASE_SMALL ? "small" : "large";
              document.documentElement.classList.add("sg-is-scaled-canvas");
              document.body.classList.add("sg-is-scaled-canvas");
              frame.style.height = h + "px";
              app.classList.add("sg-is-scaled");
              app.classList.toggle("sg-is-small-canvas", currentBaseKey === "small");
              app.classList.toggle("sg-is-large-canvas", currentBaseKey === "large");
              app.classList.toggle("sg-is-tiny-canvas", w <= 330 || h <= 380);
              app.style.width = base.w + "px";
              app.style.height = base.h + "px";
              if ("zoom" in app.style) {
                app.style.left = Math.round(offsetX) + "px";
                app.style.top = Math.round(offsetY) + "px";
                app.style.zoom = scale;
                app.style.transform = "none";
              } else {
                app.style.left = "0px";
                app.style.top = "0px";
                app.style.zoom = "";
                app.style.transform =
                  "translate(" + Math.round(offsetX) + "px, " + Math.round(offsetY) + "px) scale(" + scale + ")";
              }
            }


            var galleries = (options && options.galleries) || [
              {
                src: "../assets/头像.jpg",
                title: "职业画像",
                work: "电影剧集双线",
                role: "新生代银幕面孔",
                traits: ["清澈感", "成长型", "大银幕记忆"],
              },
              {
                src: "../assets/七根心简_剧照.jpg",
                title: "《七根心简》",
                work: "饰 木代",
                role: "奇幻冒险线女主",
                traits: ["行动力", "冒险感", "奇幻气质"],
              },
              {
                src: "../assets/脱轨_剧集镜头.jpeg",
                title: "《脱轨》",
                work: "饰 江晓媛",
                role: "身份反差中的成长型角色",
                traits: ["都市奇幻", "反差成长", "韧性"],
              },
              {
                src: "../assets/活动红毯.png",
                title: "活动红毯",
                work: "银幕新人到公众场域",
                role: "作品之外的时尚表达",
                traits: ["松弛", "清新", "镜头感"],
              },
              {
                src: "../assets/杂志写真.jpg",
                title: "写真杂志",
                work: "影像表现力",
                role: "清冷与少女感之间切换",
                traits: ["清透", "故事脸", "轻盈"],
              },
              {
                src: "../assets/生活日常.jpg",
                title: "生活日常",
                work: "角色之外的自然状态",
                role: "保持低饱和、轻生活感的公众印象",
                traits: ["自然", "亲和", "年轻态"],
              },
            ];

            var facts = (options && options.facts) || [
              ["出道节点", "2020年《一秒钟》上映", "以大银幕作品进入观众视野"],
              ["获奖记录", "第15届亚洲电影大奖最佳新演员", "凭《一秒钟》获得新人奖项认可"],
              ["提名记录", "第34届金鸡奖最佳女主角提名", "凭《送你一朵小红花》入围"],
              ["作品路径", "电影起步，剧集延展", "覆盖现实温情、青春爱情、都市奇幻等类型"],
            ];

            var tags = (options && options.tags) || ["清透镜头感", "轻盈体态", "细腻眼神", "角色反差表达"];



            var works = (options && options.works) || [
              {
                id: "qigen",
                category: "剧集",
                year: 2025,
                title: "七根心简",
                role: "木代",
                status: "已播出",
                partners: "宋威龙 敖瑞鹏",
                poster: "../assets/七根心简_海报.jpg",
                release: "2025播出",
                stat: "奇幻冒险 · 角色突破",
                desc: "奇幻冒险剧集，强化动作感和群像冒险气质。",
              },
              {
                id: "tuogui",
                category: "剧集",
                year: 2023,
                title: "脱轨",
                role: "江晓媛",
                status: "已播完",
                partners: "林一",
                poster: "../assets/脱轨_海报.jpg",
                release: "2023播出",
                stat: "都市奇幻 · 反差成长",
                desc: "都市奇幻爱情剧，呈现身份落差与成长。",
              },
              {
                id: "canlan",
                category: "电影",
                year: 2024,
                title: "灿烂的她",
                role: "徐嘉怡 / 李斯然",
                status: "已上映",
                partners: "惠英红",
                poster: "../assets/灿烂的她海报.jpeg",
                release: "2024上映",
                stat: "亲情题材 · 双女主陪伴",
                desc: "亲情题材电影，围绕重逢与陪伴。",
              },
              {
                id: "niannian",
                category: "电影",
                year: 2023,
                title: "念念相忘",
                role: "许念念",
                status: "已上映",
                partners: "宋威龙",
                poster: "../assets/念念相忘_海报.jpg",
                release: "2023上映",
                stat: "青春爱情 · 校园记忆",
                desc: "青春爱情电影，主打校园记忆。",
              },
              {
                id: "longma",
                category: "电影",
                year: 2023,
                title: "龙马精神",
                role: "罗小宝",
                status: "已上映",
                partners: "成龙 郭麒麟",
                poster: "../assets/龙马精神海报.jpeg",
                release: "2023上映",
                stat: "动作喜剧 · 亲情陪伴",
                desc: "动作喜剧电影，兼具亲情与陪伴。",
              },
              {
                id: "sihai",
                category: "电影",
                year: 2022,
                title: "四海",
                role: "周欢颂",
                status: "已上映",
                partners: "刘昊然 沈腾",
                poster: "../assets/四海_海报.jpg",
                release: "2022上映",
                stat: "青春公路 · 自由气质",
                desc: "青春公路电影，人物气质清新自由。",
              },
              {
                id: "honghua",
                category: "电影",
                year: 2020,
                title: "送你一朵小红花",
                role: "马小远",
                status: "已上映",
                partners: "易烊千玺",
                poster: "../assets/送你一朵小红花_海报.jpg",
                release: "2020上映",
                stat: "金鸡奖最佳女主角提名",
                desc: "现实温情题材电影，角色明亮乐观。",
              },
              {
                id: "yimiao",
                category: "电影",
                year: 2020,
                title: "一秒钟",
                role: "刘闺女",
                status: "已上映",
                partners: "张译 范伟",
                poster: "../assets/一秒钟_海报.jpeg",
                release: "2020上映",
                stat: "亚洲电影大奖最佳新演员",
                desc: "银幕代表起点之一，人物记忆鲜明。",
              },
            ];


            var costars = (options && options.costars) || [
              {
                name: "宋威龙",
                weight: "合作多次",
                reason: "多次联袂",
                image: "../assets/宋威龙.jpeg",
                workIds: ["qigen", "niannian"],
              },
              {
                name: "易烊千玺",
                weight: "高热电影",
                reason: "代表性强",
                image: "../assets/易烊千玺.jpeg",
                workIds: ["honghua"],
              },
              {
                name: "惠英红",
                weight: "亲情搭档",
                reason: "近期电影",
                image: "../assets/惠英红.jpeg",
                workIds: ["canlan"],
              },
              {
                name: "成龙",
                weight: "动作喜剧",
                reason: "国民认知",
                image: "../assets/成龙.jpg",
                workIds: ["longma"],
              },
              {
                name: "刘昊然",
                weight: "青春公路",
                reason: "类型互补",
                image: "../assets/刘昊然.jpeg",
                workIds: ["sihai"],
              },
              {
                name: "张译",
                weight: "张艺谋线",
                reason: "早期合作",
                image: "../assets/张译.jpeg",
                workIds: ["yimiao"],
              },
            ];

            var viewIdentity = document.getElementById("sg-view-identity");
            var viewCostars = document.getElementById("sg-view-costars");
            var modal = document.getElementById("sg-modal");
            var graphWrap = document.getElementById("sg-costarGraphWrap");
            var graphCanvas = document.getElementById("sg-costarGraphCanvas");
            var graphEdges = document.getElementById("sg-costarGraphEdges");
            var galleryIndex = 2;

            var activeCostarIndex = -1;
            var timer = null;
            var startX = 0;
            var lastModalTrigger = null;
            var reduceMotion = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            var graphBounds = { w: 0, h: 0 };
            var graphNodeState = {};

            function escapeHtml(value) {
              return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
            }

            function stopAuto() {
              clearInterval(timer);
              timer = null;
            }

            function shouldAutoPlay() {
              return !reduceMotion && !isSmallCanvas();
            }

            function focusableModalItems() {
              return Array.prototype.slice.call(
                modal.querySelectorAll(
                  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ),
              );
            }

            function trapModalFocus(event) {
              if (!modal.classList.contains("sg-active") || event.key !== "Tab") return;
              var items = focusableModalItems();
              if (!items.length) return;
              var first = items[0];
              var last = items[items.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }

            function workById(id) {
              return (
                works.filter(function (item) {
                  return item.id === id;
                })[0] || works[0]
              );
            }

            function actorWorks(actor) {
              return (actor.workIds || [])
                .map(function (id) {
                  return workById(id);
                })
                .filter(Boolean);
            }

            function actorRelationType(actor) {
              var matched = actorWorks(actor);
              if (matched.length > 1) return "sg-multi";
              return matched[0] && matched[0].category === "剧集" ? "sg-series" : "sg-film";
            }

            function actorRelationLabel(actor) {
              var matched = actorWorks(actor);
              if (matched.length > 1) return "多次合作 · " + matched.length + " 部作品";
              if (matched[0]) return matched[0].category + "合作 · " + matched[0].release;
              return "合作演员";
            }

            function actorWorkList(actor) {
              return actorWorks(actor)
                .map(function (work) {
                  return (
                    "<div class=\"sg-modal-work\">" +
                    "<b>" +
                    escapeHtml(work.title) +
                    " · " +
                    escapeHtml(work.year) +
                    "</b>" +
                    "<small>" +
                    escapeHtml(work.category) +
                    " / 饰 " +
                    escapeHtml(work.role) +
                    " / " +
                    escapeHtml(work.desc) +
                    "</small>" +
                    "</div>"
                  );
                })
                .join("");
            }

            function cloudTokens() {
              return [
                { text: "银幕新人", className: "sg-size-l" },
                { text: "张艺谋电影出道", className: "sg-size-l sg-tone-warm" },
                { text: "七根心简", className: "sg-size-l sg-tone-rose" },
                { text: "成长型女主", className: "sg-size-m" },
                { text: "电影剧集双线", className: "sg-size-m sg-tone-warm" },
                { text: "现实温情", className: "sg-size-m" },
                { text: "奇幻冒险", className: "sg-size-m sg-tone-rose" },
                { text: "青春叙事", className: "" },
                { text: "角色层次", className: "sg-tone-rose" },
                { text: "类型跨度", className: "sg-tone-warm" },
                { text: "金鸡奖提名", className: "sg-tone-warm" },
                { text: "亚洲电影大奖最佳新演员", className: "" },

              ];
            }


            function renderIdentity() {
              var item = galleries[galleryIndex];
              viewIdentity.innerHTML =
                "<div class=\"sg-photo-card\" id=\"sg-photoCard\">" +
                '<img src="' +
                escapeHtml(item.src) +
                '" alt="' +
                escapeHtml(item.title) +
                '">' +
                "<div class=\"sg-gallery-arrows\">" +
                "<button class=\"sg-arrow\" type=\"button\" data-dir=\"-1\" aria-label=\"上一张\">‹</button>" +
                "<button class=\"sg-arrow\" type=\"button\" data-dir=\"1\" aria-label=\"下一张\">›</button>" +
                "</div>" +
                "<div class=\"sg-photo-caption\">" +
                "<strong>" +
                escapeHtml(item.title) +
                " · " +
                escapeHtml(item.work) +
                "</strong>" +
                "<span>" +
                escapeHtml(item.role) +
                "</span>" +
                "<div class=\"sg-role-tags\">" +
                item.traits
                  .map(function (trait) {
                    return "<i>" + escapeHtml(trait) + "</i>";
                  })
                  .join("") +
                "</div>" +
                "</div>" +

                "</div>" +
                "<div class=\"sg-info-card\">" +
                "<div class=\"sg-tag-row\" aria-label=\"艺人标签\">" +

                tags
                  .map(function (tag) {
                    return "<div class=\"sg-tag\">" + escapeHtml(tag) + "</div>";
                  })
                  .join("") +
                "</div>" +
                "<div class=\"sg-facts\">" +
                facts
                  .map(function (fact) {
                    return (
                      "<div class=\"sg-fact\"><span>" +
                      escapeHtml(fact[0]) +
                      "</span><strong>" +
                      escapeHtml(fact[1]) +
                      "</strong><small>" +
                      escapeHtml(fact[2]) +
                      "</small></div>"
                    );
                  })
                  .join("") +
                "</div>" +
                "<div class=\"sg-identity-cloud\" aria-label=\"艺人信息词云\">" +
                cloudTokens()
                  .map(function (token) {
                    return (
                      "<span class=\"sg-cloud-token " +
                      token.className +
                      '">' +
                      escapeHtml(token.text) +
                      "</span>"
                    );
                  })
                  .join("") +
                "</div>" +
                "</div>";
            }

            function changeGallery(step) {
              galleryIndex =
                (galleryIndex + step + galleries.length) % galleries.length;
              renderIdentity();
              bindGallery();
            }

            function bindGallery() {
              var card = document.getElementById("sg-photoCard");
              if (!card) return;
              card.querySelectorAll(".sg-arrow").forEach(function (btn) {
                btn.addEventListener("click", function () {
                  stopAuto();
                  changeGallery(Number(btn.getAttribute("data-dir")) || 1);
                });
              });
              card.addEventListener("pointerdown", function (event) {
                startX = event.clientX;
              });
              card.addEventListener("pointerup", function (event) {
                var diff = event.clientX - startX;
                if (Math.abs(diff) > 35) {
                  stopAuto();
                  changeGallery(diff > 0 ? -1 : 1);
                }
              });
            }

            function measureGraph() {
              if (!graphWrap) return;
              var panelW =
                graphWrap.classList.contains("sg-panel-open") &&
                modal.classList.contains("sg-active") &&
                !isSmallCanvas()
                  ? Math.round(modal.offsetWidth || 0)
                  : 0;
              graphBounds = {
                w: Math.max((graphWrap.clientWidth || graphWrap.offsetWidth || 0) - panelW, 180),
                h: Math.max(graphWrap.clientHeight || graphWrap.offsetHeight || 0, 180),
              };
            }

            function computeGraphLayout() {
              measureGraph();
              var w = Math.max(graphBounds.w, 240);
              var h = Math.max(graphBounds.h, 240);
              var layout = { hero: [w / 2, h * 0.5] };
              var slots = Array.of(
                [0.5, 0.16],
                [0.18, 0.3],
                [0.82, 0.3],
                [0.2, 0.72],
                [0.8, 0.72],
                [0.5, 0.88],
                  );
              costars.forEach(function (item, index) {
                var slot = slots[index % slots.length];
                layout[String(index)] = [slot[0] * w, slot[1] * h];
              });
              return layout;
            }

            function updateEdgesFromDOM() {
              if (!graphEdges) return;
              graphEdges.querySelectorAll(".sg-edge").forEach(function (line) {
                var a = graphNodeState[line.dataset.a];
                var b = graphNodeState[line.dataset.b];
                if (!a || !b) return;
                var ax = a.x;
                var ay = a.y;
                var bx = b.x;
                var by = b.y;
                var dx = bx - ax;
                var dy = by - ay;
                var dist = Math.hypot(dx, dy) || 1;
                var ux = dx / dist;
                var uy = dy / dist;
                var elA = a.el.classList.contains("sg-radar-center") ? a.el : a.el.querySelector(".sg-avatar") || a.el;
                var elB = b.el.classList.contains("sg-radar-center") ? b.el : b.el.querySelector(".sg-avatar") || b.el;
                var rA = Math.max((elA.offsetWidth || 0) / 2, line.dataset.a === "hero" ? 54 : 32) + 3;
                var rB = Math.max((elB.offsetWidth || 0) / 2, line.dataset.b === "hero" ? 54 : 32) + 3;
                line.setAttribute("x1", ax + ux * rA);
                line.setAttribute("y1", ay + uy * rA);
                line.setAttribute("x2", bx - ux * rB);
                line.setAttribute("y2", by - uy * rB);
              });
            }

            function highlightRelated(index) {
              var related = new Set(["hero", String(index)]);
              Object.entries(graphNodeState).forEach(function ([key, state]) {
                if (!state || !state.el) return;
                state.el.classList.toggle("sg-active", key === String(index));
                state.el.classList.toggle("sg-dim", !related.has(key));
              });
              graphEdges.querySelectorAll(".sg-edge").forEach(function (line) {
                var on = line.dataset.b === String(index);
                line.classList.toggle("sg-hl", on);
                line.classList.toggle("sg-dim", !on);
              });
            }

            function clearHighlight() {
              Object.values(graphNodeState).forEach(function (state) {
                if (state && state.el) state.el.classList.remove("sg-active", "sg-dim");
              });
              graphEdges.querySelectorAll(".sg-edge").forEach(function (line) {
                line.classList.remove("sg-hl", "sg-dim");
              });
            }

            function attachDrag(el, key) {
              var startX = 0;
              var startY = 0;
              var origX = 0;
              var origY = 0;
              var moved = false;
              function state() {
                return graphNodeState[key];
              }
              function onMove(event) {
                var current = state();
                if (!current) return;
                var dx = event.clientX - startX;
                var dy = event.clientY - startY;
                if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
                var nx = Math.max(36, Math.min(graphBounds.w - 36, origX + dx));
                var ny = Math.max(36, Math.min(graphBounds.h - 36, origY + dy));
                current.x = nx;
                current.y = ny;
                current.el.style.left = nx + "px";
                current.el.style.top = ny + "px";
                updateEdgesFromDOM();
              }
              function onUp() {
                el.classList.remove("sg-grabbing", "sg-dragging-now");
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                if (moved) el.dataset.dragged = "1";
              }
              el.addEventListener("pointerdown", function (event) {
                if (event.button !== undefined && event.button !== 0) return;
                event.preventDefault();
                startX = event.clientX;
                startY = event.clientY;
                var current = state();
                if (!current) return;
                origX = current.x;
                origY = current.y;
                moved = false;
                el.classList.add("sg-grabbing", "sg-dragging-now");
                document.addEventListener("pointermove", onMove);
                document.addEventListener("pointerup", onUp, { once: true });
              });
            }

            function relayout() {
              var layout = computeGraphLayout();
              Object.entries(layout).forEach(function ([key, pos]) {
                var state = graphNodeState[key];
                if (!state) return;
                state.x = pos[0];
                state.y = pos[1];
                state.el.style.left = pos[0] + "px";
                state.el.style.top = pos[1] + "px";
              });
              updateEdgesFromDOM();
            }

            function renderCostars() {
              if (!graphWrap || !graphCanvas || !graphEdges) return;
              graphCanvas.querySelectorAll(".sg-radar-center, .sg-radar-center-ring, .sg-node").forEach(function (node) {
                node.remove();
              });
              graphEdges.innerHTML = "";
              graphNodeState = {};
              var layout = computeGraphLayout();
              var heroHtml =
                "<div class=\"sg-radar-center-ring\"></div>" +
                "<button class=\"sg-radar-center\" type=\"button\" aria-label=\"查看刘浩存艺人身份\"><img src=\"../assets/头像.jpg\" alt=\"刘浩存头像\"></button>";
              graphCanvas.insertAdjacentHTML("afterbegin", heroHtml);
              var hero = graphCanvas.querySelector(".sg-radar-center");
              if (hero) {
                var heroPos = layout.hero;
                hero.style.left = heroPos[0] + "px";
                hero.style.top = heroPos[1] + "px";
                hero.addEventListener("click", function () {
                  switchView("identity");
                });
                graphNodeState.hero = { x: heroPos[0], y: heroPos[1], el: hero };
              }

              costars.forEach(function (item, index) {
                var pos = layout[String(index)];
                if (!pos) return;
                var btn = document.createElement("button");
                btn.className = "sg-node";
                btn.type = "button";
                btn.dataset.actor = String(index);
                btn.setAttribute("aria-label", "查看" + item.name + "的合作详情");
                btn.innerHTML =
                  "<div class=\"sg-float-inner\"><div class=\"sg-avatar\"><img src=\"" +
                  escapeHtml(item.image) +
                  '" alt="' +
                  escapeHtml(item.name) +
                  "头像\"></div><div class=\"sg-name\">" +
                  escapeHtml(item.name) +
                  "</div></div>";
                btn.style.left = pos[0] + "px";
                btn.style.top = pos[1] + "px";
                graphCanvas.appendChild(btn);
                graphNodeState[String(index)] = { x: pos[0], y: pos[1], el: btn };
                attachDrag(btn, String(index));
                btn.addEventListener("click", function () {
                  if (!btn.dataset.dragged) {
                    lastModalTrigger = btn;
                    openActor(index);
                  }
                  delete btn.dataset.dragged;
                });
                var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("class", "sg-edge " + actorRelationType(item));
                line.dataset.a = "hero";
                line.dataset.b = String(index);
                graphEdges.appendChild(line);
              });
              updateEdgesFromDOM();
              if (activeCostarIndex >= 0 && modal.classList.contains("sg-active")) {
                highlightRelated(activeCostarIndex);
              } else {
                clearHighlight();
              }
              window.setTimeout(updateEdgesFromDOM, 0);
            }

            function changeCostar(step) {
              var current = activeCostarIndex < 0 ? 0 : activeCostarIndex;
              activeCostarIndex = (current + step + costars.length) % costars.length;
              openActor(activeCostarIndex);
            }

            function bindCostarRadar() {
              if (!graphWrap) return;
              graphWrap.addEventListener("pointerdown", function (event) {
                startX = event.clientX;
              });
              graphWrap.addEventListener("pointerup", function (event) {
                if (event.target.closest(".sg-node")) return;
                var diff = event.clientX - startX;
                if (Math.abs(diff) > 35) changeCostar(diff > 0 ? -1 : 1);
              });
            }


            function openActor(index) {
              var actor = costars[index];
              if (!actor) return;
              activeCostarIndex = index;
              openModal(
                actor.image,
                actor.name,
                actor.weight + " · " + actor.reason,
                actorRelationLabel(actor),
                actorWorkList(actor),
              );
              if (graphWrap) graphWrap.classList.add("sg-panel-open");
              highlightRelated(index);
              window.setTimeout(relayout, 60);
            }

            function openModal(poster, title, meta, desc, extraHtml) {
              if (!lastModalTrigger) lastModalTrigger = document.activeElement;
              modal.innerHTML =
                "<div class=\"sg-modal-card\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"sg-modalTitle\" tabindex=\"-1\">" +
                "<button class=\"sg-modal-close\" type=\"button\" aria-label=\"关闭\">×</button>" +
                "<div class=\"sg-modal-poster\"><img src=\"" +
                escapeHtml(poster) +
                '" alt="' +
                escapeHtml(title) +
                '图片"></div>' +
                "<div class=\"sg-modal-info\">" +
                "<strong id=\"sg-modalTitle\">" +
                escapeHtml(title) +
                "</strong>" +
                "<span>" +
                escapeHtml(meta) +
                "</span>" +
                "<p>" +
                escapeHtml(desc) +
                "</p>" +
                (extraHtml
                  ? "<div class=\"sg-modal-works\">" + extraHtml + "</div>"
                  : "") +
                "</div>" +
                "</div>";
              modal.classList.add("sg-active");
              modal.setAttribute("aria-hidden", "false");
              modal
                .querySelector(".sg-modal-close")
                .addEventListener("click", closeModal);
              modal.querySelector(".sg-modal-close").focus();
            }

            function closeModal() {
              modal.classList.remove("sg-active");
              modal.setAttribute("aria-hidden", "true");
              modal.innerHTML = "";
              if (graphWrap) graphWrap.classList.remove("sg-panel-open");
              clearHighlight();
              activeCostarIndex = -1;
              window.setTimeout(relayout, 60);
              if (lastModalTrigger && document.contains(lastModalTrigger)) {
                lastModalTrigger.focus();
              }
              lastModalTrigger = null;
            }


            function switchView(name) {
              document.querySelectorAll(".sg-view").forEach(function (view) {
                view.classList.remove("sg-active");
              });
              document.getElementById("sg-view-" + name).classList.add("sg-active");
              document.querySelectorAll(".sg-nav-btn").forEach(function (btn) {
                var active = btn.getAttribute("data-view") === name;
                btn.classList.toggle("sg-active", active);
                btn.setAttribute("aria-current", active ? "page" : "false");
              });
              if (name !== "costars" && modal.classList.contains("sg-active")) closeModal();
              if (name === "costars") window.setTimeout(renderCostars, 0);
              window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
            }

            function bindEvents() {
              document
                .querySelector(".sg-nav")
                .addEventListener("click", function (event) {
                  var btn = event.target.closest(".sg-nav-btn");
                  if (btn) switchView(btn.getAttribute("data-view"));
                });

              modal.addEventListener("click", function (event) {
                if (event.target === modal) closeModal();
              });
              window.addEventListener("keydown", function (event) {
                if (event.key === "Escape" && modal.classList.contains("sg-active")) {
                  closeModal();
                  return;
                }
                trapModalFocus(event);
              });
            }

            function startAuto() {
              stopAuto();
            }

            function handleViewportChange() {
              applyScale();
              clearTimeout(resizeTimer);
              resizeTimer = setTimeout(function () {
                if (document.getElementById("sg-view-costars").classList.contains("sg-active")) {
                  renderCostars();
                }
              }, 150);
            }

            function init() {
              applyScale();
              renderIdentity();
              renderCostars();
              bindGallery();
              bindEvents();
              startAuto();
              window.addEventListener("resize", handleViewportChange);
              window.addEventListener("orientationchange", handleViewportChange);
              if (window.visualViewport) {
                window.visualViewport.addEventListener("resize", handleViewportChange);
              }
            }


            init();

            // applyScale 三处触发，避免刷新卡在错误基准（Skill §4.3/§5.9）
            document.addEventListener("DOMContentLoaded", applyScale);
            window.addEventListener("load", applyScale);
          })();

    return { root: root, destroy: function(){ root.innerHTML = ''; } };
  }
  function create(options) {
    var root = document.createElement('div');
    root.className = 'sg-library-host';
    mount(root, options || {});
    return root;
  }
  global.LiuHaocunAtlas = { mount: mount, create: create };
})(window);
