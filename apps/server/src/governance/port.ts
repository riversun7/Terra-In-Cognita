// 의결 서비스가 세계에서 읽고 바꾸는 것(포트) — 거울 세계(NPC 사회 런타임)·원장 지분·소유 주체를 이 모양 하나로 감싼다. 시험은 같은 모양을 쓴다.
// docs/adr/2026-11-21-governance.md 2절. 읽기는 거울 세계 메모리만 본다(도시 시장 등 경제 값은 건드리지 않는다).
// - 나라 = 거울 세계에서 살아 있고 위 세력이 없는 세력(NPC 나라·독립 플레이어 가문 나라). 봉신은 위 나라의 가문으로 든다(D-250·D-329 87).
// - 지분 = 그 나라 모든 도시의 도시 지분(원장 자산 share_<도시 ID>, D-130·D-293 — 질문 2356 가) 주체마다 합.
// - 처음 지배 가문 = NPC 나라는 수도에서 처음 세운 NPC 가문(D-574 10, npc/cityHouses.ts rulingHouseOf), 플레이어 가문 나라는 그 가문.
// - 체제를 바꾸면 거울 세계 세력의 regime을 바꾸고 세력 행을 바로 쓰기 대기열에 넣는다(npc/houseRuntime.ts flush — 다음 틱 저장을 기다리지 않음).
// - 바뀜(governance-2): 지분 = 주체 계정(o:<주체>)과 가문 지분 계정(p:/n: — houseShares.ts, D-338·D-582). 의결이 정한 지배 가문을 NPC 런타임에 알린다
//   (applyRuling → npc/cityHouses.ts setRuling, 질문 2406). 국고 지분 → 가문 계정 옮기기(moveTreasuryShares — 독재 D-338·자본주의 처음 지분 D-582).
// - 선전포고는 세력·사회 규칙의 declareWar(무명분 비용 포함 — NPC와 같은 길)를 부르고 런타임 틱을 한 번 밀어 전쟁 줄을 저장한다.
import { type GovernanceRegime, type HouseKey, isHouseKey } from "@terra/shared/governance";
import {
  type CombatCatalog,
  type CombatCoefficients,
  SATISFACTION_MAX_MILLI,
  holdingsOf,
  houseHoldingsOf,
} from "@terra/sim";
import { houseTiesOf } from "../world/houseTies.ts";
import type { World } from "../world/world.ts";
import { houseKeyOfTail, treasurySharesToHouse } from "./houseShares.ts";
import type { NpcTraits } from "./npcVote.ts";
import { type GovernancePortCoup, worldGovernancePortCoup } from "./portCoup.ts";
import { type GovernancePortLeader, worldGovernancePortLeader } from "./portLeader.ts";

export interface GovernanceNation {
  /** 세력 행 ID(의결 표의 nation_id) */
  readonly rowId: number;
  /** 거울 세계 세력 ID = 소유 주체 ID(국고) */
  readonly ownerId: number;
  readonly code: string;
  /** 플레이어 가문 나라(독립 가문)인가 */
  readonly playerHouse: boolean;
  readonly regime: GovernanceRegime;
  readonly traits: NpcTraits;
  readonly cities: readonly number[];
}

/** 지분 한 줄: holder = o:<소유 주체> | p:<플레이어 가문 행> | n:<NPC 가문 ID>(가문 지분 계정) */
export interface GovernanceHolding {
  readonly holder: string;
  readonly amount: bigint;
}

export interface GovernanceOwner {
  readonly userId: string | null;
  /** 세력 주체면 그 세력 행 */
  readonly factionRow: number | null;
  /** 플레이어 가문 주체인가(가문장이 던진다) */
  readonly playerHouse: boolean;
  /** NPC 세력 주체의 성향·그 세력 도시 평균 만족도(NPC 주주 투표) */
  readonly traits: NpcTraits | null;
  readonly satisfaction: number | undefined;
}

export interface GovernancePort extends GovernancePortCoup, GovernancePortLeader {
  /** 세계·NPC 사회 런타임이 준비됐나 */
  ready(): boolean;
  nations(): readonly GovernanceNation[];
  nation(rowId: number): GovernanceNation | undefined;
  /** 처음 규칙의 지배 가문(선출 기록이 없을 때) */
  defaultRulingHouse(nation: GovernanceNation): HouseKey | null;
  /** 그 나라 도시의 NPC 가문(ID·도시) */
  npcHousesOf(nation: GovernanceNation): readonly { readonly id: number; readonly cityId: number }[];
  /** 도시 휴먼 평균 만족도(0~100). 휴먼이 없으면 undefined */
  citySatisfaction(cityId: number): number | undefined;
  /** 그 나라 모든 도시 지분의 주체·가문별 합(주체 ID 차례 → 가문 열쇠 차례) */
  holdingsOf(nation: GovernanceNation): readonly GovernanceHolding[];
  /** 의결이 정한 지배 가문을 NPC 런타임에 알린다(NPC 나라만 — null = 처음 규칙, "vacant" = 빈자리) */
  applyRuling(nation: GovernanceNation, ruling: HouseKey | "vacant" | null): void;
  /** 그 도시들의 국고 지분을 그 가문 계정으로(도시마다 옮긴 주 수) */
  moveTreasuryShares(
    nation: GovernanceNation,
    cities: readonly number[],
    key: HouseKey,
    nowMs: number,
  ): readonly { readonly cityId: number; readonly amount: bigint }[];
  /** 그 도시를 처음 세운 NPC 가문(그 도시에서 먼저 세운 가문, D-575 — 없으면 undefined) */
  founderOf(cityId: number): number | undefined;
  /** 그 나라 수도 도시 */
  capitalOf(nation: GovernanceNation): number | undefined;
  ownerInfo(ownerId: number): GovernanceOwner | undefined;
  /** 그 가문 세력 행의 소유 주체(도시를 가진 가문). 없으면 undefined */
  ownerOfHouseRow(rowId: number): number | undefined;
  setRegime(nation: GovernanceNation, regime: GovernanceRegime): void;
  /** 선전포고(이미 전쟁·상대가 없으면 false) */
  declareWar(nation: GovernanceNation, target: GovernanceNation, nowMs: number): Promise<boolean>;
  /** 이미 전쟁 중인가 */
  atWar(nation: GovernanceNation, target: GovernanceNation): boolean;
  /** 보는 사람의 나라(가문 소속 → 시민권) */
  viewerNation(userId: string): number | undefined;
}

type GovernanceWorld = Pick<World, "status" | "npc" | "persistence">;

const avg = (sum: number, count: number): number | undefined =>
  count === 0 ? undefined : Math.trunc((sum * 100) / (count * SATISFACTION_MAX_MILLI));

/** 실제 세계 포트 */
export function worldGovernancePort(
  world: () => GovernanceWorld | undefined,
  combat?: () => { readonly catalog: CombatCatalog; readonly rules: CombatCoefficients } | undefined,
): GovernancePort {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.npc && w.persistence
      ? { npc: w.npc, persistence: w.persistence }
      : undefined;
  };
  const rowOfOwner = (ownerId: number): number | undefined =>
    live()?.persistence.owners.get(ownerId)?.factionId ?? undefined;
  /** 도시마다 평균 만족도(부를 때마다 새로 센다 — 의결 틱은 1분마다) */
  const satisfactionByCity = (): Map<number, number | undefined> => {
    const sums = new Map<number, [number, number]>();
    for (const unit of live()?.npc.world.units.values() ?? []) {
      const entry = sums.get(unit.city) ?? [0, 0];
      entry[0] += unit.satisfactionMilli;
      entry[1] += 1;
      sums.set(unit.city, entry);
    }
    return new Map([...sums].map(([city, [sum, count]]) => [city, avg(sum, count)]));
  };
  const nationOf = (ownerId: number): GovernanceNation | undefined => {
    const l = live();
    const faction = l?.npc.world.factions.get(ownerId);
    const rowId = rowOfOwner(ownerId);
    if (!faction || !faction.alive || faction.overlord !== null || rowId === undefined) return undefined;
    return {
      rowId,
      ownerId,
      code: faction.code,
      playerHouse: faction.player === true,
      regime: faction.regime,
      traits: faction.traits,
      cities: [...faction.cities].toSorted((a, b) => a - b),
    };
  };
  const factionAvg = (ownerId: number): number | undefined => {
    const l = live();
    const faction = l?.npc.world.factions.get(ownerId);
    if (!faction) return undefined;
    const map = satisfactionByCity();
    const values = [...faction.cities].flatMap((city) => {
      const value = map.get(city);
      return value === undefined ? [] : [value];
    });
    return values.length === 0 ? undefined : Math.trunc(values.reduce((a, b) => a + b, 0) / values.length);
  };
  return {
    // 쿠데타·지분 따라가기·도시 독립·국고 지분(줄기 governance-3 — portCoup.ts)
    ...worldGovernancePortCoup(world, combat),
    // 강화·거래세·화폐 단계·가문 독립·신임도(줄기 governance-5 — portLeader.ts)
    ...worldGovernancePortLeader(world),
    ready: () => live() !== undefined,
    nations() {
      const l = live();
      if (!l) return [];
      return [...l.npc.world.factions.keys()]
        .flatMap((ownerId) => {
          const nation = nationOf(ownerId);
          return nation ? [nation] : [];
        })
        .toSorted((a, b) => a.rowId - b.rowId);
    },
    nation(rowId) {
      const owner = live()?.npc.houses.ownerOfRow(rowId);
      return owner === undefined ? undefined : nationOf(owner);
    },
    defaultRulingHouse(nation) {
      if (nation.playerHouse) return `p:${nation.rowId}`;
      const house = live()?.npc.cityHouses.rulingHouseOf(nation.ownerId);
      return house ? `n:${house.id}` : null;
    },
    npcHousesOf(nation) {
      const l = live();
      if (!l || nation.playerHouse) return [];
      return nation.cities.flatMap((cityId) =>
        l.npc.cityHouses.housesOfCity(cityId).map((id) => ({ id, cityId })),
      );
    },
    citySatisfaction: (cityId) => satisfactionByCity().get(cityId),
    holdingsOf(nation) {
      const l = live();
      if (!l) return [];
      const sums = new Map<number, bigint>();
      const houses = new Map<string, bigint>();
      for (const cityId of nation.cities) {
        for (const holding of holdingsOf(l.npc.world.book, cityId))
          sums.set(holding.owner, (sums.get(holding.owner) ?? 0n) + holding.amount);
        for (const holding of houseHoldingsOf(l.npc.world.book, cityId)) {
          const key = houseKeyOfTail(holding.house);
          if (key) houses.set(key, (houses.get(key) ?? 0n) + holding.amount);
        }
      }
      return [
        ...[...sums]
          .filter(([, amount]) => amount > 0n)
          .toSorted((a, b) => a[0] - b[0])
          .map(([owner, amount]) => ({ holder: `o:${String(owner)}`, amount })),
        ...[...houses]
          .filter(([, amount]) => amount > 0n)
          .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([holder, amount]) => ({ holder, amount })),
      ];
    },
    applyRuling(nation, ruling) {
      const l = live();
      if (!l || nation.playerHouse) return;
      const parsed = ruling === null || ruling === "vacant" ? undefined : parseHouseKey(ruling);
      l.npc.cityHouses.setRuling(nation.ownerId, ruling === "vacant" ? "vacant" : parsed);
    },
    moveTreasuryShares(nation, cities, key, nowMs) {
      const l = live();
      return l ? treasurySharesToHouse(l.npc.world.book, cities, nation.ownerId, key, nowMs) : [];
    },
    founderOf: (cityId) => live()?.npc.cityHouses.housesOfCity(cityId)[0],
    capitalOf: (nation) => live()?.npc.capitalOf(nation.ownerId),
    ownerInfo(ownerId) {
      const l = live();
      const row = l?.persistence.owners.get(ownerId);
      if (!l || !row) return undefined;
      const faction = l.npc.world.factions.get(ownerId);
      const playerHouse = faction?.player === true;
      return {
        userId: row.userId,
        factionRow: row.factionId,
        playerHouse,
        traits: faction && !playerHouse ? faction.traits : null,
        satisfaction: faction && !playerHouse ? factionAvg(ownerId) : undefined,
      };
    },
    ownerOfHouseRow: (rowId) => live()?.npc.houses.ownerOfRow(rowId),
    setRegime(nation, regime) {
      const l = live();
      const faction = l?.npc.world.factions.get(nation.ownerId);
      if (!l || !faction) return;
      faction.regime = regime;
      l.npc.houses.flush(nation.ownerId);
    },
    async declareWar(nation, target, nowMs) {
      const l = live();
      const a = l?.npc.world.factions.get(nation.ownerId);
      const b = l?.npc.world.factions.get(target.ownerId);
      if (!l || !a || !b || a.wars.has(b.id)) return false;
      l.npc.society.declareWar(a, b, nowMs);
      if (!a.wars.has(b.id)) return false;
      await l.npc.tick(true);
      return true;
    },
    atWar(nation, target) {
      return live()?.npc.world.factions.get(nation.ownerId)?.wars.has(target.ownerId) === true;
    },
    viewerNation(userId) {
      const l = live();
      if (!l) return undefined;
      return (
        houseTiesOf(l.persistence)?.memberNationOf(userId) ?? l.persistence.cyborgs.record(userId)?.factionId
      );
    },
  };
}

/** 가문 열쇠 → [플레이어인가, ID] */
export function parseHouseKey(key: string): { readonly npc: boolean; readonly id: number } | undefined {
  if (!isHouseKey(key)) return undefined;
  return { npc: key.startsWith("n:"), id: Number(key.slice(2)) };
}
