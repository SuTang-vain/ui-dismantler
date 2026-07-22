/* Parser-backed decomposition from index.html. */
(function(global){
  'use strict';
  var TEMPLATE = `<div id="sg-app">
      <div class="sg-main">
        <!-- 视图 1：故事图谱 -->
        <div class="sg-view sg-active" data-view="graph" role="tabpanel" id="sg-view-graph">
          <div class="sg-story-switch">
            <div class="sg-story-bar" id="sg-storyBar"></div>
            <button class="sg-story-scroll-hint" id="sg-storyScrollHint" type="button" aria-label="向右滑动查看更多故事">
              ›
            </button>
            <div class="sg-story-desc" id="sg-storyDesc"></div>
          </div>
          <div class="sg-graph-wrap" id="sg-graphWrap">
            <div class="sg-graph-legend">
              <div class="sg-legend-item family">
                <svg class="sg-lg-svg family" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>战友
              </div>
              <div class="sg-legend-item romance">
                <svg class="sg-lg-svg romance" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>家人
              </div>
              <div class="sg-legend-item master">
                <svg class="sg-lg-svg master" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>师徒
              </div>
              <div class="sg-legend-item friend">
                <svg class="sg-lg-svg friend" width="26" height="8">
                  <line x1="1" y1="4" x2="25" y2="4"></line></svg>同行
              </div>
              <div class="sg-legend-item enemy">
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
                <div class="sg-avt" id="sg-cAvt"><img id="sg-cAvtImg" alt=""></div>
                <div class="sg-char-head-info">
                  <div class="sg-p-name" id="sg-cName"></div>
                  <div class="sg-p-actor" id="sg-cActor"></div>
                  <span class="sg-char-rel-tag" id="sg-cRelTag"></span>
                </div>
              </div>
              <div class="sg-p-desc" id="sg-cDesc"></div>
            </div>
          </div>
        </div>

        <!-- 视图 2：作品推荐 -->
        <div class="sg-view" data-view="works" role="tabpanel" id="sg-view-works">
          <div class="sg-works-wrap">
            <div class="sg-works-head">
              <div class="sg-works-tabs" id="sg-worksTabs" role="tablist">
                <button class="sg-works-tab sg-active" data-cat="theme" role="tab">
                  同题材
                </button>
                <button class="sg-works-tab" data-cat="cast" role="tab">同主演</button>
                <button class="sg-works-tab" data-cat="writer" role="tab">同编剧</button>
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
        <button class="sg-tab-btn sg-active" data-tab="graph" role="tab" aria-controls="sg-view-graph" aria-selected="true">故事图谱</button>
        <button class="sg-tab-btn" data-tab="works" role="tab" aria-controls="sg-view-works" aria-selected="false">作品推荐</button>
      </div>
    </div>`;
  function mount(root, options) {
    if (!root) throw new Error('mount root is required');
        root.classList.add('sg-is-scaled-canvas');
    root.innerHTML = TEMPLATE;

          /* ========= 数据 ========= */
          const IMG = "../assets/";
          function enc(src) {
            return src.replace(/[^\x20-\x7E]/g, (c) => encodeURIComponent(c));
          }
          var chars = (options && options.chars) || {
            chengbing: {
              name: "程兵",
              actor: "张译 饰",
              img: IMG + "角色_程兵.webp",
              big: true,
              desc: "三大队队长，坚持正义和荣誉的警察。因审讯意外导致嫌犯死亡而入狱，出狱后放弃一切，以普通人身份万里追凶十二年，只为兑现承诺，给受害者一个交代。",
            },
            caibin: {
              name: "蔡彬",
              actor: "曹炳琨 饰",
              img: IMG + "角色_蔡彬.webp",
              desc: "三大队成员，心思缜密。入狱期间妻离子散，出狱后开了一家文玩店，试图寻找内心平静，但在程兵的感召下重燃追凶的火苗，贡献了关键线索。",
            },
            mazhenkun: {
              name: "马振坤",
              actor: "王骁 饰",
              img: IMG + "角色_马振坤.webp",
              desc: "三大队队员，性格火爆。出狱后在妻子的支持下经营大排档，生活回归正轨。面对程兵的追凶请求，他在家庭和兄弟情义之间艰难抉择。",
            },
            liaojian: {
              name: "廖健",
              actor: "张子贤 饰",
              img: IMG + "角色_廖健.webp",
              desc: "三大队成员，擅长后勤辅助。出狱后带着儿子卖保险为生，生活拮据。尽管对追凶犹豫不决，但仍在关键时刻为程兵提供了力所能及的帮助。",
            },
            xuyizhou: {
              name: "徐一舟",
              actor: "魏晨 饰",
              img: IMG + "角色_徐一舟.webp",
              desc: "三大队最年轻的队员，充满热血。出狱后成为一名沉默寡言的驯狗师，内心虽饱受创伤，但对正义的渴望从未熄灭，是追凶路上程兵的坚定追随者。",
            },
            yangjiantao: {
              name: "杨剑涛",
              actor: "李晨 饰",
              img: IMG + "角色_杨剑涛.webp",
              desc: "二大队队长，后接替程兵成为三大队负责人。他行事谨慎，讲究规矩，与程兵的办案风格形成对比，但在关键时刻守住了警察的底线和对三大队的承诺。",
            },
            laozhang: {
              name: "老张",
              actor: "待定",
              img: IMG + "角色_老张.webp",
              desc: "三大队的老前辈，程兵的师父。在追捕王大勇兄弟的过程中病倒，他的去世成为压垮三大队情绪的最后一根稻草，间接导致了审讯悲剧的发生。",
            },
            wangdayong: {
              name: "王大勇",
              actor: "王雨甜 饰",
              img: IMG + "角色_王大勇.webp",
              desc: "入室抢劫强奸案的主犯之一，凶狠残暴。在审讯过程中意外死亡，他的死彻底改变了三大队的命运，也开启了长达十二年的追凶序幕。",
            },
            wangeryong: {
              name: "王二勇",
              actor: "张新成 饰",
              img: IMG + "角色_王二勇.webp",
              desc: "王大勇的弟弟，命案的另一名在逃嫌犯。狡猾多端，隐姓埋名四处逃窜。他是程兵内心无法磨灭的执念，也是三大队誓要缉拿归案的最后目标。",
            },
            maqi: {
              name: "马妻",
              actor: "高叶 饰",
              img: IMG + "角色_马妻.webp",
              desc: "马振坤的妻子。坚韧善良，在丈夫入狱后不离不弃，撑起整个家。她是三大队兄弟们回归正常生活的一个缩影，代表着家庭的温暖与牵绊。",
            },
            chengbingqizi: {
              name: "程兵妻子",
              actor: "待定",
              img: IMG + "角色_程兵妻子.webp",
              desc: "程兵的妻子。深爱着丈夫，但无法承受丈夫为追凶而带来的家庭破碎，最终选择离开。她是程兵为执念所付出的家庭代价的体现。",
            },
            shouhainvhai: {
              name: "受害女孩",
              actor: "待定",
              img: IMG + "角色_受害女孩.webp",
              desc: "17岁的花季少女，奥数比赛获奖者。在家中不幸遭遇王氏兄弟入室抢劫，被残忍杀害。她的死是整个故事的开端，也是三大队无法释怀的痛。",
            },
          };

          const HERO = "chengbing";
          const RELN = {
            family: "战友",
            romance: "家人",
            master: "师徒",
            friend: "同行",
            enemy: "对立",
          };
          const REL_COLORS = {
            family: "var(--sg-red)",
            romance: "var(--sg-pink)",
            master: "var(--sg-gold)",
            friend: "var(--sg-green)",
            enemy: "#55585f",
          };
          var ALL_EDGES = (options && options.allEdges) || [
            { a: "chengbing", b: "caibin", type: "family", label: "昔日战友" },
            { a: "chengbing", b: "mazhenkun", type: "family", label: "昔日战友" },
            { a: "chengbing", b: "liaojian", type: "family", label: "昔日战友" },
            { a: "chengbing", b: "xuyizhou", type: "family", label: "昔日战友" },
            { a: "chengbing", b: "laozhang", type: "master", label: "师徒" },
            { a: "chengbing", b: "yangjiantao", type: "friend", label: "同行" },
            { a: "chengbing", b: "wangdayong", type: "enemy", label: "宿敌" },
            { a: "chengbing", b: "wangeryong", type: "enemy", label: "宿敌" },
            { a: "chengbing", b: "chengbingqizi", type: "romance", label: "夫妻" },
            { a: "mazhenkun", b: "maqi", type: "romance", label: "夫妻" },
            { a: "wangdayong", b: "wangeryong", type: "romance", label: "兄弟" },
            { a: "caibin", b: "mazhenkun", type: "family", label: "昔日战友" },
            { a: "liaojian", b: "xuyizhou", type: "family", label: "昔日战友" },
            { a: "chengbing", b: "shouhainvhai", type: "enemy", label: "誓为追凶" },
          ];

          const heroRel = {
            caibin: { type: "family", text: "昔日战友" },
            mazhenkun: { type: "family", text: "昔日战友" },
            liaojian: { type: "family", text: "昔日战友" },
            xuyizhou: { type: "family", text: "坚定追随者" },
            laozhang: { type: "master", text: "师徒 · 引路人" },
            yangjiantao: { type: "friend", text: "同行 · 接替者" },
            wangdayong: { type: "enemy", text: "审讯意外 · 悲剧开端" },
            wangeryong: { type: "enemy", text: "万里追凶 · 终极执念" },
            maqi: { type: "family", text: "兄弟的妻子" },
            chengbingqizi: { type: "romance", text: "夫妻 · 离别" },
            shouhainvhai: { type: "enemy", text: "誓为追凶" },
          };

          var storyModules = (options && options.storyModules) || [
            {
              key: "mingan",
              name: "恶性命案",
              desc: "雨夜发生恶性入室抢劫案，三大队临危受命。在追捕主犯王大勇、王二勇的过程中，队长程兵的师父老张病倒。嫌犯王大勇在审讯中意外死亡，三大队全员命运急转直下。",
              chars: [
                "chengbing",
                "caibin",
                "mazhenkun",
                "liaojian",
                "xuyizhou",
                "laozhang",
                "wangdayong",
                "wangeryong",
                "shouhainvhai",
              ],
              layout: {
                chengbing: [0.5, 0.48],
                caibin: [0.16, 0.18],
                mazhenkun: [0.84, 0.84],
                liaojian: [0.16, 0.84],
                xuyizhou: [0.84, 0.18],
                laozhang: [0.5, 0.92],
                wangdayong: [0.9, 0.52],
                wangeryong: [0.08, 0.5],
                shouhainvhai: [0.5, 0.08],
              },
              edges: [
                { a: "chengbing", b: "caibin", type: "family", label: "昔日战友" },
                {
                  a: "chengbing",
                  b: "mazhenkun",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "liaojian",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "xuyizhou",
                  type: "family",
                  label: "昔日战友",
                },
                { a: "chengbing", b: "laozhang", type: "master", label: "师徒" },
                { a: "chengbing", b: "wangdayong", type: "enemy", label: "宿敌" },
                { a: "chengbing", b: "wangeryong", type: "enemy", label: "宿敌" },
                {
                  a: "chengbing",
                  b: "shouhainvhai",
                  type: "enemy",
                  label: "誓为追凶",
                },
                {
                  a: "wangdayong",
                  b: "wangeryong",
                  type: "romance",
                  label: "兄弟",
                },
                { a: "caibin", b: "mazhenkun", type: "family", label: "昔日战友" },
                { a: "liaojian", b: "xuyizhou", type: "family", label: "昔日战友" },
              ],
              roles: {
                chengbing: {
                  rel: ["三大队队长", "追凶执念"],
                  desc: "带领队员追捕王氏兄弟，审讯意外入狱。",
                },
                caibin: {
                  rel: ["三大队成员", "心思缜密"],
                  desc: "在审讯现场，经历命运转折。",
                },
                mazhenkun: {
                  rel: ["三大队队员", "性格火爆"],
                  desc: "参与审讯，因意外改变人生。",
                },
                liaojian: {
                  rel: ["三大队成员", "后勤辅助"],
                  desc: "全程参与案件，命运随之改变。",
                },
                xuyizhou: {
                  rel: ["最年轻队员", "热血青年"],
                  desc: "追捕王氏兄弟，卷入命运漩涡。",
                },
                laozhang: {
                  rel: ["老前辈", "师父"],
                  desc: "程兵的师父，追捕中病倒。",
                },
                wangdayong: {
                  rel: ["主犯", "审讯死亡"],
                  desc: "在审讯中意外死亡，改变三大队命运。",
                },
                wangeryong: {
                  rel: ["在逃嫌犯", "命案元凶"],
                  desc: "王大勇的弟弟，案发后持续在逃。",
                },
                shouhainvhai: {
                  rel: ["17岁受害者", "案件源头"],
                  desc: "被王氏兄弟残忍杀害，故事由此开始。",
                },
              },
            },
            {
              key: "xingtu",
              name: "漫漫刑途",
              desc: "三大队成员因刑讯逼供被判入狱。程兵被判八年，妻子提出离婚；蔡彬同样妻离子散；马振坤的妻子则选择坚守。曾经的英雄沦为阶下囚，在狱中承受着身心的双重煎熬。",
              chars: [
                "chengbing",
                "caibin",
                "mazhenkun",
                "liaojian",
                "xuyizhou",
                "chengbingqizi",
                "maqi",
              ],
              layout: {
                chengbing: [0.5, 0.48],
                caibin: [0.16, 0.18],
                mazhenkun: [0.84, 0.84],
                liaojian: [0.16, 0.84],
                xuyizhou: [0.84, 0.18],
                chengbingqizi: [0.32, 0.92],
                maqi: [0.68, 0.92],
              },
              edges: [
                { a: "chengbing", b: "caibin", type: "family", label: "昔日战友" },
                {
                  a: "chengbing",
                  b: "mazhenkun",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "liaojian",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "xuyizhou",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "chengbingqizi",
                  type: "romance",
                  label: "夫妻",
                },
                { a: "mazhenkun", b: "maqi", type: "romance", label: "夫妻" },
                { a: "caibin", b: "mazhenkun", type: "family", label: "昔日战友" },
                { a: "liaojian", b: "xuyizhou", type: "family", label: "昔日战友" },
              ],
              roles: {
                chengbing: {
                  rel: ["三大队队长", "阶下囚"],
                  desc: "被判八年，妻子提出离婚。",
                },
                caibin: {
                  rel: ["三大队成员", "妻离子散"],
                  desc: "入狱期间妻离子散，内心创伤深重。",
                },
                mazhenkun: {
                  rel: ["三大队队员", "妻子坚守"],
                  desc: "入狱后妻子不离不弃，出狱回归家庭。",
                },
                liaojian: {
                  rel: ["三大队成员", "单亲父亲"],
                  desc: "带着儿子卖保险为生，生活拮据。",
                },
                xuyizhou: {
                  rel: ["最年轻队员", "驯狗师"],
                  desc: "出狱后成为沉默寡言的驯狗师。",
                },
                chengbingqizi: {
                  rel: ["程兵妻子", "选择离开"],
                  desc: "无法承受丈夫入狱，最终选择离婚。",
                },
                maqi: {
                  rel: ["马振坤妻子", "坚守等待"],
                  desc: "在丈夫入狱后不离不弃，撑起整个家。",
                },
              },
            },
            {
              key: "zhuizong",
              name: "千里追凶",
              desc: "程兵出狱后，受害者父亲的一跪让他决心追凶到底。他踏上孤独的旅程，昔日战友们被他的执着感召，相继加入。但现实的重压让大家陆续离开，最终只剩程兵一人。",
              chars: [
                "chengbing",
                "caibin",
                "mazhenkun",
                "liaojian",
                "xuyizhou",
                "yangjiantao",
                "wangeryong",
              ],
              layout: {
                chengbing: [0.5, 0.48],
                caibin: [0.16, 0.18],
                mazhenkun: [0.84, 0.84],
                liaojian: [0.16, 0.84],
                xuyizhou: [0.84, 0.18],
                yangjiantao: [0.32, 0.92],
                wangeryong: [0.08, 0.5],
              },
              edges: [
                { a: "chengbing", b: "caibin", type: "family", label: "昔日战友" },
                {
                  a: "chengbing",
                  b: "mazhenkun",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "liaojian",
                  type: "family",
                  label: "昔日战友",
                },
                {
                  a: "chengbing",
                  b: "xuyizhou",
                  type: "family",
                  label: "昔日战友",
                },
                { a: "chengbing", b: "yangjiantao", type: "friend", label: "同行" },
                { a: "chengbing", b: "wangeryong", type: "enemy", label: "宿敌" },
                { a: "caibin", b: "mazhenkun", type: "family", label: "昔日战友" },
                { a: "liaojian", b: "xuyizhou", type: "family", label: "昔日战友" },
              ],
              roles: {
                chengbing: {
                  rel: ["追凶者", "不灭执念"],
                  desc: "被受害者父亲的一跪打动，决心追凶到底。",
                },
                caibin: {
                  rel: ["昔日战友", "内心挣扎"],
                  desc: "短暂加入，后因现实压力选择放弃。",
                },
                mazhenkun: {
                  rel: ["昔日战友", "家庭牵绊"],
                  desc: "在家庭与兄弟道义间艰难抉择后退出。",
                },
                liaojian: {
                  rel: ["昔日战友", "关键线索"],
                  desc: "虽退出追凶但提供了关键线索。",
                },
                xuyizhou: {
                  rel: ["昔日战友", "坚定追随"],
                  desc: "陪伴程兵走过追凶路上最艰难的阶段。",
                },
                yangjiantao: {
                  rel: ["同行", "暗中相助"],
                  desc: "作为在职警察，在力所能及处提供帮助。",
                },
                wangeryong: {
                  rel: ["在逃嫌犯", "终极目标"],
                  desc: "隐姓埋名逃窜，是程兵追凶的最终目标。",
                },
              },
            },
            {
              key: "huixiang",
              name: "终有回响",
              desc: "十二年间，程兵做过各种底层工作，辗转大半个中国。凭着一个模糊的背影和惊人的毅力，他最终在一个边陲小城锁定了已经改名换姓的王二勇，并配合当地警方将其抓获。正义虽迟但到。",
              chars: ["chengbing", "yangjiantao", "wangeryong"],
              layout: {
                chengbing: [0.5, 0.48],
                yangjiantao: [0.16, 0.82],
                wangeryong: [0.84, 0.18],
              },
              edges: [
                { a: "chengbing", b: "yangjiantao", type: "friend", label: "同行" },
                { a: "chengbing", b: "wangeryong", type: "enemy", label: "宿敌" },
              ],
              roles: {
                chengbing: {
                  rel: ["孤身追凶", "正义实现"],
                  desc: "十二年独行，终将王二勇缉拿归案。",
                },
                yangjiantao: {
                  rel: ["同行", "见证者"],
                  desc: "协助程兵，见证三大队使命的最终完成。",
                },
                wangeryong: {
                  rel: ["在逃嫌犯", "最终落网"],
                  desc: "隐姓埋名十二年，最终被程兵发现并抓获。",
                },
              },
            },
          ];

          const storyByKey = Object.fromEntries(
            storyModules.map((s) => [s.key, s]),
          );
          let currentStoryKey = storyModules[0].key;
          let activeStory = storyByKey[currentStoryKey];
          let edges = activeStory.edges;

          var works = (options && options.works) || {
            theme: [
              {
                n: "解救吾先生",
                m: "刘德华 / 刘烨 / 吴若甫",
                r: "真实改编 · 警匪对峙",
                cover: "推荐_解救吾先生.webp",
                ep: "106分钟",
              },
              {
                n: "烈日灼心",
                m: "邓超 / 段奕宏 / 郭涛",
                r: "人性拷问 · 警匪片",
                cover: "推荐_烈日灼心.webp",
                ep: "139分钟",
              },
              {
                n: "白日焰火",
                m: "廖凡 / 桂纶镁 / 王学兵",
                r: "金熊奖 · 黑色电影",
                cover: "推荐_白日焰火.webp",
                ep: "106分钟",
              },
              {
                n: "万里归途",
                m: "张译 / 王俊凯 / 殷桃",
                r: "真实撤侨 · 文官之战",
                cover: "推荐_万里归途.webp",
                ep: "137分钟",
              },
            ],
            cast: [
              {
                n: "悬崖之上",
                m: "张译 / 于和伟 / 秦海璐",
                r: "张译谍战 · 冰雪绝境",
                cover: "推荐_悬崖之上.webp",
                ep: "120分钟",
              },
              {
                n: "八佰",
                m: "王千源 / 张译 / 姜武",
                r: "群星参演 · 四行仓库",
                cover: "推荐_八佰.webp",
                ep: "147分钟",
              },
              {
                n: "以家人之名",
                m: "谭松韵 / 宋威龙 / 张新成",
                r: "张新成治愈剧",
                cover: "推荐_以家人之名.webp",
                ep: "46集",
              },
              {
                n: "我不是药神",
                m: "徐峥 / 王传君 / 周一围",
                r: "张子贤 · 现实力作",
                cover: "推荐_我不是药神.webp",
                ep: "117分钟",
              },
            ],
            writer: [
              {
                n: "亲爱的",
                m: "赵薇 / 黄渤 / 佟大为",
                r: "编剧张冀 · 打拐题材",
                cover: "推荐_亲爱的.webp",
                ep: "130分钟",
              },
              {
                n: "中国合伙人",
                m: "黄晓明 / 邓超 / 佟大为",
                r: "编剧张冀 · 创业史诗",
                cover: "推荐_中国合伙人.webp",
                ep: "112分钟",
              },
              {
                n: "夺冠",
                m: "巩俐 / 黄渤 / 吴刚",
                r: "编剧张冀 · 女排传奇",
                cover: "推荐_夺冠.webp",
                ep: "135分钟",
              },
            ],
          };
          /* =========================================================
             视图 1：关系图谱 —— 放射式布局 + 可拖动 + 摆动
             ========================================================= */
          const graphWrap = document.getElementById("sg-graphWrap");
          const graphCanvas = document.getElementById("sg-graphCanvas");
          const graphEdges = document.getElementById("sg-graphEdges");
          const charPanel = document.getElementById("sg-charPanel");
          const storyBar = document.getElementById("sg-storyBar");
          const storyDesc = document.getElementById("sg-storyDesc");
          const storyScrollHint = document.getElementById("sg-storyScrollHint");

          const nodeState = {};
          let bounds = { w: 0, h: 0 };
          let currentCharKey = null;

          /* ===== 等比缩放画布：双基准 380×456（小） / 788×492（大） ===== */
          const BASE_SMALL = { w: 380, h: 456 };
          const BASE_LARGE = { w: 788, h: 492 };
          let scaleFactor = 1;
          let currentBaseKey = "large";
          let currentBase = BASE_LARGE;
          function isSmallCanvas() {
            return currentBaseKey === "small";
          }
          function shouldUseSmallBase(w, h) {
            const ratio = w / h;
            const isPortraitLike = ratio < 1;
            const isCompactCard = w < 415 || h < 456;
            const isNarrowMobileCard = w <= 768 && isPortraitLike;
            return isCompactCard || isNarrowMobileCard;
          }
          function applyScale() {
            const app = document.getElementById("sg-app");
            if (!app) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            const base = shouldUseSmallBase(w, h) ? BASE_SMALL : BASE_LARGE;
            const scale = Math.min(w / base.w, h / base.h);
            scaleFactor = scale;
            currentBase = base;
            currentBaseKey = base === BASE_SMALL ? "small" : "large";
            const offsetX = (w - base.w * scale) / 2;
            const offsetY = (h - base.h * scale) / 2;
            document.documentElement.classList.add("sg-is-scaled-canvas");
            document.body.classList.add("sg-is-scaled-canvas");
            app.classList.add("sg-is-scaled");
            app.classList.toggle("sg-is-small-canvas", currentBaseKey === "small");
            app.classList.toggle("sg-is-large-canvas", currentBaseKey === "large");
            app.classList.toggle("sg-is-tiny-canvas", w <= 330 || h <= 380);
            app.style.width = base.w + "px";
            app.style.height = base.h + "px";
            app.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
          }
          applyScale();
          /* DOMContentLoaded 再兜底一次：覆盖首屏解析时视口尺寸尚未定稿的情况 */
          document.addEventListener("DOMContentLoaded", applyScale);

          function getStoryChar(k) {
            const base = chars[k];
            if (!base) return null;
            const role = activeStory.roles[k] || {};
            return {
              ...base,
              storyRel: role.rel || [],
              storyDesc: role.desc || base.desc,
            };
          }

          function getLayoutRel() {
            return activeStory.layout || {};
          }

          function measure() {
            const rect = graphWrap.getBoundingClientRect();
            const S = scaleFactor || 1;
            const logicalW = rect.width / S;
            const logicalH = rect.height / S;
            const panelW = graphWrap.classList.contains("sg-panel-open")
              ? isSmallCanvas()
                ? 0
                : 320
              : 0;
            bounds = { w: Math.max(logicalW - panelW, 120), h: logicalH };
          }

          function orderRing(keys, links) {
            const names = keys.slice();
            const n = names.length;
            if (n <= 2) return names;
            const rel = (links || []).filter(
              (l) => names.includes(l.a) && names.includes(l.b),
            );
            if (!rel.length || n > 8) return names;
            const between = (x, a, b) => {
              let i = (a + 1) % n;
              while (i !== b) {
                if (i === x) return true;
                i = (i + 1) % n;
              }
              return false;
            };
            const cost = (order) => {
              const pos = {};
              order.forEach((name, i) => (pos[name] = i));
              let score = 0;
              rel.forEach((l) => {
                const i = pos[l.a];
                const j = pos[l.b];
                const d = Math.min(Math.abs(i - j), n - Math.abs(i - j));
                score += Math.max(0, d - 1) * 2;
              });
              for (let x = 0; x < rel.length; x++) {
                for (let y = x + 1; y < rel.length; y++) {
                  const a = pos[rel[x].a],
                    b = pos[rel[x].b],
                    c = pos[rel[y].a],
                    d = pos[rel[y].b];
                  if (a === c || a === d || b === c || b === d) continue;
                  if (between(c, a, b) !== between(d, a, b)) score += 3;
                }
              }
              return score;
            };
            let best = names.slice(),
              bestCost = Infinity;
            const first = names[0];
            const rest = names.slice(1);
            const permute = (arr, k) => {
              if (k === arr.length) {
                const order = [first, ...arr];
                const c = cost(order);
                if (c < bestCost) {
                  bestCost = c;
                  best = order.slice();
                }
                return;
              }
              for (let i = k; i < arr.length; i++) {
                [arr[k], arr[i]] = [arr[i], arr[k]];
                permute(arr, k + 1);
                [arr[k], arr[i]] = [arr[i], arr[k]];
              }
            };
            if (n <= 8) permute(rest, 0);
            return best;
          }

          function graphAvatarMetrics(denseGraph) {
            const wI = currentBase.w;
            const hI = currentBase.h;
            if (wI <= 400 && hI <= 420) {
              return {
                av: denseGraph ? 34 : 38,
                avBig: denseGraph ? 42 : 48,
                nameF: 9.5,
              };
            }
            if (wI <= 400) {
              return {
                av: denseGraph ? 36 : 40,
                avBig: denseGraph ? 44 : 50,
                nameF: 10,
              };
            }
            if (wI <= 768) {
              return {
                av: denseGraph ? 40 : 46,
                avBig: denseGraph ? 48 : 56,
                nameF: 11,
              };
            }
            if (wI <= 900) {
              return {
                av: denseGraph ? 52 : 58,
                avBig: denseGraph ? 62 : 70,
                nameF: 12,
              };
            }
            return {
              av: denseGraph ? 56 : 64,
              avBig: denseGraph ? 66 : 78,
              nameF: 12,
            };
          }

          function computeLayout() {
            measure();
            const isMobile = isSmallCanvas();
            const denseGraph =
              activeStory.chars.length >= 7 || bounds.w < 560 || bounds.h < 380;
            graphWrap.classList.toggle("sg-dense-graph", denseGraph);
            const { av, avBig, nameF } = graphAvatarMetrics(denseGraph);
            const w = Math.max(bounds.w, isMobile ? 200 : 320);
            const h = Math.max(bounds.h, isMobile ? 200 : 320);
            const topSafe = isMobile ? 48 : 42;
            const botSafe = isMobile ? 22 : 32;
            const usableH = Math.max(h - topSafe - botSafe, 120);
            const cx = w * 0.5;
            const cy = topSafe + usableH * 0.5;
            const layout = {};
            const core = activeStory.chars.includes(HERO)
              ? HERO
              : activeStory.chars[0];
            layout[core] = [cx, cy];
            const others = activeStory.chars.filter((k) => k !== core);
            const ringLinks = activeStory.edges.filter(
              (e) => e.a !== core && e.b !== core,
            );
            const ordered = orderRing(others, ringLinks);
            const n = ordered.length;
            const rx = Math.max(w * 0.5 - (isMobile ? 38 : 66), 90);
            const ry = Math.max(usableH * 0.5 - (isMobile ? 10 : 14), 70);
            const start =
              -Math.PI / 2 + (n % 2 === 0 ? Math.PI / Math.max(n, 1) : 0);
            ordered.forEach((k, i) => {
              const a = start + (i / Math.max(n, 1)) * Math.PI * 2;
              layout[k] = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
            });

            const ext = {};
            Object.keys(layout).forEach((k) => {
              const c = getStoryChar(k);
              const aw = c.big ? avBig : av;
              const nameW = c.name.length * nameF * 0.95 + 14;
              const chipH = isMobile ? 0 : nameF + 4;
              ext[k] = [Math.max(aw, nameW) / 2, (aw + nameF + chipH + 14) / 2];
            });
            const keys = Object.keys(layout);
            let legendClearY = 0;
            const legendEl = document.querySelector(".sg-graph-legend");
            if (legendEl && getComputedStyle(legendEl).display !== "none") {
              const lr = legendEl.getBoundingClientRect();
              const cr = graphCanvas.getBoundingClientRect();
              const S = scaleFactor || 1;
              legendClearY = Math.max(0, (lr.bottom - cr.top) / S) + 8;
            }
            const clamp = (k) => {
              layout[k][0] = Math.max(
                ext[k][0] + 4,
                Math.min(w - ext[k][0] - 4, layout[k][0]),
              );
              const yMin = Math.max(ext[k][1] + 4, legendClearY + ext[k][1]);
              layout[k][1] = Math.max(
                yMin,
                Math.min(h - ext[k][1] - botSafe, layout[k][1]),
              );
            };
            const marginX = isMobile ? 12 : 18;
            const marginY = isMobile ? 20 : 26;
            for (let it = 0; it < 120; it++) {
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
                    if (ox <= oy) {
                      const s = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
                      layout[a][0] -= (ox / 2) * s;
                      layout[b][0] += (ox / 2) * s;
                    } else {
                      const s = dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy);
                      layout[a][1] -= (oy / 2) * s;
                      layout[b][1] += (oy / 2) * s;
                    }
                    clamp(a);
                    clamp(b);
                  }
                }
              }
              if (!moved) break;
            }
            keys.forEach(clamp);
            return layout;
          }

          function buildGraph() {
            graphCanvas.querySelectorAll(".sg-node").forEach((n) => n.remove());
            Object.keys(nodeState).forEach((k) => delete nodeState[k]);
            graphEdges.innerHTML = "";
            const layout = computeLayout();

            activeStory.chars.forEach((k) => {
              const c = getStoryChar(k);
              const pos = layout[k];
              if (!pos) return;
              const [x, y] = pos;
              const el = document.createElement("div");
              el.className = "sg-node" + (c.big ? " sg-big" : "");
              el.dataset.key = k;
              el.innerHTML = `
                <div class="sg-float-inner">
                  <div class="sg-avatar">
                    <span class="sg-avatar-img"><img src="${enc(c.img)}" alt="${c.name}"></span>
                  </div>
                  <div class="sg-name">${c.name}</div>
                </div>`;
              const inner = el.querySelector(".sg-float-inner");
              const dur = 6 + Math.random() * 4;
              inner.style.animationDuration = dur + "s";
              inner.style.animationDelay = -Math.random() * dur + "s";
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

            edges.forEach((e, idx) => {
              const path = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path",
              );
              path.setAttribute("class", "sg-edge " + e.type);
              path.dataset.a = e.a;
              path.dataset.b = e.b;
              path.dataset.idx = String(idx);
              graphEdges.appendChild(path);
            });
            edges.forEach((e, idx) => {
              const bg = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "rect",
              );
              bg.setAttribute("class", "sg-edge-label-bg");
              bg.setAttribute("rx", "5");
              bg.dataset.a = e.a;
              bg.dataset.b = e.b;
              bg.dataset.idx = String(idx);
              graphEdges.appendChild(bg);

              const label = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text",
              );
              label.setAttribute("class", "sg-edge-label " + e.type);
              label.textContent = e.label;
              label.dataset.a = e.a;
              label.dataset.b = e.b;
              label.dataset.idx = String(idx);
              graphEdges.appendChild(label);
            });
            updateEdgesFromDOM();
          }

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
            requestAnimationFrame(updateEdgesFromDOM);
          }

          function updateEdgesFromDOM() {
            const cr = graphCanvas.getBoundingClientRect();
            const S = scaleFactor || 1;
            const edgeEls = Array.from(graphEdges.querySelectorAll(".sg-edge"));
            const labelEls = Array.from(graphEdges.querySelectorAll(".sg-edge-label"));
            const nodeRects = [];
            const avatarCircles = [];
            Object.entries(nodeState).forEach(([key, s]) => {
              const r = s.el.getBoundingClientRect();
              const pad = isSmallCanvas() ? 5 : 8;
              nodeRects.push({
                key,
                left: (r.left - cr.left) / S - pad,
                right: (r.right - cr.left) / S + pad,
                top: (r.top - cr.top) / S - pad,
                bottom: (r.bottom - cr.top) / S + pad,
              });
              const ar = s.el.querySelector(".sg-avatar").getBoundingClientRect();
              avatarCircles.push({
                key,
                x: (ar.left + ar.width / 2 - cr.left) / S,
                y: (ar.top + ar.height / 2 - cr.top) / S,
                r: ar.width / (2 * S) + (s.el.classList.contains("sg-big") ? 12 : 5),
              });
            });
            const pointInRect = (x, y, r) =>
              x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
            const rectsOverlap = (a, b) =>
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top;
            const rectCircleOverlap = (rect, c) => {
              const x = Math.max(rect.left, Math.min(c.x, rect.right));
              const y = Math.max(rect.top, Math.min(c.y, rect.bottom));
              return Math.hypot(x - c.x, y - c.y) < c.r;
            };
            const linePoint = (d, t) => ({
              x: d.x1 + (d.x2 - d.x1) * t,
              y: d.y1 + (d.y2 - d.y1) * t,
            });
            const clampLabelRect = (rect) => {
              const crW = cr.width / S;
              const crH = cr.height / S;
              const dx =
                rect.left < 4
                  ? 4 - rect.left
                  : rect.right > crW - 4
                    ? crW - 4 - rect.right
                    : 0;
              const dy =
                rect.top < 4
                  ? 4 - rect.top
                  : rect.bottom > crH - 4
                    ? crH - 4 - rect.bottom
                    : 0;
              rect.left += dx;
              rect.right += dx;
              rect.top += dy;
              rect.bottom += dy;
              rect.x += dx;
              rect.y += dy;
              return rect;
            };

            const routeSlots = [];
            const routeSamples = [];
            const edgeData = edgeEls
              .map((path) => {
                const A = nodeState[path.dataset.a];
                const B = nodeState[path.dataset.b];
                if (!A || !B) return null;
                const target = (nodeEl) =>
                  nodeEl.querySelector(".sg-avatar") || nodeEl;
                const ar = target(A.el).getBoundingClientRect();
                const br = target(B.el).getBoundingClientRect();
                const ax = (ar.left + ar.width / 2 - cr.left) / S;
                const ay = (ar.top + ar.height / 2 - cr.top) / S;
                const bx = (br.left + br.width / 2 - cr.left) / S;
                const by = (br.top + br.height / 2 - cr.top) / S;
                const dx = bx - ax;
                const dy = by - ay;
                const dist = Math.hypot(dx, dy) || 1;
                const ux = dx / dist;
                const uy = dy / dist;
                const nx = -uy;
                const ny = ux;
                const idx = Number(path.dataset.idx || 0);
                const terminalShift = ((idx % 5) - 2) * (isSmallCanvas() ? 1.2 : 2);
                const x1 = ax + ux * (ar.width / (2 * S) + 5) + nx * terminalShift;
                const y1 = ay + uy * (ar.height / (2 * S) + 5) + ny * terminalShift;
                const x2 = bx - ux * (br.width / (2 * S) + 5) + nx * terminalShift;
                const y2 = by - uy * (br.height / (2 * S) + 5) + ny * terminalShift;
                const data = {
                  x1,
                  y1,
                  x2,
                  y2,
                  cx: (x1 + x2) / 2,
                  cy: (y1 + y2) / 2,
                  nx,
                  ny,
                  idx,
                };
                routeSlots.push({ x: data.cx, y: data.cy });
                routeSamples.push(
                  Array.from({ length: 13 }, (_, i) =>
                    linePoint(data, (i + 4) / 20),
                  ),
                );
                path.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
                return { path, ...data };
              })
              .filter(Boolean);

            const labelRects = [];
            labelEls.forEach((label) => {
              const idx = Number(label.dataset.idx || 0);
              const d = edgeData.find((e) => e.idx === idx);
              if (!d) return;
              const text = label.textContent || "";
              const font = currentBase.w <= 400 ? 9.5 : isSmallCanvas() ? 10.5 : 12;
              const w = Math.min(
                Math.max(text.length * font * 0.78 + 16, 34),
                isSmallCanvas() ? 72 : 92,
              );
              const h = font * 1.7 + 8;
              const p = linePoint(d, 0.5);
              const best = {
                x: p.x,
                y: p.y,
                left: p.x - w / 2,
                right: p.x + w / 2,
                top: p.y - h / 2,
                bottom: p.y + h / 2,
                score: 0,
              };
              const canvasW = cr.width / S;
              const canvasH = cr.height / S;
              let blocked =
                best.left < 4 ||
                best.right > canvasW - 4 ||
                best.top < 4 ||
                best.bottom > canvasH - 4;
              nodeRects.forEach((r) => {
                if (rectsOverlap(best, r)) blocked = true;
              });
              avatarCircles.forEach((c) => {
                if (rectCircleOverlap(best, c)) blocked = true;
              });
              labelRects.forEach((r) => {
                if (rectsOverlap(best, r)) blocked = true;
              });
              if (blocked) best.score = 1000;
              const bg = graphEdges.querySelector(
                `.sg-edge-label-bg[data-idx="${idx}"]`,
              );
              if (!best || best.score >= 1000) {
                label.classList.add("sg-lbl-hide");
                if (bg) bg.classList.add("sg-lbl-hide");
                return;
              }
              label.classList.remove("sg-lbl-hide");
              if (bg) bg.classList.remove("sg-lbl-hide");
              labelRects.push(best);
              label.setAttribute("x", best.x);
              label.setAttribute("y", best.y);
              if (bg) {
                bg.setAttribute("x", best.left);
                bg.setAttribute("y", best.top);
                bg.setAttribute("width", best.right - best.left);
                bg.setAttribute("height", best.bottom - best.top);
              }
            });
          }

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
              const S = scaleFactor || 1;
              const dx = (clientX - startX) / S,
                dy = (clientY - startY) / S;
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

          function highlightRelated(k) {
            const related = new Set([k]);
            edges.forEach((e) => {
              if (e.a === k) related.add(e.b);
              if (e.b === k) related.add(e.a);
            });
            Object.entries(nodeState).forEach(([key, s]) => {
              s.el.classList.toggle("sg-active", key === k);
              s.el.classList.toggle("sg-dim", !related.has(key));
            });
            Array.from(graphEdges.children).forEach((el) => {
              const on = el.dataset.a === k || el.dataset.b === k;
              el.classList.toggle("sg-hl", on);
              el.classList.toggle("sg-dim", !on);
            });
          }
          function clearHighlight() {
            Object.values(nodeState).forEach((s) =>
              s.el.classList.remove("sg-active", "sg-dim"),
            );
            Array.from(graphEdges.children).forEach((line) =>
              line.classList.remove("sg-hl", "sg-dim"),
            );
          }

          function getCharDescText(c) {
            const fullText =
              c.desc && c.desc !== c.storyDesc
                ? `${c.storyDesc} ${c.desc}`
                : c.storyDesc;
            return fullText.replace(/\s+/g, " ").trim();
          }
          function fitCharPanel() {
            if (!isSmallCanvas() || !graphWrap.classList.contains("sg-panel-open"))
              return;
            const fitClasses = ["sg-fit-compact", "sg-fit-tight", "sg-fit-ultra"];
            charPanel.classList.remove(...fitClasses);
            charPanel.style.removeProperty("--sg-char-fit-scale");
            for (const cls of fitClasses) {
              if (charPanel.scrollHeight <= charPanel.clientHeight) return;
              charPanel.classList.add(cls);
            }
            let scale = 1;
            for (
              let i = 0;
              i < 8 && charPanel.scrollHeight > charPanel.clientHeight;
              i++
            ) {
              scale = Math.max(
                0.62,
                scale * (charPanel.clientHeight / charPanel.scrollHeight),
              );
              charPanel.style.setProperty("--sg-char-fit-scale", String(scale));
            }
          }
          function showChar(k) {
            const c = getStoryChar(k);
            if (!c) return;
            currentCharKey = k;
            document.getElementById("sg-cAvtImg").src = enc(c.img);
            document.getElementById("sg-cName").textContent = c.name;
            document.getElementById("sg-cActor").textContent = c.actor;
            document.getElementById("sg-cDesc").textContent = getCharDescText(c);
            const tagEl = document.getElementById("sg-cRelTag");
            const coreKey = activeStory.chars.includes(HERO)
              ? HERO
              : activeStory.chars[0];
            const coreName = chars[coreKey]?.name || "主角";
            if (k === coreKey) {
              tagEl.textContent = "核心人物 · 本人";
              tagEl.style.background =
                "linear-gradient(135deg, var(--sg-primary), #7b96f7)";
            } else {
              const edgeToCore = edges.find(
                (e) =>
                  (e.a === k && e.b === coreKey) || (e.b === k && e.a === coreKey),
              );
              if (edgeToCore) {
                tagEl.textContent =
                  "与" +
                  coreName +
                  "：" +
                  (edgeToCore.label || RELN[edgeToCore.type]);
                tagEl.style.background = REL_COLORS[edgeToCore.type];
              } else if (c.storyRel.length) {
                tagEl.textContent = c.storyRel[0];
                tagEl.style.background =
                  "linear-gradient(135deg, var(--sg-primary), #7b96f7)";
              } else {
                tagEl.textContent = "本模块人物";
                tagEl.style.background =
                  "linear-gradient(135deg, var(--sg-primary), #7b96f7)";
              }
            }

            graphWrap.classList.add("sg-panel-open");
            highlightRelated(k);
            requestAnimationFrame(fitCharPanel);
            setTimeout(() => {
              relayout();
              fitCharPanel();
            }, 60);
          }
          function closeChar() {
            currentCharKey = null;
            charPanel.classList.remove("sg-fit-compact", "sg-fit-tight", "sg-fit-ultra");
            charPanel.style.removeProperty("--sg-char-fit-scale");
            graphWrap.classList.remove("sg-panel-open");
            clearHighlight();
            setTimeout(() => {
              relayout();
            }, 60);
          }
          document.getElementById("sg-charClose").addEventListener("click", closeChar);

          function getStoryDescText(story) {
            return story.desc || "";
          }
          function renderStoryButtons() {
            storyDesc.textContent = getStoryDescText(activeStory);
            storyBar.innerHTML = storyModules
              .map(
                (s, idx) =>
                  `<button class="sg-story-btn ${s.key === currentStoryKey ? "sg-active" : ""}" data-story="${s.key}"><span class="sg-story-index">${idx + 1}</span><span>${s.name}</span></button>`,
              )
              .join("");
            storyBar.querySelectorAll(".sg-story-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const next = btn.dataset.story;
                if (!next || next === currentStoryKey) return;
                currentStoryKey = next;
                activeStory = storyByKey[currentStoryKey];
                edges = activeStory.edges;
                currentCharKey = null;
                charPanel.classList.remove("sg-fit-compact", "sg-fit-tight", "sg-fit-ultra");
                charPanel.style.removeProperty("--sg-char-fit-scale");
                graphWrap.classList.remove("sg-panel-open");
                clearHighlight();
                renderStoryButtons();
                buildGraph();
              });
            });
            requestAnimationFrame(() => {
              updateStoryHint();
            });
          }
          function updateStoryHint() {
            if (!storyScrollHint) return;
            const canScrollRight =
              storyBar.scrollLeft + storyBar.clientWidth < storyBar.scrollWidth - 4;
            storyScrollHint.classList.toggle("sg-hide", !canScrollRight);
          }
          storyBar.addEventListener("scroll", updateStoryHint, { passive: true });
          if (storyScrollHint) {
            storyScrollHint.addEventListener("click", () => {
              storyBar.scrollBy({
                left: storyBar.clientWidth * 0.7,
                behavior: "smooth",
              });
            });
          }

          /* =========================================================
             视图 3：作品推荐 —— 4 tab + 每页4个 + 翻页
             ========================================================= */
          const worksGrid = document.getElementById("sg-worksGrid");
          const worksPageInfo = document.getElementById("sg-worksPageInfo");
          const worksPrev = document.getElementById("sg-worksPrev");
          const worksNext = document.getElementById("sg-worksNext");
          const worksScrollHint = document.getElementById("sg-worksScrollHint");
          let worksCat = "theme";
          let worksPage = 0;
          const WORKS_PER_PAGE = 4;

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
                const coverSrc = IMG + w.cover;
                return `
                <div class="sg-work-card ${w.up ? "sg-upcoming" : ""}">
                  <div class="sg-cover">
                    <img src="${enc(coverSrc)}" alt="${w.n}">
                    ${w.ep ? `<div class="sg-tag">${w.ep}</div>` : ""}
                  </div>
                  <div class="sg-info">
                    <div class="sg-n">${w.n}</div>
                    <div class="sg-m">${w.m
                      .split("/")
                      .slice(0, 2)
                      .map((s) => s.trim())
                      .join(" / ")}</div>
                    <div class="sg-r">▸ ${w.r}</div>
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
          function updateWorksHint() {
            if (!worksScrollHint) return;
            const canScrollRight =
              worksGrid.scrollLeft + worksGrid.clientWidth <
              worksGrid.scrollWidth - 4;
            worksScrollHint.classList.toggle("sg-hide", !canScrollRight);
          }
          worksGrid.addEventListener("scroll", updateWorksHint, { passive: true });
          if (worksScrollHint) {
            worksScrollHint.addEventListener("click", () => {
              worksGrid.scrollBy({
                left: worksGrid.clientWidth / 2,
                behavior: "smooth",
              });
            });
          }

          try {
            renderStoryButtons();
          } catch (e) {
            console.error("renderStoryButtons:", e);
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
          try {
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
          } catch (e) {
            console.error("tab init:", e);
          }

          /* resize 防抖：缩放同步执行，内部重排 debounce */
          let rzT;
          window.addEventListener("resize", () => {
            applyScale();
            clearTimeout(rzT);
            rzT = setTimeout(() => {
              try {
                buildGraph();
              } catch (e) {
                console.error("resize buildGraph:", e);
              }
              if (graphWrap.classList.contains("sg-panel-open")) {
                relayout();
                const c = currentCharKey ? getStoryChar(currentCharKey) : null;
                if (c)
                  document.getElementById("sg-cDesc").textContent = getCharDescText(c);
                fitCharPanel();
              }
              renderWorks();
            }, 150);
          });

          /* 初始化 */
          window.addEventListener("load", () => {
            try {
              applyScale(); // 用布局完成后的最终视口尺寸重算基准，修复 PC 刷新后卡在窄版
              buildGraph();
              renderWorks();
              updateStoryHint();
              startPhysics();
              const preload = new Set();
              Object.values(chars).forEach((c) => preload.add(c.img));
              Object.values(works)
                .flat()
                .forEach((w) => {
                  if (w.cover) preload.add(IMG + w.cover);
                });
              preload.forEach((src) => {
                const im = new Image();
                im.src = enc(src);
              });
              const heroNode = nodeState[HERO] && nodeState[HERO].el;
              if (heroNode) {
                heroNode.classList.add("sg-tap-hint");
                setTimeout(() => heroNode.classList.remove("sg-tap-hint"), 5600);
              }
            } catch (e) {
              console.error("init:", e);
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
  global.SanDuiLibrary = { mount: mount, create: create };
})(window);
