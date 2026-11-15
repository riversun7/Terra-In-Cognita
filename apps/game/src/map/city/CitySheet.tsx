// 2차맵 도시 화면(큰 판) — 사용자 지적 2026-11-12 "도시(현재맵도시와 건물 리스트를 보여주고 빠르게 조회 및 조작할 수있는 큰화면)".
// 아래 탭 [도시]로 연다(판 하나 규칙 — useBottomSheet). 위 판 줄까지 덮는 큰 판이고 아래 탭은 남는다.
// - 머리: 이 2차맵의 도시(이름·국가·등급·수도 — world.cities), 건물 수, [행정 건물](정부 판이 그 건물 판 안에 있다), [닫기].
// - 거르기 칩: 전체·내 것·시설 분류 아홉(기획 D-560 — 행정·채집·가공·제작·저장·물류·주거·공공·서비스·상업·교통·항만·군사·방어)·그 밖(0인 무리는
//   숨긴다). 무리는 시설 분류(겉모습 답의 category)에서 정한다(cityRows.ts).
// - 건물 줄: 무리 표시·이름·레벨·상태(짓는 중·손상·멈춤·폐허·레벨 올리는 중)·내 것·거리. 줄을 누르면 카메라가 그 건물로 가고 그 건물 판이
//   열린다(onOpen — 화면이 한다. 판의 들어가기·채집소·정부 몫은 옛 건물 판 그대로, 이 화면은 같은 판을 연다).
// 자료는 지도 자료의 건물(보이는 것만)과 겉모습 답(근처 판과 같은 nearbyState.looks)이다 — 새 조회를 하지 않는다(도시 이름만 world.cities).
import type { WorldCitiesResponse, WorldMapCity } from "@terra/shared/worldMap";
import { useEffect, useState, useSyncExternalStore } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import type { GatherState } from "../gather/gatherState.ts";
import { FACILITY_CATEGORY_TEXT } from "../facilityCategoryText.ts";
import { MapIcon } from "../mapIcons.tsx";
import { type Point, distanceParts } from "../nearby/nearbyData.ts";
import type { NearbyState } from "../nearby/nearbyState.ts";
import { cityLabel, factionName, loadWorldCities } from "../worldMapData.ts";
import {
  type CityFilter,
  type CityRow,
  FACILITY_GROUPS,
  type FacilityGroup,
  buildCityRows,
  cityCounts,
  filterCityRows,
  governmentOf,
} from "./cityRows.ts";
import "./citySheet.css";

/** 거리를 다시 재는 간격(ms) — 기준 유닛이 움직인다 */
const DISTANCE_TICK_MS = 2_000;

const GROUP_TEXT = {
  ...FACILITY_CATEGORY_TEXT,
  other: () => m.map_city_group_other(),
} satisfies Record<FacilityGroup, () => string>;

const FILTER_TEXT = (filter: CityFilter): string =>
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

/** 줄의 덧말: 레벨·상태·레벨 올리는 중·내 것 */
function detailText(row: CityRow): string {
  const parts: string[] = [];
  if (row.level !== null && row.level > 0) parts.push(m.nearby_building_level({ level: row.level }));
  if (row.state !== null && row.state !== "ok") parts.push(STATE_TEXT[row.state]());
  if (row.upgrading) parts.push(m.map_city_state_upgrading());
  if (row.mine) parts.push(m.nearby_building_mine());
  return parts.join(" · ");
}

function distanceText(cells: number | null, cellM: number): string {
  if (cells === null) return "";
  const parts = distanceParts(cells, cellM);
  if (!parts) return "";
  return parts.unit === "m"
    ? m.nearby_distance_m({ m: parts.value })
    : m.nearby_distance_km({ km: parts.value });
}

/** 이 2차맵의 도시 한 줄(이름·국가·등급·수도) */
function cityLine(city: WorldMapCity, world: WorldCitiesResponse): string {
  const parts = [cityLabel(world.factions, city), factionName(world.factions, city.factionId)];
  if (city.grade !== null) parts.push(m.map_city_grade({ grade: city.grade }));
  if (city.capital === true) parts.push(m.map_city_capital());
  return parts.join(" · ");
}

interface CitySheetProps {
  readonly gather: GatherState;
  readonly nearby: NearbyState;
  readonly mapKey: number;
  /** 거리를 재는 기준점(기준 유닛 자리, 없으면 null) — 부를 때 읽는다 */
  readonly anchorAt: () => Point | null;
  /** 줄을 눌렀다: 카메라를 그 건물로 옮기고 건물 판을 연다 */
  readonly onOpen: (buildingId: number) => void;
  /** [건설]: 건축 모드를 연다(없으면 단추 없음) */
  readonly onBuild?: (() => void) | undefined;
  readonly onClose: () => void;
}

export function CitySheet({ gather, nearby, mapKey, anchorAt, onOpen, onBuild, onClose }: CitySheetProps) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const gatherVersion = useSyncExternalStore(
    (listener) => gather.subscribe(listener),
    () => gather.version,
  );
  const nearbyVersion = useSyncExternalStore(
    (listener) => nearby.subscribe(listener),
    () => nearby.version,
  );
  const [filter, setFilter] = useState<CityFilter>("all");
  const [world, setWorld] = useState<WorldCitiesResponse | null>(null);
  // 기준점은 잠깐마다 다시 읽는다(그리는 중에는 읽지 않는다)
  const [at, setAt] = useState<Point | null>(null);
  useEffect(() => {
    const read = (): void => setAt(anchorAt());
    const first = setTimeout(read, 0);
    const timer = setInterval(read, DISTANCE_TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [anchorAt]);
  // 도시 목록은 판을 열 때 한 번 묻는다(옆 2차맵으로 넘어도 같은 목록에서 그 2차맵 도시를 고른다)
  useEffect(() => {
    const controller = new AbortController();
    loadWorldCities(controller.signal).then(setWorld, () => undefined);
    return () => controller.abort();
  }, []);
  // Esc로 닫는다(열린 대화상자가 없을 때)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && document.querySelector("dialog[open]") === null) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const locale = getLocale() === "en" ? "en" : "ko";
  // 판 번호(구독)가 바뀌거나 기준점을 다시 읽으면 다시 그리며 만든다(건물 수백 개 — 싸다)
  const rows = buildCityRows({ buildings: gather.buildings, looks: nearby.looks, at, locale });
  const counts = cityCounts(rows);
  const shown = filterCityRows(rows, filter);
  const government = governmentOf(rows);
  const cities = world?.cities.filter((city) => city.mapKey === mapKey) ?? [];
  const filters = (["all", "mine", ...FACILITY_GROUPS] satisfies CityFilter[]).filter(
    (key: CityFilter) => key === "all" || counts[key] > 0,
  );

  return (
    <section
      className="map-panel map-city"
      aria-labelledby="map-city-title"
      data-rows={shown.length}
      data-total={rows.length}
      data-version={`${gatherVersion}.${nearbyVersion}`}
    >
      <div className="map-city-head">
        <h2 id="map-city-title" className="map-city-title" ref={headingRef} tabIndex={-1}>
          <MapIcon name="city" />
          <span>{m.map_city_title()}</span>
          <span className="map-city-count">{rows.length}</span>
        </h2>
        <button type="button" className="button-small map-city-close" onClick={onClose}>
          {m.map_city_close()}
        </button>
      </div>
      {world ? (
        cities.length === 0 ? (
          <p className="map-city-note">{m.map_city_none()}</p>
        ) : (
          <ul className="map-city-places">
            {cities.map((city) => (
              <li key={city.id} data-city={city.id} translate="no">
                {cityLine(city, world)}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {/* [건설]: 건축 모드로(docs/adr/2026-11-14-second-map-build.md — 사용자 요청 "도시 버튼을 통해 2차맵에 건축모드로 진입") */}
      <div className="map-city-actions">
        {onBuild ? (
          <button type="button" className="button-small button-primary map-city-build" onClick={onBuild}>
            {m.map_city_build()}
          </button>
        ) : null}
        {government ? (
          <button
            type="button"
            className="button-small map-city-government"
            onClick={() => onOpen(government.id)}
          >
            {m.map_city_government()}
          </button>
        ) : null}
      </div>
      <div className="map-city-filters" role="group" aria-label={m.map_city_filter_label()}>
        {filters.map((key) => (
          <button
            key={key}
            type="button"
            className="map-city-filter"
            data-filter={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            <span>{FILTER_TEXT(key)}</span>
            <span className="map-city-filter-count">{counts[key]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="map-city-note">{rows.length === 0 ? m.map_city_empty() : m.map_city_filter_empty()}</p>
      ) : (
        <ul className="map-city-list" aria-label={m.map_city_list_label({ filter: FILTER_TEXT(filter) })}>
          {shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="map-city-row"
                data-building={row.id}
                data-group={row.group}
                data-facility={row.facilityId ?? undefined}
                data-mine={row.mine}
                aria-pressed={gather.sheet?.kind === "building" && gather.sheet.id === row.id}
                onClick={() => onOpen(row.id)}
              >
                <span className="map-city-mark" data-group={row.group} title={GROUP_TEXT[row.group]()}>
                  <MapIcon name={row.group} />
                </span>
                <span className="map-city-name">{row.name ?? m.nearby_building_unknown({ id: row.id })}</span>
                <span className="map-city-detail">{detailText(row)}</span>
                <span className="map-city-distance">{distanceText(row.cells, nearby.cellM)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
