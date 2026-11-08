// 2차맵 근처 판 — 자원·건물·유닛 탭과 기준 유닛에서 가까운 차례 목록. docs/adr/2026-11-08-seamless-second-map.md WP-2.
// - 탭을 고르면 지도에는 그 탭 표시만 보인다(채집 덧그림이 nearbyState를 읽는다). [닫기]면 지도 표시가 없다. 같은 탭을 다시 누르면 접고 편다.
// - 20개씩: 목록 끝까지 내리거나 [N개 더 보기]를 누르면 20개 더(사용자 답 Q4).
// - 줄 누르기: 자원·건물 = 아래 채집·건물 판(gather/), 내 유닛 = 고르기(카메라가 그 유닛을 따라간다), 다른 유닛 = 살펴보기(정보만).
//   좁은 화면이면 누른 뒤 목록을 접는다(아래 판·지도가 보이게, 탭 줄과 지도 표시는 남는다).
// - 줄은 1초마다와 자료가 바뀔 때 다시 만든다(유닛이 움직이면 거리도 바뀐다). 엔진·자료는 함수로 받는다(그리는 중에는 읽지 않는다).
// - 유닛 탭 끝에 "다른 곳에 내 유닛 N"(기획 답 632 다). 이 판이 옛 [내 유닛 N] 목록을 맡는다(사용자 답 "합치기: 내 유닛 + 보이는 유닛").
import type { MapUnit } from "@terra/shared/mapUnits";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { m } from "../../paraglide/messages.js";
import type { GatherState } from "../gather/gatherState.ts";
import { ElsewhereLine } from "../UnitControlPanels.tsx";
import { wideScreen } from "../commandNotice.ts";
import { type Point, distanceParts, nearListEnd } from "./nearbyData.ts";
import { EMPTY_ROWS, type NearbyRow, type NearbyRows, buildNearbyRows } from "./nearbyRows.ts";
import { NEARBY_PAGE, NEARBY_TABS, type NearbyState, type NearbyTab } from "./nearbyState.ts";
import "./nearby.css";

/** 줄을 다시 만드는 간격(ms) */
const ROWS_TICK_MS = 1_000;
/** 목록 id(탭 단추의 aria-controls) */
const LIST_ID = "map-nearby-list";

const TAB_LABEL = {
  resources: () => m.nearby_tab_resources(),
  buildings: () => m.nearby_tab_buildings(),
  units: () => m.nearby_tab_units(),
} satisfies Record<NearbyTab, () => string>;

const EMPTY_TEXT = {
  resources: () => m.nearby_empty_resources(),
  buildings: () => m.nearby_empty_buildings(),
  units: () => m.nearby_empty_units(),
} satisfies Record<NearbyTab, () => string>;

export interface NearbySources {
  /** 기준 유닛의 지금 자리(배치 칸, 없으면 null) */
  readonly anchorAt: () => Point | null;
  /** 엔진이 아는 유닛의 지금 자리 */
  readonly unitAt: (id: number) => Point | null;
  /** 시야 안 유닛 ID */
  readonly visibleUnits: () => Iterable<number>;
  readonly serverNow: () => number;
}

interface NearbyPanelProps {
  readonly nearby: NearbyState;
  readonly gather: GatherState;
  readonly sources: NearbySources;
  readonly myUnits: readonly MapUnit[] | null;
  readonly unitsFailed: boolean;
  readonly elsewhere: number;
  readonly moving: ReadonlySet<number>;
  /** 내 유닛 목록을 받은 서버 시각(부상 남은 시간 "N시간 M분", D-525) */
  readonly now?: number | undefined;
  readonly selected: number | null;
  readonly onPickUnit: (unit: MapUnit) => void;
  readonly onInspectUnit: (unitId: number) => void;
}

/** 거리 글자(칸 크기를 모르면 빈 글자) */
function distanceText(cells: number, cellM: number): string {
  const parts = distanceParts(cells, cellM);
  if (!parts) return "";
  return parts.unit === "m"
    ? m.nearby_distance_m({ m: parts.value })
    : m.nearby_distance_km({ km: parts.value });
}

/** 판이 닫혀 있을 때 [근처] 단추 */
export function NearbyToggle({ nearby }: { readonly nearby: NearbyState }) {
  return (
    <button
      type="button"
      className="button-small map-nearby-toggle"
      aria-expanded={false}
      aria-controls={LIST_ID}
      onClick={() => nearby.setTab("units")}
    >
      {m.nearby_open()}
    </button>
  );
}

export function NearbyPanel(props: NearbyPanelProps) {
  const { nearby, gather } = props;
  const version = useSyncExternalStore(
    (listener) => nearby.subscribe(listener),
    () => nearby.version,
  );
  const [rows, setRows] = useState<NearbyRows>(EMPTY_ROWS);
  // 줄 만들기가 읽는 최신 값(효과가 고친다 — 그리는 중에는 읽지 않는다)
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const tab = nearby.tab;
  useEffect(() => {
    if (tab === null) return () => undefined;
    const update = (): void => {
      const now = latest.current;
      setRows(
        buildNearbyRows({
          tab: nearby.tab,
          limit: nearby.limit,
          at: now.sources.anchorAt(),
          nowMs: now.sources.serverNow(),
          kinds: gather.kinds,
          objects: gather.objects,
          buildings: gather.buildings,
          looks: nearby.looks,
          myUnits: now.myUnits,
          visibleUnits: now.sources.visibleUnits(),
          unitAt: now.sources.unitAt,
          moving: now.moving,
          listedAt: now.now,
        }),
      );
    };
    const first = setTimeout(update, 0);
    const timer = setInterval(update, ROWS_TICK_MS);
    const offGather = gather.subscribe(update);
    const offNearby = nearby.subscribe(update);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      offGather();
      offNearby();
    };
  }, [tab, gather, nearby]);

  if (tab === null) return null;
  const left = Math.max(0, rows.total - rows.rows.length);
  const pick = (row: NearbyRow): void => {
    if (row.kind === "unit") {
      if (row.unit) props.onPickUnit(row.unit);
      else props.onInspectUnit(row.id);
      return;
    }
    gather.open({ kind: row.kind === "object" ? "object" : "building", id: row.id });
    // 좁은 화면: 목록을 접어 아래 판·지도가 보이게(고른 탭 표시는 남는다)
    if (!wideScreen()) nearby.setExpanded(false);
  };
  const pressed = (row: NearbyRow): boolean => {
    if (row.kind === "unit") return props.selected === row.id;
    return (
      gather.sheet?.kind === (row.kind === "object" ? "object" : "building") && gather.sheet.id === row.id
    );
  };
  return (
    <section
      className="map-panel map-nearby"
      aria-labelledby="map-nearby-title"
      data-tab={tab}
      data-rows={rows.rows.length}
      data-total={rows.total}
      data-version={version}
    >
      <div className="map-nearby-head">
        <h2 id="map-nearby-title" className="visually-hidden">
          {m.nearby_title()}
        </h2>
        <div className="map-nearby-tabs" role="group" aria-label={m.nearby_title()}>
          {NEARBY_TABS.map((key) => (
            <button
              key={key}
              type="button"
              className="map-nearby-tab"
              data-tab={key}
              aria-pressed={tab === key}
              aria-expanded={tab === key ? nearby.expanded : undefined}
              aria-controls={tab === key ? LIST_ID : undefined}
              onClick={() => nearby.setTab(key)}
            >
              <span>{TAB_LABEL[key]()}</span>
              <span className="map-nearby-count">{rows.counts[key]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="button-small map-nearby-close" onClick={() => nearby.setTab(null)}>
          {m.nearby_close()}
        </button>
      </div>
      {nearby.expanded ? (
        <>
          {tab === "units" && props.unitsFailed ? (
            <p className="map-nearby-note" role="status">
              {m.map_units_failed()}
            </p>
          ) : null}
          {rows.rows.length === 0 ? (
            <p className="map-nearby-note">{EMPTY_TEXT[tab]()}</p>
          ) : (
            <ul
              id={LIST_ID}
              className="map-nearby-list"
              aria-label={m.nearby_list_label({ tab: TAB_LABEL[tab]() })}
              onScroll={(event) => {
                if (left > 0 && nearListEnd(event.currentTarget)) nearby.more();
              }}
            >
              {rows.rows.map((row) => (
                <li key={`${row.kind}:${row.id}`}>
                  <button
                    type="button"
                    className="map-nearby-row"
                    aria-pressed={pressed(row)}
                    data-kind={row.kind}
                    data-id={row.id}
                    data-mine={
                      row.kind === "unit" ? row.unit !== null : row.kind === "building" ? row.mine : undefined
                    }
                    data-depleted={row.kind === "object" && row.depleted ? "true" : undefined}
                    onClick={() => pick(row)}
                  >
                    <span className="map-nearby-name">{row.name}</span>
                    <span className="map-nearby-detail">{row.detail}</span>
                    <span className="map-nearby-distance">{distanceText(row.cells, nearby.cellM)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {left > 0 ? (
            <button type="button" className="button-small map-nearby-more" onClick={() => nearby.more()}>
              {m.nearby_more({ count: Math.min(NEARBY_PAGE, left) })}
            </button>
          ) : null}
          {tab === "units" ? <ElsewhereLine count={props.elsewhere} /> : null}
        </>
      ) : null}
    </section>
  );
}
