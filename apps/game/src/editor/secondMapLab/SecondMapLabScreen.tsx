// 2차맵 · 지형 오브젝트 통합 PC 작업 화면(/dev/terrain-objects · /dev/second-map) — dev·admin, 틀 숨김 전체 화면.
// - 왼쪽: 실시간 3D 2차맵 엔진 뷰포트 + 하단 퀵 조작 도크(확대·채집/어군 표시·격자·낮밤·과장).
//   지형 오브젝트 비율(map_props·gather_objects)을 고치면 카메라를 유지한 채 왼쪽 2차맵에 실시간 반영된다.
// - 오른쪽: 탭 전환 워크벤치
//   1) [지형 오브젝트 · 3D 모델]: 14개 바이옴 칩 + 선택 오브젝트 대화형 3D 로우폴리 모델 카드 + 모든 행 3D 썸네일 + 비율 슬라이더/입력 +
//      현재 맵 개수·[맵에서 찾기] + 느림·티어 + 추가/빼기 + 차이 내보내기(terrain-objects-diff.json → pnpm tuning:apply).
//   2) [맵 · 조명 · 칸 상세]: 행성·프리셋·바이옴 바로 가기·면/i/j·키·낮밤 시각·고저 과장·이웃 3×3·격자·소품 거리/상한·누른 칸 정보.
// 시험·측정용 data-*: .sml-body[data-status·data-error·data-source·data-map-key·data-exaggeration·data-grid·data-sky·
// data-neighbours·data-props·data-clutter·data-draw-calls·data-triangles·data-render-p95·data-view-span·data-light-hour·data-live-preview].
import {
  type EngineStats,
  type PlanetSkyMode,
  type SecondMapEngine,
  createSecondMapEngine,
  secondMapPlace,
  utcMsForLocalHour,
} from "@terra/engine";
import { cellKey, cellsPerSide, isCellKey, isFace } from "@terra/planet";
import type { MapPreset } from "@terra/planet/secondMap";
import { SCHOOL_POSITION_SCALE, schoolPosition } from "@terra/shared/fishSchool";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSecondMapPreviewClient } from "../../map/secondMapBuildClient.ts";
import { formatLocalTime } from "../../map/secondMapSky.ts";
import { fetchTerrain } from "../../map/terrainLoader.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import ScopeBar from "../../scope/ScopeBar.tsx";
import { usePlanetScope } from "../../scope/planetScopeStore.ts";
import type { SecondMapPreviewStage } from "../planet/secondMapPreviewProtocol.ts";
import type { JsonEntry, TerrainEntries } from "../terrainObjects/terrainObjectsModel.ts";
import { LabPanel, type LabPanelProps, type LabSettings } from "./LabPanel.tsx";
import { type BiomeOption, TerrainObjectsPanel } from "./TerrainObjectsPanel.tsx";
import { type CellSpot, buildGatherPreview, summarizeArtLayer } from "./labGatherPreview.ts";
import { labErrorText } from "./labMessages.ts";
import {
  type LabDefinitions,
  type LabErrorCode,
  LabLoadError,
  type LabMap,
  type LabNeighbour,
  type LabTarget,
  createLabSource,
  faceLevelOf,
} from "./labSource.ts";
import {
  type LabPointInfo,
  exaggerateTerrain,
  labPivot,
  labPointInfo,
  maxExaggeration,
} from "./labTerrain.ts";
import "./secondMapLab.css";

export type SecondMapLabTab = "objects" | "lab";

/** 처음 여는 행성(월드 행성 = 서버 지형). 정의에 없으면 첫 행성 */
const DEFAULT_PLANET = "s2_test_planet";
/** 기본 보기: 정오, 낮밤 켬, 과장 ×1, 소품 모델 420m·5,000개 */
const DEFAULT_SETTINGS: LabSettings = {
  sky: true,
  hour: 12,
  exaggeration: 1,
  neighbours: false,
  grid: false,
  propSpanM: 420,
  propCap: 5000,
};
/** 처음 카메라: 화면 짧은 변 약 180m(3D 로우폴리 소품 모델이 열자마자 또렷하게 보이게) */
const INITIAL_ZOOM = 12;
/** 이 면 레벨부터는 기기에서 행성을 처음 만들기 전에 묻는다 */
const CONFIRM_BUILD_LEVEL = 9;
/** 엔진 요약을 읽는 간격(ms) */
const STATS_MS = 1000;
/** map_props 비율 변경 → 서버/워커 재생성 디바운스(ms) */
const RATIO_DEBOUNCE_MS = 280;

function ignoreDisposed(): void {}

type Status =
  | { readonly kind: "loading"; readonly stage: SecondMapPreviewStage | null }
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly code: LabErrorCode };

function biomesOf(list: readonly unknown[]): BiomeOption[] {
  const out: BiomeOption[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const id = Reflect.get(raw, "id");
    if (typeof id !== "string") continue;
    const name = Reflect.get(raw, "name");
    const ko =
      typeof name === "object" && name !== null && "ko" in name ? String(Reflect.get(name, "ko")) : id;
    const en =
      typeof name === "object" && name !== null && "en" in name ? String(Reflect.get(name, "en")) : id;
    const colorRaw = Reflect.get(raw, "color");
    const color = typeof colorRaw === "string" && colorRaw !== "" ? colorRaw : "#667788";
    out.push({ id, name: { ko, en }, color });
  }
  return out;
}

function asJsonEntries(list: readonly unknown[]): readonly JsonEntry[] {
  return list.filter(
    (item): item is JsonEntry => typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function labDefinitions(definitions: {
  readonly planets: readonly { readonly id: string; readonly entry: unknown }[];
  readonly templates: readonly { readonly id: string; readonly entry: unknown }[];
  readonly biomes: readonly unknown[];
  readonly mapProps: readonly unknown[];
  readonly gatherObjects: readonly unknown[];
  readonly contentVersion: string;
}): LabDefinitions {
  return {
    planets: [
      ...definitions.planets.map((planet) => ({ id: planet.id, kind: "pack" as const, entry: planet.entry })),
      ...definitions.templates.map((planet) => ({
        id: planet.id,
        kind: "template" as const,
        entry: planet.entry,
      })),
    ],
    biomes: definitions.biomes,
    mapProps: definitions.mapProps,
    gatherObjects: definitions.gatherObjects,
    contentVersion: definitions.contentVersion,
  };
}

function skyMode(mapKey: number, settings: LabSettings): PlanetSkyMode {
  const place = secondMapPlace(mapKey);
  if (!settings.sky || !place) return { kind: "off" };
  return { kind: "fixed", utcMs: utcMsForLocalHour(place.lonDeg, settings.hour) };
}

export default function SecondMapLabScreen({
  onClose,
  initialTab = "objects",
}: {
  onClose: () => void;
  initialTab?: SecondMapLabTab;
}) {
  const [load, setLoad] = useState<
    { kind: "loading" } | { kind: "failed" } | { kind: "ready"; definitions: LabDefinitions }
  >({ kind: "loading" });
  const [tabOverride, setTabOverride] = useState<{
    readonly base: SecondMapLabTab;
    readonly value: SecondMapLabTab;
  } | null>(null);
  const tab: SecondMapLabTab = tabOverride?.base === initialTab ? tabOverride.value : initialTab;
  const selectTab = (next: SecondMapLabTab): void => setTabOverride({ base: initialTab, value: next });

  useEffect(() => {
    let live = true;
    api.planetEditor.definitions.query().then(
      (definitions) => {
        if (live) setLoad({ kind: "ready", definitions: labDefinitions(definitions) });
      },
      () => {
        if (live) setLoad({ kind: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="sml-screen" aria-labelledby="sml-title" data-density="compact">
      <header className="sml-header">
        <button type="button" className="button-small sml-back" onClick={onClose}>
          {m.map_back()}
        </button>
        <h1 id="sml-title" className="sml-title" tabIndex={-1}>
          {m.shell_route_dev_terrain_objects()}
        </h1>
        <div className="sml-tabs" role="tablist" aria-label={m.shell_route_dev_terrain_objects()}>
          <button
            type="button"
            role="tab"
            className="button-small sml-tab"
            data-tab="objects"
            aria-selected={tab === "objects"}
            onClick={() => selectTab("objects")}
          >
            {m.dev_terrain_lab_tab_objects()}
          </button>
          <button
            type="button"
            role="tab"
            className="button-small sml-tab"
            data-tab="lab"
            aria-selected={tab === "lab"}
            onClick={() => selectTab("lab")}
          >
            {m.dev_terrain_lab_tab_map()}
          </button>
        </div>
        <ScopeBar route="dev_second_map" inline />
      </header>
      {load.kind === "ready" ? (
        <Lab definitions={load.definitions} activeTab={tab} />
      ) : (
        <p className="status sml-center" role="status">
          {load.kind === "loading" ? m.second_map_lab_loading() : m.second_map_lab_load_failed()}
        </p>
      )}
    </section>
  );
}

function Lab({ definitions, activeTab }: { definitions: LabDefinitions; activeTab: SecondMapLabTab }) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SecondMapEngine | null>(null);
  const mapRef = useRef<LabMap | null>(null);
  const seqRef = useRef(0);
  const previewSeqRef = useRef(0);
  const baseMapCacheRef = useRef(new Map<string, LabMap>());
  const locateCycleRef = useRef(new Map<string, number>());

  const [client] = useState(() => createSecondMapPreviewClient());
  const source = useMemo(
    () =>
      createLabSource({
        query: (input) => api.planetEditor.secondMap.query(input),
        preview: (input) =>
          api.planetEditor.secondMapPreview.mutate({
            planetId: input.planetId,
            target: input.target,
            mapProps: [...input.mapProps],
          }),
        fetchTerrain: (url) => fetchTerrain(url),
        device: client,
        definitions,
      }),
    [client, definitions],
  );

  const biomeOptions = useMemo(() => biomesOf(definitions.biomes), [definitions.biomes]);
  const originalEntries = useMemo<TerrainEntries>(
    () => ({
      mapProps: asJsonEntries(definitions.mapProps),
      gatherObjects: asJsonEntries(definitions.gatherObjects),
    }),
    [definitions.mapProps, definitions.gatherObjects],
  );
  const originalMapPropsKey = useMemo(() => JSON.stringify(originalEntries.mapProps), [originalEntries]);

  const [edited, setEdited] = useState<TerrainEntries>(originalEntries);
  const [pickedBiome, setPickedBiome] = useState<string | null>(null);
  const [syncMapWithBiome, setSyncMapWithBiome] = useState(true);
  const [biomeVariant, setBiomeVariant] = useState(0);
  const [showGather, setShowGather] = useState(true);
  const [ratioUpdating, setRatioUpdating] = useState(false);

  const editedMapPropsKey = useMemo(() => JSON.stringify(edited.mapProps), [edited.mapProps]);
  const mapPropsChanged = editedMapPropsKey !== originalMapPropsKey;
  const editedMapPropsRef = useRef(edited.mapProps);
  const mapPropsChangedRef = useRef(mapPropsChanged);
  useEffect(() => {
    editedMapPropsRef.current = edited.mapProps;
    mapPropsChangedRef.current = mapPropsChanged;
  }, [edited.mapProps, mapPropsChanged]);

  const firstPlanet = definitions.planets.some((planet) => planet.id === DEFAULT_PLANET)
    ? DEFAULT_PLANET
    : (definitions.planets[0]?.id ?? DEFAULT_PLANET);
  const scope = usePlanetScope("lab");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const scoped =
    scope.planetId !== undefined && definitions.planets.some((planet) => planet.id === scope.planetId)
      ? scope.planetId
      : firstPlanet;
  const planetId = templateId ?? scoped;
  const scopeReady = scope.status !== "loading";

  const [status, setStatus] = useState<Status>({ kind: "loading", stage: null });
  const [map, setMap] = useState<LabMap | null>(null);
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
  const [point, setPoint] = useState<LabPointInfo | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [buildAsk, setBuildAsk] = useState<{ level: number; answer: (ok: boolean) => void } | null>(null);
  const [inputs, setInputs] = useState<LabPanelProps["inputs"]>({ face: "", i: "", j: "", key: "" });

  useEffect(() => () => client.dispose(), [client]);

  const askBuild = useCallback(
    (level: number) =>
      new Promise<boolean>((resolve) => {
        if (level < CONFIRM_BUILD_LEVEL) {
          resolve(true);
          return;
        }
        setBuildAsk({
          level,
          answer: (ok) => {
            setBuildAsk(null);
            resolve(ok);
          },
        });
      }),
    [],
  );

  /** 2차맵 하나를 연다(편집 중인 map_props가 있으면 바로 비율 미리 보기로 연다) */
  const run = useCallback(
    (planet: string, target: LabTarget) => {
      seqRef.current += 1;
      previewSeqRef.current += 1;
      const seq = seqRef.current;
      const useCustom = mapPropsChangedRef.current;
      const request = useCustom
        ? source.preview(planet, target, editedMapPropsRef.current, {
            onStage: (stage) => {
              if (seq === seqRef.current) setStatus({ kind: "loading", stage });
            },
            beforeBuild: askBuild,
          })
        : source.load(planet, target, {
            onStage: (stage) => {
              if (seq === seqRef.current) setStatus({ kind: "loading", stage });
            },
            beforeBuild: askBuild,
          });
      request.then(
        (loaded) => {
          if (seq !== seqRef.current) return;
          if (!useCustom) {
            baseMapCacheRef.current.set(`${planet}:${loaded.mapKey}`, loaded);
          }
          setMap(loaded);
          setPoint(null);
          setStatus({ kind: "ready" });
          setRatioUpdating(false);
          setInputs({
            face: String(loaded.cell.face),
            i: String(loaded.cell.i),
            j: String(loaded.cell.j),
            key: String(loaded.mapKey),
          });
        },
        (error: unknown) => {
          if (seq !== seqRef.current) return;
          setRatioUpdating(false);
          setStatus({ kind: "failed", code: error instanceof LabLoadError ? error.code : "failed" });
        },
      );
    },
    [source, askBuild],
  );

  const open = useCallback(
    (planet: string, target: LabTarget): void => {
      setStatus({ kind: "loading", stage: null });
      run(planet, target);
    },
    [run],
  );

  // 처음과 행성을 바꿨을 때: 그 행성의 시험 2차맵
  useEffect(() => {
    if (scopeReady) run(planetId, { kind: "test" });
  }, [run, planetId, scopeReady]);

  // 처음 열린 2차맵의 바이옴으로 오브젝트 표 기본 지형을 맞춘다(사용자가 직접 고르기 전)
  const selectedBiome =
    pickedBiome ??
    biomeOptions.find((item) => item.id === map?.cell.biomeId)?.id ??
    biomeOptions[0]?.id ??
    "grassland";

  // map_props 비율이 바뀌면 같은 2차맵 키에서 카메라를 유지한 채 지형 소품 층만 즉석 재생성한다
  const loadedMapKey = map?.mapKey ?? null;
  const loadedPlanetId = map?.planetId ?? null;
  useEffect(() => {
    if (loadedMapKey === null || loadedPlanetId === null) return () => undefined;
    if (!mapPropsChanged) {
      const current = mapRef.current;
      if (!current?.customProps) return () => undefined;
      const cached = baseMapCacheRef.current.get(`${loadedPlanetId}:${loadedMapKey}`);
      if (cached) {
        queueMicrotask(() => {
          setMap(cached);
          setRatioUpdating(false);
        });
        return () => undefined;
      }
      previewSeqRef.current += 1;
      const pSeq = previewSeqRef.current;
      queueMicrotask(() => setRatioUpdating(true));
      source.load(loadedPlanetId, { kind: "key", mapKey: loadedMapKey }).then(
        (loaded) => {
          if (pSeq !== previewSeqRef.current) return;
          baseMapCacheRef.current.set(`${loadedPlanetId}:${loadedMapKey}`, loaded);
          setMap(loaded);
          setRatioUpdating(false);
        },
        () => {
          if (pSeq === previewSeqRef.current) setRatioUpdating(false);
        },
      );
      return () => undefined;
    }
    const timer = setTimeout(() => {
      previewSeqRef.current += 1;
      const pSeq = previewSeqRef.current;
      setRatioUpdating(true);
      source
        .preview(loadedPlanetId, { kind: "key", mapKey: loadedMapKey }, edited.mapProps, {
          beforeBuild: askBuild,
        })
        .then(
          (loaded) => {
            if (pSeq !== previewSeqRef.current) return;
            setMap(loaded);
            setRatioUpdating(false);
          },
          () => {
            if (pSeq === previewSeqRef.current) setRatioUpdating(false);
          },
        );
    }, RATIO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [mapPropsChanged, loadedMapKey, loadedPlanetId, edited.mapProps, source, askBuild]);

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  // 엔진은 2차맵 키가 바뀔 때만 새로 만든다 → 같은 맵에서 비율만 바꾸면 카메라가 전혀 움직이지 않는다
  useEffect(() => {
    const host = hostRef.current;
    if (!host || loadedMapKey === null) return () => undefined;
    const engine = createSecondMapEngine(host, {
      mapKey: loadedMapKey,
      initialZoom: INITIAL_ZOOM,
      onGroundTap: (cell) => {
        const current = mapRef.current;
        if (current) setPoint(labPointInfo(current.terrain, cell.x, cell.y));
      },
    });
    engineRef.current = engine;
    const timer = setInterval(() => setStats(engine.stats()), STATS_MS);
    return () => {
      clearInterval(timer);
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [loadedMapKey]);

  const cap = map ? maxExaggeration(map.terrain) : 1;
  const factor = Math.min(settings.exaggeration, cap);

  // 지형(높이 과장 + 비율 변경 즉석 교체)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !map) return;
    engine.setTerrain(exaggerateTerrain(map.terrain, factor)).catch(ignoreDisposed);
  }, [map, factor]);

  // 채집 자리(site)·움직이는 어군(school) 즉석 미리 보기
  const gatherPreview = useMemo(() => {
    if (!map) return null;
    return buildGatherPreview({
      mapKey: map.mapKey,
      surface: map.terrain.surface,
      art: map.terrain.art,
      biomeId: map.cell.biomeId,
      waterBits: map.cell.water,
      gatherObjects: edited.gatherObjects,
    });
  }, [map, edited.gatherObjects]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !map) return;
    if (!showGather || !gatherPreview) {
      engine.setObjectProps([]);
      engine.setSchools([]);
      return;
    }
    engine.setObjectProps(gatherPreview.objectProps);
    engine.setSchools(gatherPreview.schools);
  }, [map, showGather, gatherPreview]);

  const artSummary = useMemo(() => summarizeArtLayer(map?.terrain.art), [map?.terrain.art]);

  // 낮밤
  useEffect(() => {
    if (loadedMapKey === null) return;
    engineRef.current?.setSky(skyMode(loadedMapKey, settings));
  }, [loadedMapKey, settings]);

  // 보기(격자·소품 모델 거리·상한)
  const { grid, propSpanM, propCap } = settings;
  useEffect(() => {
    if (loadedMapKey === null) return;
    engineRef.current?.setViewOptions({ grid, propSpanM, propCap });
  }, [loadedMapKey, grid, propSpanM, propCap]);

  // 이웃 3×3
  const neighbourCache = useRef(new Map<LabMap, Promise<LabNeighbour[]>>());
  const { neighbours } = settings;
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !map) return () => undefined;
    if (!neighbours) {
      engine.setNeighbours([]).catch(ignoreDisposed);
      return () => undefined;
    }
    let live = true;
    const cache = neighbourCache.current;
    let pending = cache.get(map);
    if (!pending) {
      pending = source
        .neighbours(map, map.customProps ? editedMapPropsRef.current : undefined)
        .catch(() => []);
      cache.clear();
      cache.set(map, pending);
    }
    const pivot = labPivot(map.terrain);
    void pending.then((list) => {
      if (!live || engineRef.current !== engine) return;
      const placed = list.flatMap((item) => {
        try {
          return [
            {
              id: `${item.mapKey}@${factor}`,
              terrain: exaggerateTerrain(item.terrain, factor, pivot),
              placement: item.placement,
            },
          ];
        } catch {
          return [];
        }
      });
      engine.setNeighbours(placed).catch(ignoreDisposed);
    });
    return () => {
      live = false;
    };
  }, [map, neighbours, factor, source]);

  const level = faceLevelOf(definitions.planets.find((planet) => planet.id === planetId)?.entry) ?? 9;
  const openCell = (): void => {
    const face = Number(inputs.face);
    const i = Number(inputs.i);
    const j = Number(inputs.j);
    const n = cellsPerSide(level);
    if (!isFace(face) || !Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) {
      setStatus({ kind: "failed", code: "bad_key" });
      return;
    }
    open(planetId, { kind: "key", mapKey: cellKey(face, level, i, j) });
  };
  const openKey = (): void => {
    const key = Number(inputs.key.trim());
    if (!isCellKey(key)) {
      setStatus({ kind: "failed", code: "bad_key" });
      return;
    }
    open(planetId, { kind: "key", mapKey: key });
  };
  const onPreset = (preset: MapPreset | "test"): void =>
    open(planetId, preset === "test" ? { kind: "test" } : { kind: "preset", preset });
  const onJumpBiome = (biomeId: string): void => {
    setPickedBiome(biomeId);
    setBiomeVariant(0);
    open(planetId, { kind: "biome", biomeId, variant: 0 });
  };
  const onSelectBiome = (biomeId: string): void => {
    setPickedBiome(biomeId);
    setBiomeVariant(0);
    if (syncMapWithBiome) open(planetId, { kind: "biome", biomeId, variant: 0 });
  };
  const onNextCell = (): void => {
    const next = (biomeVariant + 1) % 8;
    setBiomeVariant(next);
    open(planetId, { kind: "biome", biomeId: selectedBiome, variant: next });
  };
  const onPlanet = (next: string): void => {
    if (next === planetId) return;
    setStatus({ kind: "loading", stage: null });
    if (scope.planets.some((planet) => planet.id === next)) {
      setTemplateId(null);
      scope.select(next);
    } else setTemplateId(next);
  };
  const onLocate = (rowKey: string, spots: readonly CellSpot[]): void => {
    const engine = engineRef.current;
    if (!engine) return;
    const id = rowKey.split("/")[1] ?? "";
    const liveSchools = rowKey.startsWith("gather_objects/") ? gatherPreview?.schoolsById.get(id) : undefined;
    if (liveSchools && liveSchools.length > 0) {
      const index = locateCycleRef.current.get(rowKey) ?? 0;
      const school = liveSchools[index % liveSchools.length];
      locateCycleRef.current.set(rowKey, (index + 1) % liveSchools.length);
      if (!school) return;
      const pos = schoolPosition(school, Date.now());
      engine.setView({
        x: pos.x / SCHOOL_POSITION_SCALE + 0.5,
        y: pos.y / SCHOOL_POSITION_SCALE + 0.5,
        spanM: 110,
      });
      return;
    }
    if (spots.length === 0) return;
    const index = locateCycleRef.current.get(rowKey) ?? 0;
    const spot = spots[index % spots.length];
    locateCycleRef.current.set(rowKey, (index + 1) % spots.length);
    if (!spot) return;
    engine.setView({ x: spot.x + 0.5, y: spot.y + 0.5, spanM: 90 });
  };
  const zoomToSpan = (spanM: number): void => {
    const engine = engineRef.current;
    if (!engine || !map) return;
    const cam = engine.camera();
    const cellM = map.terrain.cellSizeM / 2;
    engine.setView({ x: cam.targetX / cellM, y: cam.targetZ / cellM, spanM });
  };

  const light = stats?.light ?? null;
  const busy = status.kind === "loading";
  const currentBiomeLabel =
    biomeOptions.find((entry) => entry.id === map?.cell.biomeId)?.name[locale] ?? map?.cell.biomeId ?? "";

  return (
    <div
      className="sml-body"
      data-status={status.kind}
      data-error={status.kind === "failed" ? status.code : undefined}
      data-source={map?.source}
      data-map-key={map?.mapKey}
      data-exaggeration={factor}
      data-grid={settings.grid ? "on" : "off"}
      data-sky={settings.sky ? "on" : "off"}
      data-neighbours={stats?.neighbours}
      data-props={stats?.props}
      data-clutter={stats?.propClutter}
      data-draw-calls={stats?.drawCalls}
      data-triangles={stats?.triangles}
      data-render-p95={stats?.renderP95Ms.toFixed(2)}
      data-view-span={stats ? Math.round(stats.viewSpanM) : undefined}
      data-light-hour={light?.localHours == null ? undefined : light.localHours.toFixed(2)}
      data-live-preview={map?.customProps ? "custom" : "pack"}
    >
      {/* 왼쪽: 실시간 3D 2차맵 + 하단 퀵 도크 */}
      <div className="sml-left">
        <div className="sml-stage">
          <div ref={hostRef} className="sml-view" role="img" aria-label={m.second_map_lab_view_label()} />
          {buildAsk ? (
            <div className="sml-ask" role="alertdialog" aria-labelledby="sml-ask-text">
              <p id="sml-ask-text">{m.second_map_lab_build_ask({ level: String(buildAsk.level) })}</p>
              <div className="sml-ask-actions">
                <button type="button" className="button-small" onClick={() => buildAsk.answer(false)}>
                  {m.second_map_lab_cancel()}
                </button>
                <button
                  type="button"
                  className="button-small button-primary sml-ask-build"
                  onClick={() => buildAsk.answer(true)}
                >
                  {m.second_map_lab_build()}
                </button>
              </div>
            </div>
          ) : null}
          <div className="sml-hud">
            <p className="sml-chip" role="status">
              {status.kind === "loading"
                ? status.stage === "planet"
                  ? m.planet_editor_second_map_stage_planet({ level: String(level) })
                  : status.stage === "map"
                    ? m.planet_editor_second_map_stage_map()
                    : m.second_map_lab_loading_map()
                : status.kind === "failed"
                  ? labErrorText(status.code)
                  : light
                    ? m.map_perf_light({
                        time: formatLocalTime(light.localHours),
                        sun: light.sunElevationDeg == null ? "–" : String(Math.round(light.sunElevationDeg)),
                        moon: light.moonLit == null ? "–" : String(Math.round(light.moonLit * 100)),
                      })
                    : m.second_map_lab_loading_map()}
            </p>
            {map ? (
              <p className="sml-chip">
                {`${currentBiomeLabel} · (${map.cell.face}:${map.cell.i},${map.cell.j})`}
              </p>
            ) : null}
            <p
              className="sml-chip sml-live-chip"
              data-mode={ratioUpdating ? "updating" : map?.customProps ? "custom" : "pack"}
            >
              {ratioUpdating
                ? m.dev_terrain_lab_live_updating()
                : map?.customProps
                  ? `${m.dev_terrain_lab_live_badge()}${map.mapMs != null ? ` (${Math.round(map.mapMs)}ms)` : ""}`
                  : m.dev_terrain_lab_pack_badge()}
            </p>
          </div>
        </div>

        {/* 2차맵 하단 PC 퀵 툴바 */}
        <div className="sml-dock">
          <div className="sml-dock-group">
            <button type="button" className="button-small" onClick={() => zoomToSpan(80)}>
              {m.dev_terrain_lab_zoom_close()}
            </button>
            <button type="button" className="button-small" onClick={() => zoomToSpan(170)}>
              {m.dev_terrain_lab_zoom_mid()}
            </button>
            <button type="button" className="button-small" onClick={() => zoomToSpan(360)}>
              {m.dev_terrain_lab_zoom_far()}
            </button>
          </div>
          <div className="sml-dock-group">
            <label className="sml-dock-check">
              <input
                type="checkbox"
                checked={showGather}
                onChange={(event) => setShowGather(event.currentTarget.checked)}
              />
              <span>{m.dev_terrain_lab_show_gather()}</span>
            </label>
            <label className="sml-dock-check">
              <input
                type="checkbox"
                checked={settings.grid}
                onChange={(event) => setSettings((cur) => ({ ...cur, grid: event.currentTarget.checked }))}
              />
              <span>{m.second_map_lab_grid()}</span>
            </label>
            <label className="sml-dock-check">
              <input
                type="checkbox"
                checked={settings.sky}
                onChange={(event) => setSettings((cur) => ({ ...cur, sky: event.currentTarget.checked }))}
              />
              <span>{m.second_map_lab_sky()}</span>
            </label>
          </div>
          <div className="sml-dock-group">
            {([1, 2, 4] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                className="button-small"
                disabled={ex > cap}
                aria-pressed={factor === ex}
                onClick={() => setSettings((cur) => ({ ...cur, exaggeration: ex }))}
              >
                {`×${ex}`}
              </button>
            ))}
          </div>
          <span className="sml-dock-stats">
            {m.dev_terrain_lab_dock_stats({
              props: String(stats?.props ?? 0),
              schools: String(showGather ? (gatherPreview?.schools.length ?? 0) : 0),
            })}
          </span>
        </div>
      </div>

      {/* 오른쪽: 지형 오브젝트·3D 모델 편집기 ↔ 맵·조명·칸 상세 */}
      <div className="sml-panel" data-active-tab={activeTab}>
        {activeTab === "objects" ? (
          <TerrainObjectsPanel
            original={originalEntries}
            edited={edited}
            biomes={biomeOptions}
            contentVersion={definitions.contentVersion}
            locale={locale}
            biome={selectedBiome}
            mapBiomeId={map?.cell.biomeId ?? null}
            syncMapWithBiome={syncMapWithBiome}
            mapBusy={busy}
            artSummary={artSummary}
            gatherSpotsById={gatherPreview?.spotsById ?? new Map()}
            onSelectBiome={onSelectBiome}
            onToggleSync={setSyncMapWithBiome}
            onNextCell={onNextCell}
            onEdited={setEdited}
            onLocate={onLocate}
          />
        ) : (
          <LabPanel
            planets={definitions.planets}
            biomes={definitions.biomes}
            biomeOptions={biomeOptions}
            locale={locale}
            planetId={planetId}
            map={map}
            settings={settings}
            maxExaggeration={cap}
            point={point}
            inputs={inputs}
            busy={busy}
            viewStats={stats ? { neighbours: stats.neighbours, props: stats.props } : null}
            onPlanet={onPlanet}
            onPreset={onPreset}
            onBiome={onJumpBiome}
            onInputs={setInputs}
            onOpenCell={openCell}
            onOpenKey={openKey}
            onSettings={(next) => setSettings((current) => ({ ...current, ...next }))}
          />
        )}
      </div>
    </div>
  );
}
