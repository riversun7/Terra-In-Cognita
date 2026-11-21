// 1차맵 도시·국가·세력 전선 덧그림 — 영토(도시 원·도시 사이 땅·이중 국경선), 국가 이름표(문양·전쟁 배지),
// 전쟁 전선 호·교전 배지(⚔)·불가침·봉신 선, 도시·수도 표시, 내 사이보그·좌표 유닛 표시.
// docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", ADR 2026-11-07-planet-view.
// - 엔진(onOverlay)이 그린 프레임마다 투영기를 주면 DOM 위치·경로·보임만 바로 바꾼다(React 상태를 바꾸지 않는다, PLAN 5.7).
// - 국가 이름표는 지형·영토를 포함한 모든 레이어에서 항상 표시하며, 가장자리 국가도 화면 안으로 당겨 사라지지 않게 한다.
// - 가까운 도시는 묶되 수도·고른 도시·교전 도시를 우선 살리고, 도시 이름표도 수도·선택 도시 우선으로 겹치지 않게 띄운다.
import type { PlanetLayer, PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type {
  WorldMapCity,
  WorldMapFaction,
  WorldMapRelation,
  WorldMyUnit,
  WorldParkedUnit,
  WorldTravel,
} from "@terra/shared/worldMap";
import { useEffect, useId, useMemo, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { MapIcon } from "./mapIcons.tsx";
import { nationHex, nationStyle } from "./nationColor.ts";
import { type LabelSize, placeLabels, projectTerritory } from "./territoryDraw.ts";
import { type TerritoryView, territoryViewOf } from "./territoryView.ts";
import { placeMyUnits, projectMyRoutes } from "./unitOverlay.ts";
import {
  buildDiplomacyArcs,
  factionFallbackAnchors,
  factionScaleOf,
  projectDiplomacyArcs,
  selectCityLabelIds,
  warSetsOf,
} from "./warOverlay.ts";
import { cityLabel, factionColor, factionName } from "./worldMapData.ts";
import "./cityOverlay.css";

/** 비슷한 색 이웃 빗금 한 칸(화면 px)·줄 몫(칸의 이만큼이 줄) */
const HATCH_PX = 9;
const HATCH_LINE = 0.4;
/** 겹침으로 칠 화면 거리(CSS px) */
const CLUSTER_PX = 24;

/** 엔진 프레임마다 부를 덧그림 함수를 화면(엔진 주인)에 맡긴다. null = 뗌 */
export type RegisterOverlay = (draw: ((projector: PlanetProjector) => void) | null) => void;

interface CityOverlayProps {
  readonly cities: readonly WorldMapCity[];
  readonly factions: readonly WorldMapFaction[];
  /** 반경 환산(1000분율 칸 → 라디안). 0·없음이면 영토를 그리지 않는다 */
  readonly milliPerRadian?: number | undefined;
  /**
   * 영토 보기(모양·비슷한 색 이웃 무늬 — 1차맵 화면이 world.cities 응답으로 셈해 범례와 같이 쓴다, territoryView.ts). 없으면 이 도시 목록으로
   * 셈한다(비콘·표시 값 없이)
   */
  readonly territory?: TerritoryView | undefined;
  /** 세력 외교 관계(전쟁·불가침). 없으면 전선 호를 그리지 않는다 */
  readonly relations?: readonly WorldMapRelation[] | undefined;
  /** 지금 강조해서 보는 국가 ID(고른 도시 국가 또는 세력 현황에서 고른 국가) */
  readonly focusedFactionId?: number | null | undefined;
  /** 지금 레이어(지형·기후·고도·자원·영토). 없으면 terrain */
  readonly layer?: PlanetLayer | undefined;
  /** 내 사이보그 자리(없으면 그리지 않는다) */
  readonly me?:
    | {
        readonly latDeg: number;
        readonly lonDeg: number;
        readonly unitId?: number | undefined;
        readonly name?: string | null | undefined;
      }
    | null
    | undefined;
  /** 내 사이보그가 2차맵 사이를 이동 중인가 */
  readonly meMoving?: boolean | undefined;
  /** 내 좌표 유닛(옛 호출 호환용). myUnits가 있으면 myUnits를 우선 쓴다 */
  readonly away?: readonly WorldParkedUnit[] | undefined;
  /** 행성 전역의 내 모든 유닛(본캐 + 띄운/안 띄운 2차맵 + 이동 중). 없으면 away로 대체 */
  readonly myUnits?: readonly WorldMyUnit[] | undefined;
  /** 내 유닛의 이동 경로(1차맵 점선 경로·목적지 표적 표시) */
  readonly myTravels?: readonly WorldTravel[] | undefined;
  /** 내 부대 위치 강조 레이아웃(본캐·유닛 핀과 이동 경로를 지도 맨 위에 뚜렷하게) */
  readonly unitSpotlight?: boolean | undefined;
  /** 지금 강조해서 보는 내 유닛 ID */
  readonly focusedUnitId?: number | null | undefined;
  /** 본캐 사이보그 핀을 눌렀을 때 */
  readonly onSelectMe?: (() => void) | undefined;
  /** 내 유닛 핀을 눌렀을 때 */
  readonly onSelectUnit?: ((unitId: number) => void) | undefined;
  readonly selected: number | null;
  readonly onSelect: (city: WorldMapCity) => void;
  /** 묶음 표시를 누르면 그곳으로 다가간다 */
  readonly onZoomTo: (city: WorldMapCity) => void;
  /** 엔진 onOverlay가 부를 함수를 맡긴다(화면이 자기 ref에 둔다) */
  readonly register: RegisterOverlay;
  /** 영토 레이어: 영토 칠·테두리를 진하게 */
  readonly emphasis?: boolean | undefined;
  /** 덧그림 자료가 바뀌면 한 번 더 그리게(엔진 requestFrame) */
  readonly requestFrame: () => void;
}

/** 정수 px에 놓는다(반 px 자리는 누르는 상자 크기가 44px보다 조금 작게 재진다) */
const place = (element: HTMLElement, point: { readonly x: number; readonly y: number }): void => {
  element.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -50%)`;
};

/** 영토를 그릴 국가(도시 차례에 처음 나온 차례 — 비콘은 늘 기준 도시의 국가) */
function areaNations(cities: readonly WorldMapCity[]): number[] {
  return [...new Set(cities.map((city) => city.factionId))];
}

/** 국가 영토 한 벌(바탕 칠·바깥 그림자 선·테두리 선·이름표) */
interface AreaParts {
  fill: SVGPathElement | null;
  shadow: SVGPathElement | null;
  edge: SVGPathElement | null;
  label: HTMLSpanElement | null;
}

/** 표시 차례: 고른 도시 → 수도 → 교전 중 도시 → 시작 도시 → 높은 등급 → ID. 묶을 때 앞 것이 남는다 */
function drawOrder(cities: readonly WorldMapCity[], selected: number | null): WorldMapCity[] {
  return cities.toSorted(
    (a, b) =>
      Number(b.id === selected) - Number(a.id === selected) ||
      Number(b.capital === true) - Number(a.capital === true) ||
      Number(b.occupation != null && !b.occupation.recent) -
        Number(a.occupation != null && !a.occupation.recent) ||
      Number(b.start) - Number(a.start) ||
      (b.grade ?? 0) - (a.grade ?? 0) ||
      a.id - b.id,
  );
}

export function CityOverlay(props: CityOverlayProps) {
  const {
    cities,
    factions,
    relations,
    selected,
    focusedFactionId = null,
    register,
    requestFrame,
    milliPerRadian,
    territory: given,
  } = props;
  const markers = useRef(new Map<number, HTMLButtonElement>());
  const areas = useRef(new Map<number, AreaParts>());
  const clashRefs = useRef(new Map<string, HTMLSpanElement>());
  // 이름표 크기(px) — 국가·외교가 바뀌거나 글꼴이 다 열리면 다시 잰다
  const labelSizes = useRef(new Map<number, LabelSize>());
  const measureRetryRef = useRef(0);
  const meRef = useRef<HTMLButtonElement>(null);
  /** 내 비본체 유닛 핀(유닛 ID → 버튼 요소) */
  const awayRefs = useRef(new Map<number, HTMLButtonElement>());
  /** 내 이동 목적지 표적(유닛 ID → 요소) */
  const routeTargetRefs = useRef(new Map<number, HTMLSpanElement>());
  const territoryRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<SVGPathElement>(null);
  const warDividerRef = useRef<SVGPathElement>(null);
  const warArcGlowRef = useRef<SVGPathElement>(null);
  const warArcRef = useRef<SVGPathElement>(null);
  const warArcFocusRef = useRef<SVGPathElement>(null);
  const truceArcRef = useRef<SVGPathElement>(null);
  const vassalArcRef = useRef<SVGPathElement>(null);
  const myRouteCyborgRef = useRef<SVGPathElement>(null);
  const myRouteUnitRef = useRef<SVGPathElement>(null);
  const latest = useRef(props);

  // SVG 무늬 ID 앞머리(useId 글자에서 영문·숫자만 — url(#…)에 그대로 넣는다)
  const patternBase = `nation${useId().replaceAll(/[^A-Za-z0-9]/g, "")}`;
  // 영토 모양(도시 자료가 바뀔 때만 셈한다). 화면이 준 보기가 있으면 그것
  const view = useMemo(
    (): TerritoryView =>
      given ?? territoryViewOf({ status: "ready", cities, factions, milliPerRadian: milliPerRadian ?? 0 }),
    [given, cities, factions, milliPerRadian],
  );
  const territory = view.shapes;
  const model = useRef(territory);

  const warInfo = useMemo(() => warSetsOf(relations), [relations]);
  const diplomacyArcs = useMemo(
    () => buildDiplomacyArcs(cities, factions, relations),
    [cities, factions, relations],
  );
  const fallbacks = useMemo(() => factionFallbackAnchors(cities), [cities]);
  // 비본체 내 유닛 목록(myUnits 우선, 없으면 옛 away fallback)
  const ownedOtherUnits = useMemo((): WorldMyUnit[] => {
    if (props.myUnits) {
      return props.myUnits.filter((unit) => unit.kind !== "cyborg" && unit.aboardId == null);
    }
    return (props.away ?? []).map((unit) => ({
      unitId: unit.unitId,
      kind: unit.boat ? "boat" : "other",
      mapKey: unit.mapKey,
      cellX: unit.cellX,
      cellY: unit.cellY,
      latDeg: unit.latDeg,
      lonDeg: unit.lonDeg,
      loaded: false,
      moving: false,
      working: false,
      aboardId: null,
    }));
  }, [props.myUnits, props.away]);
  const derivedRef = useRef({ warPairs: warInfo.pairs, diplomacyArcs, fallbacks, ownedOtherUnits });

  const factionById = useMemo(() => new Map(factions.map((entry) => [entry.id, entry])), [factions]);
  const cityCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const city of cities) counts.set(city.factionId, (counts.get(city.factionId) ?? 0) + 1);
    return counts;
  }, [cities]);

  // 웹 글꼴이 뒤늦게 로드되면 이름표 폭을 다시 재고 한 프레임 더 그린다
  useEffect(() => {
    let active = true;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return undefined;
    void fonts.ready.then(() => {
      if (!active) return;
      labelSizes.current.clear();
      latest.current.requestFrame();
    });
    return () => {
      active = false;
    };
  }, []);

  // 그린 뒤 최신 자료를 둔다. 자료·고르기·내 자리·영토·강조·외교가 바뀌었으면 한 번 더 그린다
  useEffect(() => {
    const before = latest.current;
    latest.current = props;
    const changedShapes = model.current !== territory;
    model.current = territory;
    derivedRef.current = { warPairs: warInfo.pairs, diplomacyArcs, fallbacks, ownedOtherUnits };
    if (before.factions !== props.factions || before.relations !== props.relations) {
      labelSizes.current.clear();
      measureRetryRef.current = 0;
    }
    if (
      changedShapes ||
      before.cities !== props.cities ||
      before.selected !== props.selected ||
      before.focusedFactionId !== props.focusedFactionId ||
      before.me !== props.me ||
      before.meMoving !== props.meMoving ||
      before.away !== props.away ||
      before.myUnits !== props.myUnits ||
      before.myTravels !== props.myTravels ||
      before.unitSpotlight !== props.unitSpotlight ||
      before.focusedUnitId !== props.focusedUnitId ||
      before.emphasis !== props.emphasis ||
      before.layer !== props.layer ||
      before.factions !== props.factions ||
      before.relations !== props.relations
    )
      props.requestFrame();
  });

  // 투영기를 받으면 위치·보임·묶음·영토·전선·이름표를 바꾼다(엔진 프레임 안). 붙이면 한 번 그린다
  useEffect(() => {
    register((projector) => {
      const {
        cities: list,
        me,
        selected: chosen,
        emphasis,
        focusedFactionId: focusFaction,
        myTravels,
        focusedUnitId,
      } = latest.current;
      const {
        warPairs,
        diplomacyArcs: arcs,
        fallbacks: labelFallbacks,
        ownedOtherUnits: otherUnits,
      } = derivedRef.current;
      const { width, height } = projector.viewport;
      const shown: { readonly city: WorldMapCity; readonly point: ProjectedPoint; count: number }[] = [];
      for (const city of drawOrder(list, chosen)) {
        const element = markers.current.get(city.id);
        if (!element) continue;
        const point = projector.project(city.latDeg, city.lonDeg);
        // 지평선 너머뿐 아니라 화면 바깥 도시도 숨긴다(바깥 버튼에 초점·클릭이 닿아 오버레이가 밀리는 일을 막는다)
        if (
          !point?.visible ||
          point.x < -48 ||
          point.x > width + 48 ||
          point.y < -48 ||
          point.y > height + 48
        ) {
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

      // 영토: 국가마다 바탕·이중 테두리·맞닿은 국경선·전쟁 국경선(territoryDraw.ts)
      const shapes = model.current;
      const frame = projectTerritory(projector, shapes, warPairs);
      for (const [nation, parts] of areas.current) {
        const d = frame.fills.get(nation) ?? "";
        parts.fill?.setAttribute("d", d);
        parts.shadow?.setAttribute("d", d);
        parts.edge?.setAttribute("d", d);
      }
      dividerRef.current?.setAttribute("d", frame.dividers);
      warDividerRef.current?.setAttribute("d", frame.warDividers);
      if (territoryRef.current) {
        territoryRef.current.dataset.drawn = String(frame.areas);
        territoryRef.current.dataset.blobs = String(frame.blobs);
      }

      // 전쟁 전선 호·교전 배지(⚔)·불가침·봉신 연결선
      const diplomacy = projectDiplomacyArcs(projector, arcs, focusFaction ?? null, emphasis === true);
      const allWarPaths = diplomacy.warPath + diplomacy.focusedWarPath;
      warArcGlowRef.current?.setAttribute("d", allWarPaths);
      warArcRef.current?.setAttribute("d", diplomacy.warPath);
      warArcFocusRef.current?.setAttribute("d", diplomacy.focusedWarPath);
      truceArcRef.current?.setAttribute("d", diplomacy.trucePath);
      vassalArcRef.current?.setAttribute("d", diplomacy.vassalPath);
      const clashMap = new Map(diplomacy.clashes.map((item) => [item.key, item]));
      for (const [key, badge] of clashRefs.current) {
        const hit = clashMap.get(key);
        if (hit) {
          badge.hidden = false;
          place(badge, hit);
        } else {
          badge.hidden = true;
        }
      }

      // 내 본캐릭 사이보그 위치 핀(좌표 먼저 계산해 국가 이름표가 본캐 배너와 겹치지 않게 피한다)
      const mePoint = me ? projector.project(me.latDeg, me.lonDeg) : null;
      const meOnScreen =
        mePoint !== null &&
        mePoint.visible &&
        mePoint.x >= -64 &&
        mePoint.x <= width + 64 &&
        mePoint.y >= -64 &&
        mePoint.y <= height + 64;
      const mine = meRef.current;
      if (mine) {
        mine.hidden = !meOnScreen;
        if (meOnScreen && mePoint) place(mine, mePoint);
      }

      // 국가 이름표(모든 레이어에 항상 표시 — 크기는 처음 잰 값을 두고 0이면 다음 프레임에 한 번 다시 잰다)
      const labels = [...areas.current].flatMap(([nation, parts]) =>
        parts.label ? [[nation, parts.label] as const] : [],
      );
      let unmeasured = false;
      for (const [nation, label] of labels) {
        if (!labelSizes.current.has(nation)) {
          if (label.offsetWidth > 0) {
            labelSizes.current.set(nation, { width: label.offsetWidth, height: label.offsetHeight });
          } else {
            unmeasured = true;
          }
        }
      }
      if (unmeasured && measureRetryRef.current < 3) {
        measureRetryRef.current += 1;
        requestAnimationFrame(() => latest.current.requestFrame());
      }
      const meAvoid =
        meOnScreen && mePoint
          ? [
              mePoint,
              { x: mePoint.x, y: mePoint.y - 34 },
              { x: mePoint.x - 32, y: mePoint.y - 34 },
              { x: mePoint.x + 32, y: mePoint.y - 34 },
            ]
          : [];
      const spots = placeLabels(
        projector,
        shapes.labels,
        labelSizes.current,
        [...shown.map((entry) => entry.point), ...diplomacy.clashes, ...meAvoid],
        labelFallbacks,
      );
      for (const [nation, label] of labels) {
        const spot = spots.get(nation);
        label.dataset.shown = spot ? "true" : "false";
        if (spot) place(label, spot);
      }

      // 도시 이름표: 수도·선택 도시·교전 도시 우선 배치(국가 이름표와 겹치지 않게)
      const labeledCities = selectCityLabelIds(shown, chosen, spots);
      for (const entry of shown) {
        const element = markers.current.get(entry.city.id);
        if (!element) continue;
        element.dataset.cluster = String(entry.count);
        element.dataset.label = labeledCities.has(entry.city.id) ? "on" : "off";
      }

      // 내 이동 경로(본캐·유닛)와 목적지 표적
      const myRoutes = projectMyRoutes(projector, myTravels, me?.unitId ?? null);
      myRouteCyborgRef.current?.setAttribute("d", myRoutes.cyborgRoute);
      myRouteUnitRef.current?.setAttribute("d", myRoutes.unitRoute);
      const targetByUnit = new Map(myRoutes.targets.map((entry) => [entry.unitId, entry]));
      for (const [unitId, el] of routeTargetRefs.current) {
        const hit = targetByUnit.get(unitId);
        if (hit) {
          el.hidden = false;
          place(el, hit);
        } else {
          el.hidden = true;
        }
      }

      // 내 비본체 유닛(띄운/안 띄운 2차맵·이동 중): 같은 자리 묶음 + 본캐 옆 살짝 비켜 놓기
      const placedUnits = placeMyUnits(
        projector,
        otherUnits,
        meOnScreen ? mePoint : null,
        focusedUnitId ?? null,
      );
      const placedByUnit = new Map(placedUnits.map((entry) => [entry.unit.unitId, entry]));
      for (const [unitId, element] of awayRefs.current) {
        const placed = placedByUnit.get(unitId);
        if (!placed) {
          element.hidden = true;
          continue;
        }
        element.hidden = false;
        element.dataset.cluster = String(placed.count);
        element.dataset.moving = placed.anyMoving ? "true" : undefined;
        const badgeText = element.querySelector<HTMLElement>(".city-away-label");
        if (badgeText) {
          badgeText.textContent =
            placed.count > 1
              ? m.planet_units_cluster_label({ count: placed.count })
              : (element.dataset.shortLabel ?? "");
        }
        place(element, placed);
      }
    });
    requestFrame();
    return () => register(null);
  }, [register, requestFrame]);

  /** 그 국가 영토 한 벌(없으면 만든다). 국가가 목록에서 빠지면 모두 null이 되고 다음 그리기에서 지운다 */
  const areaRef = (nation: number): AreaParts => {
    let parts = areas.current.get(nation);
    if (!parts) {
      parts = { fill: null, shadow: null, edge: null, label: null };
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
  const warArcs = diplomacyArcs.filter((arc) => arc.kind === "war");
  const goingTravels = (props.myTravels ?? []).filter((entry) => entry.state === "going");
  /** 비슷한 색 이웃 무늬(D-546 1435) 정의 ID */
  const patternId = (nation: number): string => `${patternBase}-hatch-${String(nation)}`;
  const activeLayer = props.layer ?? (props.emphasis ? "territory" : "terrain");

  return (
    <div
      className="city-overlay"
      ref={territoryRef}
      data-emphasis={props.emphasis ? "territory" : undefined}
      data-layer={activeLayer}
      data-has-focus={focusedFactionId !== null ? "true" : undefined}
      data-unit-spotlight={props.unitSpotlight ? "true" : undefined}
      data-territories={territory.labels.length}
      data-wars={warArcs.length}
    >
      <svg className="city-territory" aria-hidden="true">
        {/* 비슷한 색 이웃 무늬(기획 D-546 1435): 국가 색 바탕 + 그 색 위 글자 색(검정·흰색) 빗금 */}
        <defs>
          {nations
            .filter((nation) => view.patterned.has(nation))
            .map((nation) => (
              <pattern
                key={`hatch-${String(nation)}`}
                id={patternId(nation)}
                patternUnits="userSpaceOnUse"
                width={HATCH_PX}
                height={HATCH_PX}
                patternTransform="rotate(45)"
                style={nationStyle(factions, nation)}
              >
                <rect className="city-area-hatch-base" width={HATCH_PX} height={HATCH_PX} />
                <rect className="city-area-hatch-line" width={HATCH_PX * HATCH_LINE} height={HATCH_PX} />
              </pattern>
            ))}
        </defs>
        {/* 칠: 국가마다 영토 고리들(겹치지 않는다 — 주인이 하나) */}
        {nations.map((nation) => {
          const style = nationStyle(factions, nation);
          const patterned = view.patterned.has(nation) && style !== undefined;
          const isFocused = focusedFactionId === nation;
          return (
            <path
              key={`fill-${String(nation)}`}
              ref={(element) => {
                areaRef(nation).fill = element;
              }}
              className="city-area-fill"
              data-nation={factionColor(factions, nation)}
              data-pattern={patterned ? "hatch" : undefined}
              data-focused={isFocused ? "true" : undefined}
              style={patterned ? { ...style, fill: `url(#${patternId(nation)})` } : style}
            />
          );
        })}
        {/* 영토 바깥 어두운 테두리 그림자(어느 지형·기후 위에서도 국경이 뚜렷하게 읽힌다) */}
        {nations.map((nation) => (
          <path
            key={`shadow-${String(nation)}`}
            ref={(element) => {
              areaRef(nation).shadow = element;
            }}
            className="city-area-edge-shadow"
            data-focused={focusedFactionId === nation ? "true" : undefined}
          />
        ))}
        {/* 국가 경계 받침: 두 국가가 맞닿은 선만 판색으로 깔고 그 위에 국가 색 선 */}
        <path ref={dividerRef} className="city-area-divider" />
        {nations.map((nation) => (
          <path
            key={`edge-${String(nation)}`}
            ref={(element) => {
              areaRef(nation).edge = element;
            }}
            className="city-area-edge"
            data-nation={factionColor(factions, nation)}
            data-focused={focusedFactionId === nation ? "true" : undefined}
            data-war={warInfo.warringFactions.has(nation) ? "true" : undefined}
            style={nationStyle(factions, nation)}
          />
        ))}
        {/* 전쟁 중인 국경 강조선(맥박 치는 진홍 전선) */}
        <path ref={warDividerRef} className="city-war-divider" />
        {/* 세력 외교 연결 호: 불가침 · 봉신 · 전쟁 전선 */}
        <path ref={truceArcRef} className="city-diplomacy-truce" />
        <path ref={vassalArcRef} className="city-diplomacy-vassal" />
        <path ref={warArcGlowRef} className="city-diplomacy-war-glow" />
        <path ref={warArcRef} className="city-diplomacy-war" />
        <path ref={warArcFocusRef} className="city-diplomacy-war-focus" />
        {/* 내 사이보그·내 유닛 실시간 이동 경로 */}
        <path ref={myRouteUnitRef} className="city-my-route-unit" />
        <path ref={myRouteCyborgRef} className="city-my-route-cyborg" />
      </svg>

      {/* 이동 목적지 표적 */}
      {goingTravels.map((travel) => {
        const isCyborg = props.me?.unitId !== undefined && travel.unitId === props.me.unitId;
        return (
          <span
            key={`target-${String(travel.unitId)}`}
            ref={(element) => {
              if (element) routeTargetRefs.current.set(travel.unitId, element);
              else routeTargetRefs.current.delete(travel.unitId);
            }}
            className="city-my-route-target"
            data-cyborg={isCyborg ? "true" : undefined}
            aria-hidden="true"
            hidden
          />
        );
      })}

      {/* 전쟁 전선 중앙 교전 배지(⚔) */}
      {warArcs.map((arc) => (
        <span
          key={arc.key}
          ref={(element) => {
            if (element) clashRefs.current.set(arc.key, element);
            else clashRefs.current.delete(arc.key);
          }}
          className="city-war-clash"
          data-focused={
            focusedFactionId === arc.factionA || focusedFactionId === arc.factionB ? "true" : undefined
          }
          aria-hidden="true"
          hidden
        >
          <MapIcon name="swords" className="city-war-clash-icon" />
        </span>
      ))}

      {/* 국가 이름표(문양 + 이름 + 교전 배지) — 모든 레이어에서 항상 표시 */}
      {nations.map((nation) => {
        const entry = factionById.get(nation);
        const hex = nationHex(factions, nation);
        const emblem = entry?.emblem;
        const atWar = warInfo.warringFactions.has(nation);
        const scale = factionScaleOf(entry?.cityCount ?? cityCounts.get(nation) ?? 1);
        return (
          <span
            key={`label-${String(nation)}`}
            ref={(element) => {
              areaRef(nation).label = element;
            }}
            className="city-area-label"
            data-nation={factionColor(factions, nation)}
            style={nationStyle(factions, nation)}
            data-faction={nation}
            data-scale={scale}
            data-war={atWar ? "true" : undefined}
            data-focused={focusedFactionId === nation ? "true" : undefined}
            data-shown="false"
            aria-hidden="true"
          >
            {emblem || hex ? (
              <NationEmblem
                spec={emblem?.spec}
                color={emblem?.color ?? hex ?? "#64748b"}
                uploaded={emblem?.uploaded}
                size={scale === "major" ? 20 : 16}
                className="city-area-label-emblem"
              />
            ) : null}
            <span className="city-area-label-name">{factionName(factions, nation)}</span>
            {atWar ? (
              <span className="city-area-label-war" aria-hidden="true">
                <MapIcon name="swords" className="city-area-label-war-icon" />
              </span>
            ) : null}
          </span>
        );
      })}

      {/* 도시·수도 표시 */}
      {cities.map((city) => {
        const label = cityLabel(factions, city);
        const battleState = city.occupation ? (city.occupation.recent ? "recent" : "active") : undefined;
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
            style={nationStyle(factions, city.factionId)}
            data-start={city.start ? "true" : "false"}
            data-capital={city.capital ? "true" : undefined}
            data-grade={city.grade ?? 1}
            data-battle={battleState}
            data-focused={focusedFactionId === city.factionId ? "true" : undefined}
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
            {battleState === "active" ? (
              <span className="city-marker-siege" aria-hidden="true">
                <MapIcon name="swords" className="city-marker-siege-icon" />
              </span>
            ) : null}
            <span className="city-marker-name" aria-hidden="true">
              {label}
            </span>
          </button>
        );
      })}
      {/* 내 본캐릭 사이보그 위치 비콘 — 도시 점을 가리지 않고 위로 떠서 본캐 이름과 레이더 고리를 표시 */}
      {props.me ? (
        <button
          ref={meRef}
          type="button"
          className="city-me"
          data-moving={props.meMoving ? "true" : undefined}
          data-focused={
            props.focusedUnitId !== undefined &&
            props.focusedUnitId !== null &&
            props.me.unitId === props.focusedUnitId
              ? "true"
              : undefined
          }
          aria-label={m.world_my_cyborg()}
          onClick={() => props.onSelectMe?.()}
          hidden
        >
          <span className="city-me-pulse" aria-hidden="true" />
          <span className="city-me-anchor" aria-hidden="true" />
          <span className="city-me-pin" aria-hidden="true">
            <span className="city-me-icon-wrap">
              <MapIcon name="cyborg" className="city-me-icon" />
            </span>
            <span className="city-me-badge">{m.planet_units_me_badge()}</span>
            <span className="city-me-name">{props.me.name || m.world_my_cyborg()}</span>
          </span>
        </button>
      ) : null}

      {/* 내 보유 유닛(휴먼·사이보그 유닛·수호신·배·이동 중) 위치 핀 */}
      {ownedOtherUnits.map((unit) => {
        const isBoat = unit.kind === "boat";
        const iconName = isBoat
          ? "transport"
          : unit.kind === "cyborg_unit"
            ? "cyborg"
            : unit.kind === "guardian"
              ? "military"
              : "unit";
        const ariaLabel =
          unit.name ??
          (isBoat ? m.world_parked_boat({ id: unit.unitId }) : m.world_parked_unit({ id: unit.unitId }));
        const shortKind = isBoat
          ? m.planet_units_kind_boat()
          : unit.kind === "cyborg_unit"
            ? m.planet_units_kind_cyborg_unit()
            : unit.kind === "guardian"
              ? m.planet_units_kind_guardian()
              : unit.kind === "human"
                ? m.planet_units_kind_human()
                : m.planet_units_kind_other();
        const shortLabel = unit.name ?? `${shortKind} #${unit.unitId}`;
        return (
          <button
            key={unit.unitId}
            type="button"
            ref={(element) => {
              if (element) awayRefs.current.set(unit.unitId, element);
              else awayRefs.current.delete(unit.unitId);
            }}
            className="city-away"
            data-away-unit={unit.unitId}
            data-boat={isBoat ? "true" : undefined}
            data-kind={unit.kind}
            data-moving={unit.moving ? "true" : undefined}
            data-focused={props.focusedUnitId === unit.unitId ? "true" : undefined}
            data-cluster="1"
            data-short-label={shortLabel}
            aria-label={ariaLabel}
            onClick={() => props.onSelectUnit?.(unit.unitId)}
            hidden
          >
            <span className="city-away-dot" aria-hidden="true">
              <MapIcon name={iconName} className="city-away-icon" />
            </span>
            <span className="city-away-label" aria-hidden="true">
              {shortLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
