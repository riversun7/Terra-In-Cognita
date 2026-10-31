// 1차맵 구름 굽기 예약 — 순수 상태 기계(시험 대상, three.js를 쓰지 않는다). ADR 2026-10-29-primary-map-sky 6·7절.
// 기다림(첫 단계 타일이 다 오거나 10초, 쉬는 프레임) → 굽는 중(쉬는 프레임마다 면 하나, 껍질 숨김) → 나타남(1초) → 보임.
// 날씨 창이 바뀌면(쉬는 프레임에) 1초에 걸쳐 숨기고 → 다시 굽고 → 1초에 걸쳐 나타난다. 손가락 동작 중·끝난 지 300ms가 안 됐을 때,
// 카메라가 움직이는 중, 타일 받기·올리기 중이면 옛 구름을 둔 채 미룬다. fixed는 창이 바뀌지 않아 한 번만 굽는다.
// 구름이 보이지 않는 거리(1.2R 안쪽, 일하는 거리)에서는 굽지 않는다: 가까이서 1차맵을 쓰는 동안 GPU 일·메모리를 쓰지 않는다.
// 그 사이 창이 바뀌면 숨기기 없이 바로 굽기로 돌아간다(멀어졌을 때 옛 구름을 먼저 보이지 않게).
// 컨텍스트 복구 뒤(렌더 타깃 내용은 돌아오지 않는다)에는 숨긴 채 다시 굽는다.

/** 구름 값(시제품 출발값, 휴대폰에서 다듬는다 — ADR 6절) */
export const CLOUD_LOOK = {
  /** 큐브 한 면(텍셀) */
  cubeSize: 512,
  /** 최대 불투명도 */
  maxOpacity: 0.8,
  /** 덮임 문턱(smoothstep 아래·위) */
  coverLow: 0.44,
  coverHigh: 0.64,
  /** 구름 높이(게임 m, 과장 전) */
  heightGameM: 600,
  /** 높이 상한 = 대기 띠 두께(0.018R) × 이 값 */
  atmosphereCap: 0.9,
} as const;

export const CLOUD_TIMING = {
  /** 나타나기·숨기기(ms) */
  fadeMs: 1000,
  /** 손가락 동작이 끝난 뒤 이만큼은 굽지 않는다(ms) */
  settleMs: 300,
  /** 첫 단계 타일을 이만큼 기다리고 나면 없는 타일은 바다로 보고 굽는다(ms) */
  climateWaitMs: 10_000,
} as const;

/** 구름 높이(m, 과장 반영): 600 게임 m × 과장, 대기 띠 두께의 0.9배 아래. 과장을 바꿔도 산과 구름의 관계가 같다 */
export function cloudLiftM(radiusM: number, exaggeration: number): number {
  return Math.min(CLOUD_LOOK.heightGameM * exaggeration, radiusM * 0.018 * CLOUD_LOOK.atmosphereCap);
}

export type CloudPhase = "waiting" | "baking" | "showing" | "shown" | "hiding";

export interface CloudScheduleInput {
  readonly nowMs: number;
  /** 지금 하늘 시각의 날씨 창 번호 */
  readonly windowIndex: number;
  /** 첫 단계 타일을 다 받았다(F11은 늘 true — 받은 것만 쓴다) */
  readonly climateReady: boolean;
  /** 쉬는 프레임: 손가락 동작 없음·끝난 지 300ms 넘음·카메라 멈춤·타일 받기/올리기 없음 */
  readonly idle: boolean;
  /** 이 거리에서 구름이 보일 수 있다(sky.ts cloudFade.visible). 아니면 굽지 않는다 */
  readonly visible: boolean;
  /** 쉬지 못하는 까닭이 "동작이 끝난 지 300ms 안"뿐이면 남은 ms(그때 다시 그려 달라). 아니면 null */
  readonly msUntilIdle: number | null;
}

export interface CloudStep {
  /** 이번 프레임에 구울 면(0~5). 없으면 null */
  readonly bakeFace: number | null;
  /** 껍질 불투명도 배율(0 = 그리지 않음) */
  readonly fade: number;
  /** 다음 프레임이 필요하다(굽는 중·옅어지는 중) */
  readonly animating: boolean;
  /** 이만큼 뒤에 한 번 그려 달라(기다림이 시간으로 풀릴 때). 없으면 null */
  readonly wakeInMs: number | null;
  /** 이번 굽기의 날씨 창(면 0을 구울 때 노이즈 오프셋을 정한다) */
  readonly windowIndex: number;
}

/** 나타나기·숨기기 곡선: 3차 ease-out(바로 바뀌기 시작해 부드럽게 멈춘다 — 들어오고 나가는 것은 ease-out, review-animations) */
const easeOut = (u: number): number => {
  const x = 1 - Math.min(1, Math.max(0, u));
  return 1 - x * x * x;
};

export class CloudSchedule {
  phase: CloudPhase = "waiting";
  /** 다 구운 횟수(면 6개 = 1번) */
  bakes = 0;
  private startedAt: number | null = null;
  private face = 0;
  private fadeStart = 0;
  /** 지금 구운(또는 굽는) 날씨 창 */
  private bakingWindow = 0;
  private shownWindow: number | null = null;

  /** 구운 것이 사라졌다(컨텍스트 복구): 숨긴 채 처음 면부터 다시 굽는다 */
  invalidate(): void {
    if (this.phase === "waiting") return;
    this.phase = "baking";
    this.face = 0;
  }

  step(input: CloudScheduleInput): CloudStep {
    const now = input.nowMs;
    this.startedAt ??= now;
    const out = (bakeFace: number | null, fade: number, animating: boolean, wakeInMs: number | null) => ({
      bakeFace,
      fade,
      animating,
      wakeInMs,
      windowIndex: this.bakingWindow,
    });
    if (this.phase === "waiting") {
      const waited = now - this.startedAt;
      if (!input.climateReady && waited < CLOUD_TIMING.climateWaitMs) {
        return out(null, 0, false, CLOUD_TIMING.climateWaitMs - waited);
      }
      if (!input.visible) return out(null, 0, false, null);
      if (!input.idle) return out(null, 0, false, input.msUntilIdle);
      this.phase = "baking";
      this.face = 0;
    }
    if (this.phase === "baking") {
      if (!input.visible) return out(null, 0, false, null);
      if (!input.idle) return out(null, 0, false, input.msUntilIdle);
      if (this.face === 0) this.bakingWindow = input.windowIndex;
      const face = this.face;
      this.face += 1;
      if (this.face >= 6) {
        this.phase = "showing";
        this.fadeStart = now;
        this.shownWindow = this.bakingWindow;
        this.bakes += 1;
      }
      return out(face, 0, true, null);
    }
    if (this.phase === "showing") {
      const u = (now - this.fadeStart) / CLOUD_TIMING.fadeMs;
      if (u < 1) return out(null, easeOut(u), true, null);
      this.phase = "shown";
    }
    if (this.phase === "shown") {
      if (input.windowIndex === this.shownWindow) return out(null, 1, false, null);
      // 창이 바뀌었다: 보이지 않는 거리면 숨기기 없이 바로 굽기로(멀어지면 숨긴 채 굽고 나타난다)
      if (!input.visible) {
        this.phase = "baking";
        this.face = 0;
        return out(null, 0, false, null);
      }
      // 보이면 쉬는 프레임에 옅게 숨기기 시작(그때까지 옛 구름)
      if (!input.idle) return out(null, 1, false, input.msUntilIdle);
      this.phase = "hiding";
      this.fadeStart = now;
      return out(null, 1, true, null);
    }
    // hiding
    const u = (now - this.fadeStart) / CLOUD_TIMING.fadeMs;
    if (u < 1) return out(null, 1 - easeOut(u), true, null);
    this.phase = "baking";
    this.face = 0;
    return out(null, 0, true, null);
  }
}
