// npcAi 라우터 시험 — 권한(tuning:read, dev·admin만), 7축 가상 판단 결과·요인 분해·담은 변경값 반영
import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createEconomyServices } from "../economyView/services.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { NO_HOLDINGS } from "../holdings/reads.ts";
import { createMailServices } from "../mail/list.ts";
import { createRosterServices } from "../roster/services.ts";
import { NO_VITALS } from "../vitals/reads.ts";
import type { TrpcContext, Viewer } from "./context.ts";
import { createCallerFactory } from "./init.ts";
import { appRouter } from "./router.ts";

const PLAYER: Viewer = { id: "u-player", loginId: "player", roles: ["player"] };
const DEV: Viewer = { id: "u-dev", loginId: "dev", roles: ["dev"] };

function callerFor(viewer: Viewer) {
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => 0,
    viewer: () => Promise.resolve(viewer),
    admin: undefined,
    settings: undefined,
    planetEditor: undefined,
    home: createHomeServices(),
    roster: createRosterServices(),
    faction: createFactionScreenServices(),
    mail: createMailServices(),
    holdings: NO_HOLDINGS,
    vitals: NO_VITALS,
    economy: createEconomyServices({ catalog: emptyEconomyCatalog("test") }),
  };
  return createCallerFactory(appRouter)(ctx);
}

const SAMPLE_INPUT = {
  traits: { ...DEFAULT_UNIT_TRAITS, belligerence: 900, boldness: 850, greed: 800 },
  cities: 2,
  strength: 2000,
  rivalStrength: 1000,
  rivalAtWar: false,
  rivalRebel: false,
  treasury: 50_000,
  satisfaction: 75,
  foodPm: 1000,
  crowded: true,
  researchBlocked: false,
  poor: false,
  hasOverlord: false,
  overlordStrength: 1500,
  vassals: 0,
  hasRuin: false,
  roll: 0,
};

describe("npcAi 라우터", () => {
  it("플레이어는 FORBIDDEN으로 거절된다", async () => {
    await expect(callerFor(PLAYER).npcAi.previewDecision(SAMPLE_INPUT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("dev 계정은 7축 판단 점수 분해표와 정책 규칙식 결과를 받는다", async () => {
    const res = await callerFor(DEV).npcAi.previewDecision(SAMPLE_INPUT);
    expect(res.actions.length).toBeGreaterThan(0);
    expect(res.chosen.kind).toBe("attack");
    expect(res.policies.sellPct).toBeGreaterThan(100);
    expect(res.policies.effectiveAttackRatioPm).toBeLessThan(1200);
    // 담은 변경값으로 탐색 온도를 올리면 결과에 그대로 반영된다
    const resTemp = await callerFor(DEV).npcAi.previewDecision({
      ...SAMPLE_INPUT,
      tuningValues: { npc_ai_decision_temp_pm: 300 },
    });
    expect(resTemp.decisionTempPm).toBe(300);
  });

  it("previewUnitSchedule은 24시간 8상태 일과표와 순찰 반경을 반환하고 플레이어는 거절된다", async () => {
    const input = {
      traits: { ...DEFAULT_UNIT_TRAITS, discipline: 800, boldness: 700, openness: 600 },
      role: "guard" as const,
      hasWorkplace: false,
      hasMarket: true,
    };
    await expect(callerFor(PLAYER).npcAi.previewUnitSchedule(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const res = await callerFor(DEV).npcAi.previewUnitSchedule(input);
    expect(res.slots).toHaveLength(24);
    expect(res.patrolRadiusCells).toBeGreaterThanOrEqual(8);
  });

  it("previewCombatMove는 D-558 전개 방식과 WP-4 이동 AI 판정을 반환하고 플레이어는 거절된다", async () => {
    const input = {
      traits: { ...DEFAULT_UNIT_TRAITS, belligerence: 850, boldness: 800, autonomy: 850, discipline: 200 },
      unitKind: "human" as const,
      loyalty: 20,
      playerPreset: "hold" as const,
      range: 1,
      hpPct: 80,
      staminaPct: 80,
    };
    await expect(callerFor(PLAYER).npcAi.previewCombatMove(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const res = await callerFor(DEV).npcAi.previewCombatMove(input);
    expect(res.deployment).toBe("assault");
    expect(res.overridePm).toBeGreaterThan(400);
    expect(res.runsRetreating).toBe(true);
  });
});
