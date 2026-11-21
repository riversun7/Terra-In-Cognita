// 의결 포트 셋째 묶음(줄기 governance-5 — port.ts·portCoup.ts 줄 수 때문에 따로 둔다): 강화(질문 2452)·거래세(2460)·화폐 단계(2453)·가문 독립(2454)·쿠데타 도시
// 떨어져 나가기(D-585)·지도자 신임도 반란 고리(D-585)가 세계에서 읽고 바꾸는 것. 읽기는 거울 세계 메모리, 쓰기는 세력·사회 규칙(NPC와 같은 길)·경제 고리.
// - 강화: 세력·사회 makePeace(강화 조약 — 불가침 기간, NPC와 같다). 받는 쪽이 NPC가 이끄는 나라면 NPC 강화 규칙식(@terra/sim peaceScore — npcRun proposePeace와 같은 셈).
// - 거래세: 경제 고리 setTax(NPC 세율 규칙식과 같은 길 — 그 나라 도시 거래소 세율).
// - 화폐 단계: 경제 bankOverride(지도자 손 조절 나라 → 하루 조절 만분율)·bankPriceCap(목표 물가 상한 — 줄기 gov-coup, D-588 2499). 공식 나라는 표에 없다.
// - 신임도(줄기 gov-coup — D-588 2493): 전쟁 수(세력 wars)·세금 수준(나라 세금 표 + 경제 거래세)을 읽는다.
import type { HouseKey } from "@terra/shared/governance";
import { factionView, houseHoldingsOf, holdingsOf, peaceScore, rivalView } from "@terra/sim";
import { nationTaxesOf } from "../government/nationTax.ts";
import type { World } from "../world/world.ts";
import { setRebellionShifts } from "./approval.ts";
import { taxLevelPm } from "./approvalFactors.ts";
import { houseKeyOfTail } from "./houseShares.ts";
import type { GovernanceNation } from "./port.ts";

export interface GovernancePortLeader {
  /** 강화 조약(전쟁 중일 때만 — 맺었으면 true) */
  makePeace(nation: GovernanceNation, target: GovernanceNation, nowMs: number): Promise<boolean>;
  /** 받는 쪽 NPC 강화 규칙식(점수 > 0이면 받는다) */
  npcAcceptsPeace(proposer: GovernanceNation, target: GovernanceNation, nowMs: number): boolean;
  /** 그 나라 지금 거래세(만분율, 모르면 undefined) */
  tradeTaxOf(nation: GovernanceNation): number | undefined;
  /** 그 나라 지도자가 정한 거래세(nation_taxes.trade_tax_bp, 정하지 않았으면 undefined) */
  leaderTradeTaxOf(nation: GovernanceNation): number | undefined;
  /** 거래세를 바꾼다(그 나라 도시 거래소) */
  setTradeTax(nation: GovernanceNation, bp: number, nowMs: number): void;
  /** 지도자 손 조절 나라(소유 주체 ID → 하루 조절 만분율·목표 물가 상한 천분율 — D-588 2499)를 중앙은행에 건다 */
  installMonetary(byOwner: ReadonlyMap<number, ManualMoney>): void;
  /** 그 나라가 지금 하는 전쟁 수(신임도 — D-588 2493) */
  warCount(nation: GovernanceNation): number;
  /** 그 나라 세금 수준(‰ — 소득세 ÷ 10 + 주민세 + 거래세 ÷ 10, approvalFactors.ts taxLevelPm). 모르면 undefined */
  taxLevelOf(nation: GovernanceNation): number | undefined;
  /** 신임도 반란 문턱 보정(소유 주체 ID → 만족도 점)을 건다 */
  installRebellionShifts(byOwner: ReadonlyMap<number, number>): void;
  /** 그 도시 지분: 가문 열쇠마다 가진 주 수와 전체 주 수 */
  cityShares(cityId: number): { readonly houses: ReadonlyMap<HouseKey, bigint>; readonly total: bigint };
  /** 그 나라 세력 유닛(군대 — 경비대 포함) */
  armyUnits(nation: GovernanceNation): readonly number[];
  /** 그 유닛이 선 도시(모르면 undefined) */
  unitCity(unitId: number): number | undefined;
  /** 새 나라의 체제를 바꾼다(쿠데타로 떨어져 나간 도시국가 = 독재 D-582) */
  setNationRegime(nationRow: number, regime: "dictatorship" | "democracy" | "capitalism"): void;
}

/** 지도자 손 조절 한 나라(줄기 governance-5·gov-coup) */
export interface ManualMoney {
  readonly rateBp: number;
  /** 목표 물가 상한(천분율) — 물가 지수가 이 값 이상이면 발행을 막는다(D-588 2499) */
  readonly capMilli: number;
}

type LeaderWorld = Pick<World, "status" | "npc" | "persistence">;

export function worldGovernancePortLeader(world: () => LeaderWorld | undefined): GovernancePortLeader {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.npc && w.persistence
      ? { npc: w.npc, persistence: w.persistence }
      : undefined;
  };
  return {
    async makePeace(nation, target, nowMs) {
      const l = live();
      const a = l?.npc.world.factions.get(nation.ownerId);
      const b = l?.npc.world.factions.get(target.ownerId);
      if (!l || !a || !b || !a.wars.has(b.id)) return false;
      l.npc.society.makePeace(a, b, nowMs);
      if (a.wars.has(b.id)) return false;
      await l.npc.tick(true);
      return true;
    },
    npcAcceptsPeace(proposer, target, nowMs) {
      const l = live();
      const ctx = l?.npc.houseRecruit.context();
      const from = l?.npc.world.factions.get(proposer.ownerId);
      const to = l?.npc.world.factions.get(target.ownerId);
      if (!ctx || !from || !to) return false;
      return peaceScore(factionView(ctx, to, nowMs), rivalView(ctx, to, from, nowMs), ctx.c.npc) > 0;
    },
    tradeTaxOf: (nation) => live()?.npc.economy?.economy.taxOf.get(nation.ownerId),
    leaderTradeTaxOf(nation) {
      const l = live();
      const row = l ? nationTaxesOf(l.persistence.ledger)?.forOwner(nation.ownerId) : undefined;
      const bp = row?.tradeTaxBp;
      return bp === null || bp === undefined ? undefined : bp;
    },
    setTradeTax(nation, bp, nowMs) {
      const l = live();
      const faction = l?.npc.world.factions.get(nation.ownerId);
      const economy = l?.npc.economy;
      if (!faction || !economy) return;
      economy.run.hooks.setTax?.(faction, Math.max(0, Math.trunc(bp)), nowMs);
    },
    installMonetary(byOwner) {
      const economy = live()?.npc.economy?.economy;
      if (!economy) return;
      const table = new Map(byOwner);
      economy.bankOverride = table.size === 0 ? undefined : (factionId) => table.get(factionId)?.rateBp;
      economy.bankPriceCap = table.size === 0 ? undefined : (factionId) => table.get(factionId)?.capMilli;
    },
    warCount: (nation) => live()?.npc.world.factions.get(nation.ownerId)?.wars.size ?? 0,
    taxLevelOf(nation) {
      const l = live();
      if (!l) return undefined;
      const row = nationTaxesOf(l.persistence.ledger)?.forOwner(nation.ownerId);
      return taxLevelPm({
        incomeTaxBp: row?.incomeTaxBp,
        residentTaxPm: row?.residentTaxPm,
        tradeTaxBp: l.npc.economy?.economy.taxOf.get(nation.ownerId),
      });
    },
    installRebellionShifts(byOwner) {
      const l = live();
      if (l) setRebellionShifts(l.npc.world, byOwner);
    },
    cityShares(cityId) {
      const l = live();
      const houses = new Map<HouseKey, bigint>();
      let total = 0n;
      if (!l) return { houses, total };
      for (const row of holdingsOf(l.npc.world.book, cityId)) total += row.amount;
      for (const row of houseHoldingsOf(l.npc.world.book, cityId)) {
        total += row.amount;
        const key = houseKeyOfTail(row.house);
        if (key && row.amount > 0n) houses.set(key, (houses.get(key) ?? 0n) + row.amount);
      }
      return { houses, total };
    },
    armyUnits(nation) {
      const faction = live()?.npc.world.factions.get(nation.ownerId);
      return faction ? [...faction.units].toSorted((a, b) => a - b) : [];
    },
    unitCity: (unitId) => live()?.npc.world.units.get(unitId)?.city,
    setNationRegime(nationRow, regime) {
      const l = live();
      const owner = l?.npc.houses.ownerOfRow(nationRow);
      const faction = owner === undefined ? undefined : l?.npc.world.factions.get(owner);
      if (!l || !faction || owner === undefined) return;
      faction.regime = regime;
      l.npc.houses.flush(owner);
    },
  };
}
