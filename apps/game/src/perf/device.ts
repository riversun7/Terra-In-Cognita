// 기기 정보 읽기 — 성능 보고에 붙인다. 브라우저마다 없는 값은 빼고 보낸다.
import type { PerfReport } from "@terra/protocol";

type ExtendedNavigator = Navigator & {
  /** GB 단위, 크롬 계열만 */
  deviceMemory?: number;
  connection?: { effectiveType?: string };
};

/** JS 힙 사용량(MB). 크롬 계열만 지원하는 비표준 값(performance.memory)이라 없으면 undefined */
export function readMemoryMb(): number | undefined {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / (1024 * 1024)) : undefined;
}

export function readDevice(): PerfReport["device"] {
  const nav = navigator as ExtendedNavigator;
  const connection = nav.connection?.effectiveType;
  return {
    screenW: Math.round(screen.width),
    screenH: Math.round(screen.height),
    dpr: window.devicePixelRatio || 1,
    ...(nav.hardwareConcurrency ? { cores: nav.hardwareConcurrency } : {}),
    ...(nav.deviceMemory ? { memoryGb: nav.deviceMemory } : {}),
    ...(connection ? { connection: connection.slice(0, 16) } : {}),
  };
}
