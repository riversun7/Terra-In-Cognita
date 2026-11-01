// 서버 전체 무거운 일 바쁨 표시 — 밸런스 대결·전투 실험실 전투장이 함께 쓴다(한 번에 하나, 바쁘면 TOO_MANY_REQUESTS busy).
// docs/adr/2026-11-01-balance-screen.md 3절 상한, "바뀜 (2026-11-01, 전투 실험실)" 4절.

export interface HeavyGate {
  /** 비어 있으면 잡고 true, 바쁘면 false */
  tryEnter(): boolean;
  leave(): void;
}

export function createHeavyGate(): HeavyGate {
  let busy = false;
  return {
    tryEnter() {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave() {
      busy = false;
    },
  };
}
