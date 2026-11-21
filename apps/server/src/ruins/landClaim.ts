// 빈 2차맵 알박기 완성(서버 권위) — 기획 D-572 "세력범위에는 포함되나 정부건물이 없는 땅에는 다른세력이 건설가능하고 건설되면 해당 정부가
// 영토소유 알박기처럼 가능. 물론 군사력이 약하여 뺐기고 자원과 시간만 날릴수있음", 알박기 시점 "정부 건물을 다 지으면", D-574 "가문이 있으면
// 가문소유, 무소속이면 유닛 독재 도시. 정부건설시 독립할지 소속된 국가로 귀속할지 결정가능", D-575 "소속된 국가로 귀속을 하여도, 그 도시의
// 지분은 최초설립자가 가지며 독립을 선언할수도 있음"(ADR docs/adr/2026-11-14-second-map-build.md, 질문 2122 가·2191~2200·2241~).
// - 자리: 도시(world_cities·거울 세계 도시)도 폐허도 없는 2차맵. 행정 건물(시설 단계 government)은 그런 2차맵 어디에나 짓는다(1차맵 세력
//   범위 안이어도 — 알박기는 정부 건물이 없는 땅의 규칙이라 새 마을 자리 규칙 foundingClaimConflict를 거치지 않는다, 질문 2191). 폐허가 있는
//   2차맵은 폐허 복원 길(ruins/service.ts), 도시가 있는 2차맵은 정부를 더 짓지 못한다(not_ruin 그대로).
// - 새 도시 주인(D-574): 가문이 있으면(가문장·가문원 모두) 그 가문, 가문 없는 플레이어는 그 플레이어의 1인 가문("유닛 독재 도시" — 다 지었을 때
//   ruins/claimHouse.ts가 만든다, 질문 2242), 세력 주체(NPC)는 바뀜 (D-580 — 질문 2335 나, npc-claim-3): 지은 세력에서 태어난 새 NPC 가문 세력
//   (@terra/sim SocietyRun.claimHouse — 봉신 | 독립 + 체제 = 가문 성향 규칙식, 지분 = 그 가문, 재료를 낸 도시 휴먼이 가문원, foundNpcHouse). 가문이 아직 도시가 없으면(거울 세계에 없음) 짓기 때 고른 것으로 들인다
//   (houses.adopt — 가문 마을 세우기·폐허 고르기와 같은 함수, D-340): nation = 가문 나라(born_of)의 봉신(귀속), independent = 독립 도시국가 +
//   고른 체제(1인 가문은 늘 독재). 이미 도시가 있는 가문은 그 상태 그대로(mode_locked와 같다). 고르기는 시설 줄 claim(짓기 명령, 기본 선택 =
//   @terra/shared/facilities DEFAULT_LAND_CLAIM_MODE — 확인 대기 질문 2241).
// - 지분(D-575): 새 도시 지분 1,000주는 새 도시 주인 = 최초 설립자(그 가문·1인 가문·세력)의 국고로 간다(귀속해도 나라가 아니라 설립자). 귀속한
//   봉신은 나중에 독립을 선언할 수 있다(factionIdentity/houseIndependence.ts). 알박기로 선 도시는 표 claim_cities에 적는다(D-575 보충 "가" —
//   독재 나라에 귀속해도 독립 선언이 되는 표지).
// - 다 지음 = 행정 건물 레벨 1 이상·상태 0% 초과·2차맵에 서 있음. NPC 사회 런타임 틱(5초)마다 훑어(foundPending) 그 2차맵에 아직 도시·폐허가
//   없으면 새 도시를 세운다 — 가문 마을 세우기와 같은 길(npc/houseRuntime.ts foundVillage: 행정 Lv1·연구 0·휴먼 없음·지분 1,000주를 주인 국고에,
//   주거 = 설정 칸 house_village_housing). 도시 자리 = 행정 건물 가운데 칸. 그 행정 건물은 새 도시의 시설이 된다(489 다).
// - 경쟁: 먼저 다 지은 쪽이 도시가 된다(D-510 결). 도시가 서면 그 2차맵의 다른 편 짓는 중 정부 건물은 짓기가 멈춘다(질문 2194 → D-572
//   "적대세력은 아예 건설불가" — 재료는 돌려주지 않는다, "자원과 시간만 날릴수있음"). 멈춘 건물은 레벨 0(짓는 중 모습)인 채 남는다(기술
//   기본값, 질문 2241 — 공격·점령 규칙을 따른다). 이미 다 지은 늦은 쪽 건물(같은 틱)은 그대로 남는다.
// - 소식: 도시가 서면 그 가문 가문원 모두에게 city_gained(2197 나), 멈춘 건물을 지은 사람에게 claim_halted.
// - 저장할 새 값: 시설 줄 claim_choice(고른 것), 알박기 도시 표 claim_cities. "알박기 중" = 시설 줄 도시가 비어 있는(null) 행정 건물이다.
import type { SocietyCoefficients } from "@terra/sim";
import { isCellKey } from "@terra/planet";
import { DEFAULT_LAND_CLAIM_MODE, type LandClaimChoice } from "@terra/shared/facilities";
import type { PlaceWorld } from "../facilities/places.ts";
import { type FacilityRecord, claimChoiceText } from "../facilities/state.ts";
import { TEST_HOUSE_RULES, houseRulesFrom } from "../factionIdentity/rules.ts";
import { ringsOf } from "../npc/claimSites.ts";
import type { CityPlace } from "../npc/persist.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { ClaimNotice } from "./claimHouse.ts";

/** 빈 2차맵에 정부를 다 지으면 새 도시의 주인: 내 가문 | 1인 독재 도시(가문 없음) | 내 세력 */
export type LandClaimKind = "house" | "personal" | "faction";

export interface LandClaimDeps {
  readonly places: PlaceWorld;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly facilities: {
    readonly facilities: ReadonlyMap<number, FacilityRecord>;
    seedBuilt(record: FacilityRecord): void;
    haltBuild(buildingId: number, atMs: number): boolean;
  };
  /** 세력 주체가 정부를 지으면 도시가 드는 세력(폐허 복원과 같은 함수) */
  readonly joinOf: (runtime: NpcRuntime, ownerId: number) => number | undefined;
  /** 사용자가 든 가문 행(world/houseTies.ts houseOfUser). 없으면(무소속) undefined */
  readonly houseOfUser?: ((userId: string) => number | undefined) | undefined;
  /** 도시 없는 가문의 나라(세력 행, born_of — houseTies memberNationOf). 봉신으로 들일 때 */
  readonly houseNationOf?: ((userId: string) => number | undefined) | undefined;
  /** 설정 칸(새 도시 주거 = house_village_housing). 없으면 시험 계수표 */
  readonly rules?: (() => SocietyCoefficients) | undefined;
  /** 알박기 도시 줄(claim_cities)을 쓰기 대기열에 — 새 도시 행과 같은 동기 처리 */
  readonly saveClaimCity?: ((row: Record<string, unknown>) => void) | undefined;
  /** 가문 없는 플레이어의 1인 가문을 만든다(비동기 — 다음 틱에 그 가문으로 세운다). 없으면 그런 건물은 기다린다 */
  readonly foundPersonal?: ((userId: string) => void) | undefined;
  /** 소식(비동기로 쓴다) */
  readonly notify?: ((notices: readonly ClaimNotice[]) => void) | undefined;
}

export interface LandClaims {
  /** 그 2차맵이 알박기 자리(도시·폐허 없음)면 정부를 지었을 때 새 도시의 주인, 아니면 null(런타임이 없어도 null) */
  kindOf(runtime: NpcRuntime, ownerId: number, mapKey: number): LandClaimKind | null;
  /** 그 주체의 가문이 이미 도시를 가져 봉신·독립이 정해졌으면 그 상태, 아니면 null(짓기 때 고른다) */
  lockedOf(runtime: NpcRuntime, ownerId: number): "vassal" | "independent" | null;
  /** 그 2차맵에 도시나 폐허가 있나 */
  settled(runtime: NpcRuntime, mapKey: number): boolean;
  /** 다 지은 알박기 행정 건물마다 그 2차맵에 새 도시를 세운다. 세운 수 */
  foundPending(runtime: NpcRuntime, nowMs: number): number;
}

const DEFAULT_CHOICE: LandClaimChoice = { mode: DEFAULT_LAND_CLAIM_MODE, regime: null };

export function createLandClaims(d: LandClaimDeps): LandClaims {
  const { places } = d;
  const settled = (runtime: NpcRuntime, mapKey: number): boolean => {
    if (places.cities().some((city) => city.mapKey === mapKey)) return true;
    for (const [id, place] of runtime.places)
      if (place.mapKey === mapKey && (runtime.world.cities.has(id) || runtime.world.ruins.has(id)))
        return true;
    return false;
  };
  const userOf = (ownerId: number): string | null => d.owners.get(ownerId)?.userId ?? null;
  const houseOf = (ownerId: number): number | undefined => {
    const userId = userOf(ownerId);
    return userId ? d.houseOfUser?.(userId) : undefined;
  };
  const kindOf = (runtime: NpcRuntime, ownerId: number): LandClaimKind | undefined => {
    if (userOf(ownerId) === null) return d.joinOf(runtime, ownerId) === undefined ? undefined : "faction";
    return houseOf(ownerId) === undefined ? "personal" : "house";
  };
  /** 그 주체의 가문이 거울 세계에 든 세력(도시를 가진 가문)이면 그 세력 */
  const mirrorOf = (runtime: NpcRuntime, ownerId: number) => {
    const house = houseOf(ownerId);
    return house === undefined ? undefined : runtime.houses.mirrorOf(house);
  };
  const isGovernment = (record: FacilityRecord): boolean =>
    places.catalog().facility(record.facilityId)?.stage === "government";

  /**
   * 새 도시 주인 세력(소유 주체). 가문이 아직 거울 세계에 없으면 고른 것으로 들인다. 1인 가문을 만드는 중이거나 들일 수 없으면 undefined(다음
   * 틱에 다시)
   */
  const ownerFor = (
    runtime: NpcRuntime,
    record: FacilityRecord,
    ownerId: number,
    nowMs: number,
  ): { owner: number; house: number | null; mode: "vassal" | "independent" } | undefined => {
    const userId = userOf(ownerId);
    if (userId === null) {
      const join = d.joinOf(runtime, ownerId);
      return join === undefined ? undefined : { owner: join, house: null, mode: "independent" };
    }
    const house = d.houseOfUser?.(userId);
    if (house === undefined) {
      // 가문 없는 플레이어: 1인 가문(유닛 독재 도시)을 만든다. 독립이면 체제는 늘 독재(D-574 "유닛 독재 도시")
      const choice = record.claim ?? DEFAULT_CHOICE;
      if (choice.mode === "independent" && choice.regime !== "dictatorship")
        d.facilities.seedBuilt({ ...record, claim: { mode: "independent", regime: "dictatorship" } });
      d.foundPersonal?.(userId);
      return undefined;
    }
    const mirror = runtime.houses.mirrorOf(house);
    if (mirror)
      return runtime.world.factions.get(mirror.ownerId)?.alive
        ? { owner: mirror.ownerId, house, mode: mirror.vassal ? "vassal" : "independent" }
        : undefined;
    const choice = record.claim ?? DEFAULT_CHOICE;
    const vassal = choice.mode === "nation";
    const owner = runtime.houses.adopt({
      rowId: house,
      nationRowId: d.houseNationOf?.(userId) ?? null,
      vassal,
      regime: choice.regime ?? "democracy",
      nowMs,
    });
    return owner === undefined ? undefined : { owner, house, mode: vassal ? "vassal" : "independent" };
  };

  /** 그 주체(멈출지 볼 건물 주인)가 새 도시 주인과 같은 편인가 */
  const sameSide = (
    runtime: NpcRuntime,
    ownerId: number,
    founded: { owner: number; house: number | null },
  ) => {
    if (userOf(ownerId) === null) return d.joinOf(runtime, ownerId) === founded.owner;
    const house = houseOf(ownerId);
    if (house === undefined) return false;
    return house === founded.house || runtime.houses.ownerOfRow(house) === founded.owner;
  };

  /** 도시가 선 2차맵의 다른 편 짓는 중 정부 건물을 멈춘다(2194). 멈춘 건물 주인 목록 */
  const haltRivals = (
    runtime: NpcRuntime,
    mapKey: number,
    founded: { owner: number; house: number | null },
    nowMs: number,
  ): ClaimNotice[] => {
    const notices: ClaimNotice[] = [];
    for (const record of d.facilities.facilities.values()) {
      if (record.level >= 1 || !isGovernment(record)) continue;
      const cell = cellOf(places, record);
      if (!cell || cell.mapKey !== mapKey || cell.ownerId === null) continue;
      if (sameSide(runtime, cell.ownerId, founded)) continue;
      if (!d.facilities.haltBuild(record.buildingId, nowMs)) continue;
      const userId = userOf(cell.ownerId);
      if (userId)
        notices.push({
          userId,
          house: houseOf(cell.ownerId) ?? null,
          kind: "claim_halted",
          reason: null,
          nowMs,
        });
    }
    return notices;
  };

  /**
   * NPC 알박기 도시(D-580 — 질문 2335 나): 시뮬과 같은 SocietyRun.claimHouse — 지은 세력(부모)에서 새 NPC 가문 세력을 세우고(봉신 | 독립 + 체제 =
   * 가문 성향 규칙식 foundingChoice, 마을 세우기와 같다), 재료를 낸 도시(그 2차맵에서 가장 가까운 부모 도시)의 휴먼 founders명이 가문원으로 옮기고,
   * 지분 1,000주는 그 가문(최초 설립자, D-575). 도시 행·자리는 가문 마을과 같은 houses.placeCity. 옮긴 휴먼의 몸은 2차맵을 옮기지 않는다
   * (NPC 마을 세우기와 같다 — 다음 맞추기가 그 도시 2차맵에 있는 사람만 세운다). 세웠나
   */
  const foundNpcHouse = (
    runtime: NpcRuntime,
    record: FacilityRecord,
    ownerId: number,
    place: Omit<CityPlace, "foundedAtMs">,
    housing: number,
    nowMs: number,
  ): boolean => {
    const join = d.joinOf(runtime, ownerId);
    const parent = join === undefined ? undefined : runtime.world.factions.get(join);
    if (!parent?.alive) return false;
    const house = runtime.society.claimHouse(
      parent,
      sourceCityOf(runtime, parent.cities, place.mapKey),
      nowMs,
      (h) => runtime.houses.placeCity(h.id, place, housing, nowMs),
    );
    const cityId = [...house.cities][0];
    if (cityId === undefined) return false;
    const latest = d.facilities.facilities.get(record.buildingId) ?? record;
    // 행정 건물은 새 도시의 시설(489 다), 고르기 칸 = 가문이 고른 것(봉신 = nation, 독립 = 그 체제)
    const choice: LandClaimChoice =
      house.overlord === null
        ? { mode: "independent", regime: house.regime }
        : { mode: "nation", regime: null };
    d.facilities.seedBuilt({ ...latest, cityId, claim: choice });
    runtime.houses.flush(house.id, cityId);
    d.saveClaimCity?.({
      city_id: cityId,
      founder_owner_id: house.id,
      choice: claimChoiceText(choice),
      founded_at_ms: nowMs,
    });
    d.notify?.(haltRivals(runtime, place.mapKey, { owner: house.id, house: null }, nowMs));
    return true;
  };

  return {
    settled,
    kindOf(runtime, ownerId, mapKey) {
      if (settled(runtime, mapKey)) return null;
      return kindOf(runtime, ownerId) ?? null;
    },
    lockedOf(runtime, ownerId) {
      const mirror = mirrorOf(runtime, ownerId);
      return mirror ? (mirror.vassal ? "vassal" : "independent") : null;
    },
    foundPending(runtime, nowMs) {
      let founded = 0;
      for (const record of [...d.facilities.facilities.values()].toSorted(
        (a, b) => a.buildingId - b.buildingId,
      )) {
        if (record.cityId !== null || record.level < 1 || record.conditionPpm <= 0 || !isGovernment(record))
          continue;
        const found = cellOf(places, record);
        if (!found || found.ownerId === null || settled(runtime, found.mapKey)) continue;
        const map = places.maps.get(found.mapKey);
        if (!map) continue;
        const housing = (d.rules ? houseRulesFrom(d.rules()) : TEST_HOUSE_RULES).villageHousing;
        const planetId = [...runtime.places.values()].find((p) => p.mapKey === found.mapKey)?.planetId;
        const place = {
          planetId: planetId ?? map.planetId,
          mapKey: found.mapKey,
          cellX: found.x,
          cellY: found.y,
        };
        // NPC 세력이 지은 알박기(D-580 — 질문 2335 나): 지은 NPC 가문이 새 세력(봉신 | 독립 = 가문 성향 규칙식, 지분 = 그 가문)
        if (userOf(found.ownerId) === null) {
          if (foundNpcHouse(runtime, record, found.ownerId, place, housing, nowMs)) founded += 1;
          continue;
        }
        const side = ownerFor(runtime, record, found.ownerId, nowMs);
        if (!side) continue;
        const cityId = runtime.houses.foundVillage(side.owner, place, housing, nowMs);
        // 행정 건물은 새 도시의 시설(489 다 — 행정 레벨 = 건물 레벨). 시설 줄·세력 행·도시 행·알박기 도시 줄을 같은 동기 처리에서 쓰기 대기열로
        const latest = d.facilities.facilities.get(record.buildingId) ?? record;
        d.facilities.seedBuilt({ ...latest, cityId });
        runtime.houses.flush(side.owner, cityId);
        d.saveClaimCity?.({
          city_id: cityId,
          founder_owner_id: side.owner,
          choice: claimChoiceText(latest.claim ?? DEFAULT_CHOICE),
          founded_at_ms: nowMs,
        });
        const notices = haltRivals(runtime, found.mapKey, side, nowMs);
        if (side.house !== null)
          notices.unshift({ userId: null, house: side.house, kind: "city_gained", reason: side.mode, nowMs });
        d.notify?.(notices);
        founded += 1;
      }
      return founded;
    },
  };
}

/** 행정 건물의 2차맵·가운데 칸·주인(2차맵에 없으면 undefined) */
function cellOf(
  places: PlaceWorld,
  record: FacilityRecord,
): { mapKey: number; x: number; y: number; ownerId: number | null } | undefined {
  for (const map of places.maps.values()) {
    if (map.buildingOwner(record.buildingId) === undefined) continue;
    let found: { mapKey: number; x: number; y: number; ownerId: number | null } | undefined;
    map.forEachBuilding((building) => {
      if (building.id !== record.buildingId) return;
      const footprint = places.catalog().facility(record.facilityId)?.footprint;
      found = {
        mapKey: map.mapKey,
        x: building.x + Math.floor((footprint?.width ?? 1) / 2),
        y: building.y + Math.floor((footprint?.height ?? 1) / 2),
        ownerId: building.ownerId,
      };
    });
    return found;
  }
  return undefined;
}

/** 재료를 낸 도시 = 그 2차맵에서 행성 칸 이웃 겹으로 가장 가까운 그 세력 도시(같으면 작은 ID, 8겹 안에 없으면 가장 작은 ID). 도시가 없으면 −1 */
function sourceCityOf(runtime: NpcRuntime, cities: ReadonlySet<number>, mapKey: number): number {
  let best: { id: number; d: number } | undefined;
  const sorted = [...cities].toSorted((a, b) => a - b);
  for (const id of sorted) {
    const at = runtime.places.get(id);
    if (!at || !isCellKey(at.mapKey)) continue;
    const d = ringsOf(at.mapKey, 8).get(mapKey)?.d;
    if (d !== undefined && (!best || d < best.d)) best = { id, d };
  }
  return best?.id ?? sorted[0] ?? -1;
}
