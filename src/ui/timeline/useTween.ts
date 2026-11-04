import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../media";

/** Counts a number toward its target (for the year readout); instant for small steps. */
export function useTween(target: number, instant: boolean): number {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (instant || Math.abs(target - from) <= 1 || prefersReducedMotion()) {
      cur.current = target;
      setV(target);
      return;
    }
    const dur = Math.min(560, 240 + Math.abs(target - from) * 1.6);
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      const x = Math.round(from + (target - from) * e);
      cur.current = x;
      setV(x);
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, instant]);
  return v;
}
