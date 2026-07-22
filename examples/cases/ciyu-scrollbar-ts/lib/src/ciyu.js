/* Parser-backed decomposition from original.html. */
(function(global){
  'use strict';
  var TEMPLATE = `<div id="sg-app">
  <div class="sg-nav" id="sg-nav">
    <span class="sg-n" data-p="sg-home" role="tab" aria-controls="sg-home">基本释义</span>
    <span class="sg-n" data-p="sg-story" role="tab" aria-controls="sg-story">典故出处</span>
    <span class="sg-n sg-on" data-p="sg-graph-p" role="tab" aria-controls="sg-graph-p">关联词</span>
    <span class="sg-n" data-p="sg-quiz" role="tab" aria-controls="sg-quiz">测一测</span>
  </div>
  <div class="sg-stage">
    <section class="sg-panel" id="sg-home" data-mt="core" role="tabpanel">
      <div class="sg-home-l">
        <div class="sg-word">
          <div class="sg-big">白月光和朱砂痣</div>
          <div class="sg-py">bai yue guang he zhu sha zhi</div>
        </div>
        <div class="sg-tags">
          <span class="sg-tag">中性</span>
          <span class="sg-tag">文学意象</span>
          <span class="sg-tag">网络热词</span>
        </div>
        <div class="sg-one">喻指人生遗憾旧人，难忘的两种情愫。</div>
        <div class="sg-cover"><img src="../assets/cover.webp" alt="封面图" width="350" height="110"></div>
      </div>
      <div class="sg-home-r">
        <div class="sg-m-subtab" data-group="sg-home">
          <span class="sg-ms sg-on" data-mt="core">核心信息</span>
          <span class="sg-ms" data-mt="examples">典型例句</span>
        </div>
        <h3 class="sg-sec sg-sec-core">核心信息</h3>
        <div class="sg-core">
          <div class="sg-c"><div class="sg-k">字面义</div><div class="sg-v">月光皎洁，痣色赤红</div></div>
          <div class="sg-c"><div class="sg-k">引申义</div><div class="sg-v">纯白遗憾，刻骨深情</div></div>
          <div class="sg-c"><div class="sg-k">出处摘要</div><div class="sg-v">《红玫瑰与白玫瑰》</div></div>
          <div class="sg-c"><div class="sg-k">使用语境</div><div class="sg-v">形容难忘的情感执念</div></div>
          <div class="sg-c sg-wide"><div class="sg-k">详细释义</div><div class="sg-v">指代心底纯粹遗憾与刻骨难忘的旧人。</div></div>
        </div>
        <div class="sg-ex-wrap">
          <h3 class="sg-sec sg-sec-ex" style="margin-top:12px">典型例句</h3>
          <div class="sg-ex-list">
            <div class="sg-ex-item"><div class="sg-dot"></div><div>每个人心中都有专属的<b>白月光和朱砂痣</b>。</div></div>
          </div>
          <div class="sg-ex-foot">
            <div class="sg-gc"><div class="sg-k">近义词</div><div class="sg-v"><span class="sg-syn">念念不忘</span><span class="sg-sep"> · </span><span class="sg-syn">意难平</span><span class="sg-sep sg-syn-extra"> · </span><span class="sg-syn sg-syn-extra">旧情难忘</span></div></div>
            <div class="sg-gc"><div class="sg-k">反义词</div><div class="sg-v">释怀放下 · 过往云烟 · 心如止水</div></div>
          </div>
        </div>
      </div>
    </section>
    <section class="sg-panel" id="sg-story" data-mt="stories" role="tabpanel">
      <div class="sg-m-subtab" data-group="sg-story">
        <span class="sg-ms sg-on" data-mt="stories">词条典故</span>
        <span class="sg-ms" data-mt="src">出处原文</span>
      </div>
      <div class="sg-story-l">
        <h3 class="sg-sec">词条典故渊源</h3>
        <div class="sg-scard">
          <div class="sg-head"><div class="sg-badge">源</div><div class="sg-ht"><div class="sg-h-main">张氏小说独创意象</div><div class="sg-h-sub">文学概念诞生</div></div></div>
          <div class="sg-body"><div class="sg-bd-inner">张爱玲书中创设<em>白月光</em>、<em>朱砂痣</em>情感意象。</div></div>
        </div>
        <div class="sg-scard">
          <div class="sg-head"><div class="sg-badge">义</div><div class="sg-ht"><div class="sg-h-main">双意象各有深意</div><div class="sg-h-sub">情愫对照阐释</div></div></div>
          <div class="sg-body"><div class="sg-bd-inner"><em>白月光</em>喻纯粹遗憾，<em>朱砂痣</em>喻刻骨深情。</div></div>
        </div>
        <div class="sg-scard">
          <div class="sg-head"><div class="sg-badge">传</div><div class="sg-ht"><div class="sg-h-main">网络广泛传播走红</div><div class="sg-h-sub">成为流行热词</div></div></div>
          <div class="sg-body"><div class="sg-bd-inner">经网络传唱普及，成为<em>大众常用</em>情感表述。</div></div>
        </div>
      </div>
      <div class="sg-story-r">
        <h3 class="sg-sec">出处原文（点高亮看注解）</h3>
        <div class="sg-src-card">
          <div class="sg-from">民国·张爱玲《红玫瑰与白玫瑰》</div>
          <div class="sg-text">娶红玫瑰，红成蚊子血，白为<span class="sg-hl" data-k="baiyueguang">白月光</span>；娶白玫瑰，白成饭粘子，红为<span class="sg-hl" data-k="zhushazhi">朱砂痣</span>。</div>
          <div class="sg-tr">未得之人纯白难忘，所得之人刻骨铭心。</div>
        </div>
      </div>
    </section>
    <section class="sg-panel sg-on" id="sg-graph-p" role="tabpanel">
      <h3 class="sg-sec">关联词语图谱 · 点击查看</h3>
      <div class="sg-gp-head" id="sg-filters"></div>
      <div class="sg-gp-body">
        <div class="sg-graph" id="sg-graph"><svg class="sg-lines" id="sg-lines"></svg></div>
        <aside class="sg-gp-side" id="sg-detail"></aside>
      </div>
    </section>
    <section class="sg-panel" id="sg-quiz" role="tabpanel">
      <div class="sg-qz-top">
        <span class="sg-qno" id="sg-qno"></span>
        <div class="sg-bar"><i id="sg-barf"></i></div>
        <span class="sg-score" id="sg-score">0 / 5</span>
      </div>
      <div class="sg-qz-body" id="sg-qzbody">
        <div class="sg-qt" id="sg-qt"></div>
        <div class="sg-opts" id="sg-opts"></div>
        <div class="sg-qz-fb" id="sg-qzfb"></div>
        <button class="sg-qz-next" id="sg-qznext">下一题 →</button>
      </div>
      <div class="sg-qz-result" id="sg-qzresult">
        <div class="sg-badge" id="sg-rbadge"></div>
        <div class="sg-rlabel">你的得分</div>
        <div class="sg-big" id="sg-rscore"></div>
        <div class="sg-desc">出自张爱玲小说，代指心底遗憾与刻骨旧情。</div>
        <button id="sg-again">再来一次</button>
      </div>
    </section>
  </div>
  <div class="sg-pop" id="sg-pop">
    <div class="sg-box"><div class="sg-pt" id="sg-pt"></div><div class="sg-pd" id="sg-pd"></div><div class="sg-pc" id="sg-pclose">知道了</div></div>
  </div>
  <div class="sg-toast" id="sg-toast"></div>
</div>`;
  function mount(root, options) {
    if (!root) throw new Error('mount root is required');

    root.innerHTML = TEMPLATE;

    function goPanel(p){
      document.querySelectorAll(".sg-nav .sg-n").forEach(function(x){x.classList.toggle("sg-on",x.dataset.p===p)});
      document.querySelectorAll(".sg-panel").forEach(function(x){x.classList.toggle("sg-on",x.id===p)});
      if(p==="sg-graph-p")layout()
    }
    document.querySelectorAll(".sg-nav .sg-n").forEach(function(n){n.onclick=function(){goPanel(n.dataset.p)}});
    document.querySelectorAll(".sg-m-subtab").forEach(function(tab){
      var group=tab.dataset.group;
      var target=document.getElementById(group);
      tab.querySelectorAll(".sg-ms").forEach(function(ms){
        ms.onclick=function(){
          tab.querySelectorAll(".sg-ms").forEach(function(x){x.classList.toggle("sg-on",x===ms)});
          target.dataset.mt=ms.dataset.mt
        }
      })
    });
    var NOTE = (options && options.notes) || {
      baiyueguang:['白月光','喻可望不可即、纯粹遗憾的旧人旧事。'],
      zhushazhi:['朱砂痣','喻刻骨铭心、难以释怀的过往深情。']
    };
    document.querySelectorAll(".sg-hl").forEach(function(h){
      h.onclick=function(){
        var n=NOTE[h.dataset.k];
        if(!n)return;
        document.getElementById("sg-pt").textContent=n[0];
        document.getElementById("sg-pd").textContent=n[1];
        document.getElementById("sg-pop").classList.add("sg-on")
      }
    });
    var pop=document.getElementById("sg-pop");
    document.getElementById("sg-pclose").onclick=function(){pop.classList.remove("sg-on")};
    pop.onclick=function(e){if(e.target===pop)pop.classList.remove("sg-on")};
    var NODE_IMG = (options && options.nodeImages) || {
      '红玫瑰与白玫瑰':"../assets/hongmeigui-baimeigui.webp",
      '张爱玲':"../assets/zhangailing.webp"
    };
    function ndImgBlock(name){
      var file=NODE_IMG[name]||"../assets/"+name+'.webp';
      return "<div class=\"sg-nd-img\" style=\"overflow:hidden;padding:0;background:#eef1f8;height:120px\"><sg-img src=\""+file+'" alt="'+name+"\" loading=\"lazy\" style=\"width:100%;height:100%;object-fit:sg-cover;display:block\"></div>"
    }
    function sideImgBlock(name){
      var file=NODE_IMG[name]||"../assets/"+name+'.webp';
      return "<div class=\"sg-img\" style=\"overflow:hidden;background:#eef1f8\"><sg-img src=\""+file+'" alt="'+name+"\" loading=\"lazy\" style=\"width:100%;height:100%;object-fit:sg-cover;display:block\"></div>"
    }
    var NODES = (options && options.nodes) || [
      {w:'意难平',rel:'近义词',x:18,y:25,desc:'心中存有遗憾，始终无法坦然释怀。'},
      {w:'念念不忘',rel:'近义词',x:82,y:25,desc:'对过往人事铭记于心，久久难忘。'},
      {w:'旧情难忘',rel:'衍生词义',x:10,y:50,desc:'难以放下曾经拥有的真挚情感。'},
      {w:'红白玫瑰',rel:'同源意象',x:90,y:50,desc:'词条本源意象，对应两种情感。'},
      {w:'浮生遗憾',rel:'同类意象',x:15,y:78,desc:'人生中无法圆满、留存心底的缺憾。'},
      {w:'红玫瑰与白玫瑰',rel:'典籍关联',x:85,y:78,desc:'张爱玲经典中篇小说，词条原生出处。',img:1},
      {w:'张爱玲',rel:'人物关联',x:50,y:12,desc:'民国知名作家，该意象原创作者。',img:1},
      {w:'过往云烟',rel:'反义词',x:35,y:92,desc:'往事随风消散，内心全然释怀。'},
      {w:'心如止水',rel:'反义词',x:65,y:92,desc:'心境平静淡然，无执念与牵挂。'}
    ];
    var CENTER = (options && options.center) || {w:'白月光和朱砂痣',x:50,y:50};
    var COLORS = (options && options.colors) || {
      '近义词':'#34c759',
      '衍生词义':'#34c759',
      '同源意象':'#6487FA',
      '同类意象':'#6487FA',
      '典籍关联':'#ff9500',
      '人物关联':'#ff9500',
      '反义词':'#ff3b30'
    };
    var graph=document.getElementById("sg-graph"),linesSvg=document.getElementById("sg-lines");
    var curFilter='全部';
    function layout(){
      graph.querySelectorAll(".sg-gnd").forEach(function(n){n.remove()});
      linesSvg.innerHTML='';
      var W=graph.clientWidth,H=graph.clientHeight;
      addGNode(CENTER,true);
      NODES.forEach(function(n){
        if(curFilter!=='全部'&&n.rel!==curFilter)return;
        var x1=(CENTER.x/100)*W,y1=(CENTER.y/100)*H,x2=(n.x/100)*W,y2=(n.y/100)*H;
        var ln=document.createElementNS('http://www.w3.org/2000/svg','line');
        ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
        ln.setAttribute('class',"sg-gline");ln.setAttribute('stroke',COLORS[n.rel]);
        linesSvg.appendChild(ln);
        addGNode(n,false)
      })
    }
    function addGNode(n,center){
      var el=document.createElement('div');
      el.className="sg-gnd"+(center?" sg-center":'');
      el.style.left=n.x+'%';el.style.top=n.y+'%';
      var dotStyle=center?'':' style="border-color:'+COLORS[n.rel]+'33"';
      el.innerHTML="<div class=\"sg-dot\""+dotStyle+'>'+n.w+'</div>'+(center?'':"<div class=\"sg-rel\">"+n.rel+'</div>');
      if(!center)el.onclick=function(){
        showDetail(n);
        graph.querySelectorAll(".sg-gnd").forEach(function(x){x.classList.remove("sg-on")});
        el.classList.add("sg-on");
        if(window.matchMedia('(max-width: 520px)').matches){
          var c=COLORS[n.rel];
          document.getElementById("sg-pt").innerHTML="<span class=\"sg-nd-tag\" style=\"background:"+c+'">'+n.rel+"</span><div style=\"font-size:15px;font-weight:800;color:var(--sg-t1)\">"+n.w+'</div>';
          document.getElementById("sg-pd").innerHTML='<div>'+n.desc+'</div>'+(n.img?ndImgBlock(n.w):'');
          document.getElementById("sg-pop").classList.add("sg-on")
        }
      };
      graph.appendChild(el)
    }
    function showDetail(n){
      document.getElementById("sg-detail").innerHTML="<div class=\"sg-dw\">"+n.w+"</div><span class=\"sg-dr\" style=\"background:"+COLORS[n.rel]+'1a;color:'+COLORS[n.rel]+'">'+n.rel+"</span><div class=\"sg-dd\">"+n.desc+'</div>'+(n.img?sideImgBlock(n.w):'')
    }
    (function buildFilters(){
      var rels=['全部'].concat(Array.from(new Set(NODES.map(function(n){return n.rel}))));
      var box=document.getElementById("sg-filters");
      box.innerHTML=rels.map(function(r){return "<span class=\"sg-f"+(r==='全部'?" sg-on":'')+'" data-r="'+r+'">'+r+'</span>'}).join('');
      box.querySelectorAll(".sg-f").forEach(function(f){
        f.onclick=function(){
          curFilter=f.dataset.r;
          box.querySelectorAll(".sg-f").forEach(function(x){x.classList.remove("sg-on")});
          f.classList.add("sg-on");
          layout()
        }
      })
    })();
    showDetail(NODES[0]);
    var _layoutTimer=null;
    window.addEventListener('resize',function(){
      if(_layoutTimer)clearTimeout(_layoutTimer);
      _layoutTimer=setTimeout(function(){
        var gp=document.getElementById("sg-graph-p");
        if(gp&&gp.classList.contains("sg-on"))layout()
      },120)
    });
    (function preloadNodeImgs(){
      var idle=window.requestIdleCallback||function(cb){return setTimeout(cb,600)};
      idle(function(){Object.values(NODE_IMG).forEach(function(src){var img=new Image();img.src=src})})
    })();
    var QS = (options && options.questions) || [
      {t:'该词条出自哪位作家的作品？',o:['鲁迅','张爱玲','冰心','林徽因'],a:1,fb:'词条出自张爱玲《红玫瑰与白玫瑰》。'},
      {t:'白月光核心指代的是？',o:['圆满爱情','纯粹遗憾','憎恶之人','平淡生活'],a:1,fb:'白月光喻指可望不可即的遗憾旧人。'},
      {t:'朱砂痣代表的情感是？',o:['刻骨深情','短暂好感','陌生疏离','平淡相守'],a:0,fb:'朱砂痣指代心底难以磨灭的深情执念。'},
      {t:'以下哪项是该词条反义词？',o:['意难平','念念不忘','过往云烟','旧情难忘'],a:2,fb:'过往云烟指释怀往事，与执念语义相反。'},
      {t:'该词条的感情色彩是？',o:['褒义','贬义','中性','讽刺'],a:2,fb:'属中性词，客观形容内心情感状态。'}
    ];
    var qi=0,sc=0,locked=false;
    function renderQ(){
      document.getElementById("sg-qzbody").style.display='flex';
      document.getElementById("sg-qzresult").classList.remove("sg-on");
      var Q=QS[qi];
      locked=false;
      document.getElementById("sg-qno").textContent='第 '+(qi+1)+' 题 / 共 '+QS.length;
      document.getElementById("sg-qt").textContent=Q.t;
      document.getElementById("sg-qzfb").textContent='';
      document.getElementById("sg-qznext").classList.remove("sg-on");
      document.getElementById("sg-qznext").textContent=qi===QS.length-1?'查看结果 →':'下一题 →';
      document.getElementById("sg-opts").innerHTML=Q.o.map(function(o,k){return "<div class=\"sg-opt\" data-k=\""+k+"\"><span class=\"sg-key\">"+'ABCD'[k]+'</span><span>'+o+'</span></div>'}).join('');
      document.querySelectorAll("#sg-opts .sg-opt").forEach(function(op){
        op.onclick=function(){
          if(locked)return;
          locked=true;
          var k=+op.dataset.k;
          document.querySelectorAll("#sg-opts .sg-opt").forEach(function(x){if(+x.dataset.k===Q.a)x.classList.add("sg-right")});
          if(k!==Q.a)op.classList.add("sg-wrong");else sc++;
          document.getElementById("sg-qzfb").textContent=Q.fb;
          document.getElementById("sg-score").textContent=sc+' / '+QS.length;
          document.getElementById("sg-barf").style.width=((qi+1)/QS.length)*100+'%';
          document.getElementById("sg-qznext").classList.add("sg-on")
        }
      })
    }
    document.getElementById("sg-qznext").onclick=function(){
      if(qi<QS.length-1){qi++;renderQ()}
      else{
        document.getElementById("sg-qzbody").style.display='none';
        document.getElementById("sg-rscore").textContent=sc+' / '+QS.length;
        document.getElementById("sg-rbadge").textContent=sc===5?'文学达人·深谙意象':sc>=3?'文学积累尚可':'多读现代文学';
        document.getElementById("sg-qzresult").classList.add("sg-on")
      }
    };
    document.getElementById("sg-again").onclick=function(){qi=0;sc=0;document.getElementById("sg-score").textContent='0 / 5';document.getElementById("sg-barf").style.width='0';renderQ()};
    renderQ();
    var tt;
    function showToast(m){var t=document.getElementById("sg-toast");t.textContent=m;t.classList.add("sg-on");clearTimeout(tt);tt=setTimeout(function(){t.classList.remove("sg-on")},2000)}
    layout();

    return { root: root, destroy: function(){ root.innerHTML = ''; } };
  }
  function create(options) {
    var root = document.createElement('div');
    root.className = 'sg-library-host';
    mount(root, options || {});
    return root;
  }
  global.CiyuEncyclopedia = { mount: mount, create: create };
})(window);
