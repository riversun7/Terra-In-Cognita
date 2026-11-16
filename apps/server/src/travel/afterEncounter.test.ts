// 조우 뒤 다시 판단(D-570 1908, 질문 2033·2035 답) — 짐이 차면 창고로 정리하러, 다치면 거점으로 재정비하러, 아니면 하던 길·채집
// (창고·거점을 모르면 출발한 자리 — 옛 줄)
import type { GatherEnterResult } from "@terra/shared/gather";
import { START_ENCOUNTER } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { SecondMap } from "../world/secondMap.ts";
import { type AfterInput, afterEncounterChoice, afterUnloadGoal, reconsiderTrips } from "./afterEncounter.ts";
import type { HaltedTrip } from "./serviceTypes.ts";

const base: AfterInput = {
  stays: true,
  available: true,
  hp: 100,
  maxHp: 100,
  injured: false,
  cargoGrams: 0n,
  capacityGrams: 80_000,
  hasOrigin: true,
};

describe("afterEncounterChoice", () => {
  it("서 있지 않았거나 움직일 수 없으면 그대로, 짐 85% 이상이면 정리, 다쳤으면 재정비, 아니면 하던 길", () => {
    expect(afterEncounterChoice(base, START_ENCOUNTER)).toBe("resume");
    expect(afterEncounterChoice({ ...base, stays: false }, START_ENCOUNTER)).toBe("stay");
    expect(afterEncounterChoice({ ...base, available: false }, START_ENCOUNTER)).toBe("stay");
    expect(afterEncounterChoice({ ...base, cargoGrams: 68_000n }, START_ENCOUNTER)).toBe("unload");
    expect(afterEncounterChoice({ ...base, cargoGrams: 67_999n }, START_ENCOUNTER)).toBe("resume");
    expect(afterEncounterChoice({ ...base, hp: 49 }, START_ENCOUNTER)).toBe("regroup");
    expect(afterEncounterChoice({ ...base, injured: true }, START_ENCOUNTER)).toBe("regroup");
    // 짐이 먼저
    expect(afterEncounterChoice({ ...base, hp: 1, cargoGrams: 80_000n }, START_ENCOUNTER)).toBe("unload");
    // 돌아갈 곳이 없으면 그대로
    expect(afterEncounterChoice({ ...base, hp: 1, hasOrigin: false }, START_ENCOUNTER)).toBe("stay");
  });
});

const trip = (unitId: number, userId: string | null = "u"): HaltedTrip => ({
  unitId,
  ownerId: 9,
  userId,
  kind: "scout",
  origin: { mapKey: 1, x: 5, y: 6 },
  target: { mapKey: 3, x: 7, y: 8 },
});

describe("reconsiderTrips", () => {
  it("결과에 따라 같은 목표(같은 명령)·출발한 자리(이동)로 다시 보낸다", async () => {
    const started: unknown[] = [];
    const condition = { injury: 0, injuryUntilMs: null, healPm: 1000, heldBy: null };
    const map = {
      unitInfo: (id: number) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 상태만 읽는다
        id === 4 ? undefined : ({ condition } as unknown as ReturnType<SecondMap["unitInfo"]>),
    };
    const counts = await reconsiderTrips(
      {
        maps: new Map([[1, map]]),
        travel: {
          start: (userId, request) => {
            started.push([userId, request]);
            return Promise.resolve({ ok: true });
          },
        },
        battle: () =>
          Promise.resolve({
            status: "ended",
            outcome: {
              units: [
                { unit: 1, outcome: "stays", hp: 90 },
                { unit: 2, outcome: "stays", hp: 10 },
                { unit: 3, outcome: "returned", hp: 0 },
                { unit: 4, outcome: "stays", hp: 90 },
                { unit: 5, outcome: "stays", hp: 90 },
              ],
            },
          }),
        maxHp: () => 100,
        cargoGrams: () => 0n,
        capacityGrams: () => 80_000,
        rules: () => START_ENCOUNTER,
        now: () => 0,
        log: { info: () => {}, error: () => {} },
      },
      77,
      [trip(1), trip(2), trip(3), trip(4), trip(5, null)],
    );
    expect(counts).toEqual({ resume: 1, unload: 0, regroup: 1, stay: 3 });
    expect(started).toEqual([
      ["u", { unitId: 1, mapKey: 3, x: 7, y: 8, kind: "scout" }],
      ["u", { unitId: 2, mapKey: 1, x: 5, y: 6, kind: "move" }],
    ]);
  });
});

/** 시험 창고가 선 2차맵(앞 시험 = 같은 2차맵, 뒤 시험 = 다른 2차맵) */
const unitIdWarehouse = { value: 1 };

describe("reconsiderTrips — 창고·거점·채집 줄(encounter-4)", () => {
  it("정리 = 가장 가까운 내 창고(같은 2차맵이면 들어가기, 다른 2차맵이면 가서 닿으면 들어가기), 재정비 = 거점, 채집 줄은 다시 잇는다", async () => {
    const started: unknown[] = [];
    const entered: unknown[] = [];
    const resumed: unknown[] = [];
    const dropped: number[] = [];
    const laters: (() => void)[] = [];
    const thens: ((result: GatherEnterResult) => void)[] = [];
    const condition = { injury: 0, injuryUntilMs: null, healPm: 1000, heldBy: null };
    const onMap = new Map<number, number>([
      [1, 1],
      [2, 1],
      [6, 1],
      [7, 1],
      [8, 1],
    ]);
    const mapOf = (key: number) => ({
      unitInfo: (id: number) =>
        onMap.get(id) === key
          ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 상태만 읽는다
            ({ condition } as unknown as ReturnType<SecondMap["unitInfo"]>)
          : undefined,
    });
    const cargo = new Map<number, bigint>([
      [1, 80_000n],
      [2, 80_000n],
      [7, 80_000n],
    ]);
    const counts = await reconsiderTrips(
      {
        maps: new Map([
          [1, mapOf(1)],
          [3, mapOf(3)],
        ]),
        travel: {
          start: (userId, request) => {
            started.push([userId, request]);
            return Promise.resolve({ ok: true, arriveAt: 5_000 });
          },
        },
        battle: () =>
          Promise.resolve({
            status: "ended",
            outcome: {
              units: [1, 2, 6, 7, 8].map((unit) => ({
                unit,
                outcome: "stays",
                hp: unit === 6 ? 10 : 90,
              })),
            },
          }),
        maxHp: () => 100,
        cargoGrams: (_owner, unitId) => cargo.get(unitId) ?? 0n,
        capacityGrams: () => 80_000,
        rules: () => START_ENCOUNTER,
        where: () => ({ mapKey: 1, x: 10, y: 10 }),
        warehouse: (_owner, from) =>
          from.mapKey === 1 ? { buildingId: 50, mapKey: unitIdWarehouse.value, x: 20, y: 20 } : undefined,
        base: () => ({ mapKey: 3, x: 128, y: 128 }),
        gather: {
          resume: (unitId, unload) => {
            resumed.push([unitId, unload]);
            return Promise.resolve(unload ? "deposit" : "object");
          },
          drop: (unitId) => {
            dropped.push(unitId);
          },
          enter: (userId, input, then) => {
            entered.push([userId, input]);
            if (then) thens.push(then);
            return Promise.resolve({ ok: true });
          },
        },
        later: (run) => {
          laters.push(run);
        },
        now: () => 0,
        log: { info: () => {}, error: () => {} },
      },
      77,
      [trip(1)],
      [
        { unitId: 6, ownerId: 9, userId: "u" },
        { unitId: 7, ownerId: 9, userId: "u" },
        { unitId: 8, ownerId: 9, userId: "u" },
      ],
    );
    // 유닛 1: 같은 2차맵(1) 창고 → 들어가기로 바로 넣는다
    expect(entered).toEqual([["u", { unitId: 1, buildingId: 50 }]]);
    // 6 = 다쳐서 줄을 끝내고 거점으로, 7 = 짐이 차서 넣고 다시, 8 = 그 오브젝트로
    expect(dropped).toEqual([6]);
    expect(started).toEqual([["u", { unitId: 6, mapKey: 3, x: 128, y: 128, kind: "move" }]]);
    expect(resumed).toEqual([
      [7, true],
      [8, false],
    ]);
    expect(counts).toEqual({ resume: 1, unload: 2, regroup: 1, stay: 0 });
    expect(laters).toEqual([]);
    // 정리를 마치면 원래 목표로 다시(질문 2138 고침 — 같은 명령 종류). 배치되면(일하는 건물) 그대로
    expect(thens).toHaveLength(1);
    thens[0]?.("assigned");
    await Promise.resolve();
    expect(started).toHaveLength(1);
    thens[0]?.("deposited");
    await Promise.resolve();
    expect(started.at(-1)).toEqual(["u", { unitId: 1, mapKey: 3, x: 7, y: 8, kind: "scout" }]);
    thens.length = 0;

    // 다른 2차맵 창고: 가서(이동) 닿으면 들어가기
    unitIdWarehouse.value = 3;
    entered.length = 0;
    started.length = 0;
    await reconsiderTrips(
      {
        maps: new Map([
          [1, mapOf(1)],
          [3, mapOf(3)],
        ]),
        travel: {
          start: (userId, request) => {
            started.push([userId, request]);
            return Promise.resolve({ ok: true, arriveAt: 5_000 });
          },
        },
        battle: () =>
          Promise.resolve({ status: "ended", outcome: { units: [{ unit: 2, outcome: "stays", hp: 90 }] } }),
        maxHp: () => 100,
        cargoGrams: (_owner, unitId) => cargo.get(unitId) ?? 0n,
        capacityGrams: () => 80_000,
        rules: () => START_ENCOUNTER,
        where: () => ({ mapKey: 1, x: 10, y: 10 }),
        warehouse: () => ({ buildingId: 60, mapKey: 3, x: 20, y: 20 }),
        gather: {
          resume: () => Promise.resolve("ended"),
          drop: () => {},
          enter: (userId, input, then) => {
            entered.push([userId, input]);
            if (then) thens.push(then);
            return Promise.resolve({ ok: true });
          },
        },
        later: (run) => {
          laters.push(run);
        },
        now: () => 0,
        log: { info: () => {}, error: () => {} },
      },
      78,
      [trip(2)],
    );
    expect(started).toEqual([["u", { unitId: 2, mapKey: 3, x: 20, y: 20, kind: "move" }]]);
    expect(entered).toEqual([]);
    // 아직 닿지 않았으면 다시 미룬다, 닿으면 들어가기
    laters.shift()?.();
    expect(entered).toEqual([]);
    onMap.set(2, 3);
    laters.shift()?.();
    expect(entered).toEqual([["u", { unitId: 2, buildingId: 60 }]]);
    thens[0]?.("deposited");
    await Promise.resolve();
    expect(started.at(-1)).toEqual(["u", { unitId: 2, mapKey: 3, x: 7, y: 8, kind: "scout" }]);
    expect(afterUnloadGoal(trip(2))).toEqual({ target: { mapKey: 3, x: 7, y: 8 }, kind: "scout" });
  });
});
