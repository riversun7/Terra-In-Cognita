// NPC 가문 자율 AI 런타임(npcHouseAi.ts) — docs/adr/2026-11-20-npc-autonomous-ai.md 1·4절
// 각 NPC 가문의 7축 실효 성향(가문장 + 가문원 합성 또는 traits_override)을 산출하고,
// houseDecideMinMs~houseDecideMaxMs 주기로 가문 행동(금고 환류·도시 투자·배당·분가·이주) 및 국가 안건 투표를 수행한다.
import type { UnitTraits } from "@terra/shared/unitTraits";
import { type SocietyCoefficients, mix32 } from "@terra/sim";
import {
  type HouseProposalKind,
  type HouseVoteChoice,
  type NpcHouseDecision,
  decideHouseAction,
  decideHouseVote,
  houseDecideIntervalMs,
  resolveHouseEffectiveTraits,
} from "@terra/sim/npcAi";

export interface NpcHouseSnapshot {
  readonly houseId: number;
  readonly isRulingHouse: boolean;
  readonly headTraits?: UnitTraits | undefined;
  readonly memberTraits: readonly UnitTraits[];
  readonly override?: UnitTraits | undefined;
  readonly vaultBalance: bigint;
  readonly citySatisfaction: number;
  readonly cityCrowded: boolean;
  readonly cityNeedsInvestment: boolean;
  readonly hasMigrationTarget: boolean;
}

export interface NpcHouseAiService {
  /** 가문 하나의 7축 실효 성향 계산(override > 가문장+가문원 합성) */
  effectiveTraitsOf(
    snapshot: Pick<NpcHouseSnapshot, "headTraits" | "memberTraits" | "override" | "citySatisfaction">,
  ): UnitTraits;
  /** 민주·자본 국가 안건 투표 판정 */
  vote(
    snapshot: Pick<NpcHouseSnapshot, "headTraits" | "memberTraits" | "override" | "citySatisfaction">,
    proposal: HouseProposalKind,
    atWar?: boolean,
  ): HouseVoteChoice;
  /** 판단 주기가 도래한 NPC 가문들을 1회 평가하고 결정 목록을 반환한다(npc_ai_house_enabled=0이면 빈 목록) */
  tick(
    houses: readonly NpcHouseSnapshot[],
    nowMs: number,
  ): readonly {
    readonly houseId: number;
    readonly traits: UnitTraits;
    readonly decision: NpcHouseDecision;
  }[];
  /** 마지막 가문 결정 조회 */
  lastDecisionOf(houseId: number): NpcHouseDecision | undefined;
}

export function createNpcHouseAi(o: {
  readonly worldSeed: number;
  readonly rules: () => SocietyCoefficients;
}): NpcHouseAiService {
  const nextAt = new Map<number, number>();
  const steps = new Map<number, number>();
  const lastDecision = new Map<number, NpcHouseDecision>();

  const effectiveTraitsOf: NpcHouseAiService["effectiveTraitsOf"] = (snap) => {
    const ai = o.rules().npcAi;
    return resolveHouseEffectiveTraits({
      leader: snap.headTraits,
      members: snap.memberTraits,
      override: snap.override,
      avgLoyalty: snap.citySatisfaction,
      ai,
    });
  };

  return {
    effectiveTraitsOf,

    vote(snapshot, proposal, atWar = false) {
      const traits = effectiveTraitsOf(snapshot);
      return decideHouseVote(traits, proposal, {
        citySatisfaction: snapshot.citySatisfaction,
        atWar,
      });
    },

    tick(houses, nowMs) {
      const c = o.rules();
      if (c.npcAi.houseAiEnabled !== 1) return [];
      const results: { houseId: number; traits: UnitTraits; decision: NpcHouseDecision }[] = [];
      for (const h of houses) {
        const due = nextAt.get(h.houseId);
        const step = steps.get(h.houseId) ?? 0;
        const roll =
          mix32(o.worldSeed ^ Math.imul(h.houseId, 0x9e37_79b1) ^ Math.imul(step + 1, 0x85eb_ca6b)) >>> 0;
        if (due === undefined) {
          // 최초 실행은 전체 가문이 동시에 몰리지 않게 첫 주기를 시드 흩기
          const interval = houseDecideIntervalMs(roll, c.npcAi);
          nextAt.set(h.houseId, nowMs + (roll % Math.max(1, interval)));
          continue;
        }
        if (nowMs < due) continue;
        const traits = effectiveTraitsOf(h);
        const decision = decideHouseAction(
          {
            houseId: h.houseId,
            traits,
            isRulingHouse: h.isRulingHouse,
            vaultBalance: h.vaultBalance,
            memberCount: h.memberTraits.length,
            citySatisfaction: h.citySatisfaction,
            cityCrowded: h.cityCrowded,
            cityNeedsInvestment: h.cityNeedsInvestment,
            hasMigrationTarget: h.hasMigrationTarget,
            limits: {
              feeMax: c.house.npcEntryFeeMax,
              grantMax: c.house.npcEntryGrantMax,
              vaultReturnMinPm: c.house.npcVaultReturnMinPm,
              vaultReturnMaxPm: c.house.npcVaultReturnMaxPm,
              investMinVault: BigInt(c.house.villageCost),
              dividendMinVault: 5_000n,
              branchMinMembers: 4,
            },
          },
          roll,
          c.npcAi.decisionTempPm,
        );
        lastDecision.set(h.houseId, decision);
        steps.set(h.houseId, step + 1);
        nextAt.set(h.houseId, nowMs + houseDecideIntervalMs(roll ^ 0x27d4_eb2d, c.npcAi));
        results.push({ houseId: h.houseId, traits, decision });
      }
      return results;
    },

    lastDecisionOf(houseId) {
      return lastDecision.get(houseId);
    },
  };
}
