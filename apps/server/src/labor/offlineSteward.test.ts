import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { UNIT_KIND_CYBORG, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { createOfflineSteward } from "./offlineSteward.ts";

const AFTER = TEST_SOCIETY_COEFFICIENTS.npcAi.offlineStewardAfterMs;
const CHECK = TEST_SOCIETY_COEFFICIENTS.npcAi.houseCheckMs;

interface Job {
  readonly id: number;
  readonly mapKey: number;
  readonly slots: number;
  readonly filled: number;
}
const job = (id: number, mapKey: number, slots: number, filled = 0): Job => ({ id, mapKey, slots, filled });

function setup(o: { enabled?: number; busy?: number[]; jobs?: Job[]; fail?: number[] } = {}) {
  const accepted: { userId: string; jobId: number; unitId: number }[] = [];
  const steward = createOfflineSteward({
    rules: () => ({
      ...TEST_SOCIETY_COEFFICIENTS,
      npcAi: { ...TEST_SOCIETY_COEFFICIENTS.npcAi, offlineStewardEnabled: o.enabled ?? 1 },
    }),
    settlement: {
      // away = 오래 비접속, fresh = 방금 끊음
      offlineUsers: () => [
        { userId: "away", sinceMs: 0 },
        { userId: "fresh", sinceMs: AFTER },
      ],
      findOwnerOfUser: (userId) => (userId === "away" ? 1 : 2),
    },
    labor: {
      jobs: () => ({
        status: "ready",
        jobs: o.jobs ?? [job(100, 5, 1), job(101, 5, 2), job(102, 9, 5)],
      }),
      acceptJob: async (userId, jobId, unitId) => {
        if (o.fail?.includes(jobId)) return { ok: false };
        accepted.push({ userId, jobId, unitId });
        return { ok: true };
      },
      unitBusy: (unitId) => o.busy?.includes(unitId) ?? false,
    },
    maps: new Map([
      [
        5,
        {
          mapKey: 5,
          forEachUnit: (visit) => {
            visit({ id: 11, kind: UNIT_KIND_HUMAN, ownerId: 1 });
            visit({ id: 12, kind: UNIT_KIND_HUMAN, ownerId: 1 });
            visit({ id: 13, kind: UNIT_KIND_CYBORG, ownerId: 1 }); // 사이보그 본체는 건드리지 않는다
            visit({ id: 21, kind: UNIT_KIND_HUMAN, ownerId: 2 }); // 방금 끊은 유저
          },
        },
      ],
    ]),
  });
  return { steward, accepted };
}

describe("비접속 유저 유닛 관리인(offlineSteward.ts)", () => {
  it("오래 비접속인 유저의 일 없는 유닛을 같은 2차맵의 열린 일자리에 임금 높은 차례로 넣는다", async () => {
    const { steward, accepted } = setup();
    expect(await steward.sweep(AFTER)).toBe(2);
    // 일자리 100은 한 자리 → 11번, 다음 유닛은 101로. 다른 2차맵(102)·사이보그 본체·방금 끊은 유저는 건드리지 않는다
    expect(accepted).toEqual([
      { userId: "away", jobId: 100, unitId: 11 },
      { userId: "away", jobId: 101, unitId: 12 },
    ]);
    // 살피는 주기 전에는 다시 보지 않는다
    expect(await steward.sweep(AFTER + 1)).toBe(0);
    expect(await steward.sweep(AFTER + CHECK)).toBe(2);
  });

  it("일하는 유닛은 두고, 받지 못한 일자리는 건너뛰어 다음 것을 본다. 스위치를 끄면 아무것도 하지 않는다", async () => {
    const busy = setup({ busy: [11], fail: [100] });
    expect(await busy.steward.sweep(AFTER)).toBe(1);
    expect(busy.accepted).toEqual([{ userId: "away", jobId: 101, unitId: 12 }]);
    const off = setup({ enabled: 0 });
    expect(await off.steward.sweep(AFTER)).toBe(0);
    expect(off.accepted).toEqual([]);
  });
});
