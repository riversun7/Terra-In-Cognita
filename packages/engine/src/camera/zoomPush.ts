// 확대 한계 너머로 밀기 — 두 지도 조작(1차맵 globeControls.ts, 2차맵 controls.ts)이 같이 쓴다. 순수 계산(시험 대상).
// 기획 D-6018: 2차맵을 끝까지 줄이면 1차맵 5단계, 1차맵 5단계에서 더 키우면 그 2차맵. 사용자 요청 2026-11-07: 1차맵을 더 줄이면 항성계.
// 그래서 "이미 끝에 닿은 채 시작한 줄이기·키우기 묶음"이 그쪽으로 더 밀면(배율 곱이 threshold 이상) 알린다(ADR 2026-11-07-planet-view 2절).
// - 묶음: 두 손가락을 댄 때부터 뗄 때까지, 휠은 idleMs보다 오래 쉬면 새 묶음. 끝에 닿지 않은 채 시작한 묶음은 끝까지 가도 알리지 않는다
//   (한 번에 쭉 줄이다가 지도가 바뀌지 않게: 끝에서 멈춘 뒤 한 번 더 줄여야 넘어간다).
// - 배율 factor는 거리 배율이다(> 1 = 줄이기·멀어짐, < 1 = 키우기·가까워짐).

/** 끝: 가장 가까이(in)·가장 멀리(out) */
export type ZoomEdge = "in" | "out";

export interface ZoomPushOptions {
  /** 끝 너머로 이만큼(배율 곱) 밀면 알린다 */
  readonly threshold?: number;
  /** 휠 묶음을 나누는 쉼(ms) */
  readonly idleMs?: number;
}

export interface ZoomPush {
  /** 새 묶음을 시작한다(두 손가락을 댐). edge = 지금 닿아 있는 끝 */
  begin(edge: ZoomEdge | null): void;
  /** 묶음 안의 배율 하나(두 손가락 움직임) */
  push(factor: number): void;
  /** 휠 한 번: 쉼이 길면 새 묶음으로 시작하고 배율을 더한다 */
  wheel(factor: number, edge: ZoomEdge | null, timeMs: number): void;
  /** 묶음을 끝낸다(손가락을 뗌) */
  end(): void;
}

/** 휠 한 칸(보통 deltaY 100 → 배율 약 1.16)이면 넘어가게. 두 손가락은 15% 벌리기·오므리기 */
export const ZOOM_PUSH_THRESHOLD = 1.15;
const ZOOM_PUSH_IDLE_MS = 350;

export function createZoomPush(onPush: (edge: ZoomEdge) => void, options: ZoomPushOptions = {}): ZoomPush {
  const threshold = options.threshold ?? ZOOM_PUSH_THRESHOLD;
  const idleMs = options.idleMs ?? ZOOM_PUSH_IDLE_MS;
  let armed: ZoomEdge | null = null;
  let total = 1;
  let lastWheel = Number.NEGATIVE_INFINITY;

  const begin = (edge: ZoomEdge | null): void => {
    armed = edge;
    total = 1;
  };
  const push = (factor: number): void => {
    if (armed === null || !(factor > 0) || !Number.isFinite(factor)) return;
    total *= factor;
    // 반대로 움직이면 처음부터 다시 센다(끝에서 벗어나면 묶음이 풀린다)
    if ((armed === "out" && total < 1) || (armed === "in" && total > 1)) {
      armed = null;
      total = 1;
      return;
    }
    const pushed = armed === "out" ? total : 1 / total;
    if (pushed >= threshold) {
      const edge = armed;
      armed = null;
      total = 1;
      onPush(edge);
    }
  };
  return {
    begin,
    push,
    wheel(factor, edge, timeMs) {
      if (timeMs - lastWheel > idleMs) begin(edge);
      lastWheel = timeMs;
      push(factor);
    },
    end() {
      armed = null;
      total = 1;
    },
  };
}

/** 지금 거리가 닿아 있는 끝(상대 여유 1e-6) */
export function edgeOf(distance: number, minDistance: number, maxDistance: number): ZoomEdge | null {
  if (distance <= minDistance * (1 + 1e-6)) return "in";
  if (distance >= maxDistance * (1 - 1e-6)) return "out";
  return null;
}
