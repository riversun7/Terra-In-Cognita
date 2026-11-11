// 플레이어 가문을 NPC 사회 런타임의 거울 세계에 들이기 — docs/adr/2026-11-11-house-village.md(질문 1005 가, D-213·D-216·D-340·D-339).
// 가문이 도시를 처음 얻을 때(마을 세우기·폐허 복원) 봉신·독립을 고르면 그때 가문에 소유 주체(world_owners — 국고·원장 계정)를 만들고 거울
// 세계 세력(SimFaction, player 표시)으로 둔다. 그 뒤 가문 도시는 NPC 도시와 같은 규칙을 탄다(D-212 "유저와 NPC가 같은 규칙"): 만족도·반란·
// 공물(봉신 → 나라, 시뮬 societyPayouts)·배당·점령·정원사 웨이브·도시 경제. 다른 점: 판단(NPC 두뇌)을 돌리지 않는다(runtime.ts가 player
// 세력에는 판단을 예약하지 않는다), 도시를 모두 잃어도 사라지지 않는다(@terra/sim dieIfEmpty — 가문 행 해산은 가문장 몫).
// - 봉신: 위 세력(overlord) = 가문 나라(factions.born_of)의 소유 주체. 체제는 나라 체제를 따른다(D-339 해석과 같은 결 [임시]).
// - 독립: 위 세력 없음 + 고른 체제(D-340 "독립 도시국가로 세우면 체제도 그때 정한다"). 태어날 때 부모(bornOf) = 가문 나라(화폐·도시 이름이
//   부모 나라를 따른다 — 기획 답 601 나·620 나, 독립 가문이 자기 화폐를 찍는 길(D-299)은 아직 없다).
// - 마을: NPC 새 마을(society.found)과 같은 모양 — 행정 Lv1, 연구 0, 휴먼 없음(구인 카드로 든다), 지분 1,000주를 가문 국고에(D-130).
//   자리 규칙은 NPC 마을과 같은 함수(townSites.ts checkTownSite — 다른 도시·폐허와 띄움, 다른 세력 영향권 밖 D-519).
import {
  type Regime,
  type SimCity,
  type SimFaction,
  type SimHooks,
  type SimWorld,
  STREAM_TRAITS,
  type SocietyCoefficients,
  issueShares,
  newFaction,
  rollTraits,
  streamRng,
} from "@terra/sim";
import type { CityPlace, NpcPersist } from "./persist.ts";
import { houseCodeOf } from "./state.ts";
import type { TownSiteProblem } from "./townSites.ts";

export interface HouseAdoptInput {
  /** 가문 세력 행 */
  readonly rowId: number;
  /** 가문 나라(세력 행, factions.born_of). 없으면 null(봉신을 고를 수 없다) */
  readonly nationRowId: number | null;
  readonly vassal: boolean;
  /** 독립일 때 체제 */
  readonly regime: Regime;
  readonly nowMs: number;
}

/** 거울 세계의 가문 상태 */
export interface HouseMirror {
  readonly ownerId: number;
  readonly vassal: boolean;
  readonly regime: Regime;
  readonly cities: readonly number[];
}

export interface NpcHouses {
  /** 들인 가문(세력 행)의 거울 상태. 아직이면 undefined */
  mirrorOf(rowId: number): HouseMirror | undefined;
  /** 가문을 들인다(소유 주체·세력). 이미 있으면 그 소유 주체. 봉신인데 나라가 거울에 없으면 undefined */
  adopt(input: HouseAdoptInput): number | undefined;
  /** 그 칸이 마을 자리인가(NPC 마을과 같은 규칙). own = 내 편 세력(소유 주체 — 그 영향권 안은 된다) */
  siteCheck(mapKey: number, x: number, y: number, own: readonly number[]): TownSiteProblem | null;
  /** from 둘레의 첫 마을 자리(NPC 마을과 같은 차례·규칙). own의 첫 세력을 세우는 쪽으로 본다 */
  siteNear(from: CityPlace, own: readonly number[]): CityPlace | undefined;
  /** 그 가문(소유 주체)이 마을을 세운다. 세운 도시 ID */
  foundVillage(
    ownerId: number,
    place: Omit<CityPlace, "foundedAtMs">,
    housing: number,
    nowMs: number,
  ): number;
  /** 가문 세력 행·도시 행을 쓰기 대기열에 넣는다(동기). 쓴 행 수 */
  flush(ownerId: number, cityId?: number): number;
  /** 세력 행 → 소유 주체(거울 세계에 있는 세력만) */
  ownerOfRow(rowId: number): number | undefined;
}

export function attachNpcHouses(o: {
  readonly world: SimWorld;
  readonly persist: NpcPersist;
  readonly hooks: () => SimHooks | undefined;
  readonly nextOwnerId: () => number;
  readonly rules: () => SocietyCoefficients;
}): NpcHouses {
  const { world, persist } = o;
  const ownerOfRow = (rowId: number): number | undefined => {
    for (const [owner, row] of persist.rowOf) if (row === rowId && world.factions.has(owner)) return owner;
    return undefined;
  };
  const mirrorOf = (rowId: number): HouseMirror | undefined => {
    const owner = ownerOfRow(rowId);
    const faction = owner === undefined ? undefined : world.factions.get(owner);
    if (!faction?.player) return undefined;
    return {
      ownerId: faction.id,
      vassal: faction.overlord !== null,
      regime: faction.regime,
      cities: [...faction.cities].toSorted((a, b) => a - b),
    };
  };

  return {
    mirrorOf,
    ownerOfRow,

    adopt(input) {
      const existing = ownerOfRow(input.rowId);
      if (existing !== undefined) return existing;
      const nationOwner = input.nationRowId === null ? undefined : ownerOfRow(input.nationRowId);
      const nation = nationOwner === undefined ? undefined : world.factions.get(nationOwner);
      if (input.vassal && !nation?.alive) return undefined;
      const ownerId = o.nextOwnerId();
      const c = o.rules();
      const faction: SimFaction = newFaction(ownerId, houseCodeOf(input.rowId), {
        fixed: false,
        tech: Math.max(1, nation?.tech ?? 1),
        // 봉신은 나라 체제를 따른다 [임시], 독립은 고른 체제
        regime: input.vassal && nation ? nation.regime : input.regime,
        settledAtMs: input.nowMs,
        overlord: input.vassal && nation ? nation.id : null,
        traits: rollTraits(streamRng(world.seed, STREAM_TRAITS, ownerId, 0), c.npc),
      });
      faction.player = true;
      faction.bornOf = nation?.id ?? null;
      faction.research = { progress: 0, blueprint: faction.tech };
      world.factions.set(ownerId, faction);
      persist.adoptHouse(ownerId, input.rowId);
      // 화폐·세율은 나라를 따른다(반란·새 마을 세력과 같은 고리)
      if (nation) o.hooks()?.factionBorn(faction, nation);
      return ownerId;
    },

    siteCheck(mapKey, x, y, own) {
      return persist.siteCheck(mapKey, x, y, own);
    },

    siteNear(from, own) {
      return persist.siteNear(from, own[0]);
    },

    foundVillage(ownerId, place, housing, nowMs) {
      const faction = world.factions.get(ownerId);
      if (!faction) throw new Error(`house village: unknown owner ${String(ownerId)}`);
      const city: SimCity = {
        id: world.nextCityId(),
        owner: ownerId,
        start: false,
        housing: Math.max(1, Math.trunc(housing)),
        researchLevel: 0,
        // NPC 새 마을과 같다: 행정 Lv1(행정 건물을 지으면 그 레벨 — 489 다)
        adminLevel: 1,
        recruitDraw: null,
        development: 0,
        nextRebellionMs: nowMs,
      };
      world.cities.set(city.id, city);
      faction.cities.add(city.id);
      persist.places.set(city.id, { ...place, foundedAtMs: nowMs });
      o.hooks()?.cityFounded?.(city.id, 0, nowMs);
      issueShares(world.book, city.id, [{ owner: ownerId, amount: BigInt(o.rules().sharesPerCity) }], nowMs);
      return city.id;
    },

    flush(ownerId, cityId) {
      return persist.flushHouse(ownerId, cityId);
    },
  };
}
