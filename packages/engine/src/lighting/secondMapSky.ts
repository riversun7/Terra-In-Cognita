// 2차맵 하늘 시계 — 하늘 모드(1차맵과 같은 PlanetSkyMode)와 시각에서 지금 쓸 빛을 정한다. three·DOM을 쓰지 않는다(시험 대상).
// ADR 2026-10-28-s1-second-map "구현하며 정한 것 (2차맵 낮밤)".
// - 엔진이 1초마다 tick()을 부른다(빛 계산은 수 µs). 눈에 띄게 바뀌었을 때만(lightChanged) 다시 그리라고 알린다:
//   한낮은 방향 0.5° = 약 5초에 한 번, 박명은 밝기가 빨리 바뀌어 거의 1초에 한 번. 새 그리기 단계·그림자는 없다.
// - 시계를 아직 못 쟀으면(serverNow가 null) 낮(지금 고정 빛)으로 그린다. 재면, 또는 모드가 바뀌면 0.5초에 걸쳐 옮긴다
//   (1차맵 하늘과 같은 시간, ADR 2026-10-29-primary-map-sky 2절). 평소 1초 걸음은 바로 바꾼다(변화가 작다).
import {
  type PlanetSkyDescription,
  type PlanetSkyMode,
  PLACEHOLDER_PLANET_SKY,
  skyAt,
} from "../planet/sky.ts";
import {
  FIXED_SECOND_MAP_LIGHT,
  type SecondMapLight,
  type SecondMapPlace,
  blendLight,
  lightChanged,
  secondMapLightAt,
} from "./secondMapLight.ts";

/** 시계 상태(통계·시험 표시): 끔, 시계 기다림(낮으로 그림), 서버 시계, 기기 시계, 멈춘 시각 */
export type SecondMapClockState = "off" | "waiting" | "server" | "device" | "fixed";

/** 엔진이 tick을 부르는 간격(ms) */
export const SKY_TICK_MS = 1000;
/** 큰 변화(시계를 잼·모드 바꿈)를 옮기는 시간(ms) */
export const LIGHT_BLEND_MS = 500;

const smooth = (u: number): number => u * u * (3 - 2 * u);

export class SecondMapSky {
  private mode: PlanetSkyMode;
  private readonly place: SecondMapPlace | null;
  private readonly description: PlanetSkyDescription;
  private applied: SecondMapLight = FIXED_SECOND_MAP_LIGHT;
  private target: SecondMapLight = FIXED_SECOND_MAP_LIGHT;
  private blendFrom: SecondMapLight | null = null;
  private blendStart = 0;
  private clock: SecondMapClockState = "off";
  /** 빛을 바꾼 횟수(쉬는 동안 다시 그린 원인 세기, 시험·통계) */
  private changes = 0;

  constructor(
    place: SecondMapPlace | null,
    mode: PlanetSkyMode = { kind: "off" },
    description: PlanetSkyDescription = PLACEHOLDER_PLANET_SKY,
  ) {
    this.place = place;
    this.mode = mode;
    this.description = description;
  }

  /** 시계가 도는 모드인가(엔진이 1초 타이머를 둘지) */
  get ticking(): boolean {
    return this.place !== null && this.mode.kind === "clock";
  }

  get clockState(): SecondMapClockState {
    return this.clock;
  }

  get changeCount(): number {
    return this.changes;
  }

  /** 지금 쓰는 빛(옮기는 중이면 그 사이 값) */
  get light(): SecondMapLight {
    return this.applied;
  }

  /** 옮기는 중인가(엔진은 다음 프레임도 그린다) */
  get blending(): boolean {
    return this.blendFrom !== null;
  }

  /** 모드를 바꾼다. 다음 tick이 0.5초에 걸쳐 옮긴다 */
  setMode(mode: PlanetSkyMode, nowMs: number): boolean {
    this.mode = mode;
    return this.update(nowMs, true);
  }

  /** 1초마다(그리고 처음·보이게 될 때). 다시 그려야 하면 true */
  tick(nowMs: number): boolean {
    return this.update(nowMs, false);
  }

  /** 프레임마다: 옮기는 중이면 빛을 한 걸음 옮긴다. 아직 옮기는 중이면 true(다음 프레임 필요) */
  frame(nowMs: number): boolean {
    if (!this.blendFrom) return false;
    const u = (nowMs - this.blendStart) / LIGHT_BLEND_MS;
    if (u >= 1) {
      this.applied = this.target;
      this.blendFrom = null;
      return false;
    }
    this.applied = blendLight(this.blendFrom, this.target, smooth(Math.max(0, u)));
    return true;
  }

  private update(nowMs: number, modeChanged: boolean): boolean {
    const before = this.clock;
    const next = this.compute();
    const big = modeChanged || before !== this.clock;
    if (!lightChanged(this.target, next) && !lightChanged(this.applied, next)) {
      this.target = next;
      return false;
    }
    this.target = next;
    this.changes += 1;
    // 처음(끔 → 무엇이든)은 바로 놓는다: 화면을 연 첫 프레임부터 그 시각의 빛이다
    if (big && before !== "off") {
      this.blendFrom = this.applied;
      this.blendStart = nowMs;
    } else if (!this.blendFrom) {
      this.applied = next;
    }
    return true;
  }

  /** 지금 모드·시각의 빛과 시계 상태 */
  private compute(): SecondMapLight {
    const place = this.place;
    const mode = this.mode;
    if (place === null || mode.kind === "off") {
      this.clock = "off";
      return FIXED_SECOND_MAP_LIGHT;
    }
    if (mode.kind === "fixed") {
      this.clock = "fixed";
      return secondMapLightAt(skyAt(mode.utcMs, this.description), place, mode.features);
    }
    const now = mode.serverNow();
    if (now === null) {
      this.clock = "waiting";
      return FIXED_SECOND_MAP_LIGHT;
    }
    this.clock = mode.source?.() ?? "server";
    return secondMapLightAt(skyAt(now, this.description), place, mode.features);
  }
}
