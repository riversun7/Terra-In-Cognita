// 걷기 빠르기 시험(walkSpeed.ts, 사용자 결정 D-540 "걷기만 AGI 반영") — 실효 AGI(전투와 같은 몸) → 계산식 walk_speed가 2차맵 이동·운영자 빠르기·
// 도착 시각에 들고, 탈것 봇·땅이 아닌 유닛은 그대로, 몸 셈은 바뀐 때만 하는지
import { CAR_SPEED, CELL_UNITS, WALK_SPEED, anchorCenter, arrivalAt } from "@terra/sim";
import { DEFAULT_CHARACTER_LOOK } from "@terra/shared/characterLook";
import { zeroElements } from "@terra/shared/cyborg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CyborgRecord } from "../cyborg/state.ts";
import { testRosterCatalog } from "../roster/catalog.ts";
import { NO_GEAR, type UnitGear } from "../roster/unitBody.ts";
import { OPERATOR_SPEED_FACTOR } from "./operatorPace.ts";
import { createTestMap } from "./testSupport.ts";
import { UNIT_KIND_BOT, UNIT_KIND_CYBORG } from "./unitKinds.ts";
import { createWalkSpeeds, walksOnFoot } from "./walkSpeed.ts";

const START = 1_798_000_000_000;
const catalog = testRosterCatalog();

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

const recordAt = (level: number, agi = 10): CyborgRecord => ({
  userId: "u-1",
  name: "새싹",
  nameKey: "새싹",
  temperament: "balanced",
  initial: { str: 10, dex: 10, agi, vit: 10, int: 10, wis: 10 },
  kPm: { str: 1000, dex: 1000, agi: 1000, vit: 1000, int: 1000, wis: 1000 },
  look: DEFAULT_CHARACTER_LOOK,
  lookAuto: false,
  factionId: 1,
  startCityId: 1,
  unitId: 1,
  level,
  exp: 0,
  rebirths: 0,
  faith: 0,
  createdAtMs: START,
  elements: zeroElements(),
  religion: null,
  faithPoints: 0,
  startGrant: null,
  nationChangedAtMs: null,
  standings: new Map(),
});

function speeds(state: { record?: CyborgRecord; gear?: UnitGear }) {
  const gearOf = vi.fn((_unitId: number, _nowMs: number) => state.gear ?? NO_GEAR);
  const walk = createWalkSpeeds({
    cyborgs: {
      userOfUnit: (unitId) => (unitId === 1 && state.record ? "u-1" : undefined),
      record: () => state.record,
    },
    gearOf,
    catalog: () => catalog,
    fallback: catalog.coefficients,
    now: () => Date.now(),
  });
  return { walk, gearOf };
}

const foot = (id: number, kind = UNIT_KIND_CYBORG) => ({ id, kind, speed: WALK_SPEED, domain: "land" });

describe("걷기 빠르기 = 계산식 walk_speed(실효 AGI)", () => {
  it("처음 AGI 10(기본 몸·새 사이보그) = 437, 레벨이 오르면 빨라진다", () => {
    const state: { record?: CyborgRecord } = {};
    const { walk } = speeds(state);
    expect(walk.speedOf(foot(2, UNIT_KIND_BOT))).toBe(WALK_SPEED);
    state.record = recordAt(1);
    expect(walk.speedOf(foot(1))).toBe(WALK_SPEED);
    state.record = recordAt(30);
    expect(walk.agiOf(1)).toBe(39);
    expect(walk.speedOf(foot(1))).toBe(552);
  });

  it("AGI 버프는 곧바로 들고(지문이 바뀜), 끝나면 돌아온다", () => {
    const state: { record?: CyborgRecord; gear?: UnitGear } = { record: recordAt(1) };
    const { walk } = speeds(state);
    expect(walk.speedOf(foot(1))).toBe(437);
    state.gear = {
      equipped: [],
      effects: [
        { effect: "haste", value: 10, untilMs: START + 60_000, kind: "buff", stat: "agi", valueMode: "flat" },
      ],
    };
    expect(walk.speedOf(foot(1))).toBe(476);
    state.gear = NO_GEAR;
    expect(walk.speedOf(foot(1))).toBe(437);
  });

  it("이동 속도 버프·디버프(‰)도 걷기에 든다(사용자 1264, D-553 — 전투와 같은 합·하한), 끝나면 돌아온다", () => {
    const state: { record?: CyborgRecord; gear?: UnitGear } = { record: recordAt(1) };
    const { walk } = speeds(state);
    const effect = (kind: string, value: number, untilMs = START + 60_000) => ({
      effect: `${kind}_${value}`,
      value,
      untilMs,
      kind,
      stat: "move_speed",
      valueMode: "permille" as const,
    });
    state.gear = { equipped: [], effects: [effect("buff", 500)] };
    // 437 × 1500 ÷ 1000 = 655.5
    expect(walk.speedOf(foot(1))).toBe(655);
    state.gear = { equipped: [], effects: [effect("buff", 500), effect("debuff", 300)] };
    expect(walk.speedOf(foot(1))).toBe(524);
    // 하한 100‰(10배 느림까지)
    state.gear = { equipped: [], effects: [effect("debuff", 5000)] };
    expect(walk.speedOf(foot(1))).toBe(43);
    // 끝난 효과는 빼고, 탈것·배는 그대로
    state.gear = { equipped: [], effects: [effect("buff", 500, START)] };
    expect(walk.speedOf(foot(1))).toBe(437);
    state.gear = { equipped: [], effects: [effect("buff", 500)] };
    expect(walk.speedOf({ id: 3, kind: UNIT_KIND_BOT, speed: CAR_SPEED, domain: "land" })).toBe(CAR_SPEED);
  });

  it("탈것 봇·땅이 아닌 유닛은 수단 속도 그대로(D-5052)", () => {
    const { walk } = speeds({});
    const car = { id: 3, kind: UNIT_KIND_BOT, speed: CAR_SPEED, domain: "land" };
    expect(walksOnFoot(car)).toBe(false);
    expect(walk.speedOf(car)).toBe(CAR_SPEED);
    const boat = { id: 4, kind: UNIT_KIND_CYBORG, speed: 3000, domain: "sea" };
    expect(walk.speedOf(boat)).toBe(3000);
  });

  it("몸 셈은 지문이 같으면 다시 하지 않는다(받아 둔 AGI), TTL이 지나면 다시", () => {
    const record = recordAt(30);
    const state = { record };
    const { walk } = speeds(state);
    const first = walk.agiOf(1);
    // 같은 지문인데 다른 레코드 객체가 와도(저장된 값 같음) 받아 둔 값
    state.record = { ...record };
    expect(walk.agiOf(1)).toBe(first);
    vi.advanceTimersByTime(60_000);
    expect(walk.agiOf(1)).toBe(first);
  });
});

const center = (x: number, y: number) => anchorCenter(x, y, 1);

describe("2차맵 이동에 든다", () => {
  it("이동을 시작할 때 몸 빠르기를 읽고, 도착 시각·운영자 빠르기(× 100)도 그 빠르기로", async () => {
    let speed = 600;
    const { map } = createTestMap({ walkSpeed: (unit) => (unit.domain === "land" ? speed : unit.speed) });
    expect(map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 })).toBe(true);
    const first = map.moveUnit(1, center(30, 10));
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toEqual({ ok: true });
    const info = map.unitInfo(1);
    expect(info?.speed).toBe(600);
    expect(info?.motion.speed).toBe(600);
    expect(info && arrivalAt(info.motion)).toBe(START + Math.ceil((20 * CELL_UNITS * 1000) / 600));
    // 몸이 바뀌면 다음 이동부터(운영자 빠르기는 그 빠르기 × 100)
    speed = 800;
    expect(map.refreshSpeed(1)).toBe(800);
    map.setPace(1, OPERATOR_SPEED_FACTOR);
    const fast = map.moveUnit(1, center(10, 10));
    await vi.advanceTimersByTimeAsync(0);
    expect(await fast).toEqual({ ok: true });
    expect(map.unitInfo(1)?.motion.speed).toBe(800 * OPERATOR_SPEED_FACTOR);
    expect(map.refreshSpeed(99)).toBeUndefined();
    map.stop();
  });
});
