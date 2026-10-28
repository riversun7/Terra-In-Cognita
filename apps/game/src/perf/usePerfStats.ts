// 화면 갱신 속도(fps) 측정 — 성능 오버레이용. 화면이 숨겨지면 측정하지 않는다.
import { useEffect, useState } from "react";

export function useFps(): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let handle = 0;

    const tick = (now: number): void => {
      frames += 1;
      if (now - windowStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return fps;
}
