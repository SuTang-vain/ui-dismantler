/* Parser-backed decomposition from original.html. */
(function(global){
  'use strict';
  var TEMPLATE = `<main class="sg-pc-card-frame" data-dudesign-template="dtp_de_star_group_member_map" role="region" aria-label="BLACKPINK 动态百科成员探索卡">

  <nav class="sg-tab-bar" role="tablist" aria-label="BLACKPINK 探索视图">
    <button class="sg-tab" id="sg-tab-members" type="button" role="tab" aria-selected="true" aria-controls="sg-panel-members">成员详情 <small>4</small></button>
    <button class="sg-tab" id="sg-tab-timeline" type="button" role="tab" aria-selected="false" aria-controls="sg-panel-timeline">经历 <small>6</small></button>
    <button class="sg-tab" id="sg-tab-works" type="button" role="tab" aria-selected="false" aria-controls="sg-panel-works">团体作品 <small>6</small></button>
    <button class="sg-tab sg-tab-more" id="sg-tab-more" type="button" role="tab" aria-selected="false" aria-controls="modal-overlay-region">其它</button>
  </nav>

  <!-- 初始引导遮罩：组合照玻璃磨砂四分入口 -->
  <div class="sg-entry-cover" id="sg-entry-cover" aria-hidden="false">
    <img class="sg-entry-cover-img" src="https://bkimg.cdn.bcebos.com/pic/c995d143ad4bd11373f01a5e66fab30f4bfbfbedaf18?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="BLACKPINK 组合照">
    <div class="sg-entry-grids" role="list">
      <button class="sg-entry-cell" type="button" data-tab="sg-tab-members" style="--ci:1">
        <span class="sg-entry-no">01</span>
        <span class="sg-entry-name">成员详情</span>
        <span class="sg-entry-arrow">↓</span>
      </button>
      <button class="sg-entry-cell" type="button" data-tab="sg-tab-timeline" style="--ci:2">
        <span class="sg-entry-no">02</span>
        <span class="sg-entry-name">经历</span>
        <span class="sg-entry-arrow">↓</span>
      </button>
      <button class="sg-entry-cell" type="button" data-tab="sg-tab-works" style="--ci:3">
        <span class="sg-entry-no">03</span>
        <span class="sg-entry-name">团体作品</span>
        <span class="sg-entry-arrow">↓</span>
      </button>
      <button class="sg-entry-cell" type="button" data-tab="sg-tab-more" style="--ci:4">
        <span class="sg-entry-no">04</span>
        <span class="sg-entry-name">其它</span>
        <span class="sg-entry-arrow">↗</span>
      </button>
    </div>
  </div>

  <div class="sg-view-stack">

    <!-- 成员 + 关系主视图 -->
    <section class="sg-view sg-members-view sg-active" id="sg-panel-members" role="tabpanel" aria-labelledby="sg-tab-members">
      <div class="sg-member-stage">
        <div class="sg-member-grid" role="list">
          <button class="sg-member" type="button" role="listitem" data-member="jisoo" aria-pressed="true" data-color="violet">
            <figure class="sg-avatar" aria-hidden="true">
              <img src="https://bkimg.cdn.bcebos.com/pic/bd315c6034a85edf8db167d391071e23dd54574edfbd?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="金智秀">
              <span class="sg-avatar-fallback">Jisoo</span>
              <span class="sg-photo-source">百度百科</span>
              <span class="sg-member-info">
                <span class="sg-member-name">Jisoo · 金智秀</span>
                <span class="sg-member-role">主唱 · 视觉</span>
                <span class="sg-member-state">在团</span>
              </span>
            </figure>
          </button>
          <button class="sg-member" type="button" role="listitem" data-member="jennie" aria-pressed="false" data-color="pink">
            <figure class="sg-avatar" aria-hidden="true">
              <img src="https://bkimg.cdn.bcebos.com/pic/5243fbf2b2119313b07e4175a4621bd7912396dd27f9?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="金珍妮">
              <span class="sg-avatar-fallback">Je</span>
              <span class="sg-member-info">
                <span class="sg-member-name">Jennie · 金珍妮</span>
                <span class="sg-member-role">主唱 · 说唱 · 视觉</span>
                <span class="sg-member-state">在团</span>
              </span>
            </figure>
          </button>
          <button class="sg-member" type="button" role="listitem" data-member="rose" aria-pressed="false" data-color="gold">
            <figure class="sg-avatar" aria-hidden="true">
              <img src="https://img2.baidu.com/it/u=1620513757,1085926222&amp;fm=253&amp;app=138&amp;f=JPEG?w=800&amp;h=800" alt="朴彩英">
              <span class="sg-avatar-fallback">Rö</span>
              <span class="sg-member-info">
                <span class="sg-member-name">Rosé · 朴彩英</span>
                <span class="sg-member-role">主唱 · 领舞</span>
                <span class="sg-member-state">在团</span>
              </span>
            </figure>
          </button>
          <button class="sg-member" type="button" role="listitem" data-member="lisa" aria-pressed="false" data-color="blue">
            <figure class="sg-avatar" aria-hidden="true">
              <img src="https://n.sinaimg.cn/sinakd20109/120/w1120h1400/20251124/4d76-2860aac47ef6fb7cd99942bda74ce419.jpg" alt="Lisa">
              <span class="sg-avatar-fallback">Li</span>
              <span class="sg-member-info">
                <span class="sg-member-name">Lisa · Lalisa</span>
                <span class="sg-member-role">主舞 · 说唱 · 副唱</span>
                <span class="sg-member-state">在团</span>
              </span>
            </figure>
          </button>
        </div>
        <button class="sg-carousel-arrow sg-carousel-prev" type="button" aria-label="上一页">‹</button>
        <button class="sg-carousel-arrow sg-carousel-next" type="button" aria-label="下一页">›</button>
        <div class="sg-carousel-dots"></div>
      </div>

      <aside class="sg-detail-panel" aria-live="polite">
        <span class="sg-detail-kicker" id="sg-rel-kicker">成员 ↔ 团体 关系</span>
        <h2 id="sg-rel-name">Jisoo · 金智秀</h2>
        <p class="sg-subtitle" id="sg-rel-sub">队内定位：主唱 · 视觉</p>
        <div class="sg-relation-list" id="sg-rel-list">
          <div class="sg-relation-row"><span class="sg-rel-label">所属团体</span><span class="sg-rel-value">BLACKPINK</span></div>
          <div class="sg-relation-row"><span class="sg-rel-label">队内角色</span><span class="sg-rel-value">主唱 · 视觉</span></div>
          <div class="sg-relation-row"><span class="sg-rel-label">加入阶段</span><span class="sg-rel-value">出道成员 · 2016</span></div>
          <div class="sg-relation-row"><span class="sg-rel-label">团体代表</span><span class="sg-rel-value">《Square Up》《THE ALBUM》</span></div>
          <div class="sg-relation-row"><span class="sg-rel-label">当前状态</span><span class="sg-rel-value">在团</span></div>
        </div>
        <span class="sg-source-note">资料为可核实的公开事实;未列出的个人作品或履历留待补充。</span>
      </aside>
    </section>

    <!-- 入退团时间线 -->
    <section class="sg-view sg-timeline-view" id="sg-panel-timeline" role="tabpanel" aria-labelledby="sg-tab-timeline" hidden="">
      <div class="sg-section-head">
        <strong>组合阶段</strong>
        <span id="sg-tl-page-label">第 1 / 2 页 · 关键节点</span>
      </div>
      <div class="sg-tl-scroll-wrap">
        <button class="sg-carousel-arrow sg-tl-prev sg-tl-prev-pc sg-is-hidden" type="button" aria-label="上一页">‹</button>
        <button class="sg-carousel-arrow sg-tl-next sg-tl-next-pc sg-is-hidden" type="button" aria-label="下一页">›</button>
        <div class="sg-timeline-track" id="sg-tl-track">
          <!-- 第1页：3条经历 -->
          <article class="sg-t-item" data-story="0">
            <img class="sg-t-img" src="https://bkimg.cdn.bcebos.com/pic/d058ccbf6c81800a5b3cdcbcb83533fa838b47a2?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="出道" loading="lazy">
            <div class="sg-t-info"><time>2016.08</time>
            <b>出道 ·《Square One》</b>
            <p>以《WHISTLE》与《BOOMBAYAH》双主打正式出道,确立四人编制主唱/主舞双轴。</p>
            <span class="sg-t-hint">了解背景 ›</span></div>
            <div class="sg-t-story">
              <div class="sg-t-story-head"><time>2016.08</time><b>出道 ·《Square One》</b></div>
              <span class="sg-t-story-label">经历背景</span>
              <p class="sg-t-story-text">YG 娱乐时隔七年推出的全新女团。出道前四人经历长达四至六年的练习生训练,从多名练习生中脱颖而出。双主打《WHISTLE》与《BOOMBAYAH》的选拔历经数月,前者以空灵口哨 hook 搭配简约鼓点,后者融合电子舞曲。出道当日即登顶韩国音源榜单,《WHISTLE》成为团体首个音乐节目一位。</p>
              <button class="sg-t-story-close" type="button">收起</button>
            </div>
          </article>
          <article class="sg-t-item" data-story="1">
            <img class="sg-t-img" src="https://bkimg.cdn.bcebos.com/pic/c83d70cf3bc79f3d6f74cfdcb6a1cd11738b2940?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="SQUARE UP" loading="lazy">
            <div class="sg-t-info"><time>2018.06</time>
            <b>《SQUARE UP》迷你专辑</b>
            <p>凭《DDU-DU DDU-DU》刷新团体 MV 观看纪录,四人全员参与词曲与编舞。</p>
            <span class="sg-t-hint">了解背景 ›</span></div>
            <div class="sg-t-story">
              <div class="sg-t-story-head"><time>2018.06</time><b>《SQUARE UP》迷你专辑</b></div>
              <span class="sg-t-story-label">经历背景</span>
              <p class="sg-t-story-text">出道两年后的首张迷你专辑。主打曲《DDU-DU DDU-DU》以 Trap 节拍和标志性口哨旋律席卷全球,MV 在 YouTube 创下韩国女团最快破 10 亿观看纪录,并打入 Billboard Hot 100 榜单。收录曲《Forever Young》《Really》均由成员参与词曲创作,展现了从新人到音乐人的成长轨迹。</p>
              <button class="sg-t-story-close" type="button">收起</button>
            </div>
          </article>
          <article class="sg-t-item" data-story="2">
            <img class="sg-t-img" src="https://bkimg.cdn.bcebos.com/pic/9345d688d43f8794a4c27935615419f41bd5ad6e8cd3?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="THE ALBUM" loading="lazy">
            <div class="sg-t-info"><time>2020.10</time>
            <b>首张正规专辑《THE ALBUM》</b>
            <p>四位成员共同录制,与 Selena Gomez、Cardi B 等合作曲目列入团体作品。</p>
            <span class="sg-t-hint">了解背景 ›</span></div>
            <div class="sg-t-story">
              <div class="sg-t-story-head"><time>2020.10</time><b>首张正规专辑《THE ALBUM》</b></div>
              <span class="sg-t-story-label">经历背景</span>
              <p class="sg-t-story-text">出道四年来的里程碑之作,在新冠疫情期间录制完成。收录了与 Selena Gomez 合作的《Ice Cream》、与 Cardi B 合作的《Bet You Wanna》等国际化曲目。主打曲《Lovesick Girls》由 Jennie 和 Rosé 参与作词,探讨爱情中的伤痛与治愈。预售量突破 100 万张,刷新韩国女团纪录。</p>
              <button class="sg-t-story-close" type="button">收起</button>
            </div>
          </article>
          <!-- 第2页：3条经历 -->
          <article class="sg-t-item" data-story="3">
            <img class="sg-t-img" src="https://bkimg.cdn.bcebos.com/pic/0d338744ebf81a4c510f73495e7d7759252dd52a08a1?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="Pink Venom" loading="lazy">
            <div class="sg-t-info"><time>2022.09</time>
            <b>《Pink Venom》先行曲</b>
            <p>收录于《BORN PINK》的回归先行曲,团体作品。</p>
            <span class="sg-t-hint">了解背景 ›</span></div>
            <div class="sg-t-story">
              <div class="sg-t-story-head"><time>2022.09</time><b>《Pink Venom》先行曲</b></div>
              <span class="sg-t-story-label">经历背景</span>
              <p class="sg-t-story-text">作为《BORN PINK》正式回归前的预热单曲。该曲融合韩国传统乐器伽倻琴与现代嘻哈节拍,在 hook 部分采样了周杰伦《青花瓷》旋律片段,营造出东西方文化碰撞的独特听感。歌词以"毒"与"粉"的对比意象延续危险魅惑美学,发行后 24 小时内 YouTube 破亿。</p>
              <button class="sg-t-story-close" type="button">收起</button>
            </div>
          </article>
          <article class="sg-t-item" data-story="4">
            <img class="sg-t-img" src="https://i0.hdslb.com/bfs/new_dyn/eaca03ec96ad350d9ff5567e72ebbc29503647121.jpg@progressive.webp" alt="世界巡回演唱会" loading="lazy">
            <div class="sg-t-info"><time>2022.09</time>
            <b>世界巡回演唱会</b>
            <p>以《BORN PINK》为主题开展世界巡回,团体活动。</p>
            <span class="sg-t-hint">了解背景 ›</span></div>
            <div class="sg-t-story">
              <div class="sg-t-story-head"><time>2022.09</time><b>世界巡回演唱会</b></div>
              <span class="sg-t-story-label">经历背景</span>
              <p class="sg-t-story-text">以《BORN PINK》为主题开启的世界巡回演唱会,覆盖北美、欧洲、亚洲多国。累计观众超过 150 万人次,是韩国女团历史上规模最大的巡回演出之一。巡演舞台设计融入古典与街头元素,主打曲《Shut Down》以帕格尼尼《钟》采样开场,成为标志性演出。</p>
              <button class="sg-t-story-close" type="button">收起</button>
            </div>
          </article>
          <article class="sg-t-item" data-story="5">
            <img class="sg-t-img" src="https://bkimg.cdn.bcebos.com/pic/3801213fb80e7bec54e75a8fd578ae389b504fc23d1c?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" alt="团体状态" loading="lazy">
            <div class="sg-t-info"><time>当前</time>
            <b>团体状态</b>
            <p>四人仍为 BLACKPINK 成员,具体行程以官方为准。</p>
            <span class="sg-t-hint">了解背景 ›</span></div>
            <div class="sg-t-story">
              <div class="sg-t-story-head"><time>当前</time><b>团体状态</b></div>
              <span class="sg-t-story-label">经历背景</span>
              <p class="sg-t-story-text">四人仍为 BLACKPINK 成员。2023 年底团体合约续约后,成员个人活动与团体活动并行发展。各成员相继开展个人音乐、影视、时尚等领域活动,团体回归时间以 YG 官方公告为准。组合整体仍保持活跃状态。</p>
              <button class="sg-t-story-close" type="button">收起</button>
            </div>
          </article>
        </div>
      </div>
      <!-- 滚动控制栏：左箭头 + 指示器 + 右箭头 -->
      <div class="sg-tl-controls">
        <button class="sg-carousel-arrow sg-tl-prev sg-tl-prev-mobile sg-is-hidden" type="button" aria-label="上一页">‹</button>
        <div class="sg-tl-dots" id="sg-tl-dots"></div>
        <button class="sg-carousel-arrow sg-tl-next sg-tl-next-mobile" type="button" aria-label="下一页">›</button>
      </div>
    </section>

    <!-- 团体作品：中心聚焦轮播 -->
    <section class="sg-view sg-works-view" id="sg-panel-works" role="tabpanel" aria-labelledby="sg-tab-works" hidden="">
      <div class="sg-section-head">
        <strong>团体作品概览</strong>
        <span>仅收录团体作品 · 个人作品另列</span>
      </div>
      <div class="sg-ws-scroll-wrap">
        <button class="sg-carousel-arrow sg-ws-prev" type="button" aria-label="上一个">‹</button>
        <button class="sg-carousel-arrow sg-ws-next" type="button" aria-label="下一个">›</button>
        <div class="sg-works-carousel" id="sg-works-carousel">
          <!-- JS 动态渲染轮播卡片 -->
        </div>
        <div class="sg-ws-dots" id="sg-ws-dots"></div>
      </div>
      <!-- 引导按钮：探索当前专辑的创作背景故事 -->
      <button class="sg-ws-story-cta" id="sg-ws-story-cta" type="button">展开创作故事</button>
      <!-- 专辑故事面板（覆盖在作品视图上方） -->
      <div class="sg-work-story-panel" id="sg-work-story-panel" hidden="">
        <button class="sg-ws-story-close" id="sg-ws-story-close" type="button" aria-label="关闭故事">×</button>
        <div class="sg-ws-story-body" id="sg-ws-story-body">
          <!-- JS 动态填充: 封面 + 年份 + 标题 + 创作背景故事 -->
        </div>
      </div>
      <!-- 作品数据源（隐藏，供 JS 读取） -->
      <script type="application/json" id="sg-works-data">
      [
        {"img":"https://bkimg.cdn.bcebos.com/pic/faf2b2119313b07e60a8d1be04d7912397dd8c6b?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080","alt":"Square One","year":"2016 · 单曲","title":"《Square One》","desc":"出道双主打《WHISTLE》《BOOMBAYAH》收录,团体首支作品。","story":"2016年8月8日,BLACKPINK 以《Square One》正式出道,这是 YG 娱乐时隔七年推出的全新女团。专辑收录双主打《WHISTLE》与《BOOMBAYAH》,前者以空灵口哨 hook 搭配简约鼓点,后者融合电子舞曲与异域风情。两首曲目均在发行当日登顶韩国音源榜单,《WHISTLE》更成为团体首个音乐节目一位获奖曲。这张作品确立了 Jisoo、Jennie、Rosé、Lisa 四人编制的主唱/主舞双轴定位,也为后续 BLACKPINK 横扫全球的征程奠定了基石。"},
        {"img":"https://bkimg.cdn.bcebos.com/pic/3ac79f3df8dcd100620612a97e8b4710b8122fa4?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080","alt":"SQUARE UP","year":"2018 · 迷你专辑","title":"《SQUARE UP》","desc":"包含《DDU-DU DDU-DU》《Forever Young》等团体主打。","story":"2018年6月15日发行的首张迷你专辑,主打曲《DDU-DU DDU-DU》以强有力的Trap节拍和标志性口哨旋律席卷全球。该曲 MV 在YouTube 创下韩国女团最快破10亿观看纪录,并打入美国 Billboard Hot 100 榜单,刷新韩国女团历史最高排位。专辑收录曲《Forever Young》《Really》《See U Later》均由四位成员参与词曲创作与编舞设计,展现了团体从新人到音乐人的成长轨迹。这张专辑标志着 BLACKPINK 从韩国本土新人正式跃升为具有全球影响力的现象级团体。"},
        {"img":"https://bkimg.cdn.bcebos.com/pic/a9d3fd1f4134970a91b523949bcad1c8a6865d42?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080","alt":"Kill This Love","year":"2019 · 单曲","title":"《Kill This Love》","desc":"同名主打及 EP,由团体全员参与录制与表演。","story":"2019年4月5日发行的回归先行曲及同名EP,主打曲《Kill This Love》以军乐鼓号元素搭配强烈铜管,营造出凌厉而富有戏剧张力的听感。该曲在发行后24小时内打破 YouTube 单日最高播放纪录,并再次刷新团体在 Billboard Hot 100 的排位。EP 收录《Don't Know What To Do》《Kick It》《Hope Not》等曲,全员参与录制与舞台表演,编舞中融入军鼓踏步与利落手势,成为 BLACKPINK 巡演的标志性舞台之一。这次回归确立了团体\\"强烈概念\\"的音乐美学方向。"},
        {"img":"https://bkimg.cdn.bcebos.com/pic/7c1ed21b0ef41bd5ad6ebd520d9096cb39dbb6fd9749?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080","alt":"THE ALBUM","year":"2020 · 正规专辑","title":"《THE ALBUM》","desc":"首张韩国正规专辑,合作曲目含 Selena Gomez、Cardi B。","story":"2020年10月2日发行的首张韩国正规专辑,是 BLACKPINK 出道四年来的里程碑之作。专辑在新冠疫情期间录制完成,收录了与 Selena Gomez 合作的《Ice Cream》、与 Cardi B 合作的《Bet You Wanna》等国际化合作曲目。主打曲《Lovesick Girls》由 Jennie 和 Rosé 参与作词,探讨了爱情中的伤痛与治愈,展现出团体在音乐表达上的成熟蜕变。专辑预售量突破100万张,刷新韩国女团纪录,并登顶 Billboard 200 榜单第2位,标志着 BLACKPINK 正式跻身全球顶级流行团体行列。"},
        {"img":"https://bkimg.cdn.bcebos.com/pic/d439b6003af33a87e950fe7cbf0b07385343fbf21f07?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080","alt":"Pink Venom","year":"2022 · 单曲","title":"《Pink Venom》","desc":"回归先行曲,团体作品,收录于《BORN PINK》。","story":"2022年8月19日发行的回归先行曲,作为《BORN PINK》正式回归前的预热单曲。该曲融合韩国传统乐器伽倻琴与现代嘻哈节拍,在 hook 部分采样了周杰伦《青花瓷》的旋律片段,营造出东西方文化碰撞的独特听感。歌词以\\"毒\\"与\\"粉\\"的对比意象,延续了 BLACKPINK 标志性的危险魅惑美学。《Pink Venom》发行后迅速登顶全球多国 Spotify 榜单,并在 YouTube 创下24小时内最快破亿观看纪录,为后续《BORN PINK》的全球性成功奠定了巨大声势。"},
        {"img":"https://bkimg.cdn.bcebos.com/pic/aa64034f78f0f736afc3de4a3d00a419ebc4b745b579?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080","alt":"BORN PINK","year":"2022 · 正规专辑","title":"《BORN PINK》","desc":"第二张韩国正规专辑及世界巡回主题专辑。","story":"2022年9月16日发行的第二张韩国正规专辑,是 BLACKPINK 迄今最具野心的一张作品。主打曲《Shut Down》采样了帕格尼尼名曲《钟》,以古典小提琴与Trap节拍的碰撞营造出强烈的戏剧张力。专辑预售量突破200万张,刷新韩国女团历史纪录,并登顶 Billboard 200 榜单第1位,成为首个登顶该榜的韩国女团。以《BORN PINK》为主题,团体开启了覆盖北美、欧洲、亚洲的世界巡回演唱会,累计观众超过150万人次,标志着 BLACKPINK 进入团体发展的全新阶段——从现象级新人蜕变为具有持久影响力的全球流行文化符号。"}
      ]
      <\/script>
    </section>
  </div>

  <!-- Modal overlay: 资料与来源说明 -->
</main>
<div class="sg-modal-overlay" id="sg-member-modal" role="dialog" aria-modal="true" aria-labelledby="sg-member-modal-title" hidden="">
  <div class="sg-modal-card sg-member-detail-modal">
    <button class="sg-modal-x-btn" type="button" id="sg-member-modal-close" aria-label="关闭">×</button>
    <div class="sg-modal-head">
      <h3 id="sg-member-modal-title">成员详情</h3>
    </div>
    <div class="sg-modal-body" id="sg-member-modal-body">
      <!-- 动态填充 -->
    </div>
    <div class="sg-modal-foot">
      <span class="sg-modal-decl">点击卡片查看详情</span>
    </div>
  </div>
</div>
<div class="sg-modal-overlay" id="sg-modal" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title" hidden="">
  <div class="sg-modal-card">
    <button class="sg-modal-x-btn" type="button" id="sg-modal-close" aria-label="关闭">×</button>
    <div class="sg-modal-head">
      <h3 id="sg-modal-title">资料与说明</h3>
    </div>
    <p class="sg-modal-sub">本卡片仅使用可核实的公开事实,具体年代、关系以官方与权威来源为准。</p>
    <div class="sg-modal-body">
      <div class="sg-m-row"><small>词条类型</small><span>韩国女子演唱组合 · 四人编制</span></div>
      <div class="sg-m-row"><small>经纪机构</small><span>YG Entertainment(韩国)</span></div>
      <div class="sg-m-row"><small>出道日期</small><span>2016 年 8 月 8 日</span></div>
      <div class="sg-m-row"><small>当前成员</small><span>Jisoo、Jennie、Rosé、Lisa — 均为出道成员</span></div>
      <div class="sg-m-row"><small>历任成员</small><span>暂无退出成员;若以官方公告为准。</span></div>
      <div class="sg-m-row"><small>图片来源</small><span>Jisoo 头像来源:百度百科 · 金智秀词条</span></div>
      <div class="sg-m-row sg-full"><small>资料声明</small><span>事实中立,虚构履历或未公开状态一律不填写。</span></div>
    </div>
    <div class="sg-modal-foot">
      <span class="sg-modal-decl">动态百科 · 资料与说明</span>
    </div>
  </div>
</div>`;
  function mount(root, options) {
    if (!root) throw new Error('mount root is required');

    root.innerHTML = TEMPLATE;

    (function () {
      'use strict';

      // ---- Member data (array format for carousel support) ----
      var memberList = (options && options.memberList) || [
        {
          key: 'jisoo', name: 'Jisoo · 金智秀', role: '队内定位:主唱 · 视觉', shortName: 'Jisoo', color: 'violet',
          img: 'https://bkimg.cdn.bcebos.com/pic/bd315c6034a85edf8db167d391071e23dd54574edfbd?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080',
          photoSource: '百度百科',
          relations: [
            ['所属团体',   'BLACKPINK'],
            ['队内角色',   '主唱 · 视觉'],
            ['加入阶段',   '出道成员 · 2016'],
            ['团体代表',   '《Square Up》《THE ALBUM》'],
            ['当前状态',   '在团']
          ]
        },
        {
          key: 'jennie', name: 'Jennie · 金珍妮', role: '队内定位:主唱 · 说唱 · 视觉', shortName: 'Je', color: 'pink',
          img: 'https://bkimg.cdn.bcebos.com/pic/5243fbf2b2119313b07e4175a4621bd7912396dd27f9?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080',
          photoSource: '百度百科',
          relations: [
            ['所属团体',   'BLACKPINK'],
            ['队内角色',   '主唱 · 说唱 · 视觉'],
            ['加入阶段',   '出道成员 · 2016'],
            ['团体代表',   '《SQUARE UP》《Kill This Love》'],
            ['当前状态',   '在团']
          ]
        },
        {
          key: 'rose', name: 'Rosé · 朴彩英', role: '队内定位:主唱 · 领舞', shortName: 'Rö', color: 'gold',
          img: 'https://img2.baidu.com/it/u=1620513757,1085926222&fm=253&app=138&f=JPEG?w=800&h=800',
          photoSource: '百度图片',
          relations: [
            ['所属团体',   'BLACKPINK'],
            ['队内角色',   '主唱 · 领舞'],
            ['加入阶段',   '出道成员 · 2016'],
            ['团体代表',   '《THE ALBUM》《BORN PINK》'],
            ['当前状态',   '在团']
          ]
        },
        {
          key: 'lisa', name: 'Lisa · Lalisa', role: '队内定位:主舞 · 说唱 · 副唱', shortName: 'Li', color: 'blue',
          img: 'https://n.sinaimg.cn/sinakd20109/120/w1120h1400/20251124/4d76-2860aac47ef6fb7cd99942bda74ce419.jpg',
          photoSource: '新浪图片',
          relations: [
            ['所属团体',   'BLACKPINK'],
            ['队内角色',   '主舞 · 说唱 · 副唱'],
            ['加入阶段',   '出道成员 · 2016'],
            ['团体代表',   '《Kill This Love》《Pink Venom》'],
            ['当前状态',   '在团']
          ]
        }
      ];

      // ---- Carousel state ----
      const membersPerPage = 4;
      var totalPages = Math.ceil(memberList.length / membersPerPage);
      var currentPage = 1;
      var selectedMemberKey = 'jisoo';
      var memberGrid = document.querySelector(".sg-member-grid");
      var carouselPrev = document.querySelector(".sg-carousel-prev");
      var carouselNext = document.querySelector(".sg-carousel-next");
      var carouselDots = document.querySelector(".sg-carousel-dots");

      // ---- Build member data lookup for quick access ----
      var memberData = {};
      memberList.forEach(function(m) { memberData[m.key] = m; });

      // ---- DOM refs ----
      var relName  = document.getElementById("sg-rel-name");
      var relSub   = document.getElementById("sg-rel-sub");
      var relList  = document.getElementById("sg-rel-list");
      var relKick  = document.getElementById("sg-rel-kicker");

      // ---- Render a page of members ----
      function renderMemberPage(page) {
        var start = (page - 1) * membersPerPage;
        var pageMembers = memberList.slice(start, start + membersPerPage);

        memberGrid.innerHTML = '';
        pageMembers.forEach(function(m) {
          var btn = document.createElement('button');
          btn.className = "sg-member";
          btn.type = 'button';
          btn.setAttribute('role', 'listitem');
          btn.dataset.member = m.key;
          btn.setAttribute('aria-pressed', m.key === selectedMemberKey ? 'true' : 'false');

          var fig = document.createElement('figure');
          fig.className = "sg-avatar";
          fig.setAttribute('aria-hidden', 'true');

          var img = document.createElement('img');
          img.src = m.img;
          img.alt = m.name;
          img.addEventListener('load', function() { img.classList.add("sg-is-loaded"); });
          img.addEventListener('error', function() { img.classList.add("sg-is-error"); });
          fig.appendChild(img);

          var fallback = document.createElement('span');
          fallback.className = "sg-avatar-fallback";
          fallback.textContent = m.shortName;
          fig.appendChild(fallback);

          var source = document.createElement('span');
          source.className = "sg-photo-source";
          source.textContent = m.photoSource;
          fig.appendChild(source);

          var info = document.createElement('span');
          info.className = "sg-member-info";

          var nameSpan = document.createElement('span');
          nameSpan.className = "sg-member-name";
          nameSpan.textContent = m.name;
          info.appendChild(nameSpan);

          var roleSpan = document.createElement('span');
          roleSpan.className = "sg-member-role";
          roleSpan.textContent = m.role.replace('队内定位:', '');
          info.appendChild(roleSpan);

          var stateSpan = document.createElement('span');
          stateSpan.className = "sg-member-state";
          stateSpan.textContent = '在团';
          info.appendChild(stateSpan);

          fig.appendChild(info);
          btn.appendChild(fig);

          // Click handler
          btn.addEventListener('click', function() {
            selectMember(m.key, true);
          });

          memberGrid.appendChild(btn);
        });

        // Update arrows
        carouselPrev.classList.toggle("sg-is-hidden", page <= 1);
        carouselNext.classList.toggle("sg-is-hidden", page >= totalPages);

        // Update dots
        carouselDots.innerHTML = '';
        for (var i = 1; i <= totalPages; i++) {
          var dot = document.createElement('button');
          dot.className = "sg-dot" + (i === page ? " sg-is-active" : '');
          dot.type = 'button';
          dot.setAttribute('aria-label', '第 ' + i + ' 页');
          dot.addEventListener('click', function(p) {
            return function() { goToPage(p); };
          }(i));
          carouselDots.appendChild(dot);
        }
      }

      function goToPage(page) {
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        currentPage = page;
        renderMemberPage(page);
      }

      carouselPrev.addEventListener('click', function() { goToPage(currentPage - 1); stopAutoPlay(); });
      carouselNext.addEventListener('click', function() { goToPage(currentPage + 1); stopAutoPlay(); });

      // ---- Auto-play: cycle through individual members ----
      var autoPlayTimer = null;
      var autoPlayInterval = 3000;
      var autoPlayMemberIndex = 0;

      function startAutoPlay() {
        stopAutoPlay();
        autoPlayMemberIndex = 0;
        autoPlayTimer = setInterval(function() {
          autoPlayMemberIndex++;
          if (autoPlayMemberIndex >= memberList.length) autoPlayMemberIndex = 0;
          var m = memberList[autoPlayMemberIndex];
          selectMember(m.key);
        }, autoPlayInterval);
      }

      function stopAutoPlay() {
        if (autoPlayTimer) {
          clearInterval(autoPlayTimer);
          autoPlayTimer = null;
        }
      }

      // ---- Helper: select a member by key ----
      function selectMember(key, showModal) {
        selectedMemberKey = key;
        document.querySelectorAll(".sg-member").forEach(function(el) {
          el.setAttribute('aria-pressed', el.dataset.member === key ? 'true' : 'false');
        });
        var d = memberData[key];
        if (!d) return;
        relName.textContent = d.name;
        relSub.textContent  = d.role;
        relList.innerHTML   = '';
        d.relations.forEach(function(row) {
          var div = document.createElement('div');
          div.className = "sg-relation-row";
          div.innerHTML = "<span class=\"sg-rel-label\">" + row[0] + "</span><span class=\"sg-rel-value\">" + row[1] + '</span>';
          relList.appendChild(div);
        });
        relKick.textContent = '成员 ↔ 团体 关系 · ' + d.name.split(' ')[0];
        // 显示成员详情弹窗：移动端（detail-panel 隐藏时）
        if (showModal && (window.innerWidth <= 500 || window.innerHeight <= 380)) {
          openMemberModal(d);
        }
      }

      // Stop on any user interaction
      function onUserInteraction() { stopAutoPlay(); }

      document.querySelector(".sg-member-stage").addEventListener('click', onUserInteraction);
      document.querySelector(".sg-member-stage").addEventListener('touchstart', onUserInteraction);
      carouselDots.addEventListener('click', onUserInteraction);
      memberGrid.addEventListener('click', onUserInteraction);

      // ---- Initial render ----
      renderMemberPage(1);
      startAutoPlay();

      // ---- Member detail modal (for small screens) ----
      var memberModal = document.getElementById("sg-member-modal");
      var memberModalBody = document.getElementById("sg-member-modal-body");
      var memberModalClose = document.getElementById("sg-member-modal-close");
      var memberModalTitle = document.getElementById("sg-member-modal-title");

      function openMemberModal(data) {
        memberModalTitle.textContent = data.name;
        memberModalBody.innerHTML = '';
        // 成员信息头：头像 + 名字 + 角色
        var header = document.createElement('div');
        header.className = "sg-mdm-header";
        var avatar = document.createElement('div');
        avatar.className = "sg-mdm-avatar " + (data.color || '');
        if (data.img) {
          avatar.innerHTML = '<img src="' + data.img + '" alt="' + data.name + '" />';
        } else {
          avatar.textContent = data.shortName || data.name.charAt(0);
        }
        var headText = document.createElement('div');
        headText.className = "sg-mdm-head-text";
        headText.innerHTML = '<b>' + data.name + '</b><span>' + (data.role || '').replace('队内定位:', '') + '</span>';
        header.appendChild(avatar);
        header.appendChild(headText);
        memberModalBody.appendChild(header);
        // 关系列表
        data.relations.forEach(function (row) {
          var div = document.createElement('div');
          div.className = "sg-m-row";
          div.innerHTML = '<small>' + row[0] + '</small><span>' + row[1] + '</span>';
          memberModalBody.appendChild(div);
        });
        memberModal.hidden = false;
        memberModal.classList.add("sg-open");
      }

      function closeMemberModal() {
        memberModal.classList.remove("sg-open");
        memberModal.hidden = true;
      }

      memberModalClose.addEventListener('click', closeMemberModal);
      memberModal.addEventListener('click', function (e) {
        if (e.target === memberModal) closeMemberModal();
      });

      // ---- Tab bar switching (aria-selected + hidden) ----
      var tabs   = document.querySelectorAll(".sg-tab-bar .sg-tab");
      var panels = {
        "sg-tab-members":  document.getElementById("sg-panel-members"),
        "sg-tab-timeline": document.getElementById("sg-panel-timeline"),
        "sg-tab-works":    document.getElementById("sg-panel-works")
      };
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          // The "more" tab opens a modal — handled by its own listener.
          if (tab.id === "sg-tab-more") return;
          tabs.forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
          Object.keys(panels).forEach(function (key) {
            var p = panels[key];
            var active = (key === tab.id);
            p.hidden = !active;
            p.classList.toggle("sg-active", active);
          });
          // reset timeline scroll to start when entering
          if (tab.id === "sg-tab-timeline") resetTimelineScroll();
          // 进入作品页启动自动轮播，离开时停止
          if (tab.id === "sg-tab-works") {
            startWorksAutoPlay();
          } else {
            stopWorksAutoPlay();
          }
          // closing the modal (if open) clears the more-tab's aria-selected
          if (!modal.hidden) closeModal();
        });
      });

      // ---- 初始引导遮罩：点击玻璃块进入对应页，或点 tab-bar 同步淡出 ----
      var entryCover = document.getElementById("sg-entry-cover");
      function dismissEntryCover() {
        if (entryCover.classList.contains("sg-is-hidden")) return;
        entryCover.classList.add("sg-is-hidden");
        entryCover.setAttribute('aria-hidden', 'true');
        setTimeout(function () { entryCover.style.display = 'none'; }, 420);
      }
      function restoreEntryCover() {
        entryCover.style.display = '';
        entryCover.setAttribute('aria-hidden', 'false');
        // 触发重排再移除 is-hidden，确保 opacity 过渡生效
        void entryCover.offsetWidth;
        entryCover.classList.remove("sg-is-hidden");
      }
      function deactivateAllContentTabs() {
        // 清空三个内容 Tab 的选中态，回到「无内容页」初始状态
        tabs.forEach(function (t) {
          if (t.id !== "sg-tab-more") t.setAttribute('aria-selected', 'false');
        });
        Object.keys(panels).forEach(function (key) {
          var p = panels[key];
          p.hidden = true;
          p.classList.remove("sg-active");
        });
        stopWorksAutoPlay();
      }
      entryCover.querySelectorAll(".sg-entry-cell").forEach(function (cell) {
        cell.addEventListener('click', function () {
          var tabId = cell.getAttribute('data-tab');
          if (tabId === "sg-tab-more") {
            // 其它：恢复初始态并在其上叠加弹窗
            deactivateAllContentTabs();
            restoreEntryCover();
            if (modal.hidden) openModal();
          } else {
            document.getElementById(tabId).click();
            dismissEntryCover();
          }
        });
      });
      // 点 tab-bar（成员/经历/作品）进入对应页并淡出遮罩
      tabs.forEach(function (tab) {
        if (tab.id === "sg-tab-more") return;
        tab.addEventListener('click', dismissEntryCover);
      });

      // ---- Timeline horizontal scroll with arrows ----
      var tlTrack = document.getElementById("sg-tl-track");
      // PC 端箭头（绝对定位） + 移动端箭头（底部控制栏）
      var tlPrevPc = document.querySelector(".sg-tl-prev-pc");
      var tlNextPc = document.querySelector(".sg-tl-next-pc");
      var tlPrevMobile = document.querySelector(".sg-tl-prev-mobile");
      var tlNextMobile = document.querySelector(".sg-tl-next-mobile");
      var tlLabel = document.getElementById("sg-tl-page-label");
      var tlItems = document.querySelectorAll(".sg-t-item");
      var tlDots = document.getElementById("sg-tl-dots");

      // 同步设置两组箭头的 is-hidden
      function setTlPrevHidden(hidden) {
        tlPrevPc.classList.toggle("sg-is-hidden", hidden);
        tlPrevMobile.classList.toggle("sg-is-hidden", hidden);
      }
      function setTlNextHidden(hidden) {
        tlNextPc.classList.toggle("sg-is-hidden", hidden);
        tlNextMobile.classList.toggle("sg-is-hidden", hidden);
      }

      // Build dot indicators (visible only on small screens)
      function buildTlDots() {
        tlDots.innerHTML = '';
        var total = getTlTotalPages();
        for (var i = 0; i < total; i++) {
          var dot = document.createElement('button');
          dot.className = "sg-tl-dot" + (i === 0 ? " sg-is-active" : '');
          dot.setAttribute('type', 'button');
          dot.setAttribute('data-index', i);
          dot.addEventListener('click', function () {
            var idx = Number(this.dataset.index);
            var itemWidth = getTlItemWidth();
            tlTrack.scrollTo({ left: idx * itemWidth * getTlPerPage(), behavior: 'smooth' });
          });
          tlDots.appendChild(dot);
        }
      }

      function getTlPerPage() {
        if (window.innerWidth <= 320 || window.innerHeight <= 380) return 2;
        if (window.innerWidth <= 500) return 2;
        return 3;
      }

      function getTlTotalPages() {
        var perPage = getTlPerPage();
        return Math.ceil(tlItems.length / perPage);
      }

      function getTlItemWidth() {
        // 优先使用未展开卡片宽度，避免展开态卡片干扰分页计算
        var normalItem = document.querySelector(".sg-t-item:not(.sg-is-expanded)");
        if (normalItem) return normalItem.offsetWidth + 10; // gap = 10
        var item = tlItems[0];
        if (!item) return 0;
        return item.offsetWidth + 10;
      }

      function updateTlArrows() {
        var scrollLeft = tlTrack.scrollLeft;
        var maxScroll = tlTrack.scrollWidth - tlTrack.clientWidth;
        // Show/hide prev arrow (both PC and mobile)
        setTlPrevHidden(scrollLeft <= 5);
        // Show/hide next arrow (both PC and mobile)
        setTlNextHidden(scrollLeft >= maxScroll - 5);
        // Update page label & dots
        var perPage = getTlPerPage();
        var totalPages = getTlTotalPages();
        var itemWidth = getTlItemWidth();
        var pageNum = 1;
        if (itemWidth > 0) {
          pageNum = Math.round(scrollLeft / (itemWidth * perPage)) + 1;
          pageNum = Math.max(1, Math.min(pageNum, totalPages));
        }
        tlLabel.textContent = '第 ' + pageNum + ' / ' + totalPages + ' 页 · 关键节点';
        // Update dots
        var dots = tlDots.querySelectorAll(".sg-tl-dot");
        dots.forEach(function (d, i) {
          d.classList.toggle("sg-is-active", i === pageNum - 1);
        });
      }

      function scrollTlPrev() {
        var perPage = getTlPerPage();
        var itemWidth = getTlItemWidth();
        tlTrack.scrollBy({ left: -itemWidth * perPage, behavior: 'smooth' });
      }
      function scrollTlNext() {
        var perPage = getTlPerPage();
        var itemWidth = getTlItemWidth();
        tlTrack.scrollBy({ left: itemWidth * perPage, behavior: 'smooth' });
      }

      // 绑定两组箭头点击事件
      tlPrevPc.addEventListener('click', scrollTlPrev);
      tlNextPc.addEventListener('click', scrollTlNext);
      tlPrevMobile.addEventListener('click', scrollTlPrev);
      tlNextMobile.addEventListener('click', scrollTlNext);

      tlTrack.addEventListener('scroll', updateTlArrows);
      window.addEventListener('resize', function () {
        buildTlDots();
        updateTlArrows();
      });

      function resetTimelineScroll() {
        tlTrack.scrollTo({ left: 0, behavior: 'auto' });
        // 延迟到布局完成后再计算箭头显隐（面板刚切换可见时尺寸为0）
        requestAnimationFrame(function () {
          tlTrack.scrollTo({ left: 0, behavior: 'auto' });
          updateTlArrows();
        });
      }

      // Initial - defer until layout is ready
      buildTlDots();
      requestAnimationFrame(updateTlArrows);

      // ---- Modal overlay (triggered by the top tab bar) ----
      var modal      = document.getElementById("sg-modal");
      var modalClose = document.getElementById("sg-modal-close");
      var tabMore    = document.getElementById("sg-tab-more");

      function openModal() {
        modal.hidden = false;
        modal.classList.add("sg-open");
        tabMore.setAttribute('aria-selected', 'true');
        tabMore.setAttribute('aria-expanded', 'true');
      }
      function closeModal() {
        modal.classList.remove("sg-open");
        modal.hidden = true;
        tabMore.setAttribute('aria-selected', 'false');
        tabMore.setAttribute('aria-expanded', 'false');
      }
      tabMore.addEventListener('click', function () {
        if (modal.hidden) {
          // 打开弹窗前：恢复初始引导态并关闭内容页
          deactivateAllContentTabs();
          restoreEntryCover();
          openModal();
        } else {
          closeModal();
        }
      });
      modalClose.addEventListener('click', closeModal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hidden) closeModal();
      });

      // ---- Works 中心聚焦轮播引擎 ----
      var worksCarousel = document.getElementById("sg-works-carousel");
      var wsDots = document.getElementById("sg-ws-dots");
      var wsPrev = document.querySelector(".sg-ws-prev");
      var wsNext = document.querySelector(".sg-ws-next");
      var worksDataEl = document.getElementById("sg-works-data");
      var worksData = [];
      try { worksData = JSON.parse(worksDataEl.textContent); } catch (e) { worksData = []; }

      var currentWorkIndex = 0;
      var worksAutoTimer = null;
      var WORKS_AUTO_INTERVAL = 3500;
      var wsCards = [];

      // 渲染轮播卡片
      function renderWorksCarousel() {
        worksCarousel.innerHTML = '';
        wsDots.innerHTML = '';
        wsCards = [];
        worksData.forEach(function (w, i) {
          var card = document.createElement('article');
          card.className = "sg-work-item";
          card.setAttribute('data-index', i);
          card.innerHTML =
            "<img class=\"sg-w-img\" src=\"" + w.img + '" alt="' + w.alt + '" loading="lazy" />' +
            "<div class=\"sg-work-info\">" +
              "<span class=\"sg-work-year\">" + w.year + '</span>' +
              '<b>' + w.title + '</b>' +
              '<p>' + w.desc + '</p>' +
            '</div>';
          worksCarousel.appendChild(card);
          wsCards.push(card);

          // 指示器
          var dot = document.createElement('button');
          dot.className = "sg-ws-dot" + (i === 0 ? " sg-is-active" : '');
          dot.setAttribute('type', 'button');
          dot.setAttribute('aria-label', '第 ' + (i + 1) + ' 个作品');
          dot.addEventListener('click', function () { goToWork(i); });
          wsDots.appendChild(dot);

          // 卡片点击
          card.addEventListener('click', function () {
            var idx = Number(this.dataset.index);
            if (idx === currentWorkIndex) {
              // 中心卡点击：弹出创作背景故事面板
              openWorkStory(idx);
            } else {
              goToWork(idx);
            }
          });
        });
      }

      // 更新卡片布局
      function updateWorksLayout() {
        var total = wsCards.length;
        wsCards.forEach(function (card, i) {
          card.classList.remove("sg-is-center", "sg-is-prev-side", "sg-is-next-side", "sg-is-prev-far", "sg-is-next-far");
          if (i === currentWorkIndex) {
            card.classList.add("sg-is-center");
          } else if (i === (currentWorkIndex - 1 + total) % total) {
            card.classList.add("sg-is-prev-side");
          } else if (i === (currentWorkIndex + 1) % total) {
            card.classList.add("sg-is-next-side");
          } else if (i === (currentWorkIndex - 2 + total) % total) {
            card.classList.add("sg-is-prev-far");
          } else if (i === (currentWorkIndex + 2) % total) {
            card.classList.add("sg-is-next-far");
          }
        });
        // 更新指示器
        var dots = wsDots.querySelectorAll(".sg-ws-dot");
        dots.forEach(function (d, i) {
          d.classList.toggle("sg-is-active", i === currentWorkIndex);
        });
      }

      function nextWork() {
        var total = wsCards.length;
        if (total === 0) return;
        currentWorkIndex = (currentWorkIndex + 1) % total;
        updateWorksLayout();
      }

      function prevWork() {
        var total = wsCards.length;
        if (total === 0) return;
        currentWorkIndex = (currentWorkIndex - 1 + total) % total;
        updateWorksLayout();
      }

      function goToWork(idx) {
        currentWorkIndex = idx;
        updateWorksLayout();
        restartWorksAutoPlay();
      }

      function startWorksAutoPlay() {
        stopWorksAutoPlay();
        if (wsCards.length === 0) return;
        worksAutoTimer = setInterval(nextWork, WORKS_AUTO_INTERVAL);
      }

      function stopWorksAutoPlay() {
        if (worksAutoTimer) { clearInterval(worksAutoTimer); worksAutoTimer = null; }
      }

      function restartWorksAutoPlay() {
        stopWorksAutoPlay();
        startWorksAutoPlay();
      }

      // 箭头绑定
      wsPrev.addEventListener('click', function () { prevWork(); restartWorksAutoPlay(); });
      wsNext.addEventListener('click', function () { nextWork(); restartWorksAutoPlay(); });

      // PC 端鼠标悬停中心卡暂停自动播放
      worksCarousel.addEventListener('mouseenter', stopWorksAutoPlay);
      worksCarousel.addEventListener('mouseleave', startWorksAutoPlay);

      // 初始渲染
      renderWorksCarousel();
      updateWorksLayout();

      // ---- 作品「创作背景故事」面板 ----
      var wsStoryCta = document.getElementById("sg-ws-story-cta");
      var workStoryPanel = document.getElementById("sg-work-story-panel");
      var wsStoryClose = document.getElementById("sg-ws-story-close");
      var wsStoryBody = document.getElementById("sg-ws-story-body");

      function openWorkStory(idx) {
        if (!worksData[idx]) return;
        var d = worksData[idx];
        wsStoryBody.innerHTML =
          "<img class=\"sg-ws-story-cover\" src=\"" + d.img + '" alt="' + d.alt + '" />' +
          "<div class=\"sg-ws-story-content\">" +
            "<span class=\"sg-ws-year\">" + d.year + '</span>' +
            '<h3>' + d.title + '</h3>' +
            "<div class=\"sg-ws-story-divider\"></div>" +
            "<span class=\"sg-ws-story-label\">创作背景</span>" +
            "<p class=\"sg-ws-story-text\">" + d.story + '</p>' +
          '</div>';
        workStoryPanel.classList.add("sg-open");
        workStoryPanel.hidden = false;
        stopWorksAutoPlay();
      }

      function closeWorkStory() {
        workStoryPanel.classList.remove("sg-open");
        workStoryPanel.hidden = true;
        startWorksAutoPlay();
      }

      // 引导按钮：展开当前聚焦专辑的故事
      wsStoryCta.addEventListener('click', function () {
        openWorkStory(currentWorkIndex);
      });

      // 关闭按钮
      wsStoryClose.addEventListener('click', closeWorkStory);

      // 点击面板背景空白区域关闭（点击内容区不关闭）
      workStoryPanel.addEventListener('click', function (e) {
        if (e.target === workStoryPanel) closeWorkStory();
      });

      // ESC 键关闭故事面板
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !workStoryPanel.hidden) closeWorkStory();
      });

      // ---- Timeline item: 原地展开经历背景故事 ----
      var expandedTlItem = null;

      function toggleTlItem(item) {
        if (expandedTlItem && expandedTlItem !== item) {
          collapseTlItem(expandedTlItem);
        }
        if (item.classList.contains("sg-is-expanded")) {
          collapseTlItem(item);
        } else {
          expandTlItem(item);
        }
      }

      function expandTlItem(item) {
        item.classList.add("sg-is-expanded");
        expandedTlItem = item;
        // 关闭 scroll-snap 避免干扰
        tlTrack.style.scrollSnapType = 'none';
        // 等卡片宽度过渡完成后再定位，避免目标位置随宽度变化而抖动
        setTimeout(function () {
          var trackRect = tlTrack.getBoundingClientRect();
          var itemRect = item.getBoundingClientRect();
          var offset = itemRect.left - trackRect.left - (trackRect.width - itemRect.width) / 2;
          tlTrack.scrollLeft += offset;
          // 定位完成后再恢复吸附
          tlTrack.style.scrollSnapType = 'x proximity';
        }, 420);
      }

      function collapseTlItem(item) {
        item.classList.remove("sg-is-expanded");
        if (expandedTlItem === item) expandedTlItem = null;
      }

      // 卡片点击：所有屏幕尺寸均可展开/收起
      tlItems.forEach(function (it) {
        it.addEventListener('click', function (e) {
          // 点击收起按钮时单独处理
          if (e.target.closest(".sg-t-story-close")) {
            collapseTlItem(it);
            return;
          }
          toggleTlItem(it);
        });
      });

      // ESC 收起
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && expandedTlItem) {
          collapseTlItem(expandedTlItem);
        }
      });

      // 小屏作品详情弹窗已集成到轮播引擎中

      // initial state
      tabMore.setAttribute('aria-expanded', 'false');
    })();

    return { root: root, destroy: function(){ root.innerHTML = ''; } };
  }
  function create(options) {
    var root = document.createElement('div');
    root.className = 'sg-library-host';
    mount(root, options || {});
    return root;
  }
  global.BlackpinkStarGroup = { mount: mount, create: create };
})(window);
