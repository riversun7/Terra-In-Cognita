// 1차맵 레이어 상태 — 지형·기후·고도·자원 분포·영토(사용자 요청 2026-11-12, ADR 2026-11-07-planet-view "바뀜 (2026-11-12)").
// - 엔진은 목록 정보를 받은 뒤에 만든다: 그 전에 고른 레이어를 엔진에 넘기려고 화면이 지금 값을 ref에도 둔다(layerRef, 화면 것).
// - 자원 분포: 자원 레이어를 고르거나 원자재를 바꾸면 그 서버 지도를 받아 엔진에 넣는다(planetResource.ts). 다른 레이어로 가면 버린다
//   (텍스처 메모리). 받기는 누른 자리에서 시작한다(효과는 엔진이 늦게 준비된 경우와 화면을 닫을 때만).
// - 영토: 범례의 아는 국가(도시 자료에 나온 국가, 색 = 도시 덧그림과 같은 차례)와 누른 곳의 국가 안내 한 줄(territoryPick.ts).
import type { PickedCell, PlanetEngine, PlanetLayer } from "@terra/engine/planet";
import type { CatchmentMaterial } from "@terra/shared/catchment";
import type { WorldCitiesResponse } from "@terra/shared/worldMap";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import type { LegendNation, ResourceLoad } from "./PlanetLayerPicker.tsx";
import { loadResourceMap } from "./planetResource.ts";
import { territoryAt } from "./territoryPick.ts";
import { cityLabel, factionColor, factionName } from "./worldMapData.ts";

/** 영토 레이어에서 누른 곳의 국가 안내 한 줄(도시 자료가 없으면 null) */
export function territoryLineOf(world: WorldCitiesResponse | null, cell: PickedCell): string | null {
  if (world?.status !== "ready") return null;
  const hit = territoryAt(cell.latDeg, cell.lonDeg, world.cities, world.milliPerRadian);
  if (!hit) return m.planet_territory_outside();
  const nation = factionName(world.factions, hit.factionId);
  const city = world.cities.find((entry) => entry.id === hit.cityId);
  return city
    ? m.planet_territory_at_city({ nation, city: cityLabel(world.factions, city) })
    : m.planet_territory_at({ nation });
}

interface PlanetLayersInput {
  readonly planetId: string;
  readonly engineRef: RefObject<PlanetEngine | null>;
  readonly engineReady: boolean;
  /** 화면의 지금 레이어(엔진을 만들 때·누를 때 읽는다) */
  readonly layerRef: RefObject<PlanetLayer>;
  readonly world: WorldCitiesResponse | null;
}

export function usePlanetLayers({ planetId, engineRef, engineReady, layerRef, world }: PlanetLayersInput) {
  const [layer, setLayer] = useState<PlanetLayer>("terrain");
  const [material, setMaterial] = useState<CatchmentMaterial>("ore");
  const [resourceLoad, setResourceLoad] = useState<ResourceLoad>("idle");
  const controllerRef = useRef<AbortController | null>(null);

  /** 고른 원자재 지도를 받아 엔진에 넣는다(앞선 받기는 멈춘다). 엔진이 아직 없으면 아무것도 하지 않는다(준비되면 효과가 부른다) */
  const fetchMap = (next: CatchmentMaterial): void => {
    controllerRef.current?.abort(new DOMException("resource map replaced", "AbortError"));
    const engine = engineRef.current;
    if (!engine) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    loadResourceMap(planetId, next, controller.signal).then(
      (map) => {
        if (controller.signal.aborted) return;
        engine.setResourceMap(map);
        setResourceLoad("ready");
      },
      () => {
        if (controller.signal.aborted) return;
        engine.setResourceMap(null);
        setResourceLoad("failed");
      },
    );
  };
  const fetchRef = useRef(fetchMap);
  const materialRef = useRef(material);
  useEffect(() => {
    fetchRef.current = fetchMap;
    materialRef.current = material;
  });

  // 엔진이 늦게 준비됐는데 이미 자원 레이어면 그때 받는다. 화면을 닫으면 받기를 멈춘다
  useEffect(() => {
    if (engineReady && layerRef.current === "resource") fetchRef.current(materialRef.current);
  }, [engineReady, layerRef]);
  useEffect(() => () => controllerRef.current?.abort(new DOMException("planet closed", "AbortError")), []);

  const chooseLayer = (next: PlanetLayer): void => {
    const was = layerRef.current;
    layerRef.current = next;
    setLayer(next);
    engineRef.current?.setLayer(next);
    if (next === "resource" && was !== "resource") {
      setResourceLoad("loading");
      fetchMap(material);
    } else if (next !== "resource" && was === "resource") {
      controllerRef.current?.abort(new DOMException("resource layer left", "AbortError"));
      engineRef.current?.setResourceMap(null);
    }
  };
  const chooseMaterial = (next: CatchmentMaterial): void => {
    setMaterial(next);
    setResourceLoad("loading");
    fetchMap(next);
  };
  const retryResource = (): void => {
    setResourceLoad("loading");
    fetchMap(material);
  };

  const nations = useMemo((): LegendNation[] | null => {
    if (world?.status !== "ready") return null;
    return world.factions
      .filter((faction) => world.cities.some((city) => city.factionId === faction.id))
      .map((faction) => ({
        id: faction.id,
        name: factionName(world.factions, faction.id),
        color: factionColor(world.factions, faction.id),
      }));
  }, [world]);

  return { layer, chooseLayer, material, chooseMaterial, resourceLoad, retryResource, nations };
}
