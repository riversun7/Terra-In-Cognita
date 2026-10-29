// 1차맵 하늘 조절기 — 프레임마다 하늘 시각을 읽어 낮밤 uniform·달·구름을 놓고, 쉬는 동안 하늘 시계를 돌린다.
// ADR 2026-10-29-primary-map-sky 2·4·5·7절. three.js를 직접 쓰지 않는다(달·구름은 SkyMoonLayer·SkyCloudLayer로 받는다) → 시험이 가짜를 넣는다.
// - 시각: clock 모드는 serverNow()(소수면 내림, null = 시계 전 → 지금 빛 그대로), fixed 모드는 정한 시각, off는 하늘 없음.
//   하늘이 처음 보일 때 clock은 0.5초에 걸쳐 켠다(uSkyBlend 0 → 1), fixed는 바로 켠다(사진·동작 줄이기).
//   나중에 잰 값이 쓰던 시각과 1분 넘게 다르면 0.5초에 걸쳐 항성·달 방향을 큰 원을 따라 옮긴다(몇 바퀴씩 돌지 않는다).
// - 오류 가두기(검토 H1): 하늘 갱신이 던지면 하늘만 끄고(off와 같은 모습) 오류를 한 번 알린다. 지도 그리기는 계속된다.
// - 하늘 시계(7절): 보이는 하늘이 바뀔 때만 다음 그리기를 예약한다(skyClockIntervalMs). 숨김·off·fixed·시계 전·밤 쪽만이면 돌지 않는다.
//   시계 전에는 그리지 않고 250ms마다 시각이 생겼는지만 본다.
import { type GlobePose, type Viewport, projectToScreen } from "./globeCamera.ts";
import type { PlanetLayer } from "./planetTypes.ts";
import {
  PLACEHOLDER_PLANET_SKY,
  type PlanetMoonDescription,
  type PlanetSkyDescription,
  type PlanetSkyFeatures,
  type PlanetSkyMode,
  type PlanetSkyState,
  moonOnScreen,
  nightStrength,
  skyAt,
  skyClockIntervalMs,
  skyOnScreen,
  sunCosRangeOnScreen,
} from "./sky.ts";
import { type Vec3, scale, slerpUnit } from "./vec3.ts";

/** 시계 상태(통계·data-sky-clock): 끔, 정한 시각, 시계 전, 서버 시계, 기기 시계 */
export type SkyClockState = "off" | "fixed" | "waiting" | "server" | "device";

/** 하늘 통계(PlanetStats.sky) */
export interface PlanetSkyStats {
  readonly mode: PlanetSkyMode["kind"];
  readonly clock: SkyClockState;
  /** 그린 하늘 시각(정수 ms). 시계 전·끔이면 null */
  readonly utcMs: number | null;
  /** 항성 바로 아래 위도·경도(°). 시계 전·끔이면 null */
  readonly subsolarLatDeg: number | null;
  readonly subsolarLonDeg: number | null;
  /** 지금 빛 → 항성 낮밤 섞기(0 ~ 1, 켜지는 중이면 사이) */
  readonly blend: number;
  /** 그린 낮밤 세기 = 섞기 × 세기(거리·레이어·요소 반영, 0 = 늘 낮) */
  readonly nightStrength: number;
  readonly moonsDrawn: number;
  /** 구름 껍질 불투명도 배율(0 = 안 그림) */
  readonly cloudOpacity: number;
  /** 다 구운 횟수(면 6개 = 1번) */
  readonly cloudBakes: number;
  /** 면 하나 굽기 최대 시간(ms, 재기 모드면 GPU 끝까지). 아직 없으면 null */
  readonly cloudBakeMaxMs: number | null;
  /** 하늘 GPU 메모리 추정(바이트, 타일 상한과 따로 센다) */
  readonly gpuBytes: number;
  /** 다음 하늘 시계까지(ms). 돌지 않으면 null */
  readonly clockIntervalMs: number | null;
  /** 하늘 오류로 하늘을 껐다(setSky로 다시 켤 때까지) */
  readonly failed: boolean;
}

/** 엔진이 프레임마다 넘기는 것 */
export interface SkyFrame {
  readonly pose: GlobePose;
  readonly viewport: Viewport;
  /** 목표점에서 카메라까지(m) */
  readonly distanceM: number;
  /** 가장 가까운 거리(globeLimits) */
  readonly minDistanceM: number;
  readonly layer: PlanetLayer;
  readonly exaggeration: number;
  /** 첫 표시가 끝났다(달·구름은 그 뒤에 시작한다) */
  readonly firstDisplayed: boolean;
  /** 손가락 동작 중 */
  readonly gestureActive: boolean;
  /** 타일 받기·만들기·올리기 중 */
  readonly tilesBusy: boolean;
  /** performance.now() */
  readonly nowMs: number;
}

/** 달 하나를 놓을 곳(행성 좌표 m) */
export interface MoonPlacement {
  readonly center: Vec3;
  readonly radiusM: number;
  readonly orbitPole: Vec3;
  /** 행성 설명의 달 번호(메시를 고른다) */
  readonly index: number;
}

/** 달 그리기(moon.ts). 보임 판정은 조절기가 하고, 이것은 받은 달만 놓는다 */
export interface SkyMoonLayer {
  /** 받은 달을 먼 것부터 놓고 나머지는 숨긴다. fade = 하늘 섞기(켜지는 동안 우주색에서 나타난다) */
  place(moons: readonly MoonPlacement[], cameraPosition: Vec3, fade: number): void;
  hide(): void;
  readonly gpuBytes: number;
  dispose(): void;
}

/** 구름이 프레임마다 받는 것 */
export interface CloudFrame {
  readonly frame: SkyFrame;
  readonly sky: PlanetSkyState;
  /** 시각이 멈춰 있다(fixed): 한 번만 굽는다 */
  readonly frozen: boolean;
}

/** 구름 그리기(clouds.ts) */
export interface SkyCloudLayer {
  /** 굽기 예약·굽기·껍질 놓기. 다음 프레임이 필요하면(굽는 중·옅어지는 중) true */
  update(input: CloudFrame): boolean;
  hide(): void;
  /** 컨텍스트 복구 등으로 구운 것이 사라졌다(다시 굽는다) */
  invalidate(): void;
  readonly opacity: number;
  readonly bakes: number;
  readonly bakeMaxMs: number | null;
  readonly gpuBytes: number;
  dispose(): void;
}

export interface SkyControllerOptions {
  readonly radiusM: number;
  /** 달을 가리는 행성 반지름(바탕 구가 해수면보다 아래면 그 값) */
  readonly occluderRadiusM: number;
  readonly sky?: PlanetSkyDescription;
  /** 하늘 빛 uniform(planetView.setSkyLight) */
  readonly setSkyLight: (blend: number, sun: Vec3, strength: number, pose: GlobePose) => void;
  /** 다시 그려 달라(하늘 시계·시계 기다림) */
  readonly requestFrame: () => void;
  /** 달·구름 만들기(없으면 그 요소는 없다). 처음 필요할 때(첫 표시 뒤) 한 번 부른다 */
  readonly createMoons?: (moons: readonly PlanetMoonDescription[]) => SkyMoonLayer;
  readonly createClouds?: () => SkyCloudLayer;
  readonly isHidden?: () => boolean;
  /** 하늘 오류 알리기(기본: 전역 reportError → 기기 오류 보고). 조절기 하나에 한 번만 부른다 */
  readonly report?: (error: unknown) => void;
}

/** 켜지는 시간·늦게 맞추는 시간(ms), 늦게 맞추는 문턱(ms) */
export const SKY_FADE_MS = 500;
export const SKY_RETIME_MS = 500;
export const SKY_RETIME_THRESHOLD_MS = 60_000;
/** 시계 전에 시각이 생겼는지 보는 간격(ms) — 그리지 않고 serverNow만 부른다 */
export const SKY_WAIT_POLL_MS = 250;

type TimerHandle = ReturnType<typeof setTimeout>;

const OFF: PlanetSkyMode = { kind: "off" };
const NO_SUN: Vec3 = [1, 0, 0];

const smooth = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

function defaultReport(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else
    queueMicrotask(() => {
      throw error;
    });
}

const defaultHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

/** 켤 요소(기본 모두 켬) */
function featuresOf(mode: PlanetSkyMode): Required<PlanetSkyFeatures> {
  const features = mode.kind === "off" ? undefined : mode.features;
  return {
    dayNight: features?.dayNight ?? true,
    moon: features?.moon ?? true,
    clouds: features?.clouds ?? true,
  };
}

/** 그린 방향(늦게 맞추기의 출발점) */
interface Shown {
  readonly sun: Vec3;
  readonly moons: readonly Vec3[];
}

interface Reading {
  readonly utcMs: number;
  readonly atMs: number;
  readonly clock: SkyClockState;
}

export class SkyController {
  private readonly options: SkyControllerOptions;
  private readonly description: PlanetSkyDescription;
  private readonly isHidden: () => boolean;
  private mode: PlanetSkyMode = OFF;
  private features = featuresOf(OFF);
  private moons: SkyMoonLayer | null = null;
  private clouds: SkyCloudLayer | null = null;
  /** 하늘이 보이기 시작한 때(performance.now). 켜지기의 출발점. 끔·시계 전이면 null */
  private shownSince: number | null = null;
  /** 마지막으로 읽은 시각과 그때 — 늦게 맞추기 판정·시각이 다시 사라졌을 때 이어 쓰기 */
  private lastReading: Reading | null = null;
  private retime: { from: Shown; startMs: number } | null = null;
  private shown: Shown | null = null;
  private timer: TimerHandle | null = null;
  private timerDueMs = 0;
  private reported = false;
  private failed = false;
  private disposed = false;
  private last: PlanetSkyStats = statsOff(OFF, false);

  constructor(options: SkyControllerOptions) {
    this.options = options;
    this.description = options.sky ?? PLACEHOLDER_PLANET_SKY;
    this.isHidden = options.isHidden ?? defaultHidden;
  }

  /** 모드·요소를 바꾼다(실행 중에도). uniform 값만 바뀌므로 타일 셰이더를 다시 컴파일하지 않는다 */
  setMode(mode: PlanetSkyMode): void {
    if (this.disposed) return;
    this.mode = mode;
    this.features = featuresOf(mode);
    this.failed = false;
    if (mode.kind === "off") {
      this.shownSince = null;
      this.lastReading = null;
      this.shown = null;
      this.retime = null;
    }
    if (!this.features.moon || mode.kind === "off") this.disposeMoons();
    if (!this.features.clouds || mode.kind === "off") this.disposeClouds();
    this.clearTimer();
    this.options.requestFrame();
  }

  /** 컨텍스트를 잃었다 돌아왔다: 렌더 타깃 내용(구운 구름)은 돌아오지 않는다 */
  contextRestored(): void {
    this.clouds?.invalidate();
  }

  /** 한 프레임. 다음 프레임이 필요하면(켜지는 중·늦게 맞추는 중·구름 굽기) true */
  update(frame: SkyFrame): boolean {
    if (this.disposed) return false;
    if (this.mode.kind === "off" || this.failed) {
      this.applyOff(frame.pose);
      return false;
    }
    try {
      return this.step(frame);
    } catch (error) {
      this.fail(error, frame.pose);
      return false;
    }
  }

  stats(): PlanetSkyStats {
    return this.last;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.disposeMoons();
    this.disposeClouds();
  }

  private step(frame: SkyFrame): boolean {
    const reading = this.readTime(frame.nowMs);
    if (reading === null) {
      // 시계 전: 지금 빛 그대로(낮). 그리지 않고 시각이 생겼는지만 본다
      this.shownSince = null;
      this.options.setSkyLight(0, NO_SUN, 0, frame.pose);
      this.moons?.hide();
      this.clouds?.hide();
      this.last = { ...statsOff(this.mode, false), clock: "waiting" };
      this.armWaitPoll();
      return false;
    }
    const sky = skyAt(reading.utcMs, this.description);
    if (sky === null) throw new RangeError(`sky time out of range: ${reading.utcMs}`);
    let animating = false;

    // 켜지기: fixed는 바로, clock은 하늘이 처음 보인 때부터 0.5초(fixed → clock으로 바뀌면 이미 켜진 채)
    if (this.shownSince === null) {
      this.shownSince = this.mode.kind === "fixed" ? frame.nowMs - SKY_FADE_MS : frame.nowMs;
    }
    const fade = smooth((frame.nowMs - this.shownSince) / SKY_FADE_MS);
    if (fade < 1) animating = true;

    const live: Shown = { sun: sky.sun.direction, moons: sky.moons.map((moon) => moon.direction) };
    let shown = live;
    if (this.retime) {
      const u = (frame.nowMs - this.retime.startMs) / SKY_RETIME_MS;
      if (u >= 1) this.retime = null;
      else {
        const { from } = this.retime;
        const e = smooth(u);
        shown = {
          sun: slerpUnit(from.sun, live.sun, e),
          moons: live.moons.map((direction, i) => slerpUnit(from.moons[i] ?? direction, direction, e)),
        };
        animating = true;
      }
    }
    this.shown = shown;

    const dayNight = this.features.dayNight;
    const strength = dayNight
      ? nightStrength(frame.distanceM, frame.minDistanceM, this.options.radiusM, frame.layer)
      : 0;
    const blend = dayNight ? fade : 0;
    this.options.setSkyLight(blend, shown.sun, strength, frame.pose);

    const moons = this.placeMoons(frame, sky, shown, fade);
    if (this.updateClouds(frame, sky)) animating = true;

    const interval = this.scheduleClock(frame, shown.sun, strength, moons.pxPerSecond);
    this.last = {
      mode: this.mode.kind,
      clock: reading.clock,
      utcMs: sky.utcMs,
      subsolarLatDeg: sky.sun.subsolarLatDeg,
      subsolarLonDeg: sky.sun.subsolarLonDeg,
      blend,
      nightStrength: blend * strength,
      moonsDrawn: moons.drawn,
      cloudOpacity: this.clouds?.opacity ?? 0,
      cloudBakes: this.clouds?.bakes ?? 0,
      cloudBakeMaxMs: this.clouds?.bakeMaxMs ?? null,
      gpuBytes: (this.moons?.gpuBytes ?? 0) + (this.clouds?.gpuBytes ?? 0),
      clockIntervalMs: interval,
      failed: false,
    };
    return animating;
  }

  /** 하늘 시각(정수 ms)과 시계 상태. 시계 전이면 null */
  private readTime(nowMs: number): { utcMs: number; clock: SkyClockState } | null {
    const mode = this.mode;
    const previous = this.lastReading;
    let reading: Reading;
    if (mode.kind === "fixed") {
      if (!Number.isFinite(mode.utcMs)) return null;
      reading = { utcMs: Math.floor(mode.utcMs), atMs: nowMs, clock: "fixed" };
    } else if (mode.kind === "clock") {
      const raw = mode.serverNow();
      if (raw === null || !Number.isFinite(raw)) {
        // 한 번 잰 뒤 다시 모르게 되면 마지막 값에서 이어 간다(하늘이 꺼졌다 켜지지 않게)
        if (!previous) return null;
        return { utcMs: Math.floor(previous.utcMs + (nowMs - previous.atMs)), clock: previous.clock };
      }
      reading = { utcMs: Math.floor(raw), atMs: nowMs, clock: mode.source?.() ?? "server" };
      // 늦게 맞추기: 쓰던 시각(지난 값 + 흐른 시간)과 1분 넘게 다르면 지금 그린 방향에서 출발한다
      if (previous && this.shown) {
        const expected = previous.utcMs + (nowMs - previous.atMs);
        if (Math.abs(reading.utcMs - expected) > SKY_RETIME_THRESHOLD_MS) {
          this.retime = { from: this.shown, startMs: nowMs };
        }
      }
    } else {
      return null;
    }
    this.lastReading = reading;
    return reading;
  }

  /** 달을 놓는다. 그린 달 수와 가장 빠른 달의 화면 빠르기(CSS px/s, 그린 달이 없으면 null) */
  private placeMoons(
    frame: SkyFrame,
    sky: PlanetSkyState,
    shown: Shown,
    fade: number,
  ): { drawn: number; pxPerSecond: number | null } {
    const none = { drawn: 0, pxPerSecond: null };
    const create = this.options.createMoons;
    if (!this.features.moon || !frame.firstDisplayed || !create || this.description.moons.length === 0) {
      this.moons?.hide();
      return none;
    }
    this.moons ??= create(this.description.moons);
    const radiusM = this.options.radiusM;
    if (!skyOnScreen(frame.pose, frame.viewport, radiusM)) {
      this.moons.hide();
      return none;
    }
    const visible: MoonPlacement[] = [];
    this.description.moons.forEach((moon, index) => {
      const direction = shown.moons[index];
      const state = sky.moons[index];
      if (!direction || !state) return;
      const center = scale(direction, moon.distanceRadii * radiusM);
      const moonRadiusM = moon.radiusRadii * radiusM;
      if (moonOnScreen(frame.pose, frame.viewport, center, moonRadiusM, this.options.occluderRadiusM)) {
        visible.push({ center, radiusM: moonRadiusM, orbitPole: state.orbitPole, index });
      }
    });
    this.moons.place(visible, frame.pose.position, fade);
    if (visible.length === 0) return none;
    // 화면 빠르기: 1초 뒤 달 가운데를 화면에 비춰 본다(행성 자전 + 공전)
    const next = skyAt(sky.utcMs + 1000, this.description);
    let fastest = 0;
    for (const placement of visible) {
      const moon = this.description.moons[placement.index];
      const later = next?.moons[placement.index];
      if (!moon || !later) continue;
      const a = projectToScreen(frame.pose, frame.viewport, placement.center);
      const b = projectToScreen(
        frame.pose,
        frame.viewport,
        scale(later.direction, moon.distanceRadii * radiusM),
      );
      if (a && b) fastest = Math.max(fastest, Math.hypot(b.x - a.x, b.y - a.y));
    }
    return { drawn: visible.length, pxPerSecond: fastest > 0 ? fastest : null };
  }

  /** 구름(굽는 중·옅어지는 중이면 true) */
  private updateClouds(frame: SkyFrame, sky: PlanetSkyState): boolean {
    const create = this.options.createClouds;
    if (!this.features.clouds || !frame.firstDisplayed || !create) {
      this.clouds?.hide();
      return false;
    }
    this.clouds ??= create();
    return this.clouds.update({ frame, sky, frozen: this.mode.kind === "fixed" });
  }

  /** 하늘 시계를 예약한다(ADR 7절). 다음 간격(ms), 돌지 않으면 null */
  private scheduleClock(
    frame: SkyFrame,
    sun: Vec3,
    strength: number,
    moonPxPerSecond: number | null,
  ): number | null {
    if (this.mode.kind !== "clock" || this.isHidden()) {
      this.clearTimer();
      return null;
    }
    const interval = skyClockIntervalMs({
      nightStrength: strength,
      sunCos:
        strength > 0
          ? sunCosRangeOnScreen(frame.pose, frame.viewport, this.options.radiusM, sun)
          : { min: 1, max: 1 },
      moonPxPerSecond,
    });
    if (interval === null) {
      this.clearTimer();
      return null;
    }
    const due = frame.nowMs + interval;
    // 이미 걸린 것이 더 이르면 그대로 둔다(움직이는 동안 프레임마다 다시 걸지 않는다)
    if (this.timer !== null && this.timerDueMs <= due) return interval;
    this.clearTimer();
    this.timerDueMs = due;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) this.options.requestFrame();
    }, interval);
    return interval;
  }

  /** 시계 전: 250ms마다 시각이 생겼는지 본다(생겼으면 그린다) */
  private armWaitPoll(): void {
    if (this.timer !== null) return;
    this.timerDueMs = Number.POSITIVE_INFINITY;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.disposed || this.mode.kind !== "clock") return;
      const raw = this.mode.serverNow();
      if (raw !== null && Number.isFinite(raw)) this.options.requestFrame();
      else this.armWaitPoll();
    }, SKY_WAIT_POLL_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private applyOff(pose: GlobePose): void {
    this.options.setSkyLight(0, NO_SUN, 0, pose);
    this.moons?.hide();
    this.clouds?.hide();
    this.clearTimer();
    this.last = statsOff(this.mode, this.failed);
  }

  /** 하늘만 끈다(지도는 계속). 알리기는 조절기 하나에 한 번 */
  private fail(error: unknown, pose: GlobePose): void {
    this.failed = true;
    this.shownSince = null;
    this.retime = null;
    try {
      this.disposeMoons();
      this.disposeClouds();
      this.applyOff(pose);
    } catch {
      // 끄기마저 던지면 그대로 둔다(지도 프레임을 멈추지 않는 것이 먼저다). 처음 오류만 알린다
    }
    if (this.reported) return;
    this.reported = true;
    (this.options.report ?? defaultReport)(error);
  }

  private disposeMoons(): void {
    this.moons?.dispose();
    this.moons = null;
  }

  private disposeClouds(): void {
    this.clouds?.dispose();
    this.clouds = null;
  }
}

/** 하늘이 꺼진 통계(그리지 않는 엔진도 쓴다) */
export const OFF_SKY_STATS: PlanetSkyStats = statsOff(OFF, false);

function statsOff(mode: PlanetSkyMode, failed: boolean): PlanetSkyStats {
  return {
    mode: mode.kind,
    clock: failed || mode.kind === "off" ? "off" : mode.kind === "fixed" ? "fixed" : "waiting",
    utcMs: null,
    subsolarLatDeg: null,
    subsolarLonDeg: null,
    blend: 0,
    nightStrength: 0,
    moonsDrawn: 0,
    cloudOpacity: 0,
    cloudBakes: 0,
    cloudBakeMaxMs: null,
    gpuBytes: 0,
    clockIntervalMs: null,
    failed,
  };
}
