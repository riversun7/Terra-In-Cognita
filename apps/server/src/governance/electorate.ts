// 투표권(누가 몇 표를 던지나)·지배 가문·지분 과반 — docs/adr/2026-11-21-governance.md 3절, 질문 2355·2356 답(D-580), D-217·D-344·D-349.
// - 독재: 투표권이 없다(D-5057 "독재는 투표가 없다").
// - 민주주의: 그 나라 소속 가문마다 한 표, 가문장이 던진다(2355 가). 플레이어 가문(houseTies.ts와 같은 소속 규칙)과 그 나라 도시의 NPC 가문
//   (npc/cityHouses.ts — NPC 가문의 표는 같은 무게, D-555 1509). 무소속 플레이어는 표가 없다.
// - 자본주의: 그 나라 모든 도시 지분의 합, 한 주 한 표(2356 가). 주주 = 소유 주체: 사용자(그 사람이 던짐), 플레이어 가문 국고(가문장이 던짐),
//   다른 NPC 나라 국고(NPC 규칙식). 그 나라 국고 지분은 표를 던지지 않고, 그 의결권을 다른 주주에게 지분 비례로 나눠 준다(기획 D-581 — 질문 2356
//   국고 지분 표): 주주마다 무게 = 가진 주 + ⌊국고 주 × 가진 주 ÷ 다른 주주 주 합⌋(나머지는 버림 — 몫 비율은 그대로). 다른 주주가 없으면 투표권이
//   비어 정족수를 못 채운다(현상 유지).
// - 지배 가문 = 선출 기록(governance_state) → 없으면 처음 규칙(port.defaultRulingHouse — D-574 10). 지도자 = 지배 가문의 장.
// - 지분 과반(D-344): 바뀜(governance-2 — 기획 대조 D-298 "의결권도 국고가 받는다. 지도자가 사적으로 갖지 않는다"·D-581·D-580 6 "과반의 지분을 사들이는
//   방법"): 지배 쪽 = 지배 가문의 지분(가문 지분 계정 p:/n: + 지배 플레이어 가문 소유 주체 계정 — 그 나라 국고가 아닐 때)만. 국고 지분은 지배 쪽으로 치지 않고
//   D-581대로 다른 주주에게 비례로 나눈 것으로 센다 = 지배 쪽 ÷ (합 − 국고). 국고만 지분을 가진 나라의 지도자는 지분을 사지 않으면 과반이 아니다.
//   지분이 하나도 없으면(상장폐지) 과반으로 본다(@terra/sim rulerHasMajority와 같다).
// - 자본주의 가문 지분 계정(D-338·D-582)도 주주다: 플레이어 가문(p:)은 가문장이, NPC 가문(n:)은 NPC 규칙식(그 가문 도시 만족도·나라 성향)이 던진다.
// - 빈자리(질문 2403 답 D-582): governance_state.vacant_since_ms가 있으면 지배 가문·지도자가 없다.
// - 도시 단위 투표(사용자 결정 2026-11-25 "투표는 도시단위 나라단위 따로 있다", ADR 2026-11-25-vacant-government-and-city-vote.md): electorate에
//   도시를 주면 투표권을 그 도시로 좁힌다 — 민주주의 = 그 도시에 소속했거나 그 도시를 가진 플레이어 가문 + 그 도시의 NPC 가문, 자본주의 =
//   그 도시 지분의 주주(국고 지분의 의결권 나누기는 같다). 체제는 나라 체제를 따른다(독재 = 투표 없음).
import { type HouseKey, isHouseKey } from "@terra/shared/governance";
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
    if (state?.vacantSinceMs !== null && state?.vacantSinceMs !== undefined)
      return { key: null, leaderUser: null };
    const key = state?.rulingHouseKey ?? o.port.defaultRulingHouse(nation);
    const parsed = key === null ? undefined : parseHouseKey(key);
    const leaderUser = parsed && !parsed.npc ? ((await o.store.headOf(parsed.id)) ?? null) : null;
    return { key, leaderUser };
  };

  /** 지배 쪽 지분 몫(‰ — D-344, 국고는 빼고 D-581 비례 나눔으로 센다). 지분이 없으면 1000, 국고만 있으면 0 */
  const shareOf = (nation: GovernanceNation, rulingKey: HouseKey | null): number => {
    const holdings = o.port.holdingsOf(nation);
    const total = holdings.reduce((sum, row) => sum + row.amount, 0n);
    if (total === 0n) return 1000;
    const treasuryKey = `o:${String(nation.ownerId)}`;
    const others = total - (holdings.find((row) => row.holder === treasuryKey)?.amount ?? 0n);
    if (others <= 0n || rulingKey === null) return 0;
    const sides = new Set<string>([rulingKey]);
    const parsed = parseHouseKey(rulingKey);
    const houseOwner = parsed && !parsed.npc ? o.port.ownerOfHouseRow(parsed.id) : undefined;
    if (houseOwner !== undefined && houseOwner !== nation.ownerId) sides.add(`o:${String(houseOwner)}`);
    const own = holdings.filter((row) => sides.has(row.holder)).reduce((sum, row) => sum + row.amount, 0n);
    return Number((own * 1000n) / others);
  };

  /**
   * 독재 과반 셈(바뀜 gov-fix-2 — 질문 2528 나, D-587 2·D-344 "독재 나라 도시 = 지배 가문 지분 > 50% 불변 조건"): 도시마다 지배 쪽 몫을 세어 가장 낮은 도시 값(‰).
   * 독재로 바꾸는 조건(> 500)과 지키는 조건(지분 시장 과반 끝 — cityShares/market.ts majorityCaps, 도시마다)이 모두 이 셈이다. 지분이 없는 도시(상장폐지)는 1000,
   * 도시가 없으면 1000. 자본주의 의결권(표 무게)은 나라 모든 도시 합 그대로다(D-580 3 — electorate)
   */
  const rulingSharePm = (nation: GovernanceNation, rulingKey: HouseKey | null): number =>
    nation.cities.reduce(
      (low, cityId) => Math.min(low, shareOf({ ...nation, cities: [cityId] }, rulingKey)),
      1000,
    );

  const electorate = async (wholeNation: GovernanceNation, cityId?: number): Promise<Electorate> => {
    if (wholeNation.regime === "dictatorship") return { voters: [], total: 0n };
    // 도시 단위 투표: 그 나라 도시가 아니면 투표권이 비어 있다
    const nation =
      cityId === undefined
        ? wholeNation
        : { ...wholeNation, cities: wholeNation.cities.includes(cityId) ? [cityId] : [] };
    if (cityId !== undefined && nation.cities.length === 0) return { voters: [], total: 0n };
    const inCity = (house: { readonly cityId: number }): boolean =>
      cityId === undefined || house.cityId === cityId;
    const voters: Voter[] = [];
    if (nation.regime === "democracy") {
      for (const house of await o.store.playerHousesOf(nation.rowId, cityId))
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
      for (const house of o.port.npcHousesOf(wholeNation).filter(inCity))
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
      const treasuryKey = `o:${String(nation.ownerId)}`;
      const treasury = holdings.find((row) => row.holder === treasuryKey)?.amount ?? 0n;
      const others = holdings.filter((row) => row.holder !== treasuryKey);
      const othersTotal = others.reduce((sum, row) => sum + row.amount, 0n);
      // NPC 가문 도시(가문 지분 계정의 NPC 규칙식 만족도)
      const npcCity = new Map(o.port.npcHousesOf(wholeNation).map((house) => [house.id, house.cityId]));
      for (const holding of others) {
        // D-581: 국고 지분의 의결권을 지분 비례로 더한다
        const weight = holding.amount + (othersTotal > 0n ? (treasury * holding.amount) / othersTotal : 0n);
        const house = parseHouseKey(holding.holder);
        if (house && isHouseKey(holding.holder)) {
          const head = house.npc ? undefined : await o.store.headOf(house.id);
          if (!house.npc && head === undefined) continue;
          const houseCity = npcCity.get(house.id);
          voters.push({
            key: holding.holder,
            weight,
            userId: head ?? null,
            npc: house.npc,
            self: holding.holder,
            satisfaction:
              house.npc && houseCity !== undefined ? o.port.citySatisfaction(houseCity) : undefined,
            traits: house.npc ? nation.traits : NEUTRAL,
            loyal: false,
          });
          continue;
        }
        const ownerId = Number(holding.holder.slice(2));
        const info = o.port.ownerInfo(ownerId);
        if (!info) continue;
        const head =
          info.playerHouse && info.factionRow !== null ? await o.store.headOf(info.factionRow) : undefined;
        const userId = info.userId ?? head ?? null;
        if (userId === null && info.traits === null) continue;
        voters.push({
          key: holding.holder,
          weight,
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
