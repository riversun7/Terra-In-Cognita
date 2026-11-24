// 건물별 접근 권한 범위 판정(ADR 2026-11-25-building-access-and-foreign-build.md):
// - 권한 범위 4단계:
//   · anyone: 누구나 이용 가능(거래소·채집소·숙소 등 경제 시설 기본값)
//   · city_resident: 그 도시에 주거지(숙소)를 둔 유닛을 보유한 플레이어, 또는 그 도시 소속 가문원
//   · city_house: 그 도시 소속 가문(house_homes.city_id = cityId)의 가문원
//   · nation_citizen: 그 도시가 속한 나라의 시민(정부 건물 기본값 — 단 도시 가입 신청·귀화 상담은 예외)
// - 건물 주인과 운영자 모드는 항상 허용한다.
// - anyone이 아닌 건물에서 해당 나라 블랙리스트 유저는 차단한다.
import { type BuildingAccessScope, defaultBuildingAccessScope } from "@terra/shared/facilities";
import type { CyborgService } from "../cyborg/service.ts";
import { blacklistTableOf } from "../factionIdentity/blacklist.ts";
import { residenceBookOf } from "../residence/book.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityRecord } from "./state.ts";

export interface BuildingAccessEvalInput {
  readonly scope: BuildingAccessScope;
  readonly isOwner: boolean;
  readonly isOperator?: boolean | undefined;
  readonly isBlacklisted?: boolean | undefined;
  readonly userNationId: number | null;
  readonly userHouseCityId: number | null;
  readonly isCityResident: boolean;
  readonly cityId: number | null;
  readonly cityNationId: number | null;
}

export type BuildingAccessVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: "blacklisted" | "city_resident" | "city_house" | "nation_citizen";
    };

/** 순수 판정: 건물 접근 권한 범위와 사용자 소속·거주지·블랙리스트로 이용 가능 여부를 판정한다 */
export function evaluateBuildingAccess(input: BuildingAccessEvalInput): BuildingAccessVerdict {
  if (input.isOwner || input.isOperator) return { allowed: true };
  if (input.scope === "anyone") return { allowed: true };
  if (input.isBlacklisted) return { allowed: false, reason: "blacklisted" };
  switch (input.scope) {
    case "nation_citizen":
      return input.cityNationId !== null && input.userNationId === input.cityNationId
        ? { allowed: true }
        : { allowed: false, reason: "nation_citizen" };
    case "city_house":
      return input.cityId !== null && input.userHouseCityId === input.cityId
        ? { allowed: true }
        : { allowed: false, reason: "city_house" };
    default:
      return input.isCityResident || (input.cityId !== null && input.userHouseCityId === input.cityId)
        ? { allowed: true }
        : { allowed: false, reason: "city_resident" };
  }
}

export interface BuildingAccessCheckResult {
  readonly scope: BuildingAccessScope;
  readonly ownScope: BuildingAccessScope | null;
  readonly allowed: boolean;
  readonly reason: string | null;
}

export interface BuildingAccessChecker {
  check(userId: string, buildingId: number, operator?: boolean): BuildingAccessCheckResult;
  canSet(userId: string, buildingId: number, operator?: boolean): Promise<boolean>;
}

const checkers = new WeakMap<object, BuildingAccessChecker>();

/** 원장에 붙은 건물 접근 권한 판정기(없으면 undefined) */
export const buildingAccessOf = (ledger: object): BuildingAccessChecker | undefined => checkers.get(ledger);

/** 원장에 건물 접근 권한 판정기를 붙인다 */
export function attachBuildingAccess(ledger: object, checker: BuildingAccessChecker): void {
  checkers.set(ledger, checker);
}

/** 월드 상태 기반 건물 접근 권한 판정기 생성 */
export function createWorldBuildingAccess(parts: {
  readonly pool: QueryPool;
  readonly ledger: object;
  readonly store: object;
  readonly maps: ReadonlyMap<number, Pick<SecondMap, "buildingOwner">>;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly catalog: () => FacilityCatalog;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "id" | "userId" | "factionId">>;
  readonly settlement: Pick<Settlement, "findOwnerOfUser">;
  readonly cyborgs: Pick<CyborgService, "record">;
  /** 도시 ID → 그 도시가 속한 최상위 나라 세력 행 ID(모르면 null) */
  readonly cityNationRow: (cityId: number) => number | null;
}): BuildingAccessChecker {
  const buildingOwnerOf = (buildingId: number): number | null | undefined => {
    for (const map of parts.maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return undefined;
  };

  const hasUnitResidingInCity = (ownerId: number | undefined, cityId: number | null): boolean => {
    if (ownerId === undefined || cityId === null) return false;
    const book = residenceBookOf(parts.ledger);
    if (!book) return false;
    for (const choice of book.all()) {
      if (choice.ownerId !== ownerId) continue;
      const place = book.chosenPlace(choice.unitId);
      if (place?.cityId === cityId) return true;
    }
    return false;
  };

  return {
    check(userId, buildingId, operator = false) {
      const record = parts.facilities.get(buildingId);
      const def = record ? parts.catalog().facility(record.facilityId) : undefined;
      const ownScope = record?.accessScope ?? null;
      const scope = ownScope ?? defaultBuildingAccessScope(def?.stage);
      const ownerId = buildingOwnerOf(buildingId);
      const viewerOwnerId = parts.settlement.findOwnerOfUser(userId);
      const isOwner = viewerOwnerId !== undefined && ownerId === viewerOwnerId;
      const cityId = record?.cityId ?? null;
      const cityNationId = cityId === null ? null : parts.cityNationRow(cityId);
      const ties = houseTiesOf(parts.store);
      const houseId = ties?.houseOfUser(userId);
      const userHouseCityId = houseId === undefined ? null : (ties?.cityOfHouse(houseId) ?? null);
      const userNationId =
        (houseId === undefined ? undefined : ties?.memberNationOf(userId)) ??
        parts.cyborgs.record(userId)?.factionId ??
        null;
      const isBlacklisted =
        cityNationId !== null && blacklistTableOf(parts.ledger)?.isBlacklisted(cityNationId, userId) === true;
      const verdict = evaluateBuildingAccess({
        scope,
        isOwner,
        isOperator: operator,
        isBlacklisted,
        userNationId,
        userHouseCityId,
        isCityResident: hasUnitResidingInCity(viewerOwnerId, cityId),
        cityId,
        cityNationId,
      });
      return {
        scope,
        ownScope,
        allowed: verdict.allowed,
        reason: verdict.allowed ? null : verdict.reason,
      };
    },

    async canSet(userId, buildingId, operator = false) {
      if (operator) return true;
      const record = parts.facilities.get(buildingId);
      if (!record) return false;
      const ownerId = buildingOwnerOf(buildingId);
      const viewerOwnerId = parts.settlement.findOwnerOfUser(userId);
      if (viewerOwnerId !== undefined && ownerId === viewerOwnerId) return true;
      if (record.cityId === null) return false;
      const memberRes = await parts.pool.query(
        `select m.faction_id from house_members m join factions f on f.id = m.faction_id
          where m.user_id::text = $1 and m.role = 'leader' and f.dissolved_at_ms is null limit 1`,
        [userId],
      );
      const houseRow = memberRes.rows[0];
      if (!houseRow) return false;
      const houseId = Number(houseRow.faction_id);
      const rulerRes = await parts.pool.query(
        `with recursive chain as (
           select c.faction_id as id, 0 as depth from world_cities c where c.id = $1 and c.faction_id is not null
           union all
           select f.parent_id, chain.depth + 1 from chain join factions f on f.id = chain.id
            where f.parent_id is not null and chain.depth < 8
         )
         select exists (
           select 1 from world_cities c join factions f on f.id = c.faction_id
            where c.id = $1 and c.faction_id = $2 and f.kind = 'player' and f.dissolved_at_ms is null
         ) as is_city_owner,
         (select id from chain order by depth desc limit 1) as nation_id`,
        [record.cityId, houseId],
      );
      const ruleRow = rulerRes.rows[0];
      if (!ruleRow) return false;
      if (ruleRow.is_city_owner === true) return true;
      if (ruleRow.nation_id === null || ruleRow.nation_id === undefined) return false;
      const nationId = Number(ruleRow.nation_id);
      if (houseId === nationId) {
        const indRes = await parts.pool.query(
          `select 1 from world_cities c join factions f on f.id = c.faction_id
            where c.faction_id = $1 and f.kind = 'player' and f.parent_id is null and f.dissolved_at_ms is null
            limit 1`,
          [houseId],
        );
        if (indRes.rows.length > 0) return true;
      }
      const electedRes = await parts.pool.query(
        `select 1 from governance_state s join factions f on f.id = s.nation_id
          where s.nation_id = $1 and s.ruling_house_key = $2 and s.vacant_since_ms is null and f.dissolved_at_ms is null
          limit 1`,
        [nationId, `p:${String(houseId)}`],
      );
      return electedRes.rows.length > 0;
    },
  };
}
