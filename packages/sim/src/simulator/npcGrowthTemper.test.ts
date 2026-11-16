// NPC 도시 성장 성향 변수 시험 — 기획 D-554 1187·1188, D-572 질문 1995(simulator/npcGrowthTemper.ts)
import { describe, expect, it } from "vitest";
import { TEST_NPC_COEFFICIENTS } from "../npc/coefficients.ts";
import type { Traits } from "../npc/traits.ts";
import { leaderTemperOf } from "./npcGatherTier.ts";
import { NO_GROWTH_TEMPER, growthTemperOf } from "./npcGrowthTemper.ts";

const MID: Traits = { aggression: 500, commerce: 500, faith: 500, station: 500 };
/** 지도자 기질을 끈 계수 */
const NO_LEADER = { ...TEST_NPC_COEFFICIENTS, buildCapLeaderPm: 0 };

describe("도시 성장 성향 몫", () => {
  it("칸이 모두 0이면 옛 판(몫 없음)", () => {
    const off = {
      ...TEST_NPC_COEFFICIENTS,
      buildCapTemper: 0,
      buildCapCommercePm: 0,
      buildCapLeaderPm: 0,
      buildLodgingFaith: 0,
      buildLodgingCommerce: 0,
    };
    expect(growthTemperOf(7, { id: 3, traits: { ...MID, commerce: 1000, faith: 0 } }, off)).toEqual(
      NO_GROWTH_TEMPER,
    );
  });

  it("상업이 높으면 상한이 크고 붐빔 숙소는 나중, 신앙이 높으면 숙소가 먼저(축 끝에서 칸 값)", () => {
    const merchant = growthTemperOf(1, { id: 1, traits: { ...MID, commerce: 1000 } }, NO_LEADER);
    // 600‰ × 4채 ÷ 1000 = 2.4 → 2채, 숙소 −100
    expect(merchant).toEqual({ capDelta: 2, lodgingTilt: -100 });
    const pious = growthTemperOf(1, { id: 1, traits: { ...MID, commerce: 0, faith: 1000 } }, NO_LEADER);
    expect(pious).toEqual({ capDelta: -2, lodgingTilt: 250 });
    expect(growthTemperOf(1, { id: 1, traits: MID }, NO_LEADER)).toEqual(NO_GROWTH_TEMPER);
  });

  it("지도자 기질(채집 티어와 같은 값)을 더하고, 같은 시드·세력이면 같은 값", () => {
    const c = TEST_NPC_COEFFICIENTS;
    const leader = leaderTemperOf(42, { id: 5 }, c);
    const temper = growthTemperOf(42, { id: 5, traits: MID }, c);
    expect(temper.capDelta).toBe(Math.trunc((leader * 4) / 1000) + 0);
    expect(growthTemperOf(42, { id: 5, traits: MID }, c)).toEqual(temper);
    // 세력마다 기질이 달라 상한 몫도 갈린다(여러 세력 가운데 적어도 두 값)
    const deltas = new Set(
      Array.from(
        { length: 40 },
        (_, id) => growthTemperOf(42, { id, traits: { ...MID, commerce: 900 } }, c).capDelta,
      ),
    );
    expect(deltas.size).toBeGreaterThan(1);
  });
});
