import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GlobePose,
  type Viewport,
  directionOfLatLon,
  globeLimits,
  globePose,
  initialGlobe,
  latLonOf,
} from "./globeCamera.ts";
import {
  PLACEHOLDER_PLANET_SKY,
  type PlanetSkyMode,
  SKY_CLOCK,
  moonOnScreen,
  nightStrength,
  skyAt,
} from "./sky.ts";
import {
  type MoonPlacement,
  SKY_FADE_MS,
  SKY_RETIME_MS,
  SKY_WAIT_POLL_MS,
  SkyController,
  type SkyControllerOptions,
  type SkyFrame,
  type SkyMoonLayer,
} from "./skyController.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";
import { type Vec3, angleBetween, scale } from "./vec3.ts";

const R = EARTH_RADIUS_M;
const PORTRAIT: Viewport = { width: 412, height: 892 };
const LIMITS = globeLimits(R, 1500, PORTRAIT);
/** 달력 기원 뒤 하루 반(정수 ms) */
const T0 = 1_790_812_800_000 + 36 * 3_600_000 + 777;
const SUN0 = skyAt(T0)?.sun.direction ?? [1, 0, 0];

/** 위도·경도 방향을 보는 카메라(거리 m) */
function poseLooking(direction: Vec3, distanceM: number): GlobePose {
  const { latDeg, lonDeg } = latLonOf(direction);
  return globePose(initialGlobe(latDeg, lonDeg, distanceM, LIMITS), R, LIMITS);
}

function frameAt(nowMs: number, pose: GlobePose, distanceM: number, extra: Partial<SkyFrame> = {}): SkyFrame {
  return {
    pose,
    viewport: PORTRAIT,
    distanceM,
    minDistanceM: LIMITS.minDistance,
    layer: "terrain",
    exaggeration: 6,
    firstDisplayed: true,
    gestureActive: false,
    tilesBusy: false,
    nowMs,
    ...extra,
  };
}

/** 항성과 수직인 곳(낮밤 띠)을 지구본 거리에서 본다 */
const terminator: Vec3 = (() => {
  const side: Vec3 = [-SUN0[1], SUN0[0], 0];
  const length = Math.hypot(side[0], side[1]);
  return [side[0] / length, side[1] / length, 0];
})();
const GLOBE_DISTANCE = LIMITS.maxDistance * 0.9;

interface LightCall {
  blend: number;
  sun: Vec3;
  strength: number;
}

function setup(extra: Partial<SkyControllerOptions> = {}) {
  const lights: LightCall[] = [];
  const requestFrame = vi.fn();
  const report = vi.fn();
  let hidden = false;
  const controller = new SkyController({
    radiusM: R,
    occluderRadiusM: R,
    setSkyLight: (blend, sun, strength) => lights.push({ blend, sun, strength }),
    requestFrame,
    report,
    isHidden: () => hidden,
    ...extra,
  });
  return {
    controller,
    lights,
    requestFrame,
    report,
    hide: (value: boolean) => {
      hidden = value;
    },
    last: () => lights.at(-1),
  };
}

const clockMode = (serverNow: () => number | null): PlanetSkyMode => ({ kind: "clock", serverNow });

/** 가짜 달 그리기: 놓인 달과 숨긴 횟수를 적는다 */
function fakeMoons() {
  const placed: (readonly MoonPlacement[])[] = [];
  let hidden = 0;
  const dispose = vi.fn();
  const layer: SkyMoonLayer = {
    place: (moons) => {
      placed.push(moons);
    },
    hide: () => {
      hidden += 1;
    },
    gpuBytes: 24_000,
    dispose,
  };
  return { layer, placed, dispose, hiddenCount: () => hidden };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("하늘 조절기: 모드", () => {
  it("off(기본): 지금 빛(섞기 0·세기 0), 시계·예약 없음", () => {
    const { controller, last } = setup();
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    expect(controller.update(frameAt(0, pose, GLOBE_DISTANCE))).toBe(false);
    expect(last()).toMatchObject({ blend: 0, strength: 0 });
    expect(controller.stats()).toMatchObject({ mode: "off", clock: "off", utcMs: null, moonsDrawn: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fixed: 바로 켜지고(섞기 1) 그 시각의 항성·거리 세기를 쓴다. 하늘 시계는 돌지 않는다", () => {
    const { controller, last } = setup();
    controller.setMode({ kind: "fixed", utcMs: T0 + 0.75 });
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    expect(controller.update(frameAt(0, pose, GLOBE_DISTANCE))).toBe(false);
    const call = last();
    expect(call?.blend).toBe(1);
    expect(angleBetween(call?.sun ?? [0, 0, 1], SUN0)).toBeLessThan(1e-12);
    expect(call?.strength).toBeCloseTo(nightStrength(GLOBE_DISTANCE, LIMITS.minDistance, R, "terrain"), 12);
    expect(controller.stats()).toMatchObject({ mode: "fixed", clock: "fixed", utcMs: T0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("요소 끔: 낮밤을 끄면 지금 빛(섞기 0)이지만 항성 방향은 넘긴다(달 위상용)", () => {
    const { controller, last } = setup();
    controller.setMode({ kind: "fixed", utcMs: T0, features: { dayNight: false } });
    controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    expect(last()).toMatchObject({ blend: 0, strength: 0 });
    expect(angleBetween(last()?.sun ?? [0, 0, 1], SUN0)).toBeLessThan(1e-12);
  });

  it("기후 레이어: 세기 × 0.35, 가장 가까이: 0.6(사용자 결정 U1)", () => {
    const { controller, last } = setup();
    controller.setMode({ kind: "fixed", utcMs: T0 });
    controller.update(
      frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE, { layer: "climate" }),
    );
    expect(last()?.strength).toBeCloseTo(0.35, 12);
    const near = LIMITS.minDistance;
    controller.update(frameAt(16, poseLooking(terminator, near), near));
    expect(last()?.strength).toBeCloseTo(0.6, 12);
  });
});

describe("하늘 조절기: 시계", () => {
  it("소수 시각(x.5ms)도 던지지 않고 내린 시각과 같은 하늘이다(검토 H1)", () => {
    const a = setup();
    const b = setup();
    a.controller.setMode(clockMode(() => T0 + 0.5));
    b.controller.setMode(clockMode(() => T0));
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    a.controller.update(frameAt(0, pose, GLOBE_DISTANCE));
    b.controller.update(frameAt(0, pose, GLOBE_DISTANCE));
    expect(a.last()?.sun).toEqual(b.last()?.sun);
    expect(a.controller.stats().utcMs).toBe(T0);
    expect(a.report).not.toHaveBeenCalled();
  });

  it("시계 전(null)은 지금 빛(낮), 250ms마다 시각만 보고 생기면 그린다. 잰 뒤 0.5초에 걸쳐 켠다", () => {
    let now: number | null = null;
    const { controller, last, requestFrame } = setup();
    controller.setMode(clockMode(() => now));
    requestFrame.mockClear();
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    expect(controller.update(frameAt(0, pose, GLOBE_DISTANCE))).toBe(false);
    expect(last()).toMatchObject({ blend: 0, strength: 0 });
    expect(controller.stats().clock).toBe("waiting");
    vi.advanceTimersByTime(SKY_WAIT_POLL_MS * 3);
    expect(requestFrame).not.toHaveBeenCalled();
    now = T0;
    vi.advanceTimersByTime(SKY_WAIT_POLL_MS);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    // 켜지기: 처음 0, 절반에서 0.5(smoothstep), 0.5초 뒤 1
    expect(controller.update(frameAt(1000, pose, GLOBE_DISTANCE))).toBe(true);
    expect(last()?.blend).toBe(0);
    controller.update(frameAt(1000 + SKY_FADE_MS / 2, pose, GLOBE_DISTANCE));
    expect(last()?.blend).toBeCloseTo(0.5, 12);
    expect(controller.update(frameAt(1000 + SKY_FADE_MS, pose, GLOBE_DISTANCE))).toBe(false);
    expect(last()?.blend).toBe(1);
    expect(controller.stats().clock).toBe("server");
  });

  it("출처(source)를 통계에 싣는다(기기 시계)", () => {
    const { controller } = setup();
    controller.setMode({ kind: "clock", serverNow: () => T0, source: () => "device" });
    controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    expect(controller.stats().clock).toBe("device");
  });

  it("늦게 잰 값이 1분 넘게 다르면 0.5초에 걸쳐 항성을 옮기고, 1분 안쪽이면 바로 쓴다", () => {
    let server = T0;
    let now = 0;
    const { controller, last } = setup();
    controller.setMode(clockMode(() => server + now));
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    for (now = 0; now <= SKY_FADE_MS; now += 100) controller.update(frameAt(now, pose, GLOBE_DISTANCE));
    // 30초 차이: 바로
    server += 30_000;
    controller.update(frameAt(now, pose, GLOBE_DISTANCE));
    const live30 = skyAt(T0 + 30_000 + now)?.sun.direction ?? [0, 0, 1];
    expect(angleBetween(last()?.sun ?? [0, 0, 1], live30)).toBeLessThan(1e-9);
    // 10분 차이: 출발은 옛 방향, 가운데는 사이, 0.5초 뒤 새 방향
    const before = last()?.sun ?? [0, 0, 1];
    server += 600_000;
    const start = now;
    expect(controller.update(frameAt(start, pose, GLOBE_DISTANCE))).toBe(true);
    expect(angleBetween(last()?.sun ?? [0, 0, 1], before)).toBeLessThan(1e-9);
    now = start + SKY_RETIME_MS / 2;
    controller.update(frameAt(now, pose, GLOBE_DISTANCE));
    const middle = last()?.sun ?? [0, 0, 1];
    const target = skyAt(server + now)?.sun.direction ?? [0, 0, 1];
    expect(angleBetween(middle, before)).toBeGreaterThan(0.1);
    expect(angleBetween(middle, target)).toBeGreaterThan(0.1);
    now = start + SKY_RETIME_MS;
    controller.update(frameAt(now, pose, GLOBE_DISTANCE));
    expect(
      angleBetween(last()?.sun ?? [0, 0, 1], skyAt(server + now)?.sun.direction ?? [0, 0, 1]),
    ).toBeLessThan(1e-9);
  });

  it("fixed → clock으로 바꿔도 꺼졌다 켜지지 않는다(섞기 1 그대로)", () => {
    const { controller, last } = setup();
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    controller.setMode({ kind: "fixed", utcMs: T0 });
    controller.update(frameAt(0, pose, GLOBE_DISTANCE));
    controller.setMode(clockMode(() => T0));
    controller.update(frameAt(16, pose, GLOBE_DISTANCE));
    expect(last()?.blend).toBe(1);
  });
});

describe("하늘 조절기: 쉬는 동안 하늘 시계(ADR 7절)", () => {
  const clock: PlanetSkyMode = { kind: "clock", serverNow: () => T0 };

  it("지구본에서 띠가 보이면 1.7초 ÷ 밤 세기마다 한 번 그린다", () => {
    const { controller, requestFrame } = setup();
    controller.setMode(clock);
    requestFrame.mockClear();
    controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    expect(controller.stats().clockIntervalMs).toBe(SKY_CLOCK.bandStepMs);
    vi.advanceTimersByTime(SKY_CLOCK.bandStepMs - 1);
    expect(requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it("가까운 거리: 낮이면 4초, 밤 쪽만이면 멈춘다", () => {
    const near = LIMITS.minDistance;
    const day = setup();
    day.controller.setMode(clock);
    day.controller.update(frameAt(0, poseLooking(SUN0, near), near));
    expect(day.controller.stats().clockIntervalMs).toBe(SKY_CLOCK.daySideStepMs);
    const night = setup();
    night.controller.setMode(clock);
    night.controller.update(frameAt(0, poseLooking(scale(SUN0, -1), near), near));
    expect(night.controller.stats().clockIntervalMs).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("숨긴 탭·fixed·off에서는 돌지 않고, 닫은 뒤에는 예약이 남지 않는다", () => {
    const hidden = setup();
    hidden.hide(true);
    hidden.controller.setMode(clock);
    hidden.controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    expect(hidden.controller.stats().clockIntervalMs).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    const shown = setup();
    shown.controller.setMode(clock);
    shown.controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    expect(vi.getTimerCount()).toBe(1);
    shown.controller.setMode({ kind: "off" });
    expect(vi.getTimerCount()).toBe(0);
    shown.controller.setMode(clock);
    shown.controller.update(frameAt(16, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    shown.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    shown.requestFrame.mockClear();
    vi.advanceTimersByTime(10_000);
    expect(shown.requestFrame).not.toHaveBeenCalled();
  });
});

describe("하늘 조절기: 오류 가두기(검토 H1)", () => {
  it("하늘 계산이 던지면 하늘만 끄고 한 번 알린다. 다음 프레임도 던지지 않고, setSky로 다시 켤 수 있다", () => {
    let broken = true;
    const { controller, last, report } = setup();
    controller.setMode({
      kind: "clock",
      serverNow: () => {
        if (broken) throw new Error("clock exploded");
        return T0;
      },
    });
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    for (let i = 0; i < 3; i++) expect(controller.update(frameAt(i * 16, pose, GLOBE_DISTANCE))).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ blend: 0, strength: 0 });
    expect(controller.stats()).toMatchObject({ failed: true, clock: "off" });
    broken = false;
    controller.setMode({ kind: "fixed", utcMs: T0 });
    controller.update(frameAt(100, pose, GLOBE_DISTANCE));
    expect(controller.stats()).toMatchObject({ failed: false, clock: "fixed" });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("범위 밖 시각(달력이 null)도 하늘만 끈다", () => {
    const { controller, report } = setup();
    controller.setMode({ kind: "fixed", utcMs: 1e300 });
    expect(() =>
      controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE)),
    ).not.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe("하늘 조절기: 달 놓기", () => {
  it("첫 표시 전에는 만들지 않고, 하늘이 화면에 없으면 숨긴다", () => {
    const moons = fakeMoons();
    const create = vi.fn(() => moons.layer);
    const { controller } = setup({ createMoons: create });
    controller.setMode({ kind: "fixed", utcMs: T0 });
    const pose = poseLooking(terminator, GLOBE_DISTANCE);
    controller.update(frameAt(0, pose, GLOBE_DISTANCE, { firstDisplayed: false }));
    expect(create).not.toHaveBeenCalled();
    const near = LIMITS.minDistance;
    controller.update(frameAt(16, poseLooking(terminator, near), near));
    expect(create).toHaveBeenCalledTimes(1);
    expect(moons.placed).toHaveLength(0);
    expect(moons.hiddenCount()).toBeGreaterThan(0);
  });

  it("달이 화면 안이면 놓고(가운데 = 방향 × 12R, 반지름 0.27R), 화면 빠르기로 하늘 시계를 줄인다", () => {
    const moons = fakeMoons();
    const { controller } = setup({ createMoons: () => moons.layer });
    controller.setMode({ kind: "clock", serverNow: () => T0 });
    const moon = skyAt(T0)?.moons[0];
    const description = PLACEHOLDER_PLANET_SKY.moons[0];
    if (!moon || !description) throw new Error("no moon");
    // 달이 보이는 지구본 자세를 찾는다(세로 화면에서 달은 행성 뒤쪽 위·아래 20° 안에만 보인다)
    const center = scale(moon.direction, description.distanceRadii * R);
    let found: GlobePose | null = null;
    for (let lat = -87; lat <= 87 && !found; lat += 3) {
      for (let lon = -180; lon < 180 && !found; lon += 3) {
        const pose = poseLooking(directionOfLatLon(lat, lon), GLOBE_DISTANCE);
        if (moonOnScreen(pose, PORTRAIT, center, description.radiusRadii * R, R)) found = pose;
      }
    }
    if (!found) throw new Error("no pose shows the moon");
    controller.update(frameAt(0, found, GLOBE_DISTANCE));
    const placed = moons.placed.at(-1) ?? [];
    expect(placed).toHaveLength(1);
    expect(placed[0]?.radiusM).toBeCloseTo(description.radiusRadii * R, 6);
    expect(angleBetween(placed[0]?.center ?? [0, 0, 1], moon.direction)).toBeLessThan(1e-12);
    expect(controller.stats().moonsDrawn).toBe(1);
    // 지구본에서 달은 초당 1~1.5px → 0.5px 걸음이면 0.33~0.5초
    const interval = controller.stats().clockIntervalMs ?? 0;
    expect(interval).toBeGreaterThanOrEqual(SKY_CLOCK.minMs);
    expect(interval).toBeLessThan(SKY_CLOCK.bandStepMs);
  });

  it("요소 끔·off로 바꾸면 달 자원을 버린다", () => {
    const moons = fakeMoons();
    const { controller } = setup({ createMoons: () => moons.layer });
    controller.setMode({ kind: "fixed", utcMs: T0 });
    controller.update(frameAt(0, poseLooking(terminator, GLOBE_DISTANCE), GLOBE_DISTANCE));
    controller.setMode({ kind: "fixed", utcMs: T0, features: { moon: false } });
    expect(moons.dispose).toHaveBeenCalledTimes(1);
  });
});
