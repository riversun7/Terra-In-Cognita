// 2차맵 시험 화면(/dev/second-map) — ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)". dev·admin, 틀 숨김.
// 유닛 없이 아무 2차맵이나 열어 시각·자리·고저 과장·격자·소품 모델 거리를 바꿔 본다. 보기 전용: 게임 상태를 바꾸지 않는다.
// - 자료: labSource.ts(월드 행성은 서버 지형 파일, 그 밖의 행성은 편집기 2차맵 미리보기 워커). 행성 목록·바이옴 이름·소품 규칙은
//   편집기 정의 조회(planetEditor.definitions, 시드가 든 자료라 그 조회가 감사 기록을 남긴다)에서 받는다.
// - 안개 없음(엔진 setExplored를 부르지 않는다), 유닛·건물 없음. 낮밤은 지역 시각에 멈춘다(엔진 utcMsForLocalHour, 달력 3일째).
// - 높이 과장은 엔진에 넘기기 전 지형 입력에만 곱한다(labTerrain.ts). 칸 정보는 과장 전 값이다.
// - 엔진 렌더러는 앱에 하나다: 이 화면이 엔진을 들고 있는 동안 다른 지도 화면은 열려 있지 않다(틀 숨김 전체 화면).
// 시험·측정용 data-*: data-status(loading·ready·failed), data-source, data-map-key, data-exaggeration, data-grid, data-sky,
// data-neighbours·data-props(엔진 요약), data-light-hour, data-error.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatLocalTime } from "../../map/secondMapSky.ts";
import { fetchTerrain } from "../../map/terrainLoader.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { createSecondMapPreviewClient } from "../../map/secondMapBuildClient.ts";
import type { SecondMapPreviewStage } from "../planet/secondMapPreviewProtocol.ts";
import { LabPanel, type LabPanelProps, type LabSettings } from "./LabPanel.tsx";
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

/** 처음 여는 행성(월드 행성 = 서버 지형). 정의에 없으면 첫 행성 */
const DEFAULT_PLANET = "s2_test_planet";
/** 기본 보기(지금 게임 값): 정오, 낮밤 켬, 과장 ×1, 소품 모델 420m·5,000개(게임은 가시거리 단계가 상한을 고른다 — 처음 단계 5,000) */
const DEFAULT_SETTINGS: LabSettings = {
  sky: true,
  hour: 12,
  exaggeration: 1,
  neighbours: false,
  grid: false,
  propSpanM: 420,
  propCap: 5000,
};
/** 처음 카메라: 화면 짧은 변 약 360m(소품 모델 거리 420m 안, 고저가 보이게. 엔진 기본은 약 70m) */
const INITIAL_ZOOM = 9;
/** 이 면 레벨부터는 기기에서 행성을 처음 만들기 전에 묻는다(편집기 editorView.ts CONFIRM_PREVIEW_LEVEL과 같다) */
const CONFIRM_BUILD_LEVEL = 9;
/** 엔진 요약을 읽는 간격(ms) */
const STATS_MS = 1000;

/**
 * 엔진 지형·이웃 걸기는 워커에서 메시를 만든 뒤 풀린다. 그 사이 2차맵을 바꿔 엔진을 버리면 "terrain builder disposed"로 거절된다:
 * 버린 엔진의 일이라 무시한다(새 엔진이 새 지형을 건다)
 */
function ignoreDisposed(): void {}

type Status =
  | { readonly kind: "loading"; readonly stage: SecondMapPreviewStage | null }
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly code: LabErrorCode };

/** 정의 조회 → 화면이 쓰는 것(팩 행성 + 행성 표본, 바이옴, 소품 규칙) */
function labDefinitions(definitions: {
  readonly planets: readonly { readonly id: string; readonly entry: unknown }[];
  readonly templates: readonly { readonly id: string; readonly entry: unknown }[];
  readonly biomes: readonly unknown[];
  readonly mapProps: readonly unknown[];
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
  };
}

/** 하늘 모드: 끔이거나 그 2차맵 자리의 지역 시각에 멈춤 */
function skyMode(mapKey: number, settings: LabSettings): PlanetSkyMode {
  const place = secondMapPlace(mapKey);
  if (!settings.sky || !place) return { kind: "off" };
  return { kind: "fixed", utcMs: utcMsForLocalHour(place.lonDeg, settings.hour) };
}

export default function SecondMapLabScreen({ onClose }: { onClose: () => void }) {
  const [load, setLoad] = useState<
    { kind: "loading" } | { kind: "failed" } | { kind: "ready"; definitions: LabDefinitions }
  >({ kind: "loading" });

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
          {m.shell_route_dev_second_map()}
        </h1>
      </header>
      {load.kind === "ready" ? (
        <Lab definitions={load.definitions} />
      ) : (
        <p className="status sml-center" role="status">
          {load.kind === "loading" ? m.second_map_lab_loading() : m.second_map_lab_load_failed()}
        </p>
      )}
    </section>
  );
}

function Lab({ definitions }: { definitions: LabDefinitions }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SecondMapEngine | null>(null);
  const mapRef = useRef<LabMap | null>(null);
  const seqRef = useRef(0);
  const [client] = useState(() => createSecondMapPreviewClient());
  const source = useMemo(
    () =>
      createLabSource({
        query: (input) => api.planetEditor.secondMap.query(input),
        fetchTerrain: (url) => fetchTerrain(url),
        device: client,
        definitions,
      }),
    [client, definitions],
  );
  const firstPlanet = definitions.planets.some((planet) => planet.id === DEFAULT_PLANET)
    ? DEFAULT_PLANET
    : (definitions.planets[0]?.id ?? DEFAULT_PLANET);
  const [planetId, setPlanetId] = useState(firstPlanet);
  const [status, setStatus] = useState<Status>({ kind: "loading", stage: null });
  const [map, setMap] = useState<LabMap | null>(null);
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
  const [point, setPoint] = useState<LabPointInfo | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  /** 이 기기에서 F9 이상 행성을 처음 만들기 전에 묻는 중(지도 위 카드) */
  const [buildAsk, setBuildAsk] = useState<{ level: number; answer: (ok: boolean) => void } | null>(null);
  const [inputs, setInputs] = useState<LabPanelProps["inputs"]>({ face: "", i: "", j: "", key: "" });

  useEffect(() => () => client.dispose(), [client]);

  /**
   * F9 이상 행성을 이 기기에서 처음 만들 때 묻는다(편집기 F9 미리보기 확인과 같은 기준 editorView.ts CONFIRM_PREVIEW_LEVEL).
   * 편집기 확인 창 모듈은 가져오지 않는다(labSource.ts 머리 주석): 지도 위 카드로 묻는다
   */
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

  /** 2차맵 하나를 받는다(낡은 부탁의 결과는 버린다) */
  const run = useCallback(
    (planet: string, target: LabTarget) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      source
        .load(planet, target, {
          onStage: (stage) => {
            if (seq === seqRef.current) setStatus({ kind: "loading", stage });
          },
          beforeBuild: askBuild,
        })
        .then(
          (loaded) => {
            if (seq !== seqRef.current) return;
            setMap(loaded);
            setPoint(null);
            setStatus({ kind: "ready" });
            setInputs({
              face: String(loaded.cell.face),
              i: String(loaded.cell.i),
              j: String(loaded.cell.j),
              key: String(loaded.mapKey),
            });
          },
          (error: unknown) => {
            if (seq !== seqRef.current) return;
            setStatus({ kind: "failed", code: error instanceof LabLoadError ? error.code : "failed" });
          },
        );
    },
    [source, askBuild],
  );

  /** 사용자 조작으로 연다(받는 중 표시를 먼저) */
  const open = (planet: string, target: LabTarget): void => {
    setStatus({ kind: "loading", stage: null });
    run(planet, target);
  };

  // 처음: 시험 2차맵
  useEffect(() => {
    run(firstPlanet, { kind: "test" });
  }, [run, firstPlanet]);

  // 2차맵이 바뀌면 엔진을 새로 만든다(낮밤 자리가 2차맵 키에 달려 있다). 지형·보기는 아래 효과들이 건다
  useEffect(() => {
    mapRef.current = map;
    const host = hostRef.current;
    if (!host || !map) return () => undefined;
    const engine = createSecondMapEngine(host, {
      mapKey: map.mapKey,
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
  }, [map]);

  const cap = map ? maxExaggeration(map.terrain) : 1;
  const factor = Math.min(settings.exaggeration, cap);

  // 지형(높이 과장)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !map) return;
    engine.setTerrain(exaggerateTerrain(map.terrain, factor)).catch(ignoreDisposed);
  }, [map, factor]);

  // 낮밤
  useEffect(() => {
    if (!map) return;
    engineRef.current?.setSky(skyMode(map.mapKey, settings));
  }, [map, settings]);

  // 보기(격자·소품 모델)
  const { grid, propSpanM, propCap } = settings;
  useEffect(() => {
    if (!map) return;
    engineRef.current?.setViewOptions({ grid, propSpanM, propCap });
  }, [map, grid, propSpanM, propCap]);

  // 이웃 3×3(같은 높이 과장 기준으로 늘려 경계가 이어지게. 너무 높은 이웃은 뺀다)
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
      pending = source.neighbours(map).catch(() => []);
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
  const onPlanet = (next: string): void => {
    setPlanetId(next);
    open(next, { kind: "test" });
  };

  const light = stats?.light ?? null;
  const busy = status.kind === "loading";
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
      data-light-hour={light?.localHours == null ? undefined : light.localHours.toFixed(2)}
    >
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
        </div>
      </div>
      <div className="sml-panel">
        <LabPanel
          planets={definitions.planets}
          biomes={definitions.biomes}
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
          onInputs={setInputs}
          onOpenCell={openCell}
          onOpenKey={openKey}
          onSettings={(next) => setSettings((current) => ({ ...current, ...next }))}
        />
      </div>
    </div>
  );
}
