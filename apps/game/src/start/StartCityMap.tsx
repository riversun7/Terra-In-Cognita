// 첫 접속 도시 단계의 1차맵 작은 보기 — 고른 국가의 시작 도시들을 행성 위에 보이고 눌러 고른다(기획 60 §7.1 D-6041,
// docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름"). 지연 조각(StartScreen이 React.lazy로 연다): 엔진·three.js가 첫 화면·첫 접속 조각에 들지 않는다.
// 1차맵 화면과 같은 엔진·서버 타일·도시 덧그림(CityOverlay)을 쓴다. 하늘은 끈다(작은 보기라 늘 낮). 땅을 눌러도 아무것도 하지 않는다.
// 처음 보기: 도시들이 함께 들어오는 거리(가장 먼 두 도시 거리 × FIT), 엔진이 가장 가까운 거리로 묶는다. 목록에서 고르면 그 도시를 가운데로.
// WebGL을 못 쓰거나 행성을 못 받으면 안내만(목록이 대안이다).
import {
  type PlanetEngine,
  type PlanetProjector,
  type PlanetStatus,
  PLANET_EXAGGERATION,
  createPlanetEngine,
} from "@terra/engine/planet";
import type { WorldMapCity, WorldMapFaction } from "@terra/shared/worldMap";
import { useCallback, useEffect, useRef, useState } from "react";
import { CityOverlay } from "../map/CityOverlay.tsx";
import { createServerTileSource, loadPlanetManifest, planetDescriptionOf } from "../map/planetSource.ts";
import { m } from "../paraglide/messages.js";
import "./startCityMap.css";

/** [임시] 시작 도시가 놓인 행성 = 1차맵 화면과 같은 S2 시험 행성 */
const PLANET_ID = "s2_test_planet";
/** 도시들이 함께 들어오는 거리 = 가장 먼 두 도시 거리(m) × 이 값 */
const FIT = 3;
/** 도시가 하나뿐일 때 거리 = 행성 반지름 × 이 값 */
const SINGLE_RATIO = 0.05;

type Phase = "loading" | "ready" | "unavailable";

interface StartCityMapProps {
  readonly cities: readonly WorldMapCity[];
  readonly factions: readonly WorldMapFaction[];
  readonly selected: number | null;
  readonly onSelect: (cityId: number) => void;
}

/** 두 위도·경도(°) 사이 중심각(rad) */
function angleBetween(a: WorldMapCity, b: WorldMapCity): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(a.latDeg * rad) * Math.sin(b.latDeg * rad) +
    Math.cos(a.latDeg * rad) * Math.cos(b.latDeg * rad) * Math.cos((a.lonDeg - b.lonDeg) * rad);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** 도시들이 함께 보이는 처음 보기(가운데 = 위도·경도 평균 — 시작 도시는 가까이 모여 있다) */
export function fitView(cities: readonly WorldMapCity[], radiusM: number) {
  const first = cities[0];
  if (!first) return undefined;
  let span = 0;
  for (const a of cities) for (const b of cities) span = Math.max(span, angleBetween(a, b));
  const latDeg = cities.reduce((sum, city) => sum + city.latDeg, 0) / cities.length;
  const lonDeg = cities.reduce((sum, city) => sum + city.lonDeg, 0) / cities.length;
  const distanceM = span > 0 ? span * radiusM * FIT : radiusM * SINGLE_RATIO;
  return { latDeg, lonDeg, distanceM };
}

export default function StartCityMap({ cities, factions, selected, onSelect }: StartCityMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PlanetEngine | null>(null);
  const overlayDraw = useRef<((projector: PlanetProjector) => void) | null>(null);
  const registerOverlay = useCallback((draw: ((projector: PlanetProjector) => void) | null) => {
    overlayDraw.current = draw;
  }, []);
  const citiesRef = useRef(cities);
  const [phase, setPhase] = useState<Phase>("loading");
  const requestFrame = useCallback(() => engineRef.current?.requestFrame(), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const controller = new AbortController();
    let engine: PlanetEngine | null = null;
    const onStatus = (status: PlanetStatus): void => {
      if (status.kind === "unsupported" || status.kind === "error") setPhase("unavailable");
      else if (status.kind === "ready") setPhase("ready");
    };
    loadPlanetManifest(PLANET_ID, { signal: controller.signal }).then(
      (manifest) => {
        if (controller.signal.aborted) return;
        const view = fitView(citiesRef.current, manifest.radiusM);
        try {
          engine = createPlanetEngine(host, {
            planet: planetDescriptionOf(manifest),
            tileSource: createServerTileSource(manifest),
            // 고도 과장은 1차맵 화면과 같은 고정 값(×12, 사용자 결정 2026-11-14)
            exaggeration: PLANET_EXAGGERATION,
            ...(view ? { initialView: view } : {}),
            onStatus,
            onOverlay: (projector) => overlayDraw.current?.(projector),
          });
          engineRef.current = engine;
        } catch {
          engine?.dispose();
          engine = null;
          setPhase("unavailable");
        }
      },
      () => {
        if (!controller.signal.aborted) setPhase("unavailable");
      },
    );
    return () => {
      controller.abort(new DOMException("start map closed", "AbortError"));
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // 목록에서 고르면 그 도시를 가운데로(거리는 그대로)
  useEffect(() => {
    citiesRef.current = cities;
    const city = cities.find((entry) => entry.id === selected);
    if (city) engineRef.current?.lookAt({ latDeg: city.latDeg, lonDeg: city.lonDeg });
  }, [cities, selected]);

  const zoomTo = (city: WorldMapCity): void => {
    const distance = engineRef.current?.stats().camera.distanceM;
    engineRef.current?.lookAt({
      latDeg: city.latDeg,
      lonDeg: city.lonDeg,
      ...(distance ? { distanceM: distance / 4 } : {}),
    });
  };

  return (
    <div className="start-city-map" data-phase={phase} data-cities={cities.length}>
      <div ref={hostRef} className="start-city-map-view" role="img" aria-label={m.start_city_map_label()} />
      <CityOverlay
        cities={cities}
        factions={factions}
        selected={selected}
        onSelect={(city) => onSelect(city.id)}
        onZoomTo={zoomTo}
        register={registerOverlay}
        requestFrame={requestFrame}
      />
      {phase === "ready" ? null : (
        <p className="start-city-map-notice" role="status">
          {phase === "loading" ? m.start_city_map_loading() : m.start_city_map_unavailable()}
        </p>
      )}
    </div>
  );
}
