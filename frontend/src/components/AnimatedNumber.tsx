import { useEffect, useRef, useState } from 'react';

/** Número que "conta" até o valor novo, e pulsa quando muda. */
export default function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const [bump, setBump] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    if (start !== 0) setBump((b) => b + 1);
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(start + (value - start) * eased);
      setShown(current);
      from.current = current;
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span key={bump} className={`inline-block tabular-nums ${bump ? 'animate-pop' : ''}`}>
      {shown}
    </span>
  );
}
