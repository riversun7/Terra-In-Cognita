// 성능 오버레이용 — 프레임 측정기의 1초 요약(fps, 프레임 시간 p95)과 메모리를 화면 상태로 받는다
import { useEffect, useState } from "react";
import { readMemoryMb } from "./device.ts";
import type { FrameMonitor } from "./frameMonitor.ts";

export interface PerfStats {
  fps: number;
  p95Ms: number;
  /** 크롬 계열에서만 값이 있다 */
  memoryMb: number | undefined;
}

export function usePerfStats(monitor: FrameMonitor): PerfStats | null {
  const [stats, setStats] = useState<PerfStats | null>(null);

  useEffect(
    () =>
      monitor.subscribe((summary) =>
        setStats({
          fps: Math.round(summary.fps),
          p95Ms: Math.round(summary.p95Ms),
          memoryMb: readMemoryMb(),
        }),
      ),
    [monitor],
  );

  return stats;
}
