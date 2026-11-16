// 조우 편 판단 값 시험 — 유닛 개별 퇴각 기준(D-558 1547 "파티도 없으면 유닛들 개별 참전", 질문 2131 → fixes-1116l), encounterSides.ts.
import { describe, expect, it } from "vitest";
import { npcPresetOf, presetTactics } from "@terra/shared/aiTactics";
import { type SideSources, type SideUnit, unitRetreats } from "./encounterSides.ts";

const unit = (unitId: number, ownerId: number, decider = true): SideUnit => ({
  unitId,
  ownerId,
  kind: 4,
  decider,
  speed: 1000,
});

describe("unitRetreats", () => {
  it("판단 유닛마다 제 작전 ⑦(플레이어 = 저장한 작전 → 없으면 균형, NPC = 성향 프리셋), 판단 유닛이 아니면 없다(편 값을 쓴다)", () => {
    const sources: SideSources = {
      playerOwned: (ownerId) => ownerId === 1,
      online: () => true,
      aggressionOf: () => 900,
      tacticsOf: (unitId) => (unitId === 10 ? { ...presetTactics("defensive"), retreatPct: 80 } : undefined),
    };
    const out = unitRetreats(
      [[unit(10, 1), unit(11, 1), unit(12, 1, false)], [unit(20, 2)]],
      [5, 6],
      sources,
    );
    expect(out).toEqual(
      new Map([
        [10, 80],
        [11, presetTactics("balanced").retreatPct],
        [20, presetTactics(npcPresetOf(900)).retreatPct],
      ]),
    );
  });
});
