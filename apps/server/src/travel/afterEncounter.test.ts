// 조우 뒤 다시 판단(D-570 1908) — 짐이 차면 정리하러, 다치면 재정비하러 출발한 자리로, 아니면 하던 길
import { START_ENCOUNTER } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { SecondMap } from "../world/secondMap.ts";
import { type AfterInput, afterEncounterChoice, reconsiderTrips } from "./afterEncounter.ts";
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
