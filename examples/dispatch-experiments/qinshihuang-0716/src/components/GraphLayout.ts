import type { EventRecord, PersonRecord, RelationshipLink, ShellElements } from "../types.js";
import type { GraphPoint } from "./GraphNodeControl.js";
import type { GraphBounds } from "./GraphNodeGesture.js";

function avatarSizes(): { avatar: number; big: number; font: number } {
  const { innerWidth: width, innerHeight: height } = window;
  if (width <= 320 || height <= 365) return { avatar: 42, big: 54, font: 10 };
  if (width <= 480 || height <= 480) return { avatar: 50, big: 64, font: 11 };
  return { avatar: 66, big: 84, font: 12 };
}

function orderRing(people: PersonRecord[], links: RelationshipLink[]): string[] {
  const names = people.map((person) => person.name);
  const relevant = links.filter((link) => names.includes(link.a) && names.includes(link.b));
  if (names.length <= 2 || !relevant.length) return names;
  const between = (value: number, start: number, end: number): boolean => {
    for (let index = (start + 1) % names.length; index !== end; index = (index + 1) % names.length) {
      if (index === value) return true;
    }
    return false;
  };
  const cost = (order: string[]): number => {
    const positions = new Map(order.map((name, index) => [name, index]));
    let total = 0;
    for (const link of relevant) {
      const a = positions.get(link.a) ?? 0;
      const b = positions.get(link.b) ?? 0;
      total += (Math.min(Math.abs(a - b), names.length - Math.abs(a - b)) - 1) * 2;
    }
    for (let first = 0; first < relevant.length; first += 1) {
      for (let second = first + 1; second < relevant.length; second += 1) {
        const one = relevant[first]; const two = relevant[second];
        const a = positions.get(one.a) ?? 0; const b = positions.get(one.b) ?? 0;
        const c = positions.get(two.a) ?? 0; const d = positions.get(two.b) ?? 0;
        if (a !== c && a !== d && b !== c && b !== d && between(c, a, b) !== between(d, a, b)) total += 3;
      }
    }
    return total;
  };
  let best = [...names]; let bestCost = Number.POSITIVE_INFINITY;
  const first = names[0]; const rest = names.slice(1);
  const permute = (index: number): void => {
    if (index === rest.length) {
      const candidate = [first, ...rest]; const candidateCost = cost(candidate);
      if (candidateCost < bestCost) { best = [...candidate]; bestCost = candidateCost; }
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

export interface GraphLayoutController {
  getBounds(): GraphBounds;
  getScale(): number;
  compute(event: EventRecord): Map<string, GraphPoint>;
}

export function createGraphLayout(shell: ShellElements): GraphLayoutController {
  let bounds: GraphBounds = { w: 0, h: 0 };
  const getScale = (): number => {
    const logicalWidth = shell.graphWrap.offsetWidth;
    const visualWidth = shell.graphWrap.getBoundingClientRect().width;
    return logicalWidth > 0 && visualWidth > 0 ? visualWidth / logicalWidth : 1;
  };
  const measure = (): GraphBounds => {
    const rect = shell.graphWrap.getBoundingClientRect(); const scale = getScale() || 1;
    bounds = { w: Math.max(rect.width / scale, 120), h: Math.max(rect.height / scale, 120) };
    return bounds;
  };
  const compute = (event: EventRecord): Map<string, GraphPoint> => {
    const result = new Map<string, GraphPoint>();
    if (!event.people.length) return result;
    const { w, h } = measure(); const mobile = window.innerWidth <= 768;
    const topSafe = mobile ? 46 : 38; const bottomSafe = mobile ? 30 : 40;
    const usableHeight = Math.max(h - topSafe - bottomSafe, 120);
    const center = { x: w * 0.5, y: topSafe + usableHeight * 0.5 };
    result.set(event.people[0].name, center);
    const ordered = orderRing(event.people.slice(1), event.links); const count = ordered.length;
    const radiusX = Math.max(w * 0.5 - (mobile ? 48 : 70), 96);
    const radiusY = Math.max(usableHeight * 0.5 - 16, 74);
    const start = -Math.PI / 2 + (count > 0 && count % 2 === 0 ? Math.PI / count : 0);
    ordered.forEach((name, index) => result.set(name, {
      x: center.x + Math.cos(start + (index / count) * Math.PI * 2) * radiusX,
      y: center.y + Math.sin(start + (index / count) * Math.PI * 2) * radiusY,
    }));
    const sizes = avatarSizes(); const people = new Map(event.people.map((person) => [person.name, person]));
    const extents = new Map<string, GraphPoint>();
    for (const [name] of result) {
      const person = people.get(name); if (!person) continue;
      const avatar = person.big ? sizes.big : sizes.avatar;
      extents.set(name, { x: Math.max(avatar, name.length * sizes.font * 0.95 + 14) / 2, y: (avatar + sizes.font + 12) / 2 });
    }
    const clamp = (name: string): void => {
      const point = result.get(name); const extent = extents.get(name); if (!point || !extent) return;
      point.x = Math.max(extent.x + 4, Math.min(w - extent.x - 4, point.x));
      point.y = Math.max(extent.y + topSafe, Math.min(h - extent.y - bottomSafe, point.y));
    };
    const keys = [...result.keys()]; const marginX = mobile ? 14 : 18; const marginY = mobile ? 26 : 28;
    for (let iteration = 0; iteration < 120; iteration += 1) {
      let moved = false;
      for (let first = 0; first < keys.length; first += 1) for (let second = first + 1; second < keys.length; second += 1) {
        const a = result.get(keys[first]); const b = result.get(keys[second]);
        const ae = extents.get(keys[first]); const be = extents.get(keys[second]); if (!a || !b || !ae || !be) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const overlapX = ae.x + be.x + marginX - Math.abs(dx); const overlapY = ae.y + be.y + marginY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue; moved = true;
        if (overlapX <= overlapY) { const sign = dx === 0 ? (first % 2 ? 1 : -1) : Math.sign(dx); a.x -= overlapX / 2 * sign; b.x += overlapX / 2 * sign; }
        else { const sign = dy === 0 ? (first % 2 ? 1 : -1) : Math.sign(dy); a.y -= overlapY / 2 * sign; b.y += overlapY / 2 * sign; }
        clamp(keys[first]); clamp(keys[second]);
      }
      if (!moved) break;
    }
    keys.forEach(clamp); return result;
  };
  return { getBounds: () => bounds, getScale, compute };
}
