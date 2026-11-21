// 조우 편 판단 값 시험 — 유닛 개별 퇴각 기준(D-558 1547 "파티도 없으면 유닛들 개별 참전", 질문 2131 → fixes-1116l), encounterSides.ts.
import { describe, expect, it } from "vitest";
import { npcPresetOf, presetTactics } from "@terra/shared/aiTactics";
import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT } from "../world/unitKinds.ts";
import {
  type SideSources,
  type SideUnit,
  sideCombatTactics,
  unitRetreats,
  unitTactics,
} from "./encounterSides.ts";

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

  it("7축 성향과 충성도가 연결되면 낮은 충성도 휴먼은 개성이 개입하고, 안드로이드/사이보그 본체는 100% 순종한다", () => {
    const fierce = {
      ...DEFAULT_UNIT_TRAITS,
      belligerence: 950,
      boldness: 900,
      autonomy: 900,
      discipline: 100,
    };
    const sources: SideSources = {
      playerOwned: (ownerId) => ownerId === 1,
      online: () => true,
      aggressionOf: () => 500,
      tacticsOf: () => presetTactics("hold"),
      traitsOf: () => fierce,
      loyaltyMilliOf: (unitId) => (unitId === 10 ? 10_000 : unitId === 11 ? null : 10_000),
    };
    const lowLoyaltyHuman = unitTactics(unit(10, 1), 1, sources);
    const nullLoyaltyHuman = unitTactics(unit(11, 1), 1, sources);
    const androidUnit = unitTactics({ ...unit(12, 1), kind: UNIT_KIND_CYBORG_UNIT }, 1, sources);
    const cyborgMain = unitTactics({ ...unit(13, 1), kind: UNIT_KIND_CYBORG }, 1, sources);
    const npcUnit = unitTactics(unit(20, 2), 2, sources);

    // 충성도 10 휴먼은 숨어 버티기(engage=1) 대신 호전 성향이 개입해 engage가 크게 올라간다
    expect(lowLoyaltyHuman.engage).toBeGreaterThan(presetTactics("hold").engage);
    // 만족도 미집계·안드로이드·사이보그 본체는 플레이어 작전 그대로(0‰ 개입)
    expect(nullLoyaltyHuman).toEqual(presetTactics("hold"));
    expect(androidUnit).toEqual(presetTactics("hold"));
    expect(cyborgMain).toEqual(presetTactics("hold"));
    // NPC는 7축 성향에서 직접 산출
    expect(npcUnit.engage).toBeGreaterThanOrEqual(8);

    const map = sideCombatTactics([[unit(10, 1)], [unit(20, 2)]], [1, 2], sources);
    expect(map.get(10)).toEqual(lowLoyaltyHuman);
    expect(map.get(20)).toEqual(npcUnit);
  });
});
