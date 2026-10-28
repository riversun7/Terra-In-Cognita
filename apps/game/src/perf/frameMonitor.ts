// 프레임 측정기 — requestAnimationFrame으로 프레임 사이 시간을 잰다.
// 오버레이(1초마다 요약)와 텔레메트리(꺼낼 때 요약)가 하나를 함께 쓴다.
// 화면이 숨겨지면 브라우저가 프레임을 멈추므로, 돌아온 뒤 첫 간격(숨겨진 시간)은 버린다.
import { type FrameSummary, summarizeFrames } from "./frameStats.ts";

/** 텔레메트리 한 구간에 모으는 프레임 수 상한 — 메모리 보호(144Hz로 약 11분) */
const MAX_COLLECTED_FRAMES = 100_000;

export interface FrameMonitor {
  /** 1초마다 최근 1초 요약을 받는다(오버레이). 그만 받는 함수를 돌려준다 */
  subscribe(listener: (summary: FrameSummary) => void): () => void;
  /** 마지막으로 꺼낸 뒤 모은 프레임을 요약해 꺼내고 비운다(텔레메트리). 모은 것이 없으면 null */
  drain(): FrameSummary | null;
  stop(): void;
}

export function startFrameMonitor(): FrameMonitor {
  const listeners = new Set<(summary: FrameSummary) => void>();
  let second: number[] = [];
  let secondElapsed = 0;
  let collected: number[] = [];
  let last: number | null = null;
  let handle = 0;
  let stopped = false;

  const tick = (now: number): void => {
    if (last !== null) {
      const duration = now - last;
      second.push(duration);
      secondElapsed += duration;
      if (collected.length < MAX_COLLECTED_FRAMES) collected.push(duration);
      if (secondElapsed >= 1000) {
        const summary = summarizeFrames(second);
        for (const listener of listeners) listener(summary);
        second = [];
        secondElapsed = 0;
      }
    }
    last = now;
    if (!stopped) handle = requestAnimationFrame(tick);
  };

  // 숨겨졌다 돌아오면 다음 프레임부터 다시 잰다
  const onVisibility = (): void => {
    last = null;
  };
  document.addEventListener("visibilitychange", onVisibility);
  handle = requestAnimationFrame(tick);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    drain() {
      if (collected.length === 0) return null;
      const summary = summarizeFrames(collected);
      collected = [];
      return summary;
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(handle);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
