import { useEffect, useState } from "react";

export function useFps(): number {
  const [fps, setFps] = useState(60);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let started = performance.now();
    const frame = (now: number) => {
      frames += 1;
      if (now - started >= 1_000) {
        setFps(Math.round((frames * 1_000) / (now - started)));
        frames = 0;
        started = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}
