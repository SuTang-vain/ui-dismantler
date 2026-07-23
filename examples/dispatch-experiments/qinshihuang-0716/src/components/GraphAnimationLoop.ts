export interface GraphAnimationLoopController {
  start(): void;
  stop(): void;
}

export function createGraphAnimationLoop(update: () => void): GraphAnimationLoopController {
  let frame: number | null = null;
  const sync = (): void => { update(); frame = requestAnimationFrame(sync); };
  return {
    start() { if (frame === null) frame = requestAnimationFrame(sync); },
    stop() { if (frame !== null) cancelAnimationFrame(frame); frame = null; },
  };
}
