(function(global){
"use strict";
const modules = {
"components/ApplicationShell.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApplicationShell = createApplicationShell;
exports.renderEventIntro = renderEventIntro;
const constants_js_1 = require("../constants.js");
const SHELL_MARKUP = `
<div id="sg-app-container" role="application" aria-label="秦始皇七大事件与人物关系">
  <div class="sg-event-intro" id="sg-eventIntro"></div>
  <div class="sg-graph-wrap" id="sg-graphWrap">
    <div class="sg-graph-legend">
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-family" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>宗亲</div>
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-ruler" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>君臣</div>
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-ally" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>同僚</div>
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-enemy" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>对立</div>
    </div>
    <div class="sg-graph-canvas" id="sg-graphCanvas">
      <svg class="sg-edges" id="sg-graphEdges"></svg>
    </div>
    <div class="sg-graph-hint" id="sg-graphHint"><span class="sg-gh-dot"></span>点击头像查看人物详情，可拖动</div>
  </div>
  <div class="sg-event-bar">
    <button class="sg-bar-arrow" id="sg-barPrev" type="button" aria-label="上一个事件" title="上一个事件">‹</button>
    <div class="sg-event-btns" id="sg-eventBtns"></div>
    <button class="sg-bar-arrow" id="sg-barNext" type="button" aria-label="下一个事件" title="下一个事件">›</button>
    <div aria-hidden="true" class="sg-swipe-hint" id="sg-swipeHint">›</div>
  </div>
  <div class="sg-modal-overlay" id="sg-modalOverlay" role="dialog" aria-modal="true" aria-labelledby="sg-modalName">
    <div class="sg-modal-content">
      <button class="sg-modal-close" id="sg-modalClose" type="button" aria-label="关闭人物详情">✕</button>
      <div class="sg-modal-head">
        <img alt="" class="sg-modal-avatar" id="sg-modalAvatar" />
        <div class="sg-modal-head-info">
          <div class="sg-modal-person-name" id="sg-modalName"></div>
          <div class="sg-modal-person-role" id="sg-modalRole"></div>
          <span class="sg-modal-rel-tag" id="sg-modalRelTag"></span>
        </div>
      </div>
      <div class="sg-modal-body">
        <div class="sg-modal-section">
          <div class="sg-modal-section-title">在本事件中的作为</div>
          <div class="sg-modal-section-text" id="sg-modalDeed"></div>
        </div>
        <div class="sg-modal-section">
          <div class="sg-modal-section-title">影响</div>
          <div class="sg-modal-section-text" id="sg-modalImpact"></div>
        </div>
      </div>
    </div>
  </div>
</div>`;
function required(root, selector) {
    const element = root.querySelector(selector);
    if (!element)
        throw new Error(`ApplicationShell is missing ${selector}`);
    return element;
}
function createApplicationShell(root) {
    root.innerHTML = SHELL_MARKUP;
    const app = required(root, "#sg-app-container");
    return {
        app,
        intro: required(app, "#sg-eventIntro"),
        graphWrap: required(app, "#sg-graphWrap"),
        graphCanvas: required(app, "#sg-graphCanvas"),
        graphEdges: required(app, "#sg-graphEdges"),
        graphHint: required(app, "#sg-graphHint"),
        eventBtns: required(app, "#sg-eventBtns"),
        prev: required(app, "#sg-barPrev"),
        next: required(app, "#sg-barNext"),
        swipeHint: required(app, "#sg-swipeHint"),
        modalOverlay: required(app, "#sg-modalOverlay"),
        modalClose: required(app, "#sg-modalClose"),
        modalAvatar: required(app, "#sg-modalAvatar"),
        modalName: required(app, "#sg-modalName"),
        modalRole: required(app, "#sg-modalRole"),
        modalRelTag: required(app, "#sg-modalRelTag"),
        modalDeed: required(app, "#sg-modalDeed"),
        modalImpact: required(app, "#sg-modalImpact"),
    };
}
function usesSmallCanvas(shell) {
    if (shell.app.classList.contains("sg-is-small-canvas"))
        return true;
    if (shell.app.classList.contains("sg-is-large-canvas"))
        return false;
    const view = shell.app.ownerDocument.defaultView;
    if (!view)
        return false;
    const { innerWidth: width, innerHeight: height } = view;
    return width < 415 || height < 456 || (width <= 768 && width / height < 1);
}
function renderEventIntro(shell, event, eventIndex = 0, eventCount = 1) {
    const document = shell.app.ownerDocument;
    const image = document.createElement("img");
    image.className = "sg-intro-icon";
    image.src = `${constants_js_1.ASSET_BASE}${event.image}`;
    image.alt = event.name;
    image.loading = "lazy";
    const text = document.createElement("div");
    text.className = "sg-intro-text";
    const titleLine = document.createElement("div");
    titleLine.className = "sg-intro-title-line";
    const name = document.createElement("span");
    name.className = "sg-intro-name";
    name.textContent = event.name;
    const period = document.createElement("span");
    period.className = "sg-intro-period";
    period.textContent = `${event.year} · ${event.period}`;
    titleLine.append(name, period);
    const summary = document.createElement("div");
    summary.className = "sg-intro-summary";
    summary.textContent = usesSmallCanvas(shell) && event.summaryShort
        ? event.summaryShort
        : event.summary;
    text.append(titleLine, summary);
    const index = document.createElement("div");
    index.className = "sg-intro-index";
    const current = document.createElement("b");
    current.textContent = String(eventIndex + 1);
    index.append(current, `/${eventCount}`);
    shell.intro.replaceChildren(image, text, index);
}

},
"components/EdgeLabelPlacement.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeEdgeLabels = placeEdgeLabels;
const LABEL_HEIGHT = 16;
function placeEdgeLabels(segments, nodes, canvasRect, scale, bounds) {
    const circles = [];
    const rectangles = [];
    nodes.forEach((node) => {
        const avatar = node.element.querySelector(".sg-avatar");
        if (!avatar)
            return;
        const avatarRect = avatar.getBoundingClientRect();
        circles.push({
            x: (avatarRect.left + avatarRect.width / 2 - canvasRect.left) / scale,
            y: (avatarRect.top + avatarRect.height / 2 - canvasRect.top) / scale,
            r: avatarRect.width / 2 / scale + (node.element.classList.contains("sg-big") ? 14 : 4),
        });
        for (const selector of [".sg-name", ".sg-role-chip"]) {
            const label = node.element.querySelector(selector);
            if (!label)
                continue;
            const rect = label.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0)
                continue;
            rectangles.push({
                cx: (rect.left + rect.width / 2 - canvasRect.left) / scale,
                cy: (rect.top + rect.height / 2 - canvasRect.top) / scale,
                hw: rect.width / 2 / scale + 2, hh: rect.height / 2 / scale + 2,
            });
        }
    });
    const placed = [];
    const clearance = (cx, cy, hw, hh) => {
        let minimum = Number.POSITIVE_INFINITY;
        for (const circle of circles) {
            const dx = Math.abs(cx - circle.x) - hw;
            const dy = Math.abs(cy - circle.y) - hh;
            const gap = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - circle.r;
            minimum = Math.min(minimum, dx < 0 && dy < 0 ? -(circle.r + Math.min(hw + dx, hh + dy)) : gap);
        }
        const rectGap = (rect) => Math.max(Math.abs(cx - rect.cx) - (hw + rect.hw), Math.abs(cy - rect.cy) - (hh + rect.hh));
        for (const rect of rectangles)
            minimum = Math.min(minimum, rectGap(rect));
        for (const rect of placed)
            minimum = Math.min(minimum, rectGap(rect));
        return minimum;
    };
    for (const { edge, x1, y1, x2, y2, nx, ny } of segments) {
        if (!edge.text || !edge.background)
            continue;
        const measured = edge.text.getComputedTextLength();
        const width = (measured > 0 ? measured : (edge.text.textContent?.length ?? 0) * 10) + 10;
        const halfWidth = width / 2;
        const halfHeight = LABEL_HEIGHT / 2;
        const pointAt = (amount) => [x1 + (x2 - x1) * amount, y1 + (y2 - y1) * amount];
        const anchor = pointAt(0.5);
        const sign = nx * (anchor[0] - bounds.w / 2) + ny * (anchor[1] - bounds.h / 2) >= 0 ? 1 : -1;
        const offsets = [0, 9 * sign, -9 * sign, 16 * sign, -16 * sign, 24 * sign, -24 * sign,
            32 * sign, -32 * sign, 42 * sign, -42 * sign, 54 * sign, -54 * sign];
        let best = null;
        search: for (const amount of [0.5, 0.58, 0.42, 0.66, 0.34, 0.72, 0.28]) {
            const [pointX, pointY] = pointAt(amount);
            for (const offset of offsets) {
                const cx = pointX + nx * offset;
                const cy = pointY + ny * offset;
                if (cx - halfWidth < 2 || cx + halfWidth > bounds.w - 2 || cy - halfHeight < 2 || cy + halfHeight > bounds.h - 2)
                    continue;
                const candidateClearance = clearance(cx, cy, halfWidth, halfHeight);
                if (!best || candidateClearance > best.clearance)
                    best = { cx, cy, clearance: candidateClearance };
                if (candidateClearance >= 1)
                    break search;
            }
        }
        const hidden = !best || best.clearance < 0;
        edge.background.classList.toggle("sg-lbl-hide", hidden);
        edge.text.classList.toggle("sg-lbl-hide", hidden);
        if (!best || hidden)
            continue;
        placed.push({ cx: best.cx, cy: best.cy, hw: halfWidth, hh: halfHeight });
        edge.background.setAttribute("x", String(best.cx - halfWidth));
        edge.background.setAttribute("y", String(best.cy - halfHeight));
        edge.background.setAttribute("width", String(width));
        edge.background.setAttribute("height", String(LABEL_HEIGHT));
        edge.text.setAttribute("x", String(best.cx));
        edge.text.setAttribute("y", String(best.cy));
    }
}

},
"components/EdgeRenderer.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEdgeRenderer = createEdgeRenderer;
const EdgeLabelPlacement_js_1 = require("./EdgeLabelPlacement.js");
function createEdgeRenderer(shell, getNodes, getScale, getBounds) {
    let edges = [];
    const clear = () => { edges = []; shell.graphEdges.replaceChildren(); };
    const setLinks = (links) => {
        clear();
        const namespace = shell.graphEdges.namespaceURI;
        if (!namespace)
            throw new Error("graphEdges must be an SVG element");
        for (const link of links) {
            const path = document.createElementNS(namespace, "path");
            path.setAttribute("class", `sg-edge sg-${link.type}`);
            let background = null;
            let text = null;
            if (link.label) {
                background = document.createElementNS(namespace, "rect");
                background.setAttribute("class", "sg-edge-label-bg");
                background.setAttribute("rx", "5");
                text = document.createElementNS(namespace, "text");
                text.setAttribute("class", "sg-edge-label");
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("dominant-baseline", "central");
                text.textContent = link.label;
            }
            shell.graphEdges.append(path);
            if (background)
                shell.graphEdges.append(background);
            if (text)
                shell.graphEdges.append(text);
            edges.push({ ...link, path, background, text });
        }
    };
    const update = () => {
        const nodes = getNodes();
        if (!nodes.size)
            return;
        const scale = getScale() || 1;
        const canvasRect = shell.graphCanvas.getBoundingClientRect();
        const segments = [];
        for (const edge of edges) {
            const first = nodes.get(edge.a)?.element.querySelector(".sg-avatar");
            const second = nodes.get(edge.b)?.element.querySelector(".sg-avatar");
            if (!first || !second)
                continue;
            const a = first.getBoundingClientRect();
            const b = second.getBoundingClientRect();
            const ax = (a.left + a.width / 2 - canvasRect.left) / scale;
            const ay = (a.top + a.height / 2 - canvasRect.top) / scale;
            const bx = (b.left + b.width / 2 - canvasRect.left) / scale;
            const by = (b.top + b.height / 2 - canvasRect.top) / scale;
            const dx = bx - ax;
            const dy = by - ay;
            const distance = Math.hypot(dx, dy) || 1;
            const ux = dx / distance;
            const uy = dy / distance;
            const nx = -uy;
            const ny = ux;
            const x1 = ax + ux * (a.width / 2 / scale + 3);
            const y1 = ay + uy * (a.height / 2 / scale + 3);
            const x2 = bx - ux * (b.width / 2 / scale + 3);
            const y2 = by - uy * (b.height / 2 / scale + 3);
            edge.path.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
            segments.push({ edge, x1, y1, x2, y2, nx, ny });
        }
        (0, EdgeLabelPlacement_js_1.placeEdgeLabels)(segments, nodes, canvasRect, scale, getBounds());
    };
    const clearHighlight = () => {
        for (const edge of edges) {
            edge.path.classList.remove("sg-hl", "sg-dim");
            edge.background?.classList.remove("sg-hl", "sg-dim");
            edge.text?.classList.remove("sg-hl", "sg-dim");
        }
    };
    const highlightRelated = (key) => {
        const related = new Set([key]);
        for (const edge of edges) {
            if (edge.a === key)
                related.add(edge.b);
            if (edge.b === key)
                related.add(edge.a);
        }
        for (const edge of edges) {
            const highlighted = edge.a === key || edge.b === key;
            edge.path.classList.toggle("sg-hl", highlighted);
            edge.path.classList.toggle("sg-dim", !highlighted);
            edge.background?.classList.toggle("sg-hl", highlighted);
            edge.background?.classList.toggle("sg-dim", !highlighted);
            edge.text?.classList.toggle("sg-hl", highlighted);
            edge.text?.classList.toggle("sg-dim", !highlighted);
        }
        return related;
    };
    return { setLinks, update, clear, clearHighlight, highlightRelated };
}

},
"components/EventControls.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventControls = createEventControls;
const ApplicationShell_js_1 = require("./ApplicationShell.js");
function createEventControls(shell, events, onSelect) {
    const view = shell.app.ownerDocument.defaultView;
    let currentIndex = 0;
    let frame = 0;
    let destroyed = false;
    const updateArrows = () => {
        const maxScroll = shell.eventBtns.scrollWidth - shell.eventBtns.clientWidth;
        const scrollable = maxScroll > 2;
        shell.prev.disabled = !scrollable || shell.eventBtns.scrollLeft <= 1;
        shell.next.disabled = !scrollable || shell.eventBtns.scrollLeft >= maxScroll - 1;
        const canScrollRight = scrollable && shell.eventBtns.scrollLeft < maxScroll - 4;
        shell.swipeHint.classList.toggle("sg-hide", !canScrollRight);
    };
    const centerActiveButton = () => {
        if (destroyed)
            return;
        shell.eventBtns
            .querySelector(".sg-event-btn.sg-active")
            ?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
        updateArrows();
    };
    const scheduleCentering = () => {
        if (frame && typeof view?.cancelAnimationFrame === "function") {
            view.cancelAnimationFrame(frame);
        }
        if (typeof view?.requestAnimationFrame === "function") {
            frame = view.requestAnimationFrame(centerActiveButton);
        }
        else {
            frame = 0;
            queueMicrotask(centerActiveButton);
        }
    };
    const render = (index) => {
        if (index < 0 || index >= events.length)
            return;
        currentIndex = index;
        (0, ApplicationShell_js_1.renderEventIntro)(shell, events[index], index, events.length);
        const buttons = events.map((event, eventIndex) => {
            const button = shell.app.ownerDocument.createElement("button");
            button.className = `sg-event-btn${eventIndex === index ? " sg-active" : ""}`;
            button.dataset.i = String(eventIndex);
            button.title = `查看：${event.name}`;
            const name = shell.app.ownerDocument.createElement("span");
            name.className = "sg-eb-name";
            name.textContent = event.name;
            const year = shell.app.ownerDocument.createElement("span");
            year.className = "sg-eb-year";
            year.textContent = event.year;
            button.append(name, year);
            return button;
        });
        shell.eventBtns.replaceChildren(...buttons);
        updateArrows();
        scheduleCentering();
    };
    const handleButtonClick = (event) => {
        const origin = event.target;
        const target = origin?.closest(".sg-event-btn") ?? null;
        if (!target || !shell.eventBtns.contains(target))
            return;
        const index = Number(target.dataset.i);
        if (!Number.isInteger(index))
            return;
        render(index);
        onSelect(index);
    };
    const scrollPrevious = () => {
        shell.eventBtns.scrollBy({ left: -180, behavior: "smooth" });
    };
    const scrollNext = () => {
        shell.eventBtns.scrollBy({ left: 180, behavior: "smooth" });
    };
    shell.eventBtns.addEventListener("click", handleButtonClick);
    shell.eventBtns.addEventListener("scroll", updateArrows, { passive: true });
    shell.prev.addEventListener("click", scrollPrevious);
    shell.next.addEventListener("click", scrollNext);
    if (events.length)
        render(0);
    else
        updateArrows();
    return {
        render,
        destroy() {
            destroyed = true;
            if (frame && typeof view?.cancelAnimationFrame === "function") {
                view.cancelAnimationFrame(frame);
            }
            shell.eventBtns.removeEventListener("click", handleButtonClick);
            shell.eventBtns.removeEventListener("scroll", updateArrows);
            shell.prev.removeEventListener("click", scrollPrevious);
            shell.next.removeEventListener("click", scrollNext);
        },
    };
}

},
"components/GraphAnimationLoop.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGraphAnimationLoop = createGraphAnimationLoop;
function createGraphAnimationLoop(update) {
    let frame = null;
    const sync = () => { update(); frame = requestAnimationFrame(sync); };
    return {
        start() { if (frame === null)
            frame = requestAnimationFrame(sync); },
        stop() { if (frame !== null)
            cancelAnimationFrame(frame); frame = null; },
    };
}

},
"components/GraphLayout.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGraphLayout = createGraphLayout;
function avatarSizes() {
    const { innerWidth: width, innerHeight: height } = window;
    if (width <= 320 || height <= 365)
        return { avatar: 42, big: 54, font: 10 };
    if (width <= 480 || height <= 480)
        return { avatar: 50, big: 64, font: 11 };
    return { avatar: 66, big: 84, font: 12 };
}
function orderRing(people, links) {
    const names = people.map((person) => person.name);
    const relevant = links.filter((link) => names.includes(link.a) && names.includes(link.b));
    if (names.length <= 2 || !relevant.length)
        return names;
    const between = (value, start, end) => {
        for (let index = (start + 1) % names.length; index !== end; index = (index + 1) % names.length) {
            if (index === value)
                return true;
        }
        return false;
    };
    const cost = (order) => {
        const positions = new Map(order.map((name, index) => [name, index]));
        let total = 0;
        for (const link of relevant) {
            const a = positions.get(link.a) ?? 0;
            const b = positions.get(link.b) ?? 0;
            total += (Math.min(Math.abs(a - b), names.length - Math.abs(a - b)) - 1) * 2;
        }
        for (let first = 0; first < relevant.length; first += 1) {
            for (let second = first + 1; second < relevant.length; second += 1) {
                const one = relevant[first];
                const two = relevant[second];
                const a = positions.get(one.a) ?? 0;
                const b = positions.get(one.b) ?? 0;
                const c = positions.get(two.a) ?? 0;
                const d = positions.get(two.b) ?? 0;
                if (a !== c && a !== d && b !== c && b !== d && between(c, a, b) !== between(d, a, b))
                    total += 3;
            }
        }
        return total;
    };
    let best = [...names];
    let bestCost = Number.POSITIVE_INFINITY;
    const first = names[0];
    const rest = names.slice(1);
    const permute = (index) => {
        if (index === rest.length) {
            const candidate = [first, ...rest];
            const candidateCost = cost(candidate);
            if (candidateCost < bestCost) {
                best = [...candidate];
                bestCost = candidateCost;
            }
            return;
        }
        for (let cursor = index; cursor < rest.length; cursor += 1) {
            [rest[index], rest[cursor]] = [rest[cursor], rest[index]];
            permute(index + 1);
            [rest[index], rest[cursor]] = [rest[cursor], rest[index]];
        }
    };
    permute(0);
    return best;
}
function createGraphLayout(shell) {
    let bounds = { w: 0, h: 0 };
    const getScale = () => {
        const logicalWidth = shell.graphWrap.offsetWidth;
        const visualWidth = shell.graphWrap.getBoundingClientRect().width;
        return logicalWidth > 0 && visualWidth > 0 ? visualWidth / logicalWidth : 1;
    };
    const measure = () => {
        const rect = shell.graphWrap.getBoundingClientRect();
        const scale = getScale() || 1;
        bounds = { w: Math.max(rect.width / scale, 120), h: Math.max(rect.height / scale, 120) };
        return bounds;
    };
    const compute = (event) => {
        const result = new Map();
        if (!event.people.length)
            return result;
        const { w, h } = measure();
        const mobile = window.innerWidth <= 768;
        const topSafe = mobile ? 46 : 38;
        const bottomSafe = mobile ? 30 : 40;
        const usableHeight = Math.max(h - topSafe - bottomSafe, 120);
        const center = { x: w * 0.5, y: topSafe + usableHeight * 0.5 };
        result.set(event.people[0].name, center);
        const ordered = orderRing(event.people.slice(1), event.links);
        const count = ordered.length;
        const radiusX = Math.max(w * 0.5 - (mobile ? 48 : 70), 96);
        const radiusY = Math.max(usableHeight * 0.5 - 16, 74);
        const start = -Math.PI / 2 + (count > 0 && count % 2 === 0 ? Math.PI / count : 0);
        ordered.forEach((name, index) => result.set(name, {
            x: center.x + Math.cos(start + (index / count) * Math.PI * 2) * radiusX,
            y: center.y + Math.sin(start + (index / count) * Math.PI * 2) * radiusY,
        }));
        const sizes = avatarSizes();
        const people = new Map(event.people.map((person) => [person.name, person]));
        const extents = new Map();
        for (const [name] of result) {
            const person = people.get(name);
            if (!person)
                continue;
            const avatar = person.big ? sizes.big : sizes.avatar;
            extents.set(name, { x: Math.max(avatar, name.length * sizes.font * 0.95 + 14) / 2, y: (avatar + sizes.font + 12) / 2 });
        }
        const clamp = (name) => {
            const point = result.get(name);
            const extent = extents.get(name);
            if (!point || !extent)
                return;
            point.x = Math.max(extent.x + 4, Math.min(w - extent.x - 4, point.x));
            point.y = Math.max(extent.y + topSafe, Math.min(h - extent.y - bottomSafe, point.y));
        };
        const keys = [...result.keys()];
        const marginX = mobile ? 14 : 18;
        const marginY = mobile ? 26 : 28;
        for (let iteration = 0; iteration < 120; iteration += 1) {
            let moved = false;
            for (let first = 0; first < keys.length; first += 1)
                for (let second = first + 1; second < keys.length; second += 1) {
                    const a = result.get(keys[first]);
                    const b = result.get(keys[second]);
                    const ae = extents.get(keys[first]);
                    const be = extents.get(keys[second]);
                    if (!a || !b || !ae || !be)
                        continue;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const overlapX = ae.x + be.x + marginX - Math.abs(dx);
                    const overlapY = ae.y + be.y + marginY - Math.abs(dy);
                    if (overlapX <= 0 || overlapY <= 0)
                        continue;
                    moved = true;
                    if (overlapX <= overlapY) {
                        const sign = dx === 0 ? (first % 2 ? 1 : -1) : Math.sign(dx);
                        a.x -= overlapX / 2 * sign;
                        b.x += overlapX / 2 * sign;
                    }
                    else {
                        const sign = dy === 0 ? (first % 2 ? 1 : -1) : Math.sign(dy);
                        a.y -= overlapY / 2 * sign;
                        b.y += overlapY / 2 * sign;
                    }
                    clamp(keys[first]);
                    clamp(keys[second]);
                }
            if (!moved)
                break;
        }
        keys.forEach(clamp);
        return result;
    };
    return { getBounds: () => bounds, getScale, compute };
}

},
"components/GraphNodeControl.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGraphNodeControl = createGraphNodeControl;
const constants_js_1 = require("../constants.js");
function createGraphNodeControl(options) {
    const { host, person, modal } = options;
    const element = document.createElement("div");
    element.className = `sg-node${person.big ? " sg-big" : ""}`;
    element.dataset.key = person.name;
    const inner = document.createElement("div");
    inner.className = "sg-float-inner";
    const avatar = document.createElement("div");
    avatar.className = "sg-avatar";
    avatar.setAttribute("style", `background-image:url('${constants_js_1.ASSET_BASE}${person.avatar}')`);
    const name = document.createElement("div");
    name.className = "sg-name";
    name.textContent = person.name;
    const role = document.createElement("div");
    role.className = "sg-role-chip";
    role.textContent = person.role;
    inner.append(avatar, name, role);
    element.append(inner);
    const duration = 6 + Math.random() * 4;
    inner.style.animationDuration = `${duration}s`;
    inner.style.animationDelay = `${-Math.random() * duration}s`;
    let position = { ...options.position };
    const moveTo = (point) => {
        position = { ...point };
        element.style.left = `${point.x}px`;
        element.style.top = `${point.y}px`;
    };
    moveTo(position);
    host.append(element);
    const onMouseEnter = () => options.onHover(person.name);
    const onMouseLeave = () => options.onLeave();
    const onClick = () => {
        if (element.dataset.dragged) {
            delete element.dataset.dragged;
            return;
        }
        options.onSelect(person.name);
        modal.open(person, element);
    };
    element.addEventListener("mouseenter", onMouseEnter);
    element.addEventListener("mouseleave", onMouseLeave);
    element.addEventListener("click", onClick);
    return {
        key: person.name,
        element,
        inner,
        getPosition: () => ({ ...position }),
        moveTo,
        setHighlight(active, dimmed) {
            element.classList.toggle("sg-active", active);
            element.classList.toggle("sg-dim", dimmed);
        },
        destroy() {
            element.removeEventListener("mouseenter", onMouseEnter);
            element.removeEventListener("mouseleave", onMouseLeave);
            element.removeEventListener("click", onClick);
            element.remove();
        },
    };
}

},
"components/GraphNodeGesture.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAPH_DRAG_THRESHOLD = void 0;
exports.hasExceededGraphDragThreshold = hasExceededGraphDragThreshold;
exports.clampGraphPoint = clampGraphPoint;
exports.attachGraphNodeGesture = attachGraphNodeGesture;
exports.GRAPH_DRAG_THRESHOLD = 4;
function hasExceededGraphDragThreshold(dx, dy) {
    return Math.abs(dx) + Math.abs(dy) > exports.GRAPH_DRAG_THRESHOLD;
}
function clampGraphPoint(point, bounds) {
    return {
        x: Math.max(24, Math.min(bounds.w - 24, point.x)),
        y: Math.max(24, Math.min(bounds.h - 24, point.y)),
    };
}
function attachGraphNodeGesture(options) {
    const { element } = options;
    let startX = 0;
    let startY = 0;
    let origin = options.getPosition();
    let moved = false;
    let active = false;
    const onMove = (clientX, clientY) => {
        if (!active)
            return;
        const scale = options.getScale() || 1;
        const dx = (clientX - startX) / scale;
        const dy = (clientY - startY) / scale;
        if (hasExceededGraphDragThreshold(dx, dy))
            moved = true;
        options.setPosition(clampGraphPoint({ x: origin.x + dx, y: origin.y + dy }, options.getBounds()));
        options.onMove();
    };
    const mouseMove = (event) => onMove(event.clientX, event.clientY);
    const touchMove = (event) => {
        const touch = event.touches[0];
        if (!touch)
            return;
        event.preventDefault();
        onMove(touch.clientX, touch.clientY);
    };
    const finish = () => {
        if (!active)
            return;
        active = false;
        element.classList.remove("sg-grabbing", "sg-dragging-now");
        if (moved)
            element.dataset.dragged = "1";
        document.removeEventListener("mousemove", mouseMove);
        document.removeEventListener("mouseup", finish);
        document.removeEventListener("touchmove", touchMove);
        document.removeEventListener("touchend", finish);
        document.removeEventListener("touchcancel", finish);
    };
    const start = (clientX, clientY) => {
        finish();
        active = true;
        moved = false;
        startX = clientX;
        startY = clientY;
        origin = options.getPosition();
        element.classList.add("sg-grabbing", "sg-dragging-now");
        document.addEventListener("mousemove", mouseMove);
        document.addEventListener("mouseup", finish);
        document.addEventListener("touchmove", touchMove, { passive: false });
        document.addEventListener("touchend", finish);
        document.addEventListener("touchcancel", finish);
    };
    const mouseDown = (event) => {
        event.preventDefault();
        start(event.clientX, event.clientY);
    };
    const touchStart = (event) => {
        const touch = event.touches[0];
        if (touch)
            start(touch.clientX, touch.clientY);
    };
    element.addEventListener("mousedown", mouseDown);
    element.addEventListener("touchstart", touchStart, { passive: true });
    return {
        destroy() {
            finish();
            element.removeEventListener("mousedown", mouseDown);
            element.removeEventListener("touchstart", touchStart);
        },
    };
}

},
"components/ModaloverlayDialog.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createModalDialog = createModalDialog;
const constants_js_1 = require("../constants.js");
const ACTIVE_CLASS = "sg-active";
const CORE_RELATIONSHIP_LABEL = "核心人物 · 本人";
const CORE_RELATIONSHIP_BACKGROUND = "linear-gradient(135deg, var(--primary), #7b96f7)";
function findCorePersonName(shell) {
    const name = shell.graphCanvas
        .querySelector(".sg-node.sg-big .sg-name")
        ?.textContent?.trim();
    return name || "核心";
}
function createModalDialog(shell) {
    const { modalOverlay, modalClose, modalAvatar, modalName, modalRole, modalRelTag, modalDeed, modalImpact, } = shell;
    let returnFocusTo = null;
    modalOverlay.setAttribute("role", "dialog");
    modalOverlay.setAttribute("aria-modal", "true");
    modalOverlay.setAttribute("aria-labelledby", modalName.id || "sg-modalName");
    modalOverlay.setAttribute("aria-hidden", modalOverlay.classList.contains(ACTIVE_CLASS) ? "false" : "true");
    modalClose.setAttribute("aria-label", "关闭人物详情");
    function isOpen() {
        return modalOverlay.classList.contains(ACTIVE_CLASS);
    }
    function open(person, trigger) {
        returnFocusTo = trigger;
        modalAvatar.src = constants_js_1.ASSET_BASE + person.avatar;
        modalName.textContent = person.name;
        modalRole.textContent = person.role;
        if (person.rel) {
            const relationship = constants_js_1.RELATIONSHIPS[person.rel];
            modalRelTag.textContent = `与${findCorePersonName(shell)}：${relationship.name}`;
            modalRelTag.style.background = relationship.color;
        }
        else {
            modalRelTag.textContent = CORE_RELATIONSHIP_LABEL;
            modalRelTag.style.background = CORE_RELATIONSHIP_BACKGROUND;
        }
        modalDeed.textContent = person.deed;
        modalImpact.textContent = person.impact;
        modalOverlay.classList.add(ACTIVE_CLASS);
        modalOverlay.setAttribute("aria-hidden", "false");
        modalClose.focus({ preventScroll: true });
    }
    function close() {
        if (!isOpen())
            return;
        modalOverlay.classList.remove(ACTIVE_CLASS);
        modalOverlay.setAttribute("aria-hidden", "true");
        const trigger = returnFocusTo;
        returnFocusTo = null;
        if (trigger?.isConnected) {
            trigger.focus({ preventScroll: true });
        }
    }
    function handleCloseClick() {
        close();
    }
    function handleBackdropClick(event) {
        if (event.target === modalOverlay)
            close();
    }
    function handleKeydown(event) {
        if (event.key === "Escape" && isOpen()) {
            event.preventDefault();
            close();
        }
    }
    modalClose.addEventListener("click", handleCloseClick);
    modalOverlay.addEventListener("click", handleBackdropClick);
    document.addEventListener("keydown", handleKeydown);
    return {
        open,
        close,
        destroy() {
            modalClose.removeEventListener("click", handleCloseClick);
            modalOverlay.removeEventListener("click", handleBackdropClick);
            document.removeEventListener("keydown", handleKeydown);
            returnFocusTo = null;
        },
    };
}

},
"components/RelationshipCanvas.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRelationshipCanvas = createRelationshipCanvas;
const EdgeRenderer_js_1 = require("./EdgeRenderer.js");
const GraphAnimationLoop_js_1 = require("./GraphAnimationLoop.js");
const GraphLayout_js_1 = require("./GraphLayout.js");
const GraphNodeControl_js_1 = require("./GraphNodeControl.js");
const GraphNodeGesture_js_1 = require("./GraphNodeGesture.js");
function createRelationshipCanvas(shell, modal) {
    let event = null;
    let nodes = new Map();
    let gestures = [];
    let resizeTimer = null;
    let hintDismissed = false;
    const layout = (0, GraphLayout_js_1.createGraphLayout)(shell);
    const edges = (0, EdgeRenderer_js_1.createEdgeRenderer)(shell, () => nodes, layout.getScale, layout.getBounds);
    const animation = (0, GraphAnimationLoop_js_1.createGraphAnimationLoop)(edges.update);
    const currentEdges = () => {
        if (!event?.people.length)
            return [];
        const core = event.people[0].name;
        return [
            ...event.people.slice(1).map((person) => ({ a: core, b: person.name, type: person.rel ?? "ally", label: "" })),
            ...event.links,
        ];
    };
    const clearHighlight = () => {
        nodes.forEach((node) => node.setHighlight(false, false));
        edges.clearHighlight();
    };
    const highlightRelated = (key) => {
        const related = edges.highlightRelated(key);
        nodes.forEach((node, name) => node.setHighlight(name === key, !related.has(name)));
    };
    const clearGraph = () => {
        gestures.forEach((gesture) => gesture.destroy());
        gestures = [];
        nodes.forEach((node) => node.destroy());
        nodes = new Map();
        edges.clear();
    };
    const createNodes = (nextEvent) => {
        const positions = layout.compute(nextEvent);
        const bounds = layout.getBounds();
        for (const person of nextEvent.people) {
            const node = (0, GraphNodeControl_js_1.createGraphNodeControl)({
                host: shell.graphCanvas,
                person,
                position: positions.get(person.name) ?? { x: bounds.w / 2, y: bounds.h / 2 },
                modal,
                onHover: (key) => { if (!shell.modalOverlay.classList.contains("sg-active"))
                    highlightRelated(key); },
                onLeave: () => { if (!shell.modalOverlay.classList.contains("sg-active"))
                    clearHighlight(); },
                onSelect: highlightRelated,
            });
            nodes.set(person.name, node);
            gestures.push((0, GraphNodeGesture_js_1.attachGraphNodeGesture)({
                element: node.element,
                getPosition: node.getPosition,
                setPosition: node.moveTo,
                getBounds: layout.getBounds,
                getScale: layout.getScale,
                onMove: edges.update,
            }));
        }
    };
    const render = (nextEvent) => {
        event = nextEvent;
        clearGraph();
        createNodes(nextEvent);
        edges.setLinks(currentEdges());
        edges.update();
        nodes.forEach((node) => { node.inner.style.animationPlayState = "running"; });
        animation.start();
    };
    const relayout = () => {
        if (!event)
            return;
        const positions = layout.compute(event);
        nodes.forEach((node, key) => { const point = positions.get(key); if (point)
            node.moveTo(point); });
        edges.update();
    };
    const dismissHint = () => {
        if (hintDismissed)
            return;
        hintDismissed = true;
        shell.graphHint.classList.add("sg-hide");
    };
    const onResize = () => {
        if (resizeTimer !== null)
            window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(relayout, 150);
    };
    const modalObserver = new MutationObserver(() => {
        if (!shell.modalOverlay.classList.contains("sg-active"))
            clearHighlight();
    });
    shell.graphWrap.addEventListener("pointerdown", dismissHint, { passive: true });
    window.addEventListener("resize", onResize);
    modalObserver.observe(shell.modalOverlay, { attributes: true, attributeFilter: ["class"] });
    return {
        render,
        relayout,
        destroy() {
            shell.graphWrap.removeEventListener("pointerdown", dismissHint);
            window.removeEventListener("resize", onResize);
            modalObserver.disconnect();
            if (resizeTimer !== null)
                window.clearTimeout(resizeTimer);
            animation.stop();
            clearGraph();
        },
    };
}

},
"constants.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSET_BASE = exports.RELATIONSHIPS = void 0;
exports.RELATIONSHIPS = {
    family: { name: "宗亲", color: "var(--rel-family)" },
    ruler: { name: "君臣", color: "var(--rel-ruler)" },
    ally: { name: "同僚", color: "var(--rel-ally)" },
    enemy: { name: "对立", color: "var(--rel-enemy)" },
};
exports.ASSET_BASE = "../assets/";

},
"index.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mount = mount;
exports.create = create;
const ApplicationShell_js_1 = require("./components/ApplicationShell.js");
const EventControls_js_1 = require("./components/EventControls.js");
const RelationshipCanvas_js_1 = require("./components/RelationshipCanvas.js");
const ModaloverlayDialog_js_1 = require("./components/ModaloverlayDialog.js");
const BASE_SMALL = { w: 380, h: 456 };
const BASE_LARGE = { w: 788, h: 492 };
function shouldUseSmallBase(width, height) {
    const ratio = width / height;
    return width < 415 || height < 456 || (width <= 768 && ratio < 1);
}
function mount(root, options = {}) {
    if (!root)
        throw new Error("mount root is required");
    const shell = (0, ApplicationShell_js_1.createApplicationShell)(root);
    const dialogContract = 'role="dialog" aria-modal="true"';
    if (shell.modalOverlay.getAttribute("role") !== "dialog" || shell.modalOverlay.getAttribute("aria-modal") !== "true") {
        throw new Error(`missing ${dialogContract}`);
    }
    const events = options.events ?? JSON.parse(document.getElementById("sg-event-data")?.textContent || "[]");
    if (!events.length)
        throw new Error("event data is required");
    let currentIndex = 0;
    let destroyed = false;
    let initialized = false;
    let scaleFactor = 1;
    const applyScale = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const base = shouldUseSmallBase(width, height) ? BASE_SMALL : BASE_LARGE;
        const scale = Math.min(width / base.w, height / base.h);
        scaleFactor = scale;
        const offsetX = (width - base.w * scale) / 2;
        const offsetY = (height - base.h * scale) / 2;
        document.documentElement.classList.add("sg-is-scaled-canvas");
        root.classList.add("sg-is-scaled-canvas");
        shell.app.classList.add("sg-is-scaled");
        shell.app.classList.toggle("sg-is-small-canvas", base === BASE_SMALL);
        shell.app.classList.toggle("sg-is-large-canvas", base === BASE_LARGE);
        shell.app.classList.toggle("sg-is-tiny-canvas", width <= 330 || height <= 380);
        shell.app.style.width = `${base.w}px`;
        shell.app.style.height = `${base.h}px`;
        shell.app.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        shell.app.dataset.scaleFactor = String(scaleFactor);
    };
    applyScale();
    const modal = (0, ModaloverlayDialog_js_1.createModalDialog)(shell);
    const graph = (0, RelationshipCanvas_js_1.createRelationshipCanvas)(shell, modal);
    const render = (index) => {
        currentIndex = Math.max(0, Math.min(index, events.length - 1));
        modal.close();
        (0, ApplicationShell_js_1.renderEventIntro)(shell, events[currentIndex]);
        controls.render(currentIndex);
        graph.render(events[currentIndex]);
        requestAnimationFrame(() => graph.relayout());
    };
    const controls = (0, EventControls_js_1.createEventControls)(shell, events, (index) => render(index));
    const preload = () => {
        const sources = new Set();
        for (const event of events) {
            if (event.image)
                sources.add(`../assets/${event.image}`);
            for (const person of event.people)
                if (person.avatar)
                    sources.add(`../assets/${person.avatar}`);
        }
        for (const src of sources) {
            const image = new Image();
            image.src = src;
        }
    };
    const initialize = () => {
        if (destroyed || initialized)
            return;
        initialized = true;
        applyScale();
        render(currentIndex);
        preload();
        window.setTimeout(() => shell.graphHint.classList.add("sg-hide"), 6000);
    };
    const onResize = () => {
        applyScale();
        graph.relayout();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("DOMContentLoaded", applyScale);
    window.addEventListener("load", applyScale);
    if (document.readyState === "loading")
        window.addEventListener("load", initialize, { once: true });
    else
        initialize();
    return {
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            window.removeEventListener("resize", onResize);
            window.removeEventListener("orientationchange", onResize);
            document.removeEventListener("DOMContentLoaded", applyScale);
            window.removeEventListener("load", applyScale);
            controls.destroy();
            graph.destroy();
            modal.destroy();
            root.replaceChildren();
        },
    };
}
function create(options = {}) {
    const root = document.createElement("div");
    mount(root, options);
    return root;
}
if (typeof window !== "undefined") {
    window.QinShihuangDispatch = { mount, create };
}

},
"types.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

}
};
const cache = Object.create(null);
function normalize(from, request) {
  if (!request.startsWith(".")) return request;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const parts = (base + request).split("/");
  const stack = [];
  for (const part of parts) { if (!part || part === ".") continue; if (part === "..") stack.pop(); else stack.push(part); }
  let id = stack.join("/");
  if (!id.endsWith(".js")) id += ".js";
  return id;
}
function load(id) {
  if (cache[id]) return cache[id].exports;
  const factory = modules[id];
  if (!factory) throw new Error("Unknown bundled module: " + id);
  const module = { exports: {} };
  cache[id] = module;
  factory(module, module.exports, function(request){ return load(normalize(id, request)); });
  return module.exports;
}
const entry = load("index.js");
global.QinShihuangDispatch = { mount: entry.mount, create: entry.create };
})(window);
