// 투표권(누가 몇 표를 던지나)·지배 가문·지분 과반 — docs/adr/2026-11-21-governance.md 3절, 질문 2355·2356 답(D-580), D-217·D-344·D-349.
// - 독재: 투표권이 없다(D-5057 "독재는 투표가 없다").
// - 민주주의: 그 나라 소속 가문마다 한 표, 가문장이 던진다(2355 가). 플레이어 가문(houseTies.ts와 같은 소속 규칙)과 그 나라 도시의 NPC 가문
//   (npc/cityHouses.ts — NPC 가문의 표는 같은 무게, D-555 1509). 무소속 플레이어는 표가 없다.
// - 자본주의: 그 나라 모든 도시 지분의 합, 한 주 한 표(2356 가). 주주 = 소유 주체: 사용자(그 사람이 던짐), 플레이어 가문 국고(가문장이 던짐),
//   다른 NPC 나라 국고(NPC 규칙식). 그 나라 국고 지분은 표를 던지지 않고, 그 의결권을 다른 주주에게 지분 비례로 나눠 준다(기획 D-581 — 질문 2356
//   국고 지분 표): 주주마다 무게 = 가진 주 + ⌊국고 주 × 가진 주 ÷ 다른 주주 주 합⌋(나머지는 버림 — 몫 비율은 그대로). 다른 주주가 없으면 투표권이
//   비어 정족수를 못 채운다(현상 유지).
// - 지배 가문 = 선출 기록(governance_state) → 없으면 처음 규칙(port.defaultRulingHouse — D-574 10). 지도자 = 지배 가문의 장.
// - 지분 과반(D-344): 지배 쪽(그 나라 국고 — sim rulingFamilyOf와 같은 [임시] 규칙 — + 지배 플레이어 가문 국고)의 지분이 그 나라 도시 지분 합의
//   절반을 넘나. 지분이 하나도 없으면(상장폐지) 과반으로 본다(@terra/sim rulerHasMajority와 같다).
import type { HouseKey } from "@terra/shared/governance";
import type { NpcTraits } from "./npcVote.ts";
import type { GovernanceNation, GovernancePort } from "./port.ts";
import { parseHouseKey } from "./port.ts";
import type { GovernanceStore, StateRow } from "./store.ts";

export interface Voter {
  /** p:/n:(가문) · o:(주주) */
  readonly key: string;
  readonly weight: bigint;
  /** 던지는 플레이어(NPC면 null) */
  readonly userId: string | null;
  readonly npc: boolean;
  /** NPC 규칙식 입력 */
  readonly self: HouseKey | null;
  readonly satisfaction: number | undefined;
  readonly traits: NpcTraits;
  /** 지배 가문 편(국고 지분) */
  readonly loyal: boolean;
}

export interface Electorate {
  readonly voters: readonly Voter[];
  readonly total: bigint;
}

export interface Ruling {
  /** 지금 지배 가문(없으면 null) */
  readonly key: HouseKey | null;
  /** 지도자(지배 플레이어 가문의 장). NPC 지배 가문이면 null */
  readonly leaderUser: string | null;
}

const NEUTRAL: NpcTraits = { aggression: 500, commerce: 500, faith: 500 };

export function createElectorate(o: {
  readonly port: Pick<
    GovernancePort,
    "holdingsOf" | "ownerInfo" | "npcHousesOf" | "citySatisfaction" | "defaultRulingHouse" | "ownerOfHouseRow"
  >;
  readonly store: Pick<GovernanceStore, "playerHousesOf" | "headOf">;
}) {
  const ruling = async (nation: GovernanceNation, state: StateRow | undefined): Promise<Ruling> => {
    const key = state?.rulingHouseKey ?? o.port.defaultRulingHouse(nation);
    const parsed = key === null ? undefined : parseHouseKey(key);
    const leaderUser = parsed && !parsed.npc ? ((await o.store.headOf(parsed.id)) ?? null) : null;
    return { key, leaderUser };
  };

  /** 지배 쪽 지분 몫(‰ — D-344). 지분이 없으면 1000 */
  const rulingSharePm = (nation: GovernanceNation, rulingKey: HouseKey | null): number => {
    const holdings = o.port.holdingsOf(nation);
    const total = holdings.reduce((sum, row) => sum + row.amount, 0n);
    if (total === 0n) return 1000;
    const sides = new Set<number>([nation.ownerId]);
    const parsed = rulingKey === null ? undefined : parseHouseKey(rulingKey);
    const houseOwner = parsed && !parsed.npc ? o.port.ownerOfHouseRow(parsed.id) : undefined;
    if (houseOwner !== undefined) sides.add(houseOwner);
    const own = holdings.filter((row) => sides.has(row.owner)).reduce((sum, row) => sum + row.amount, 0n);
    return Number((own * 1000n) / total);
  };

  const electorate = async (nation: GovernanceNation): Promise<Electorate> => {
    if (nation.regime === "dictatorship") return { voters: [], total: 0n };
    const voters: Voter[] = [];
    if (nation.regime === "democracy") {
      for (const house of await o.store.playerHousesOf(nation.rowId))
        voters.push({
          key: `p:${house.id}`,
          weight: 1n,
          userId: house.head,
          npc: false,
          self: `p:${house.id}`,
          satisfaction: undefined,
          traits: NEUTRAL,
          loyal: false,
        });
      for (const house of o.port.npcHousesOf(nation))
        voters.push({
          key: `n:${house.id}`,
          weight: 1n,
          userId: null,
          npc: true,
          self: `n:${house.id}`,
          satisfaction: o.port.citySatisfaction(house.cityId),
          traits: nation.traits,
          loyal: false,
        });
    } else {
      const holdings = o.port.holdingsOf(nation);
      const treasury = holdings.find((row) => row.owner === nation.ownerId)?.amount ?? 0n;
      const others = holdings.filter((row) => row.owner !== nation.ownerId);
      const othersTotal = others.reduce((sum, row) => sum + row.amount, 0n);
      for (const holding of others) {
        const info = o.port.ownerInfo(holding.owner);
        if (!info) continue;
        const head =
          info.playerHouse && info.factionRow !== null ? await o.store.headOf(info.factionRow) : undefined;
        const userId = info.userId ?? head ?? null;
        if (userId === null && info.traits === null) continue;
        voters.push({
          key: `o:${holding.owner}`,
          // D-581: 국고 지분의 의결권을 지분 비례로 더한다
          weight: holding.amount + (othersTotal > 0n ? (treasury * holding.amount) / othersTotal : 0n),
          userId,
          npc: userId === null,
          self: null,
          satisfaction: info.satisfaction,
          traits: info.traits ?? NEUTRAL,
          loyal: false,
        });
      }
    }
    return { voters, total: voters.reduce((sum, voter) => sum + voter.weight, 0n) };
  };

  return { ruling, rulingSharePm, electorate };
}

export type ElectorateTools = ReturnType<typeof createElectorate>;
