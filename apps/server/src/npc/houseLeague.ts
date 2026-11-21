// 가문 연맹(도시의 NPC 가문 모임) 기금과 투자 집행 — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (가문 연맹)". 판단은 @terra/sim/npcAi leagueBrain.ts.
// 하루 끝, 가문세·돌봄 배당(houseCare.ts) 다음에 돈다. NPC 가문이 있는 도시마다:
// ① 분담금: 그 도시 가문 금고 × 설정 칸 npc_ai_league_dues_pm → 연맹 기금(원장 시스템 계정 league:city:<도시 ID>:<화폐>).
// ② 대표 = 그 도시에 사는 가문원이 가장 많은 가문(같으면 작은 가문 ID)의 가문장. 대표 성향이 투자 하나를 고른다.
// ③ 집행(기금이 비용 이상일 때만 — 모자라면 모은다):
//    - 확장·생산: 기금 → 나라 국고(league_invest_expand·league_invest_production). 한 번에 설정 칸 npc_ai_league_lot 이상 모였을 때 모인 만큼.
//      국고는 세력 판단이 새 마을·알박기 재료, 증축 재료를 사는 돈이다(둘은 쓰임 표시만 다르다 — 무엇을 지을지는 세력 판단이 정한다).
//    - 군사: 그 도시 구인 카드 가운데 기금으로 살 수 있는 가장 좋은(스탯 합이 큰) 카드를 경비대로 들인다(값은 기금에서 소각, 구인은 값을 이미
//      낸 것으로 — 시뮬 recruit prepaid). 좋은 카드일수록 비싸다.
//    - 기술: 그 도시 연구 레벨 +1(값 = 연구 짓기 기준 × 다음 레벨 — 높을수록 비싸다, 기금에서 소각). 상한(techGroundMax)에 닿으면 후보가 아니다.
// 가문 AI 스위치(npc_ai_house_enabled)가 꺼지면 하지 않는다. 서버만의 고리(시뮬에는 가문이 없다).
import { DEFAULT_UNIT_TRAITS, type UnitTraits } from "@terra/shared/unitTraits";
import { type SimCity, type SimUnit, type SocietyCoefficients, cityHousingCap } from "@terra/sim";
import {
  type LeagueInvestment,
  type LeagueOptions,
  chooseLeagueInvestment,
  leagueDuesOf,
  leagueTechCost,
} from "@terra/sim/npcAi";
import type { Ledger } from "../economy/ledger.ts";
import { npcHouseVaultCode } from "./rulingVault.ts";

/** 연맹 기금 시스템 계정 코드 */
export const leagueFundCode = (cityId: number, asset: string): string => `league:city:${cityId}:${asset}`;

export interface HouseLeagueDay {
  /** 분담금을 낸 가문 수 */
  dues: number;
  /** 집행한 투자 수(종류마다) */
  invested: Record<LeagueInvestment, number>;
}

export const emptyLeagueDay = (): HouseLeagueDay => ({
  dues: 0,
  invested: { expand: 0, production: 0, military: 0, tech: 0 },
});

export interface HouseLeague {
  day(nowMs: number): HouseLeagueDay;
}

/** 연맹이 보는 세력(전쟁 중인가) */
interface LeagueFaction {
  readonly wars: { readonly size: number };
}

/** 연맹이 쓰는 NPC 판단 맥락의 몫(구인·세력·연구 기준 값) — @terra/sim NpcContext가 이 모양이다 */
export interface LeagueNpc<F extends LeagueFaction> {
  readonly world: {
    readonly factions: { get(id: number): F | undefined };
    readonly cities: { get(id: number): { researchLevel: number } | undefined };
  };
  readonly settings: { readonly researchBuildCost: bigint };
  readonly society?:
    | {
        recruitView(
          hirer: F,
          cityId: number,
          nowMs: number,
        ):
          | {
              readonly taken: number;
              readonly cards: readonly {
                readonly slot: number;
                readonly total: number;
                readonly cost: bigint;
              }[];
            }
          | undefined;
        recruit(
          hirer: F,
          cityId: number,
          slot: number,
          nowMs: number,
          guard?: boolean,
          prepaid?: boolean,
        ): unknown;
      }
    | undefined;
}

export function createHouseLeague<F extends LeagueFaction>(o: {
  readonly ledger: Pick<Ledger, "systemAccount" | "ownerAccount" | "balance" | "post">;
  readonly rules: () => SocietyCoefficients;
  readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "city" | "guard">>;
  readonly cities: ReadonlyMap<number, Pick<SimCity, "id" | "owner" | "housing" | "researchLevel">>;
  readonly currencyOf: (owner: number) => string | undefined;
  readonly housesOfCity: (cityId: number) => readonly number[];
  readonly membersOf: (houseId: number) => readonly number[];
  readonly headOf: (houseId: number) => number | undefined;
  readonly traitsOf: (unitId: number) => UnitTraits | undefined;
  /** NPC 판단 맥락(구인·세력·연구 기준 값). 없으면 군사·기술은 후보가 아니다 */
  readonly npc: () => LeagueNpc<F> | undefined;
}): HouseLeague {
  return {
    day(nowMs) {
      const out = emptyLeagueDay();
      const c = o.rules();
      if (c.npcAi.houseAiEnabled !== 1) return out;
      const ctx = o.npc();
      const population = new Map<number, number>();
      for (const unit of o.units.values()) population.set(unit.city, (population.get(unit.city) ?? 0) + 1);
      for (const [cityId, city] of [...o.cities].toSorted((a, b) => a[0] - b[0])) {
        const houses = o.housesOfCity(cityId).toSorted((a, b) => a - b);
        if (houses.length === 0) continue;
        const currency = o.currencyOf(city.owner);
        if (!currency) continue;
        const fund = o.ledger.systemAccount(leagueFundCode(cityId, currency), currency);
        // ① 분담금 + ② 대표
        let lead: { houseId: number; members: number } | undefined;
        for (const houseId of houses) {
          let members = 0;
          for (const unitId of o.membersOf(houseId)) {
            const unit = o.units.get(unitId);
            if (unit && unit.city === cityId && unit.guard !== true) members += 1;
          }
          if (members === 0) continue;
          if (!lead || members > lead.members) lead = { houseId, members };
          const vault = o.ledger.systemAccount(npcHouseVaultCode(houseId, currency), currency);
          const dues = leagueDuesOf(o.ledger.balance(vault), c.npcAi.leagueDuesPm);
          if (dues <= 0n) continue;
          o.ledger.post({
            kind: "league_dues",
            atMs: nowMs,
            entries: [
              { account: vault, amount: -dues },
              { account: fund, amount: dues },
            ],
          });
          out.dues += 1;
        }
        if (!lead) continue;
        const balance = o.ledger.balance(fund);
        if (balance <= 0n) continue;
        const head = o.headOf(lead.houseId);
        const traits = (head === undefined ? undefined : o.traitsOf(head)) ?? DEFAULT_UNIT_TRAITS;
        const faction = ctx?.world.factions.get(city.owner);
        // 군사: 기금으로 살 수 있는 가장 좋은 카드(없으면 가장 싼 카드를 목표로 모은다)
        const view = ctx && faction ? ctx.society?.recruitView(faction, cityId, nowMs) : undefined;
        const open = (view?.cards ?? []).filter((card) =>
          view ? (view.taken & (1 << card.slot)) === 0 : false,
        );
        const buyable = open
          .filter((card) => card.cost <= balance)
          .toSorted((a, b) => b.total - a.total || a.slot - b.slot)[0];
        const cheapest = open.toSorted((a, b) =>
          a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : a.slot - b.slot,
        )[0];
        const card = buyable ?? cheapest;
        const lot = BigInt(Math.max(1, Math.trunc(c.npcAi.leagueLot)));
        const support = { cost: balance > lot ? balance : lot };
        const options: LeagueOptions = {
          expand: support,
          production: support,
          military: card ? { cost: card.cost } : undefined,
          tech:
            ctx && city.researchLevel < c.techGroundMax
              ? { cost: leagueTechCost(ctx.settings.researchBuildCost, city.researchLevel) }
              : undefined,
        };
        const decision = chooseLeagueInvestment({
          traits,
          fund: balance,
          options,
          crowded: (population.get(cityId) ?? 0) >= cityHousingCap(city),
          atWar: (faction?.wars.size ?? 0) > 0,
        });
        if (!decision.chosen || !decision.affordable) continue;
        const sink = o.ledger.systemAccount(`sink:${currency}`, currency);
        if (decision.chosen === "expand" || decision.chosen === "production") {
          o.ledger.post({
            kind: `league_invest_${decision.chosen}`,
            atMs: nowMs,
            entries: [
              { account: fund, amount: -decision.cost },
              { account: o.ledger.ownerAccount(city.owner, currency), amount: decision.cost },
            ],
          });
        } else if (decision.chosen === "military") {
          // 구인이 되어야 값을 태운다(자리 없음 등으로 못 들이면 기금은 그대로)
          if (!ctx || !faction || !card) continue;
          if (!ctx.society?.recruit(faction, cityId, card.slot, nowMs, true, true)) continue;
          o.ledger.post({
            kind: "league_invest_military",
            atMs: nowMs,
            entries: [
              { account: fund, amount: -decision.cost },
              { account: sink, amount: decision.cost },
            ],
          });
        } else {
          const live = ctx?.world.cities.get(cityId);
          if (!live) continue;
          live.researchLevel += 1;
          o.ledger.post({
            kind: "league_invest_tech",
            atMs: nowMs,
            entries: [
              { account: fund, amount: -decision.cost },
              { account: sink, amount: decision.cost },
            ],
          });
        }
        out.invested[decision.chosen] += 1;
      }
      return out;
    },
  };
}
