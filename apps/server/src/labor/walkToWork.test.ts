// 일터로 걸어가기 시험(walkToWork.ts — 사용자 결정 D-591, 질문 2656 나). 먼 유닛은 시설 둘레로 걸어가고 그동안은 산출 멈춤 구간·부상 굴림 밖, 계약 임금은
// 도착부터. 이미 둘레·봇이면 걷지 않는다.
import { WALK_SPEED, anchorAt, arrivalAt, positionAt } from "@terra/sim";
import type { LaborContract } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkInjuryHook } from "../world/settlement.ts";
import { createTestMap } from "../world/testSupport.ts";
import { UNIT_KIND_BOT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { WORK_REACH_CELLS, cellGap, createWalkToWork, shiftPayStart } from "./walkToWork.ts";

const START = 1_798_000_000_000;
const OWNER = 7;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

/** 시험 2차맵 + 건물(기준 칸 150,100, 6×6) + 유닛 */
function rig(unitCell: { x: number; y: number }, kind = UNIT_KIND_HUMAN) {
  const { map } = createTestMap({ mapKey: 9 });
  expect(map.placeBuilding({ x: 150, y: 100, width: 6, height: 6, rotation: 0 }, OWNER)).toEqual({
    ok: true,
    buildingId: 1,
  });
  expect(
    map.addUnit({
      id: 21,
      size: 1,
      speed: WALK_SPEED,
      cellX: unitCell.x,
      cellY: unitCell.y,
      ownerId: OWNER,
      kind,
    }),
  ).toBe(true);
  const paid: [number, number][] = [];
  const walk = createWalkToWork({
    maps: new Map([[9, map]]),
    now: () => Date.now(),
    payFrom: (unitId, atMs) => paid.push([unitId, atMs]),
  });
  return { map, walk, paid };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("일터로 걸어가기 (D-591, 질문 2656 나)", () => {
  it("먼 유닛은 시설 둘레로 걸어가고, 가는 동안 = 산출 멈춤 구간·부상 굴림 밖, 계약 임금은 도착부터", async () => {
    const { map, walk, paid } = rig({ x: 40, y: 100 });
    walk.begin(21, 1);
    await settle();
    const info = map.unitInfo(21);
    if (!info) throw new Error("no unit");
    const until = arrivalAt(info.motion);
    // 순간이동 없음: 아직 그 자리에서 출발했고, 닿는 칸은 건물 둘레
    expect(anchorAt(positionAt(info.motion, START), 1)).toEqual({ x: 40, y: 100 });
    const goal = anchorAt(positionAt(info.motion, until), 1);
    expect(cellGap(goal, { x: 150, y: 100, width: 6, height: 6 })).toBeLessThanOrEqual(WORK_REACH_CELLS);
    expect(until).toBeGreaterThan(START + 60_000);
    expect(walk.commuteOf(21)).toBe(until);
    expect(paid).toEqual([[21, until]]);
    // 산출 멈춤 구간(시설 작업 멈춤과 합친다)
    const base = new Map([[99, [{ fromMs: 1, untilMs: 2 }]]]);
    expect(walk.pauses(() => base)(OWNER)).toEqual(
      new Map([
        [99, [{ fromMs: 1, untilMs: 2 }]],
        [21, [{ fromMs: START, untilMs: until }]],
      ]),
    );
    expect(walk.pauses(() => undefined)(OWNER + 1)).toBeUndefined();
    // 부상은 가는 구간을 빼고 굴린다
    const rolled: [number, number][] = [];
    const hook: WorkInjuryHook = (_unit, fromMs, toMs) => void rolled.push([fromMs, toMs]);
    const unit = { map, id: 21, kind: UNIT_KIND_HUMAN, job: { job: 1, phase: 0, progressMs: 0, fatigue: 0 } };
    walk.injury(hook)(unit, START - 1000, until + 1000, null);
    expect(rolled).toEqual([
      [START - 1000, START],
      [until, until + 1000],
    ]);
    // 닿으면 가는 중이 아니다
    vi.setSystemTime(until + 1);
    expect(walk.commuteOf(21)).toBeUndefined();
    map.stop();
  });

  it("이미 시설 둘레이거나 봇(NPC 휴먼 — 스스로 오간다)이면 걷지 않는다", async () => {
    const near = rig({ x: 148, y: 100 });
    near.walk.begin(21, 1);
    await settle();
    expect(near.walk.commuteOf(21)).toBeUndefined();
    expect(near.paid).toEqual([]);
    near.map.stop();
    const bot = rig({ x: 40, y: 100 }, UNIT_KIND_BOT);
    bot.walk.begin(21, 1);
    await settle();
    expect(bot.walk.commuteOf(21)).toBeUndefined();
    bot.map.stop();
  });
});

/** 시험 계약(shiftPayStart가 읽는 칸만) */
const contract = (fields: Partial<LaborContract>) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 이 함수가 읽는 칸만 채운다
  ({
    unitId: 21,
    state: "active",
    paidTotal: 0n,
    settledAtMs: 100,
    nextDueMs: 100,
    ...fields,
  }) as LaborContract;

describe("shiftPayStart (계약 임금·임대료는 도착부터)", () => {
  it("아직 치르지 않은 열린 계약의 정산·다음 지급 시각을 도착으로 미룬다", () => {
    const fresh = contract({});
    const paid = contract({ paidTotal: 5n });
    const other = contract({ unitId: 22 });
    const saved: LaborContract[] = [];
    shiftPayStart([fresh, paid, other], 21, 500, (c) => saved.push(c));
    expect([fresh.settledAtMs, fresh.nextDueMs]).toEqual([500, 500]);
    expect(paid.settledAtMs).toBe(100);
    expect(other.settledAtMs).toBe(100);
    expect(saved).toEqual([fresh]);
  });
});
