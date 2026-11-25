// 홈 [도시 활동] 카드의 탭 몸 — 건물 목록(거르기 칩 + 줄), 유닛 목록(내 유닛 + 시야 안 남의 유닛), 자원(종류별 줄 + [채집]), 2차맵 정보(미니맵).
// 그리기만 한다(조회·명령은 cards/CityCard.tsx가 정한다). 2차맵 도시 화면(map/city/CitySheet.tsx)과 같은 문구·무리 아이콘을 쓴다.
// 건물 줄을 누르면 카드가 건물 판 대화상자를, 남의 유닛 줄을 누르면 유닛 대화상자를 연다.
import type { RouteTarget } from "@terra/shared";
import type { GatherObjectsResponse } from "@terra/shared/gather";
import type { MapLooksResponse } from "@terra/shared/mapLooks";
import type { MapUnit, MapUnitsResponse, NearbyUnit, NearbyUnitsResponse } from "@terra/shared/mapUnits";
import type { TerrainData } from "@terra/protocol";
import type { WorldCitiesResponse, WorldMapCity, WorldMyUnit } from "@terra/shared/worldMap";
import { type ReactNode, useState } from "react";
import { FACILITY_CATEGORY_TEXT } from "../../map/facilityCategoryText.ts";
import { nameText } from "../../map/gather/gatherData.ts";
import { LandFacts } from "../../map/LandFacts.tsx";
import { MapIcon } from "../../map/mapIcons.tsx";
import { kindLabel, sortMapUnits, unitName, unitStatusText } from "../../map/mapUnits.ts";
import { cityLabel, factionName } from "../../map/worldMapData.ts";
import { m } from "../../paraglide/messages.js";
import { ExternalArrowIcon } from "../cards/icons.tsx";
import { HomeLoading } from "../InboxBody.tsx";
import { formatCount } from "../numbers.ts";
import { HomeLink } from "../shellParts.tsx";
import {
  type BuildingFilter,
  type BuildingGroup,
  type Cell,
  type CityBuildingRow,
  type CityResourceRow,
  buildingFilters,
  canGatherKind,
  filterBuildings,
  resourceRows,
} from "./cityCardData.ts";
import { CityMinimap } from "./CityMinimap.tsx";
import type { CityQueryState } from "./useCityQuery.ts";

const GROUP_TEXT = {
  ...FACILITY_CATEGORY_TEXT,
  other: () => m.map_city_group_other(),
} satisfies Record<BuildingGroup, () => string>;

const filterText = (filter: BuildingFilter): string =>
  filter === "all"
    ? m.map_city_filter_all()
    : filter === "mine"
      ? m.map_city_filter_mine()
      : GROUP_TEXT[filter]();

const STATE_TEXT = {
  building: () => m.map_city_state_building(),
  damaged: () => m.map_city_state_damaged(),
  disabled: () => m.map_city_state_disabled(),
  ruin: () => m.map_city_state_ruin(),
} as const;

/** 내 유닛 이름(고르기 상자·진행 줄): 사이보그 본체 = "이름 · 내 사이보그", 이름이 있으면 그 이름, 없으면 "종류 #번호" */
export function unitText(unit: Pick<WorldMyUnit, "unitId" | "kind" | "name" | "guardian">): string {
  if (unit.kind === "cyborg") {
    return unit.name ? m.map_unit_cyborg_named({ name: unit.name }) : m.world_my_cyborg();
  }
  if (unit.name) return unit.name;
  const type =
    unit.guardian === true
      ? m.unit_guardian_label()
      : unit.kind === "human"
        ? m.planet_units_kind_human()
        : unit.kind === "cyborg_unit"
          ? m.planet_units_kind_cyborg_unit()
          : unit.kind === "boat"
            ? m.planet_units_kind_boat()
            : m.planet_units_kind_other();
  return m.roster_unnamed({ type, number: String(unit.unitId) });
}

/** 받는 중·실패(앞 값이 없을 때) 한 줄. 그릴 값이 있으면 null */
function pendingLine(state: CityQueryState<unknown>, onRetry: () => void): ReactNode {
  if (state.data !== null) return null;
  if (state.status === "error") {
    return (
      <p className="home-card-hint city-card-failed" role="alert">
        <span>{m.home_city_load_failed()}</span>
        <button type="button" className="button-small" onClick={onRetry}>
          {m.retry()}
        </button>
      </p>
    );
  }
  return <HomeLoading />;
}

/** 세계 준비 전·띄우지 않은 2차맵 안내 */
function statusLine(status: "not_ready" | "unknown_map"): ReactNode {
  return (
    <p className="home-card-hint" data-part={status}>
      {status === "not_ready" ? m.home_city_not_ready() : m.home_city_unloaded()}
    </p>
  );
}

/** 건물 줄의 덧말: 레벨·상태·레벨 올리는 중 */
function detailText(row: CityBuildingRow): string {
  const parts: string[] = [];
  if (row.level > 0) parts.push(m.nearby_building_level({ level: row.level }));
  if (row.state !== "ok") parts.push(STATE_TEXT[row.state]());
  if (row.upgrading) parts.push(m.map_city_state_upgrading());
  return parts.join(" · ");
}

interface BuildingListProps {
  readonly state: CityQueryState<MapLooksResponse>;
  readonly rows: readonly CityBuildingRow[];
  readonly openId: number | null;
  readonly onOpen: (buildingId: number) => void;
  readonly onRetry: () => void;
}

export function CityBuildingList({ state, rows, openId, onOpen, onRetry }: BuildingListProps) {
  const [filter, setFilter] = useState<BuildingFilter>("all");
  const pending = pendingLine(state, onRetry);
  if (pending !== null || state.data === null) return pending;
  if (state.data.status !== "ok") return statusLine(state.data.status);
  const filters = buildingFilters(rows);
  // 거르던 무리가 사라졌으면(다시 받은 뒤) 전체로
  const current = filters.some((entry) => entry.filter === filter) ? filter : "all";
  const shown = filterBuildings(rows, current);
  return (
    <>
      {filters.length > 1 ? (
        <div className="city-card-filters" role="group" aria-label={m.map_city_filter_label()}>
          {filters.map((entry) => (
            <button
              key={entry.filter}
              type="button"
              className="city-card-filter"
              data-filter={entry.filter}
              aria-pressed={current === entry.filter}
              onClick={() => setFilter(entry.filter)}
            >
              <span>{filterText(entry.filter)}</span>
              <span className="city-card-filter-count">{formatCount(entry.count)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="home-card-hint">{rows.length === 0 ? m.map_city_empty() : m.map_city_filter_empty()}</p>
      ) : (
        <ul
          className="city-card-list"
          aria-label={m.map_city_list_label({ filter: filterText(current) })}
          data-rows={shown.length}
        >
          {shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="city-card-row"
                data-building={row.id}
                data-group={row.group}
                data-facility={row.facilityId ?? undefined}
                data-mine={row.mine}
                aria-haspopup="dialog"
                aria-expanded={openId === row.id}
                onClick={() => onOpen(row.id)}
              >
                <span className="city-card-mark" data-group={row.group} title={GROUP_TEXT[row.group]()}>
                  <MapIcon name={row.group} />
                </span>
                <span className="city-card-name">
                  {row.name ?? m.nearby_building_unknown({ id: row.id })}
                </span>
                <span className="city-card-detail">{detailText(row)}</span>
                {row.mine ? (
                  <span className="dash-tag-chip" data-kind="ok">
                    {m.nearby_building_mine()}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const unitTarget = (unit: Pick<MapUnit, "unitId" | "kind">): RouteTarget => ({
  route: "units",
  search: { unit: unit.kind === "cyborg_body" ? "self" : `w${unit.unitId}` },
});

/** 남의 유닛 이름: 이름이 있으면 "종류 이름", 없으면 "종류 #번호". 경비대는 종류 대신 "경비대"(2차맵 한눈 판과 같다) */
export function nearbyUnitText(unit: Pick<NearbyUnit, "unitId" | "kind" | "name" | "guard">): string {
  const type = unit.guard === true ? m.map_unit_guard() : kindLabel(unit.kind);
  return unit.name
    ? m.map_unit_named({ type, name: nameText(unit.name, String(unit.unitId)) })
    : m.roster_unnamed({ type, number: String(unit.unitId) });
}

const cellsText = (cells: number): string =>
  m.home_city_distance_cells({ cells: formatCount(Math.round(cells)) });

interface UnitListProps {
  readonly state: CityQueryState<MapUnitsResponse>;
  /** 시야 안 남의 유닛(같은 탭에서 함께 받는다) */
  readonly nearby: CityQueryState<NearbyUnitsResponse>;
  /** 지금 기준 유닛 */
  readonly selected: number;
  /** 내 유닛 줄을 눌렀다: 그 유닛을 기준 유닛으로 */
  readonly onPick: (unitId: number) => void;
  /** 남의 유닛 줄을 눌렀다: 유닛 대화상자(한눈 정보·지도자 몫·공격)를 연다 */
  readonly onOpen: (unit: NearbyUnit) => void;
  /** 열려 있는 남의 유닛(없으면 null) */
  readonly openId: number | null;
  readonly onRetry: () => void;
}

export function CityUnitList({ state, nearby, selected, onPick, onOpen, openId, onRetry }: UnitListProps) {
  const pending = pendingLine(state, onRetry);
  if (pending !== null || state.data === null) return pending;
  const data = state.data;
  if (data.status !== "ready") return statusLine("not_ready");
  if (!data.loaded) return statusLine("unknown_map");
  const units = sortMapUnits(data.units);
  const others = nearby.data?.status === "ready" && nearby.data.loaded ? nearby.data : null;
  return (
    <>
      <h3 className="city-card-section">
        {m.home_city_units_mine()} <span className="city-card-tab-count">{formatCount(units.length)}</span>
      </h3>
      {units.length === 0 ? (
        <p className="home-card-hint">{m.home_city_units_empty()}</p>
      ) : (
        <ul className="city-card-list" aria-label={m.home_city_units_mine()} data-rows={units.length}>
          {units.map((unit) => {
            const name = unitName(unit);
            return (
              <li key={unit.unitId} className="city-card-unit-row">
                <button
                  type="button"
                  className="city-card-row"
                  data-unit={unit.unitId}
                  aria-pressed={unit.unitId === selected}
                  title={m.home_city_unit_pick({ unit: name })}
                  onClick={() => onPick(unit.unitId)}
                >
                  <span className="city-card-mark" data-group="unit">
                    <MapIcon
                      name={unit.kind === "cyborg_body" || unit.kind === "cyborg" ? "cyborg" : "unit"}
                    />
                  </span>
                  <span className="city-card-name" translate="no">
                    {name}
                  </span>
                  <span className="city-card-detail">
                    {unitStatusText(unit, unit.moving, data.generatedAt)}
                  </span>
                </button>
                <HomeLink
                  to={unitTarget(unit)}
                  className="home-link-button city-card-sheet"
                  aria-label={m.home_city_unit_sheet({ unit: name })}
                  title={m.home_city_unit_sheet({ unit: name })}
                >
                  <ExternalArrowIcon />
                </HomeLink>
              </li>
            );
          })}
        </ul>
      )}
      {data.elsewhere > 0 ? (
        <HomeLink to={{ route: "units" }} className="city-card-more">
          {m.map_units_elsewhere({ count: data.elsewhere })}
        </HomeLink>
      ) : null}

      <h3 className="city-card-section">
        {m.home_city_units_nearby()}{" "}
        {others ? <span className="city-card-tab-count">{formatCount(others.total)}</span> : null}
      </h3>
      {others === null ? (
        (pendingLine(nearby, onRetry) ?? statusLine("not_ready"))
      ) : others.units.length === 0 ? (
        <p className="home-card-hint">{m.home_city_units_nearby_empty()}</p>
      ) : (
        <ul
          className="city-card-list"
          aria-label={m.home_city_units_nearby()}
          data-rows={others.units.length}
        >
          {others.units.map((unit) => {
            const cells = Math.hypot(unit.cellX - others.anchor.x, unit.cellY - others.anchor.y);
            const motion = unit.moving ? m.map_unit_state_moving() : m.map_unit_state_standing();
            return (
              <li key={unit.unitId}>
                <button
                  type="button"
                  className="city-card-row"
                  data-other={unit.unitId}
                  data-kind={unit.kind}
                  aria-haspopup="dialog"
                  aria-expanded={openId === unit.unitId}
                  onClick={() => onOpen(unit)}
                >
                  <span
                    className="city-card-mark"
                    data-group={unit.kind === "npc_leader" ? "administration" : "other"}
                  >
                    <MapIcon
                      name={
                        unit.kind === "cyborg_body" || unit.kind === "cyborg"
                          ? "cyborg"
                          : unit.kind === "boat"
                            ? "transport"
                            : unit.guard === true
                              ? "military"
                              : "unit"
                      }
                    />
                  </span>
                  <span className="city-card-name" translate="no">
                    {nearbyUnitText(unit)}
                  </span>
                  <span className="city-card-detail">{`${motion} · ${cellsText(cells)}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {others !== null && others.total > others.units.length ? (
        <p className="city-card-more">
          {m.home_city_units_nearby_more({ count: formatCount(others.total - others.units.length) })}
        </p>
      ) : null}
    </>
  );
}

interface ResourceListProps {
  readonly state: CityQueryState<GatherObjectsResponse>;
  /** 기준 유닛 자리(가까운 차례·거리. 모르면 null — 많은 차례) */
  readonly at: Cell | null;
  /** 기준 유닛이 배에 탔나(배로만 닿는 종류는 배에 탄 유닛만 캔다) */
  readonly aboard: boolean;
  /** 명령을 보내는 중(단추를 잠근다) */
  readonly sending: boolean;
  /** [채집]: 그 종류의 가장 가까운 캘 수 있는 오브젝트로 기준 유닛을 보낸다 */
  readonly onGather: (row: CityResourceRow) => void;
  readonly onRetry: () => void;
}

/** 자원 줄의 덧말: 수·캘 수 있는 수·가장 가까운 거리·나오는 것, 캘 수 없는 까닭 */
function resourceDetail(row: CityResourceRow, aboard: boolean): string {
  const parts: string[] = [
    m.home_city_resource_count({ count: formatCount(row.count), ready: formatCount(row.ready) }),
  ];
  if (row.nearest) parts.push(cellsText(row.nearest.cells));
  if (row.itemName) parts.push(m.gather_object_item({ item: nameText(row.itemName, "") }));
  if (!row.direct) parts.push(m.home_city_resource_station_only());
  else if (row.boat && !aboard) parts.push(m.home_city_resource_boat_only());
  else if (!row.boat && aboard) parts.push(m.home_city_resource_not_from_boat());
  return parts.join(" · ");
}

export function CityResourceList({ state, at, aboard, sending, onGather, onRetry }: ResourceListProps) {
  const pending = pendingLine(state, onRetry);
  if (pending !== null || state.data === null) return pending;
  const data = state.data;
  if (data.status !== "ok") return statusLine(data.status);
  // 지금 = 응답을 만든 서버 시각(다시 자란 것 세기 — [새로고침]하면 다시 센다)
  const rows = resourceRows(data, data.generatedAt, at);
  if (rows.length === 0) return <p className="home-card-hint">{m.home_city_resources_empty()}</p>;
  return (
    <ul className="city-card-list" aria-label={m.home_city_tab_resources()} data-rows={rows.length}>
      {rows.map((row) => {
        const name = nameText(row.name, row.kindId);
        return (
          <li key={row.kindId} className="city-card-row city-card-row-static" data-kind={row.kindId}>
            <span className="city-card-mark" data-group="gathering">
              <MapIcon name="gathering" />
            </span>
            <span className="city-card-name">{name}</span>
            <span className="city-card-detail">{resourceDetail(row, aboard)}</span>
            {canGatherKind(row, aboard) ? (
              <button
                type="button"
                className="button-small button-primary city-card-gather"
                data-part="gather"
                data-object={row.nearest?.objectId}
                aria-label={m.home_city_resource_gather({ resource: name })}
                disabled={sending}
                onClick={() => onGather(row)}
              >
                {m.gather_action_gather()}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface InfoProps {
  readonly unit: WorldMyUnit;
  readonly world: WorldCitiesResponse | null;
  /** 이 2차맵의 도시(없으면 도시 밖) */
  readonly cities: readonly WorldMapCity[];
  /** 보이는 건물(받기 전·띄우지 않은 2차맵이면 null) */
  readonly buildings: readonly CityBuildingRow[] | null;
  /** 이 2차맵의 내 유닛(자리) */
  readonly mine: readonly (Cell & { readonly unitId: number })[];
  /** 시야 안 남의 유닛(받기 전이면 빈 목록) */
  readonly others: readonly NearbyUnit[];
  /** 지형(받기 전·실패면 null) */
  readonly terrain: TerrainData | null;
  readonly claimable: boolean;
}

export function CityInfo({ unit, world, cities, buildings, mine, others, terrain, claimable }: InfoProps) {
  const key = String(unit.mapKey);
  const city = cities[0] ?? null;
  return (
    <div className="city-card-info">
      {buildings === null ? null : (
        <CityMinimap
          terrain={terrain}
          buildings={buildings}
          mine={mine}
          selected={unit.unitId}
          others={others}
        />
      )}
      <div className="city-card-info-side">
        <dl className="city-card-facts">
          <div>
            <dt>{m.home_city_info_place()}</dt>
            <dd translate="no">
              {world === null
                ? m.home_loading()
                : city === null
                  ? m.home_city_place_wild()
                  : cities
                      .map((entry) =>
                        [cityLabel(world.factions, entry), factionName(world.factions, entry.factionId)].join(
                          " · ",
                        ),
                      )
                      .join(" / ")}
            </dd>
          </div>
          {city !== null && typeof city.population === "number" ? (
            <div>
              <dt>{m.home_city_info_population()}</dt>
              <dd>{formatCount(city.population)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{m.home_city_info_buildings()}</dt>
            <dd>
              {buildings === null
                ? "—"
                : m.home_city_info_buildings_value({
                    count: formatCount(buildings.length),
                    mine: formatCount(buildings.filter((row) => row.mine).length),
                  })}
            </dd>
          </div>
          <div>
            <dt>{m.home_city_info_units()}</dt>
            <dd>{formatCount(mine.length)}</dd>
          </div>
          <div>
            <dt>{m.planet_editor_cell_latlon()}</dt>
            <dd>
              {m.planet_editor_cell_latlon_value({
                lat: unit.latDeg.toFixed(1),
                lon: unit.lonDeg.toFixed(1),
              })}
            </dd>
          </div>
        </dl>
        {city !== null ? <LandFacts land={city.land} /> : null}
        {claimable ? <p className="home-card-hint">{m.home_city_claim_hint()}</p> : null}
        <div className="city-card-links">
          <HomeLink to={{ route: "map", search: { key } }} className="city-link-button">
            {m.home_city_open_map()}
          </HomeLink>
          <HomeLink to={{ route: "map_planet", search: { key } }} className="city-link-button">
            {m.map_open_planet_here()}
          </HomeLink>
        </div>
      </div>
    </div>
  );
}
