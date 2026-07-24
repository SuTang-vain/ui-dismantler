/* Parser-backed decomposition from index.html. */
(function(global){
  'use strict';
  var TEMPLATE = `<div class="sg-progress" aria-hidden="true"></div>
<header class="sg-nav" id="sg-nav">
  <div class="sg-wrap">
    <a class="sg-brand" href="#sg-top" aria-label="BabeL-O home">
      <img class="sg-mark" data-src="../assets/babel-o-logo.png" alt="" width="30" height="30">
      <span>BabeL<span style="color:var(--accent)">·</span>O</span>
    </a>
    <nav class="sg-nav-links" aria-label="Primary">
      <a href="#sg-features">Features</a>
      <a href="#sg-how">How it works</a>
      <a href="#sg-demo">Live demo</a>
      <a href="#sg-architecture">Architecture</a>
      <a href="#sg-paths">Paths</a>
      <a href="#sg-faq">FAQ</a>
    </nav>
    <div class="sg-nav-right">
      <button class="sg-theme-toggle" id="sg-themeToggle" aria-label="Toggle color theme" title="Toggle theme">
        <svg class="sg-ico sg-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"></path></svg>
        <svg class="sg-ico sg-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"></path></svg>
      </button>
      <a class="sg-btn sg-btn-grad" href="#sg-cta">Get started</a>
    </div>
  </div>
</header>
<main id="sg-top">

  <!-- ====================================================================
       HERO
       ==================================================================== -->
  <section class="sg-hero sg-section">
    <!-- spinning motif (Eleveight-style star) - data-scroll-speed parallax: drifts at .6x while page scrolls at 1x -->
    <svg class="sg-motif sg-spin sg-top-right sg-accent" data-scroll="" data-scroll-speed="0.6" viewBox="0 0 100 100" aria-hidden="true">
      <g fill="currentColor">
        <path d="M50 0 56 44 100 50 56 56 50 100 44 56 0 50 44 44Z"></path>
        <path d="M50 18 53.5 46.5 82 50 53.5 53.5 50 82 46.5 53.5 18 50 46.5 46.5Z" opacity=".55"></path>
      </g>
    </svg>

    <div class="sg-wrap sg-hero-grid">
      <div>
        <span class="sg-eyebrow sg-reveal sg-in">Terminal-native AI coding agent</span>
        <h1 class="sg-display sg-words" id="sg-heroTitle" data-reveal="">
          <span class="sg-w">An</span> <span class="sg-w">AI</span> <span class="sg-w">coding</span> <span class="sg-w">agent</span> <span class="sg-w">that</span> <span class="sg-w sg-acc">stays</span> <span class="sg-w sg-acc">alive</span> <span class="sg-w">in</span> <span class="sg-w">your</span> <span class="sg-w">terminal.</span>
        </h1>
        <p class="sg-sub sg-reveal" data-d="1">
          BabeL-O pairs a native Go TUI with a durable <strong>Nexus</strong> daemon — so your
          coding sessions survive disconnects, run across parallel git worktrees, and finish
          long tasks for real. Not a demo-level toy.
        </p>

        <div class="sg-hero-cta sg-reveal" data-d="2">
          <div class="sg-install" id="sg-installChip" title="Click to copy">
            <span class="sg-prompt">$</span>
            <span class="sg-cmd">npm install -g babel-o</span>
            <span class="sg-label">Copied!</span>
            <button class="sg-copy" aria-label="Copy install command">
              <svg class="sg-cp" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>
              <svg class="sg-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
            </button>
          </div>
          <a class="sg-btn sg-btn-ghost" href="#sg-demo">
            See it run
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
          </a>
        </div>

        <div class="sg-trust sg-reveal" data-d="3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5Z"></path><path d="m9 12 2 2 4-4"></path></svg>
          Trusted by terminal-native developers who've outgrown one-shot CLI agents.
        </div>
        <div class="sg-badges sg-reveal" data-d="3">
          <span class="sg-badge sg-solid">Open Source · MIT</span>
          <span class="sg-badge">v0.4.2</span>
          <span class="sg-badge">macOS · Linux</span>
          <span class="sg-badge">Node ≥ 22</span>
        </div>
      </div>

      <!-- hero terminal preview (static) - parallax: moves slower than the heading as you scroll -->
      <div class="sg-term-card sg-reveal" data-d="2" data-scroll="" data-scroll-speed="0.3" data-scroll-position="top">
        <div class="sg-term-bar">
          <span class="sg-term-dot sg-r"></span><span class="sg-term-dot sg-y"></span><span class="sg-term-dot sg-g"></span>
          <span class="sg-term-title">bbl — session #a1f3 · nexus@localhost:7331</span>
        </div>
        <div class="sg-term-body" id="sg-heroTerm">
          <div class="sg-ln"><span class="sg-c-dim"># durable: client disconnected, session kept running</span></div>
          <div class="sg-ln"><span class="sg-prompt">❯</span> bbl go</div>
          <div class="sg-ln"><span class="sg-c-grn">●</span> nexus online · 2 sessions · ws://127.0.0.1:7331</div>
          <div class="sg-ln"><span class="sg-prompt">❯</span> refactor auth module to use keychain</div>
          <div class="sg-ln"><span class="sg-c-dim">  planning</span> 3-step plan <span class="sg-c-dim">›</span> 2 file edits <span class="sg-c-dim">›</span> 1 run</div>
          <div class="sg-ln"><span class="sg-c-acc">  edit</span> clients/go-tui/.../auth.go <span class="sg-c-dim">(+42 −18)</span></div>
          <div class="sg-ln"><span class="sg-c-acc">  edit</span> lib/keychain.ts <span class="sg-c-dim">(+11 −3)</span></div>
          <div class="sg-ln"><span class="sg-c-blu">  tool</span> bash › <span class="sg-c-dim">go test ./...</span> <span class="sg-c-grn">✓ pass</span></div>
          <div class="sg-ln"><span class="sg-c-grn">  done</span> 1m 42s · 0 issues <span class="sg-c-dim">·</span> audit saved</div>
          <div class="sg-ln"><span class="sg-prompt">❯</span> <span class="sg-term-cursor"></span></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       PROVIDERS TICKER (marquee, pause on hover)
       ==================================================================== -->
  <section class="sg-ticker" aria-label="Supported model providers">
    <div class="sg-marquee" id="sg-provTicker" style="--dur:38s">
      <div class="sg-seg">
        <span class="sg-item sg-hl">Anthropic</span><span class="sg-dot"></span>
        <span class="sg-item">OpenAI</span><span class="sg-dot"></span>
        <span class="sg-item sg-hl">DeepSeek</span><span class="sg-dot"></span>
        <span class="sg-item">Moonshot</span><span class="sg-dot"></span>
        <span class="sg-item sg-hl">Ollama</span><span class="sg-dot"></span>
        <span class="sg-item">Zhipu</span><span class="sg-dot"></span>
        <span class="sg-item sg-hl">MiniMax</span><span class="sg-dot"></span>
        <span class="sg-item">Local</span><span class="sg-dot"></span>
      </div>
      <!-- duplicate for seamless loop -->
      <div class="sg-seg" aria-hidden="true">
        <span class="sg-item sg-hl">Anthropic</span><span class="sg-dot"></span>
        <span class="sg-item">OpenAI</span><span class="sg-dot"></span>
        <span class="sg-item sg-hl">DeepSeek</span><span class="sg-dot"></span>
        <span class="sg-item">Moonshot</span><span class="sg-dot"></span>
        <span class="sg-item sg-hl">Ollama</span><span class="sg-dot"></span>
        <span class="sg-item">Zhipu</span><span class="sg-dot"></span>
        <span class="sg-item sg-hl">MiniMax</span><span class="sg-dot"></span>
        <span class="sg-item">Local</span><span class="sg-dot"></span>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       STATS
       ==================================================================== -->
  <section class="sg-section" id="sg-stats">
    <div class="sg-wrap">
      <div class="sg-stats sg-reveal" data-scroll="" data-scroll-class="in-view" data-scroll-repeat="false">
        <div class="sg-stat" data-scroll="" data-scroll-speed="0.2"><div class="sg-num">8</div><div class="sg-lab">Model providers</div></div>
        <div class="sg-stat" data-scroll="" data-scroll-speed="-0.2"><div class="sg-num">4</div><div class="sg-lab">Permission levels</div></div>
        <div class="sg-stat" data-scroll="" data-scroll-speed="0.2"><div class="sg-num">~10<span class="sg-acc">MB</span></div><div class="sg-lab">Standalone Go binary</div></div>
        <div class="sg-stat" data-scroll="" data-scroll-speed="-0.2"><div class="sg-num">0</div><div class="sg-lab">Node deps on client</div></div>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       HUE BAND - Ideogram-style tonal transition (cream -> peach -> lilac)
       ==================================================================== -->
  <section class="sg-hueband" aria-label="Design philosophy">
    <div class="sg-wrap">
      <span class="sg-mark">Design philosophy</span>
      <h2>One palette, from <span class="sg-grad">ember to violet.</span></h2>
      <p>Warmth at the surface, depth underneath. BabeL-O treats every session as craft - so the page carries a single hue band: red where it matters, orange where it moves, purple where it thinks, pink where it invites you in.</p>
    </div>
  </section>

  <!-- ====================================================================
       FEATURES (async-rendered into skeletons)
       ==================================================================== -->
  <section class="sg-section" id="sg-features">
    <div class="sg-wrap">
      <span class="sg-eyebrow sg-reveal">Capabilities</span>
      <h2 class="sg-section-title sg-reveal" data-d="1">Built for sessions that<br>actually <span style="color:var(--accent)">finish.</span></h2>
      <p class="sg-section-lead sg-reveal" data-d="2">
        Most terminal AI coders are fragile one-shot chats: kill the process, lose the task.
        BabeL-O's Nexus daemon owns execution state so work persists, stays inspectable,
        and runs safely.
      </p>

      <!-- skeleton placeholders are hydrated from async JSON (see app-data below) -->
      <div class="sg-features-grid" id="sg-featuresGrid">
        <article class="sg-feat sg-span6 sg-skeleton"><div class="sg-ic sg-sk sg-box"></div><h3 class="sg-sk sg-title"></h3><p class="sg-sk sg-line"></p><p class="sg-sk sg-line sg-short"></p></article>
        <article class="sg-feat sg-span6 sg-skeleton"><div class="sg-ic sg-sk sg-box"></div><h3 class="sg-sk sg-title"></h3><p class="sg-sk sg-line"></p><p class="sg-sk sg-line sg-short"></p></article>
        <article class="sg-feat sg-span4 sg-skeleton"><div class="sg-ic sg-sk sg-box"></div><h3 class="sg-sk sg-title"></h3><p class="sg-sk sg-line"></p><p class="sg-sk sg-line sg-short"></p></article>
        <article class="sg-feat sg-span4 sg-skeleton"><div class="sg-ic sg-sk sg-box"></div><h3 class="sg-sk sg-title"></h3><p class="sg-sk sg-line"></p><p class="sg-sk sg-line sg-short"></p></article>
        <article class="sg-feat sg-span4 sg-skeleton"><div class="sg-ic sg-sk sg-box"></div><h3 class="sg-sk sg-title"></h3><p class="sg-sk sg-line"></p><p class="sg-sk sg-line sg-short"></p></article>
        <article class="sg-feat sg-span12 sg-skeleton"><div class="sg-ic sg-sk sg-box"></div><h3 class="sg-sk sg-title"></h3><p class="sg-sk sg-line"></p><p class="sg-sk sg-line sg-short"></p></article>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       HOW IT WORKS — NESTED HORIZONTAL SNAP CAROUSEL
       ==================================================================== -->
  <section class="sg-section" id="sg-how">
    <div class="sg-wrap">
      <span class="sg-eyebrow sg-reveal">The design rule</span>
      <h2 class="sg-section-title sg-reveal" data-d="1"><span style="color:var(--accent)">Nexus</span> owns execution.<br>CLI owns interaction.</h2>
      <p class="sg-section-lead sg-reveal" data-d="2">
        A background daemon holds state; the Go TUI is just one way to talk to it. Swipe the
        carousel to see how the pieces fit together.
      </p>
    </div>
    <div class="sg-wrap">
      <div class="sg-how-scroll" id="sg-howScroll" tabindex="0" aria-label="How it works — scroll horizontally" data-lenis-prevent="">
        <article class="sg-step sg-reveal">
          <div class="sg-n">01 — DAEMON</div>
          <h3>Nexus owns execution</h3>
          <p>A Node ≥ 22 daemon (Fastify REST + WebSocket) owns sessions, agents, the tool loop, streaming events and the audit log. Kill your terminal — the task keeps running.</p>
          <div class="sg-arch">nexus @ ws://127.0.0.1:7331</div>
        </article>
        <article class="sg-step sg-reveal" data-d="1">
          <div class="sg-n">02 — CLIENT</div>
          <h3>CLI owns interaction</h3>
          <p>A ~10MB Go binary (Bubble Tea) is the production surface. Reconnect any client to a live session over WebSocket — your in-flight work is right where you left it.</p>
          <div class="sg-arch">bbl go · bbl attach &lt;id&gt;</div>
        </article>
        <article class="sg-step sg-reveal" data-d="2">
          <div class="sg-n">03 — PERMISSIONS</div>
          <h3>Tools are governed</h3>
          <p>A four-level risk model — <em>read &lt; write &lt; execute &lt; task</em> — gates Bash, Write, Edit, MCP and memory writes. Approve once, approve per-session, or reject with feedback.</p>
          <div class="sg-arch">/approve · /reject · /perm session</div>
        </article>
        <article class="sg-step sg-reveal" data-d="3">
          <div class="sg-n">04 — STATE</div>
          <h3>Durable &amp; inspectable</h3>
          <p>SQLite (WAL) + JSONL append log persist sessions, events, audits, jobs and traces. <code>/context</code> shows budget, compaction, recovery and working set — agent state is never hidden.</p>
          <div class="sg-arch">/context · /inbox · /session</div>
        </article>
        <article class="sg-step sg-reveal" data-d="3">
          <div class="sg-n">05 — PARALLELISM</div>
          <h3>Worktrees, in parallel</h3>
          <p>Run multiple isolated sessions across git worktrees at once. Sessions trade findings, handoffs and review requests over SessionChannel — real collaboration, not serial tabs.</p>
          <div class="sg-arch">bbl go --worktree feat-x</div>
        </article>
      </div>
      <div class="sg-how-hint">
        <span class="sg-arrows"><span>←</span><span>→</span></span>
        drag / scroll horizontally · or use ← → keys
      </div>
    </div>
  </section>

  <!-- ====================================================================
       LIVE DEMO — TERMINAL STATE MACHINE
       ==================================================================== -->
  <section class="sg-section" id="sg-demo">
    <div class="sg-wrap sg-demo-grid">
      <div>
        <span class="sg-eyebrow sg-reveal">Live demo</span>
        <h2 class="sg-section-title sg-reveal" data-d="1">Watch a session<br>cycle through real states.</h2>
        <p class="sg-section-lead sg-reveal" data-d="2">
          This isn't a recording — it's a live state machine driving the terminal on the right.
          It walks a real prompt through <em>idle → typing → executing → streaming → done</em>,
          the same loop Nexus runs for every task. The transcript panel scrolls independently,
          so scroll inside it to read the full log.
        </p>
        <div class="sg-demo-controls sg-reveal" data-d="3">
          <span class="sg-demo-state" id="sg-demoState" data-state="idle"><span class="sg-pip"></span><span class="sg-lbl">idle</span></span>
          <button class="sg-demo-btn sg-primary" id="sg-demoPlay">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
            <span>Run</span>
          </button>
          <button class="sg-demo-btn" id="sg-demoReset">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path></svg>
            Reset
          </button>
        </div>
      </div>

      <div class="sg-demo-term sg-reveal" data-d="2">
        <div class="sg-term-bar">
          <span class="sg-term-dot sg-r"></span><span class="sg-term-dot sg-y"></span><span class="sg-term-dot sg-g"></span>
          <span class="sg-term-title">demo · session cycle</span>
        </div>
        <!-- NESTED SCROLL: vertical overflow, independent of page -->
        <div class="sg-transcript" id="sg-demoTranscript" role="log" aria-live="polite" data-lenis-prevent=""></div>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       ARCHITECTURE
       ==================================================================== -->
  <section class="sg-section" id="sg-architecture">
    <div class="sg-wrap">
      <div class="sg-arch sg-reveal" data-scroll="" data-scroll-speed="0.15" data-scroll-call="arch,enter" data-scroll-position="top,bottom">
        <span class="sg-eyebrow">Architecture</span>
        <h2 data-scroll="" data-scroll-speed="0.4">One daemon.<br><span class="sg-stroke">Any client.</span> Zero magic.</h2>
        <div class="sg-arch-cols">
          <div class="sg-arch-col">
            <div class="sg-role">Backend · Nexus</div>
            <h4>The durable runtime</h4>
            <p>Holds execution state out-of-process so sessions outlive any single terminal.</p>
            <ul>
              <li>Fastify REST + WebSocket server</li>
              <li>LLMCodingRuntime: context, model calls, tool loop</li>
              <li>Permission enforcement + context compaction</li>
              <li>SQLite WAL + JSONL audit &amp; traces</li>
              <li>Provider failover &amp; recovery</li>
            </ul>
          </div>
          <div class="sg-arch-col">
            <div class="sg-role">Frontend · Go TUI</div>
            <h4>The interactive surface</h4>
            <p>A self-contained binary you can drop in a container and run — no Node on the client.</p>
            <ul>
              <li>Go 1.23 + Bubble Tea, ~10MB</li>
              <li>Attach / detach / reconnect over WS</li>
              <li>Streaming render, permission prompts</li>
              <li>System keychain for API keys</li>
              <li>Optional EverCore memory sidecar</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       DEPLOYMENT PATHS (pricing-style, no fabricated prices)
       ==================================================================== -->
  <section class="sg-section" id="sg-paths">
    <div class="sg-wrap">
      <span class="sg-eyebrow sg-reveal">Get started</span>
      <h2 class="sg-section-title sg-reveal" data-d="1">Pick your path</h2>
      <p class="sg-section-lead sg-reveal" data-d="2">BabeL-O is MIT-licensed. Run it yourself today, or talk to us about teams.</p>

      <div class="sg-paths-grid">
        <article class="sg-path sg-reveal">
          <div class="sg-plan">Open Source</div>
          <div class="sg-price">Free</div>
          <div class="sg-desc">The full agent, self-hosted, forever.</div>
          <ul>
            <li>Native Go TUI + Nexus daemon</li>
            <li>All 8 model providers</li>
            <li>Parallel worktree sessions</li>
            <li>Permission-governed tools</li>
            <li>Community support</li>
          </ul>
          <a class="sg-btn sg-btn-ghost" href="#sg-cta">npm i -g babel-o</a>
        </article>
        <article class="sg-path sg-featured sg-reveal" data-d="1">
          <span class="sg-ribbon">Most teams</span>
          <div class="sg-plan">Self-Hosted</div>
          <div class="sg-price">Bring your own</div>
          <div class="sg-desc">Run Nexus on your infra with shared configs and governance.</div>
          <ul>
            <li>Everything in Open Source</li>
            <li>Shared permission policies</li>
            <li>Persistent audit &amp; trace logs</li>
            <li>Remote Go-runner execution</li>
            <li>Priority issue triage</li>
          </ul>
          <a class="sg-btn sg-btn-grad" href="#sg-cta">Read the deploy guide</a>
        </article>
        <article class="sg-path sg-reveal" data-d="2">
          <div class="sg-plan">Enterprise</div>
          <div class="sg-price">Talk to us</div>
          <div class="sg-desc">For teams that need governance, SSO and SLAs.</div>
          <ul>
            <li>Everything in Self-Hosted</li>
            <li>SSO &amp; access controls</li>
            <li>Audit retention &amp; compliance</li>
            <li>Onboarding &amp; training</li>
            <li>Dedicated support SLA</li>
          </ul>
          <a class="sg-btn sg-btn-ghost" href="#sg-cta">Contact KezhongKe</a>
        </article>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       FAQ ACCORDION
       ==================================================================== -->
  <section class="sg-section" id="sg-faq">
    <div class="sg-wrap">
      <span class="sg-eyebrow sg-reveal" style="display:block;text-align:center;margin-inline:auto">Questions</span>
      <h2 class="sg-section-title sg-reveal" data-d="1" style="text-align:center">Frequently asked</h2>
      <div class="sg-faq" id="sg-faq">
        <!-- hydrated from async data -->
        <div class="sg-faq-item sg-skeleton" style="border-bottom:1px solid var(--line)">
          <div class="sg-faq-q"><span class="sg-sk sg-line" style="height:18px;width:60%"></span><span class="sg-plus" style="visibility:hidden"></span></div>
        </div>
        <div class="sg-faq-item sg-skeleton" style="border-bottom:1px solid var(--line)">
          <div class="sg-faq-q"><span class="sg-sk sg-line" style="height:18px;width:48%"></span><span class="sg-plus" style="visibility:hidden"></span></div>
        </div>
        <div class="sg-faq-item sg-skeleton" style="border-bottom:1px solid var(--line)">
          <div class="sg-faq-q"><span class="sg-sk sg-line" style="height:18px;width:54%"></span><span class="sg-plus" style="visibility:hidden"></span></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ====================================================================
       CTA + big ticker
       ==================================================================== -->
  <div class="sg-ticker sg-big" aria-hidden="true">
    <div class="sg-marquee" id="sg-ctaTicker" style="--dur:30s">
      <div class="sg-seg">
        <span class="sg-item">Let's build</span><span class="sg-dot"></span>
        <span class="sg-item sg-stroke">BabeL-O</span><span class="sg-dot"></span>
        <span class="sg-item">Let's build</span><span class="sg-dot"></span>
        <span class="sg-item sg-stroke">BabeL-O</span><span class="sg-dot"></span>
      </div>
      <div class="sg-seg" aria-hidden="true">
        <span class="sg-item">Let's build</span><span class="sg-dot"></span>
        <span class="sg-item sg-stroke">BabeL-O</span><span class="sg-dot"></span>
        <span class="sg-item">Let's build</span><span class="sg-dot"></span>
        <span class="sg-item sg-stroke">BabeL-O</span><span class="sg-dot"></span>
      </div>
    </div>
  </div>

  <section class="sg-section sg-cta" id="sg-cta">
    <div class="sg-wrap">
      <div class="sg-cta-inner">
        <span class="sg-eyebrow sg-reveal" style="justify-content:center">Ready when you are</span>
        <h2 class="sg-reveal" data-d="1" data-scroll="" data-scroll-call="cta,enter">Ready to ship<br>with <span class="sg-grad">BabeL-O?</span></h2>
        <p class="sg-reveal" data-d="2">Install in one line. Bring your own API key. Your terminal becomes a durable workspace for real coding sessions.</p>
        <div class="sg-cta-cta sg-reveal" data-d="3">
          <div class="sg-install" id="sg-installChip2" title="Click to copy">
            <span class="sg-prompt">$</span>
            <span class="sg-cmd">npm install -g babel-o</span>
            <span class="sg-label">Copied!</span>
            <button class="sg-copy" aria-label="Copy install command">
              <svg class="sg-cp" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>
              <svg class="sg-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
            </button>
          </div>
          <a class="sg-btn sg-btn-ghost" href="#sg-faq">Read the docs</a>
        </div>
      </div>
    </div>
  </section>
</main>
<footer class="sg-footer">
  <div class="sg-wrap">
    <div class="sg-footer-grid">
      <div>
        <a class="sg-brand" href="#sg-top">
          <img class="sg-mark" data-src="../assets/babel-o-logo.png" alt="" width="30" height="30">
          <span>BabeL<span style="color:var(--accent)">·</span>O</span>
        </a>
        <p>Your terminal workspace for durable coding sessions, native TUI workflows, and tool-aware agents.</p>
      </div>
      <div>
        <h5>Product</h5>
        <ul>
          <li><a href="#sg-features">Features</a></li>
          <li><a href="#sg-how">How it works</a></li>
          <li><a href="#sg-demo">Live demo</a></li>
          <li><a href="#sg-architecture">Architecture</a></li>
        </ul>
      </div>
      <div>
        <h5>Resources</h5>
        <ul>
          <li><a href="#sg-paths">Get started</a></li>
          <li><a href="#sg-faq">FAQ</a></li>
          <li><a href="#">Changelog</a></li>
          <li><a href="#">GitHub</a></li>
        </ul>
      </div>
      <div>
        <h5>Community</h5>
        <ul>
          <li><a href="#">Contributing</a></li>
          <li><a href="#">Governance</a></li>
          <li><a href="#">Discussions</a></li>
          <li><a href="#">License (MIT)</a></li>
        </ul>
      </div>
    </div>
    <div class="sg-footer-bottom">
      <span>© <span id="sg-year"></span> BabeL-O · MIT licensed</span>
      <span class="sg-kk">
        Built by
        <img data-src="../assets/kezhongke_logo_3d.png" alt="KezhongKe" width="22" height="22">
        <span>KezhongKe (壳中客)</span>
      </span>
    </div>
  </div>
</footer>
<script type="application/json" id="sg-app-data">
{
  "features": [
    {"span":"span6","icon":"terminal","title":"Native Go TUI","tag":"client","hot":false,
     "body":"\`bbl go\` launches a ~10MB Go binary (Bubble Tea) with no Node dependency on the client side. Drop it in a container and run."},
    {"span":"span6","icon":"pulse","title":"Durable Nexus sessions","tag":"runtime","hot":true,
     "body":"A background daemon holds state. Disconnect the client, reconnect over WebSocket later — your in-flight task is right where you left it."},
    {"span":"span4","icon":"layers","title":"Parallel worktrees","tag":"workflow","hot":false,
     "body":"Run multiple isolated sessions across git worktrees simultaneously, each with its own context and permissions."},
    {"span":"span4","icon":"shield","title":"Permission-first tools","tag":"safety","hot":true,
     "body":"A four-level risk model — read < write < execute < task. Approve once, per session, or reject with feedback. Every action is audited."},
    {"span":"span4","icon":"eye","title":"Inspectable context","tag":"transparency","hot":false,
     "body":"/context shows budget, compaction, recovery and working set — agent state is never a black box."},
    {"span":"span12","icon":"brain","title":"Optional long-term memory","tag":"opt-in","hot":false,
     "body":"MemoryOS / EverCore is a local, opt-in, permission-gated sidecar that indexes approved session knowledge as hints — never replacing workspace evidence. Plus session collaboration via /session, /inbox and SessionChannel, and system keychain storage for API keys (macOS/Windows/Linux)."}
  ],
  "faq": [
    {"q":"Is BabeL-O really open source?","a":"Yes. BabeL-O is MIT-licensed. The native Go TUI and the Nexus daemon are both open. Run it, self-host it, and audit every line."},
    {"q":"What does 'durable session' actually mean?","a":"Nexus owns execution state out-of-process and persists it to SQLite (WAL) plus a JSONL append log. If your terminal dies or you disconnect, the session keeps running — reconnect with \`bbl attach <id>\` and pick up exactly where you left off."},
    {"q":"Which model providers are supported?","a":"Eight out of the box: Anthropic, OpenAI, DeepSeek, Moonshot, Ollama, Zhipu, MiniMax, and local models. Each provider is pluggable, with failover and recovery handled by the runtime."},
    {"q":"Where are my API keys stored?","a":"In your operating system keychain — macOS Keychain, Windows Credential Manager, or the Linux secret store. Keys never leave your machine unless you explicitly configure a remote runner."},
    {"q":"Does it work on Windows?","a":"The daemon (Node ≥ 22) and keychain storage are cross-platform. The production interactive surface is a native Go TUI tuned for macOS and Linux terminals; on Windows use WSL for the best experience."},
    {"q":"How is this different from other CLI agents?","a":"Most are one-shot chats tied to a single process. BabeL-O separates execution (Nexus) from interaction (CLI), so sessions are durable, parallelizable across worktrees, permission-governed, fully audited, and inspectable via /context."}
  ]
}
<\/script>`;
  function mount(root, options) {
    if (!root) throw new Error('mount root is required');

    root.innerHTML = TEMPLATE;

    (() => {
      "use strict";
      const $  = (s, c=document) => c.querySelector(s);
      const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
      const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      /* year */
      $("#sg-year").textContent = new Date().getFullYear();

      /* =====================================================================
         [动态样式] 1. THEME TOGGLE  — flips [data-theme] + persists choice
         ===================================================================== */
      const root = document.documentElement;
      const stored = localStorage.getItem("bbl-theme");
      const sysDark = matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", stored || (sysDark ? "dark" : "light"));
      $("#sg-themeToggle").addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem("bbl-theme", next);
      });

      /* =====================================================================
         [动态样式] 2. LOCOMOTIVE SCROLL - smooth scrolling + data-scroll parallax
              Drives the --scroll progress var (0..1) via scrollCallback, toggles
              nav state, and fires data-scroll-call hooks for coordinated states.
              Falls back gracefully to native scroll if the lib fails to load.
         ===================================================================== */
      const nav = $("#sg-nav");
      let scrollInstance = null;

      // data-scroll-call registry - maps "key,event" -> handler. Locomotive fires
      // these when a [data-scroll-call] element crosses its trigger position,
      // giving us real, scroll-driven animation state transitions.
      const callHandlers = {
        "sg-arch,enter": (el) => {
          el.closest(".sg-arch")?.classList.add("sg-call-fired");
        },
        "sg-cta,enter": (el) => {
          el.classList.add("sg-call-fired");
        }
      };
      // Locomotive dispatches a window 'scroll-call' event with { trigger, way, obj }
      addEventListener("scroll-call", (e) => {
        const obj = e.detail?.obj || {};
        const key = [obj.trigger, obj.way].join(",");
        // Also try the element's own attribute as the canonical key
        const fn = callHandlers[key];
        if (fn && e.target instanceof Element) fn(e.target);
      });

      function applyScrollProgress(progress){
        root.style.setProperty("--sg-scroll", (progress || 0).toFixed(4));
      }
      function setNavScrolled(scrolled){
        nav.classList.toggle("sg-is-scrolled", scrolled);
      }

      // Initialise Locomotive Scroll (Lenis-powered). The UMD bundle attaches
      // window.LocomotiveScroll. If the script is missing/blocked, we degrade to
      // native scrolling and still drive --scroll from a passive scroll listener.
      if (window.LocomotiveScroll) {
        try {
          scrollInstance = new window.LocomotiveScroll({
            autoStart: true,                 // REQUIRED: Loco only starts Lenis's RAF when this is true
            lenisOptions: {
              duration: 1.1,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
              smoothWheel: true,
              touchMultiplier: 1.5
            },
            triggerRootMargin: "0px 0px -10% 0px",
            rafRootMargin: "0px 0px -10% 0px",
            scrollCallback: ({ scroll, progress, direction }) => {
              applyScrollProgress(progress);
              setNavScrolled((scroll || 0) > 12);
            }
          });
          // expose for debugging
          window.__loco = scrollInstance;
          // Defensive: autoStart should start Lenis's RAF, but some environments
          // (e.g. headless) leave isRunning=false. Force-start on the next tick so
          // smooth scrolling + parallax reliably engage.
          requestAnimationFrame(() => {
            try { scrollInstance.start(); } catch (_) {}
            if (scrollInstance.lenisInstance && !scrollInstance.lenisInstance.isRunning) {
              try { scrollInstance.lenisInstance.start(); } catch (_) {}
            }
          });
        } catch (err) {
          console.warn("[bbl] LocomotiveScroll init failed, falling back to native scroll:", err);
          scrollInstance = null;
        }
      }

      // Fallback / parity: native scroll listener still updates --scroll when smooth
      // scrolling is unavailable. Cheap no-op when Lenis is driving progress.
      let ticking = false;
      function onScrollNative(){
        if (scrollInstance) return;            // Lenis owns progress
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const h = document.documentElement;
          const max = h.scrollHeight - h.clientHeight;
          const p = max > 0 ? h.scrollTop / max : 0;
          applyScrollProgress(p);
          setNavScrolled(h.scrollTop > 12);
          ticking = false;
        });
      }
      addEventListener("scroll", onScrollNative, { passive:true });
      onScrollNative();

      /* =====================================================================
         [真实动画状态] 3. HERO WORD REVEAL  — staggered via --i per word
         ===================================================================== */
      $$(".sg-words .sg-w").forEach((w, i) => w.style.setProperty("--sg-i", i));
      const heroTitle = $("#sg-heroTitle");
      if (heroTitle) {
        if (prefersReduced) heroTitle.classList.add("sg-revealed");
        else {
          const io = new IntersectionObserver((es) => {
            es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("sg-revealed"); io.unobserve(e.target);} });
          }, { threshold: .25 });
          io.observe(heroTitle);
        }
      }

      /* =====================================================================
         [真实动画状态] 4. GENERIC REVEAL ON SCROLL
         ===================================================================== */
      const revealIO = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("sg-in"); revealIO.unobserve(e.target);} });
      }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
      $$(".sg-reveal:not(.sg-in)").forEach(el => revealIO.observe(el));

      /* =====================================================================
         [真实动画状态] 5. ACTIVE NAV LINK via section observer
         ===================================================================== */
      const navLinks = $$(".sg-nav-links a");
      const linkMap = new Map();
      navLinks.forEach(a => linkMap.set(a.getAttribute("href").slice(1), a));
      const sectionIO = new IntersectionObserver((es) => {
        es.forEach(e => {
          if (e.isIntersecting) {
            navLinks.forEach(a => a.classList.remove("sg-active"));
            const link = linkMap.get(e.target.id);
            if (link) link.classList.add("sg-active");
          }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      ["sg-features","sg-how","sg-demo","sg-architecture","sg-paths","sg-faq"].forEach(id => {
        const el = document.getElementById(id); if (el) sectionIO.observe(el);
      });

      /* =====================================================================
         [异步资源] 6. ASYNC WEBFONT  — injected <link>, swap on fonts.ready
              Graceful: if it fails/offline, system stack stays in place.
         ===================================================================== */
      const fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&sg-display=swap";
      fontLink.media = "print";
      fontLink.onload = () => {
        fontLink.media = "all";
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => root.classList.add("sg-fonts-ready"));
        } else {
          root.classList.add("sg-fonts-ready");
        }
      };
      fontLink.onerror = () => { /* keep system fonts — no-op */ };
      // small delay so first paint uses the system stack (progressive enhancement)
      setTimeout(() => document.head.appendChild(fontLink), 60);

      /* =====================================================================
         [异步资源] 7. LAZY IMAGES  — IntersectionObserver swaps data-src -> src
         ===================================================================== */
      const imgIO = new IntersectionObserver((es, obs) => {
        es.forEach(e => {
          if (e.isIntersecting) {
            const img = e.target;
            const src = img.getAttribute("data-src");
            if (src) { img.src = src; img.removeAttribute("data-src"); }
            obs.unobserve(img);
          }
        });
      }, { rootMargin: "200px" });
      $$("img[data-src]").forEach(img => imgIO.observe(img));

      /* =====================================================================
         [异步资源] 8. ASYNC DATA FETCH  — genuine fetch() of a Blob URL
              The JSON above is turned into a blob: URL and fetched, hydrating
              skeleton placeholders. Demonstrates real async resource loading.
         ===================================================================== */
      const ICONS = {
        terminal:"<sg-path d=\"M4 5h16v14H4z\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\"/><sg-path d=\"m8 9 3 3-3 3M13 15h4\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
        pulse:"<sg-path d=\"M3 12h4l2-6 4 14 2-8h6\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
        layers:"<sg-path d=\"M12 3 3 8l9 5 9-5-9-5Z\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><sg-path d=\"m3 13 9 5 9-5M3 18l9 5 9-5\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/>",
        shield:"<sg-path d=\"M12 3 4 6v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V6Z\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><sg-path d=\"m9 12 2 2 4-4\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
        eye:"<sg-path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"12\" sg-r=\"3\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\"/>",
        brain:"<sg-path d=\"M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 6 17a3 3 0 0 0 3 3V4Z\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><sg-path d=\"M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 18 17a3 3 0 0 1-3 3V4Z\" fill=\"none\" sg-stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/>"
      };
      function featIcon(name){ return '<svg viewBox="0 0 24 24" width="24" height="24">'+(ICONS[name]||ICONS.terminal)+'</svg>'; }

      // turn embedded JSON into a real fetchable resource
      const dataEl = $("#sg-app-data");
      const jsonText = dataEl.textContent;
      const blob = new Blob([jsonText], { type:"application/json" });
      const blobURL = URL.createObjectURL(blob);

      async function loadAppData(){
        // genuine async network-style fetch of the blob resource
        const res = await fetch(blobURL, { cache:"no-store" });
        if (!res.ok) throw new Error("data fetch failed");
        return res.json();
      }

      function renderFeatures(features){
        const grid = $("#sg-featuresGrid");
        grid.innerHTML = "";
        features.forEach((f, i) => {
          const a = document.createElement("article");
          a.className = `sg-feat ${f.span} sg-reveal`;
          a.setAttribute("data-d", String((i % 4) + 1));
          a.innerHTML = `
            <div class="sg-ic">${featIcon(f.icon)}</div>
            ${f.tag ? `<span class="sg-tag ${f.hot?"sg-hot":''}">${f.tag}</span>`:''}
            <h3>${f.title}</h3>
            <p>${f.body}</p>`;
          grid.appendChild(a);
          revealIO.observe(a);
        });
      }

      function renderFAQ(faq){
        const wrap = $("#sg-faq");
        wrap.innerHTML = "";
        faq.forEach((item, i) => {
          const el = document.createElement("div");
          el.className = "sg-faq-item sg-reveal";
          el.setAttribute("data-d", String((i % 3) + 1));
          el.innerHTML = `
            <button class="sg-faq-q" aria-expanded="false">
              <span>${item.q}</span>
              <span class="sg-plus" aria-hidden="true"></span>
            </button>
            <div class="sg-faq-a"><div><p>${item.a}</p></div></div>`;
          wrap.appendChild(el);
          revealIO.observe(el);
        });
        wireAccordion();
      }

      function wireAccordion(){
        $$(".sg-faq-item").forEach(item => {
          const btn = $(".sg-faq-q", item);
          btn.addEventListener("click", () => {
            const open = item.classList.toggle("sg-open");
            btn.setAttribute("aria-expanded", String(open));
          });
        });
      }

      // hydrate (with a small artificial delay so skeletons are visible)
      loadAppData().then(d => {
        setTimeout(() => {
          renderFeatures(d.features);
          renderFAQ(d.faq);
          URL.revokeObjectURL(blobURL);
        }, 700);
      }).catch(err => {
        console.error("[bbl] data hydration failed:", err);
        // graceful fallback: clear skeletons with a message
        $("#sg-featuresGrid").innerHTML = "<p style=\"grid-column:1/-1;color:var(--sg-text-3)\">Features are loading… refresh if this persists.</p>";
      });

      /* =====================================================================
         [真实动画状态] 9. COPY-TO-CLIPBOARD with copied state
         ===================================================================== */
      function wireCopy(chip){
        const cmd = $(".sg-cmd", chip);
        const copy = $(".sg-copy", chip);
        if (!cmd || !copy) return;
        chip.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            await navigator.clipboard.writeText(cmd.textContent.trim());
          } catch { /* clipboard may be blocked on file:// — still show state */ }
          chip.classList.add("sg-copied");
          setTimeout(() => chip.classList.remove("sg-copied"), 1600);
        });
      }
      wireCopy($("#sg-installChip"));
      wireCopy($("#sg-installChip2"));

      /* =====================================================================
         [嵌套滚动] 10. HOW-IT-WORKS HORIZONTAL CAROUSEL — keyboard + wheel
         ===================================================================== */
      const howScroll = $("#sg-howScroll");
      howScroll.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") { howScroll.scrollBy({ left: 460, behavior:"smooth" }); e.preventDefault(); }
        if (e.key === "ArrowLeft")  { howScroll.scrollBy({ left:-460, behavior:"smooth" }); e.preventDefault(); }
      });
      // translate vertical wheel into horizontal scroll when focused/hovered
      let wheelLock = false;
      howScroll.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && howScroll.matches(":hover")) {
          const atStart = howScroll.scrollLeft <= 0 && e.deltaY < 0;
          const atEnd   = howScroll.scrollLeft + howScroll.clientWidth >= howScroll.scrollWidth - 1 && e.deltaY > 0;
          if (!atStart && !atEnd) {
            howScroll.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        }
      }, { passive:false });

      /* =====================================================================
         [真实动画状态] 11. TERMINAL DEMO STATE MACHINE
              States: idle -> typing -> executing -> streaming -> done -> idle
              Driven by async/await with delays; the state badge + transcript
              reflect each transition (real animation states, not a recording).
         ===================================================================== */
      const demoState  = $("#sg-demoState");
      const demoLbl    = $(".sg-lbl", demoState);
      const transcript = $("#sg-demoTranscript");
      const playBtn    = $("#sg-demoPlay");
      const resetBtn   = $("#sg-demoReset");

      const setState = (s) => {
        demoState.setAttribute("data-state", s);
        demoLbl.textContent = s;
      };

      function tline(html, cls=""){
        const d = document.createElement("div");
        d.className = "sg-ln sg-fade-in" + (cls ? " "+cls : "");
        d.innerHTML = html;
        transcript.appendChild(d);
        // keep the latest line in view (nested-scroll auto-follow)
        transcript.scrollTop = transcript.scrollHeight;
        return d;
      }
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      // typewriter helper that mutates a node's text character by character
      async function typeInto(node, text, speed=18){
        for (const ch of text) {
          node.textContent += ch;
          transcript.scrollTop = transcript.scrollHeight;
          await wait(speed + Math.random()*22);
        }
      }

      let demoRunning = false;
      let demoAbort = false;

      async function runDemo(){
        if (demoRunning) return;
        demoRunning = true;
        demoAbort = false;
        playBtn.querySelector("span").textContent = "Running";
        playBtn.disabled = true;

        setState("idle");
        await wait(450); if (demoAbort) return;

        // --- typing ---
        setState("typing");
        const promptLine = tline("<span class=\"sg-prompt\">❯ </span><span class=\"typed\"></span>");
        const typed = $(".typed", promptLine);
        await typeInto(typed, "bbl go --sg-worktree sg-feat/keychain", 16);
        await wait(300); if (demoAbort) return;
        tline("<span class=\"sg-c-grn\">●</span> nexus online · ws://127.0.0.1:7331 · session #a1f3");

        // --- executing (plan + edits) ---
        setState("executing");
        await wait(350); if (demoAbort) return;
        tline("<span class=\"sg-c-acc\">planning</span> 3-step sg-plan › 2 file edits › 1 run");
        const steps = [
          ['edit','clients/go-tui/.../auth.go','(+42 −18)'],
          ['edit','lib/keychain.ts','(+11 −3)']
        ];
        for (const [k,f,d] of steps){
          if (demoAbort) return;
          tline(`<span class="sg-c-acc">${k}</span> ${f} <span class="sg-c-dim">${d}</span>`);
          await wait(520);
        }

        // --- streaming (tool output) ---
        setState("streaming");
        await wait(300); if (demoAbort) return;
        const toolLine = tline("<span class=\"sg-c-blu\">tool</span> bash › go test ./... <span class=\"c-stream\"></span>");
        const stream = $(".c-stream", toolLine);
        const streamChunks = ["ok  ", "babel-o/nexus", "  0.842s", "  ", "\n", "ok  ", "babel-o/tui", "  1.204s", "\n", "PASS"];
        for (const c of streamChunks){
          if (demoAbort) return;
          stream.textContent += c;
          transcript.scrollTop = transcript.scrollHeight;
          await wait(110);
        }
        stream.innerHTML = stream.textContent + " <span class=\"sg-c-grn\">✓ pass</span>";

        // --- done ---
        setState("done");
        await wait(250);
        tline("<span class=\"sg-c-grn\">done</span> 1m 42s · 0 issues · audit saved");
        await wait(200); if (demoAbort) return;
        const finalPrompt = tline("<span class=\"sg-prompt\">❯ </span><span class=\"sg-term-cursor\"></span>");

        await wait(1600);
        // loop unless aborted
        if (!demoAbort) {
          resetDemo();
          await wait(500);
          if (!demoAbort) runDemo();
          else { demoRunning = false; playBtn.disabled=false; playBtn.querySelector("span").textContent="Run"; }
        } else {
          demoRunning = false; playBtn.disabled=false; playBtn.querySelector("span").textContent="Run";
        }
      }

      function resetDemo(){
        transcript.innerHTML = "";
        setState("idle");
      }

      playBtn.addEventListener("click", () => { if (!demoRunning) runDemo(); });
      resetBtn.addEventListener("click", () => {
        demoAbort = true;
        resetDemo();
        demoRunning = false;
        playBtn.disabled = false;
        playBtn.querySelector("span").textContent = "Run";
      });

      // kick off the demo when it scrolls into view
      const demoIO = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting && !demoRunning && !prefersReduced) { runDemo(); demoIO.disconnect(); } });
      }, { threshold:.4 });
      demoIO.observe($("#sg-demo"));

      /* seed an initial idle line */
      tline("<span class=\"sg-c-dim\"># press Run, or scroll to auto-start the cycle</span>");
      setState("idle");

      /* =====================================================================
         smooth-scroll for in-page anchors (offset for fixed nav).
         Routed through Locomotive/Lenis scrollTo when available so the motion
         uses the same easeOutExpo curve as the rest of the page; falls back to
         native window.scrollTo otherwise.
         ===================================================================== */
      $$('a[href^="#"]').forEach(a => {
        a.addEventListener("click", (e) => {
          const id = a.getAttribute("href").slice(1);
          if (!id) return;
          const el = document.getElementById(id);
          if (el) {
            e.preventDefault();
            const offset = -((() => parseInt(getComputedStyle(root).getPropertyValue("--sg-nav-h")))() || 72);
            if (scrollInstance && scrollInstance.scrollTo) {
              scrollInstance.scrollTo(el, { offset, duration: 1.2 });
            } else {
              const y = el.getBoundingClientRect().top + window.scrollY + offset;
              window.scrollTo({ top: y, behavior: "smooth" });
            }
          }
        });
      });
      function var_navH(){ return parseInt(getComputedStyle(root).getPropertyValue("--sg-nav-h")) || 72; }

    })();

    return { root: root, destroy: function(){ root.innerHTML = ''; } };
  }
  function create(options) {
    var root = document.createElement('div');
    root.className = 'sg-library-host';
    mount(root, options || {});
    return root;
  }
  global.BabeloLanding = { mount: mount, create: create };
})(window);
