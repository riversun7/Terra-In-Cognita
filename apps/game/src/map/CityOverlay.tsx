// 1차맵 도시 덧그림 — 도시 표시(국가 색 점 + 이름), 내 사이보그 표시, 영토(도시 원들의 합·국가 이름). docs/adr/2026-11-07-play-flow.md
// "WP2 지도 흐름". 1차맵 화면과 첫 접속 도시 고르기가 같이 쓴다.
// - 엔진(onOverlay)이 그린 프레임마다 투영기를 주면 DOM 위치·보임만 바로 바꾼다(React 상태를 바꾸지 않는다, PLAN 5.7).
// - 가까운 표시는 묶는다: 화면에서 CLUSTER_PX 안에 겹치면 앞 것 하나만 보이고 "+N"을 단다. 묶음을 누르면 그곳으로 다가간다(onZoomTo).
// - 이름표는 이웃 표시와 LABEL_GAP_PX보다 떨어져 있거나 고른 도시일 때만 보인다(겹친 글자를 막는다). 단추의 읽는 이름은 늘 있다.
// - 지평선 너머 표시는 숨긴다(hidden). 키보드·화면 읽기 대안은 화면의 도시 목록이다.
// - 영토 레이어(사용자 요청 2026-11-12, ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"): emphasis면 영토 칠·테두리를 진하게 하고 국가
//   이름을 영토 위에 단다. 수도(세력 행 capital_city_id)는 어느 레이어에서나 별 표시를 단다.
// - 영토(사용자 결정 2026-11-14, ADR 2026-11-07-planet-view "바뀜 (2026-11-14)", 모양 셈은 territoryShapes.ts): 도시마다 배후지 반경 원,
//   국가마다 원들의 합, 다른 국가 원이 겹친 곳은 두 도시의 가운데가 경계. 칠은 한 묶음(불투명 국가 색 + 묶음 투명도)에 원 바탕 → 이긴 조각
//   차례로 덧칠하고, 테두리는 국가가 바뀌는 선만 긋는다. 모양(위도·경도)은 도시 자료가 바뀔 때만 셈하고, 프레임마다 꼭짓점만 투영한다:
//   화면 밖·지평선 너머 도시는 건너뛰고, 화면에서 작은 원은 꼭짓점을 솎는다(1단계 행성 전체 보기에서 원 하나 = 몇 px).
// - 국가 이름표: 넓은 국가부터, 다른 이름표·보이는 도시 표시와 겹치지 않는 자리(가운데·위·아래)에 단다. 자리가 없으면 감춘다.
import type { PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type { WorldMapCity, WorldMapFaction } from "@terra/shared/worldMap";
import { useEffect, useMemo, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { type LabelSize, placeLabels, projectTerritory } from "./territoryDraw.ts";
import { type TerritoryShapes, buildTerritoryShapes, territorySitesOf } from "./territoryShapes.ts";
import { cityLabel, factionColor, factionName } from "./worldMapData.ts";
import "./cityOverlay.css";

/** 겹침으로 칠 화면 거리(CSS px) */
const CLUSTER_PX = 22;
/** 이름표를 보일 이웃과의 거리(CSS px, 가로·세로) */
const LABEL_GAP_X_PX = 140;
const LABEL_GAP_Y_PX = 52;

/** 엔진 프레임마다 부를 덧그림 함수를 화면(엔진 주인)에 맡긴다. null = 뗌 */
export type RegisterOverlay = (draw: ((projector: PlanetProjector) => void) | null) => void;

interface CityOverlayProps {
  readonly cities: readonly WorldMapCity[];
  readonly factions: readonly WorldMapFaction[];
  /** 반경 환산(1000분율 칸 → 라디안). 0·없음이면 영토를 그리지 않는다 */
  readonly milliPerRadian?: number | undefined;
  /** 내 사이보그 자리(없으면 그리지 않는다) */
  readonly me?: { readonly latDeg: number; readonly lonDeg: number } | null | undefined;
  readonly selected: number | null;
  readonly onSelect: (city: WorldMapCity) => void;
  /** 묶음 표시를 누르면 그곳으로 다가간다 */
  readonly onZoomTo: (city: WorldMapCity) => void;
  /** 엔진 onOverlay가 부를 함수를 맡긴다(화면이 자기 ref에 둔다) */
  readonly register: RegisterOverlay;
  /** 영토 레이어: 영토 칠·테두리를 진하게, 국가 이름표를 단다 */
  readonly emphasis?: boolean | undefined;
  /** 덧그림 자료가 바뀌면 한 번 더 그리게(엔진 requestFrame) */
  readonly requestFrame: () => void;
}

/** 정수 px에 놓는다(반 px 자리는 누르는 상자 크기가 44px보다 조금 작게 재진다) */
const place = (element: HTMLElement, point: { readonly x: number; readonly y: number }): void => {
  element.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -50%)`;
};

/** 영토를 그릴 국가(도시 차례에 처음 나온 차례) */
function areaNations(cities: readonly WorldMapCity[]): number[] {
  return [...new Set(cities.map((city) => city.factionId))];
}

/** 국가 영토 한 벌(원 바탕·이긴 조각·테두리 경로, 이름표) */
interface AreaParts {
  base: SVGPathElement | null;
  win: SVGPathElement | null;
  edge: SVGPathElement | null;
  label: HTMLSpanElement | null;
}

/** 영토 모양(도시 자료가 바뀔 때만 셈한다)과 도시 가운데 */
interface TerritoryModel {
  readonly shapes: TerritoryShapes;
  readonly centers: ReadonlyMap<number, readonly [number, number]>;
}

/** 표시 차례: 고른 도시 → 시작 도시 → 나머지(ID 차례). 묶을 때 앞 것이 남는다 */
function drawOrder(cities: readonly WorldMapCity[], selected: number | null): WorldMapCity[] {
  return cities.toSorted(
    (a, b) =>
      Number(b.id === selected) - Number(a.id === selected) ||
      Number(b.start) - Number(a.start) ||
      a.id - b.id,
  );
}

export function CityOverlay(props: CityOverlayProps) {
  const { cities, factions, selected, register, requestFrame, milliPerRadian } = props;
  const markers = useRef(new Map<number, HTMLButtonElement>());
  const areas = useRef(new Map<number, AreaParts>());
  // 이름표 크기(px) — 글자가 바뀌지 않으니 처음 잰 값을 둔다(국가 목록이 바뀌면 다시 잰다)
  const labelSizes = useRef(new Map<number, LabelSize>());
  const meRef = useRef<HTMLSpanElement>(null);
  const territoryRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const territory = useMemo((): TerritoryModel => {
    const sites = territorySitesOf(cities, milliPerRadian);
    return {
      shapes: buildTerritoryShapes(sites),
      centers: new Map(sites.map((site) => [site.id, [site.latDeg, site.lonDeg] as const])),
    };
  }, [cities, milliPerRadian]);
  const model = useRef(territory);

  // 그린 뒤 최신 자료를 둔다. 자료·고르기·내 자리·영토·강조가 바뀌었으면 한 번 더 그린다(새 단추 위치를 잡는다)
  useEffect(() => {
    const before = latest.current;
    latest.current = props;
    const changedShapes = model.current !== territory;
    model.current = territory;
    if (before.factions !== props.factions) labelSizes.current.clear();
    if (
      changedShapes ||
      before.cities !== props.cities ||
      before.selected !== props.selected ||
      before.me !== props.me ||
      before.emphasis !== props.emphasis ||
      before.factions !== props.factions
    )
      props.requestFrame();
  });

  // 투영기를 받으면 위치·보임·묶음·이름표를 바꾼다(엔진 프레임 안). 붙이면 한 번 그린다
  useEffect(() => {
    register((projector) => {
      const { cities: list, me, selected: chosen, emphasis } = latest.current;
      const shown: { readonly city: WorldMapCity; readonly point: ProjectedPoint; count: number }[] = [];
      for (const city of drawOrder(list, chosen)) {
        const element = markers.current.get(city.id);
        if (!element) continue;
        const point = projector.project(city.latDeg, city.lonDeg);
        if (!point?.visible) {
          element.hidden = true;
          continue;
        }
        const near = shown.find(
          (entry) => Math.hypot(entry.point.x - point.x, entry.point.y - point.y) < CLUSTER_PX,
        );
        if (near) {
          near.count += 1;
          element.hidden = true;
          continue;
        }
        element.hidden = false;
        place(element, point);
        shown.push({ city, point, count: 1 });
      }
      for (const entry of shown) {
        const element = markers.current.get(entry.city.id);
        if (!element) continue;
        element.dataset.cluster = String(entry.count);
        const crowded = shown.some(
          (other) =>
            other !== entry &&
            Math.abs(other.point.x - entry.point.x) < LABEL_GAP_X_PX &&
            Math.abs(other.point.y - entry.point.y) < LABEL_GAP_Y_PX,
        );
        element.dataset.label = entry.count === 1 && (!crowded || entry.city.id === chosen) ? "on" : "off";
      }
      // 영토: 국가마다 원 바탕·이긴 조각·테두리 경로(territoryDraw.ts)
      const { shapes, centers } = model.current;
      const frame = projectTerritory(projector, shapes, centers);
      for (const [nation, parts] of areas.current) {
        parts.base?.setAttribute("d", frame.base.get(nation) ?? "");
        parts.win?.setAttribute("d", frame.wins.get(nation) ?? "");
        parts.edge?.setAttribute("d", frame.edges.get(nation) ?? "");
      }
      if (territoryRef.current) territoryRef.current.dataset.drawn = String(frame.cities);
      // 국가 이름표(영토 레이어만): 크기는 처음 한 번 잰다(읽기를 쓰기보다 먼저 — 레이아웃을 한 번만 셈한다)
      const labels = [...areas.current].flatMap(([nation, parts]) =>
        parts.label ? [[nation, parts.label] as const] : [],
      );
      for (const [nation, label] of labels) {
        if (!labelSizes.current.has(nation) && label.offsetWidth > 0)
          labelSizes.current.set(nation, { width: label.offsetWidth, height: label.offsetHeight });
      }
      const spots = emphasis
        ? placeLabels(
            projector,
            shapes.labels,
            labelSizes.current,
            shown.map((entry) => entry.point),
          )
        : new Map<number, { x: number; y: number }>();
      for (const [nation, label] of labels) {
        const spot = spots.get(nation);
        label.dataset.shown = spot ? "true" : "false";
        if (spot) place(label, spot);
      }
      const mine = meRef.current;
      if (mine && me) {
        const point = projector.project(me.latDeg, me.lonDeg);
        mine.hidden = !point?.visible;
        if (point?.visible) place(mine, point);
      }
    });
    requestFrame();
    return () => register(null);
  }, [register, requestFrame]);

  /** 그 국가 영토 한 벌(없으면 만든다). 국가가 목록에서 빠지면 모두 null이 되고 다음 그리기에서 지운다 */
  const areaRef = (nation: number): AreaParts => {
    let parts = areas.current.get(nation);
    if (!parts) {
      parts = { base: null, win: null, edge: null, label: null };
      areas.current.set(nation, parts);
    }
    return parts;
  };

  const click = (city: WorldMapCity): void => {
    const count = Number(markers.current.get(city.id)?.dataset.cluster ?? "1");
    if (count > 1) props.onZoomTo(city);
    else props.onSelect(city);
  };

  const nations = areaNations(cities);
  return (
    <div
      className="city-overlay"
      ref={territoryRef}
      data-emphasis={props.emphasis ? "territory" : undefined}
      data-territories={territory.shapes.labels.length}
    >
      <svg className="city-territory" aria-hidden="true">
        {/* 칠: 한 묶음 안에 불투명 국가 색으로 원 바탕 → 이긴 조각 차례(뒤가 위). 투명도는 묶음에 한 번 */}
        <g className="city-area-fills">
          {nations.map((nation) => (
            <path
              key={`base-${String(nation)}`}
              ref={(element) => {
                areaRef(nation).base = element;
              }}
              className="city-area-fill"
              data-nation={factionColor(factions, nation)}
            />
          ))}
          {nations.map((nation) => (
            <path
              key={`win-${String(nation)}`}
              ref={(element) => {
                areaRef(nation).win = element;
              }}
              className="city-area-fill"
              data-nation={factionColor(factions, nation)}
            />
          ))}
        </g>
        {nations.map((nation) => (
          <path
            key={`edge-${String(nation)}`}
            ref={(element) => {
              areaRef(nation).edge = element;
            }}
            className="city-area-edge"
            data-nation={factionColor(factions, nation)}
          />
        ))}
      </svg>
      {nations.map((nation) => (
        <span
          key={`label-${String(nation)}`}
          ref={(element) => {
            areaRef(nation).label = element;
          }}
          className="city-area-label"
          data-nation={factionColor(factions, nation)}
          data-faction={nation}
          data-shown="false"
          aria-hidden="true"
        >
          {factionName(factions, nation)}
        </span>
      ))}
      {cities.map((city) => {
        const label = cityLabel(factions, city);
        return (
          <button
            key={city.id}
            type="button"
            hidden
            ref={(element) => {
              if (element) markers.current.set(city.id, element);
              else markers.current.delete(city.id);
            }}
            className="city-marker"
            data-city={city.id}
            data-nation={factionColor(factions, city.factionId)}
            data-start={city.start ? "true" : "false"}
            data-capital={city.capital ? "true" : undefined}
            data-label="off"
            data-cluster="1"
            aria-pressed={selected === city.id}
            aria-label={[
              label,
              ...(city.capital ? [m.planet_territory_capital()] : []),
              ...(city.start ? [m.world_city_start()] : []),
            ].join(" · ")}
            onClick={() => click(city)}
          >
            <span className="city-marker-dot" aria-hidden="true">
              {city.capital ? <span className="city-marker-capital">★</span> : null}
            </span>
            <span className="city-marker-name" aria-hidden="true">
              {label}
            </span>
          </button>
        );
      })}
      {props.me ? (
        <span ref={meRef} className="city-me" role="img" aria-label={m.world_my_cyborg()} hidden />
      ) : null}
    </div>
  );
}
