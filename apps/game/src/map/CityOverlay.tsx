// 1차맵 도시 덧그림 — 도시 표시(국가 색 점 + 이름), 내 사이보그 표시, 영토 경계(볼록 껍질·도시 영향권). docs/adr/2026-11-07-play-flow.md
// "WP2 지도 흐름". 1차맵 화면과 첫 접속 도시 고르기가 같이 쓴다.
// - 엔진(onOverlay)이 그린 프레임마다 투영기를 주면 DOM 위치·보임만 바로 바꾼다(React 상태를 바꾸지 않는다, PLAN 5.7).
// - 가까운 표시는 묶는다: 화면에서 CLUSTER_PX 안에 겹치면 앞 것 하나만 보이고 "+N"을 단다. 묶음을 누르면 그곳으로 다가간다(onZoomTo).
// - 이름표는 이웃 표시와 LABEL_GAP_PX보다 떨어져 있거나 고른 도시일 때만 보인다(겹친 글자를 막는다). 단추의 읽는 이름은 늘 있다.
// - 지평선 너머 표시는 숨긴다(hidden). 키보드·화면 읽기 대안은 화면의 도시 목록이다.
import type { PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type { WorldMapCity, WorldMapFaction, WorldMapHull } from "@terra/shared/worldMap";
import { useEffect, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { cityLabel, factionColor } from "./worldMapData.ts";
import "./cityOverlay.css";

/** 겹침으로 칠 화면 거리(CSS px) */
const CLUSTER_PX = 22;
/** 이름표를 보일 이웃과의 거리(CSS px, 가로·세로) */
const LABEL_GAP_X_PX = 140;
const LABEL_GAP_Y_PX = 52;
/** 영향권 원을 그리는 점 수와 그릴 가장 작은 반지름(CSS px) */
const CIRCLE_POINTS = 32;
const CIRCLE_MIN_PX = 6;

/** 엔진 프레임마다 부를 덧그림 함수를 화면(엔진 주인)에 맡긴다. null = 뗌 */
export type RegisterOverlay = (draw: ((projector: PlanetProjector) => void) | null) => void;

interface CityOverlayProps {
  readonly cities: readonly WorldMapCity[];
  readonly factions: readonly WorldMapFaction[];
  readonly hulls?: readonly WorldMapHull[] | undefined;
  /** 영향권 반경 환산(1000분율 칸 → 라디안). 0이면 원을 그리지 않는다 */
  readonly milliPerRadian?: number | undefined;
  /** 내 사이보그 자리(없으면 그리지 않는다) */
  readonly me?: { readonly latDeg: number; readonly lonDeg: number } | null | undefined;
  readonly selected: number | null;
  readonly onSelect: (city: WorldMapCity) => void;
  /** 묶음 표시를 누르면 그곳으로 다가간다 */
  readonly onZoomTo: (city: WorldMapCity) => void;
  /** 엔진 onOverlay가 부를 함수를 맡긴다(화면이 자기 ref에 둔다) */
  readonly register: RegisterOverlay;
  /** 덧그림 자료가 바뀌면 한 번 더 그리게(엔진 requestFrame) */
  readonly requestFrame: () => void;
}

/** 위도·경도(°) 둘레 각 반지름 angle(rad) 원 위의 점들(위도·경도) */
export function circlePoints(latDeg: number, lonDeg: number, angle: number, count = CIRCLE_POINTS) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const points: [number, number][] = [];
  for (let index = 0; index < count; index++) {
    const bearing = (2 * Math.PI * index) / count;
    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing),
    );
    const pointLon =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angle) * Math.cos(lat),
        Math.cos(angle) - Math.sin(lat) * Math.sin(pointLat),
      );
    points.push([(pointLat * 180) / Math.PI, (pointLon * 180) / Math.PI]);
  }
  return points;
}

/** 화면 점들 → 닫힌 SVG 경로. 하나라도 숨으면(지평선 너머) 빈 경로 */
function closedPath(points: readonly (ProjectedPoint | null)[]): string {
  let path = "";
  for (const point of points) {
    if (!point?.visible) return "";
    path += `${path === "" ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }
  return path === "" ? "" : `${path}Z`;
}

/** 정수 px에 놓는다(반 px 자리는 누르는 상자 크기가 44px보다 조금 작게 재진다) */
const place = (element: HTMLElement, point: ProjectedPoint): void => {
  element.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -50%)`;
};

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
  const { cities, factions, selected, register, requestFrame } = props;
  const markers = useRef(new Map<number, HTMLButtonElement>());
  const circles = useRef(new Map<number, SVGPathElement>());
  const hullPaths = useRef<(SVGPathElement | null)[]>([]);
  const meRef = useRef<HTMLSpanElement>(null);
  const latest = useRef(props);

  // 그린 뒤 최신 자료를 둔다. 자료·고르기·내 자리가 바뀌었으면 한 번 더 그린다(새 단추 위치를 잡는다)
  useEffect(() => {
    const before = latest.current;
    latest.current = props;
    if (
      before.cities !== props.cities ||
      before.selected !== props.selected ||
      before.me !== props.me ||
      before.hulls !== props.hulls
    )
      props.requestFrame();
  });

  // 투영기를 받으면 위치·보임·묶음·이름표를 바꾼다(엔진 프레임 안). 붙이면 한 번 그린다
  useEffect(() => {
    register((projector) => {
      const { cities: list, hulls, milliPerRadian, me, selected: chosen } = latest.current;
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
      // 영향권 원: 도시 가운데가 보이고 원이 몇 px 이상일 때
      for (const city of list) {
        const path = circles.current.get(city.id);
        if (!path) continue;
        const angle = milliPerRadian && city.radiusMilli ? city.radiusMilli / milliPerRadian : 0;
        const center = angle > 0 ? projector.project(city.latDeg, city.lonDeg) : null;
        let d = "";
        if (center?.visible) {
          const ring = circlePoints(city.latDeg, city.lonDeg, angle).map(([lat, lon]) =>
            projector.project(lat, lon),
          );
          const edge = ring[0];
          if (edge && Math.hypot(edge.x - center.x, edge.y - center.y) >= CIRCLE_MIN_PX) d = closedPath(ring);
        }
        path.setAttribute("d", d);
      }
      (hulls ?? []).forEach((hull, index) => {
        hullPaths.current[index]?.setAttribute(
          "d",
          closedPath(hull.points.map(([lat, lon]) => projector.project(lat, lon))),
        );
      });
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

  const click = (city: WorldMapCity): void => {
    const count = Number(markers.current.get(city.id)?.dataset.cluster ?? "1");
    if (count > 1) props.onZoomTo(city);
    else props.onSelect(city);
  };

  return (
    <div className="city-overlay">
      <svg className="city-territory" aria-hidden="true">
        {(props.hulls ?? []).map((hull, index) => (
          <path
            // 껍질은 ID가 없다: 세력과 첫 꼭짓점으로 가른다
            key={`${hull.factionId}:${hull.points[0]?.join(",") ?? ""}`}
            ref={(element) => {
              hullPaths.current[index] = element;
            }}
            className="city-hull"
            data-nation={factionColor(factions, hull.factionId)}
          />
        ))}
        {cities.map((city) => (
          <path
            key={city.id}
            ref={(element) => {
              if (element) circles.current.set(city.id, element);
              else circles.current.delete(city.id);
            }}
            className="city-area"
            data-nation={factionColor(factions, city.factionId)}
          />
        ))}
      </svg>
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
            data-label="off"
            data-cluster="1"
            aria-pressed={selected === city.id}
            aria-label={city.start ? `${label} · ${m.world_city_start()}` : label}
            onClick={() => click(city)}
          >
            <span className="city-marker-dot" aria-hidden="true" />
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
