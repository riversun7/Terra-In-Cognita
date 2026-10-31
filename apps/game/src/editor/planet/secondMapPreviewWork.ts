// 편집기 2차맵 미리보기 일 하나(워커 안 순수 부분) — ADR 2026-10-31-second-map-from-planet 9절(ADR 38 D6a).
// planetEditorSecondMapWorker.ts가 메시지를 받아 부른다. 시험은 워커 없이 바로 부른다(vitest는 모듈 워커를 띄우지 않는다).
// - 행성: 같은 행성 열쇠면 들고 있는 행성 값을 다시 쓴다. 아니면 옛 값을 먼저 버리고(메모리) 생성기로 만든다.
//   서버 굽기(apps/server/src/planet/sources.ts)와 같은 길: runPlanetGenerator → planetValuesFromGeneration(바이옴 ID = 입력 바이옴 표).
// - 2차맵: 소품 규칙(map_props 원본 항목) → mapPropInputsFromJson → compileMapProps(행성 바이옴 표) → generateSecondMap. 서버 지형 워커와 같은 코드라
//   판정 층(지표·엄폐·물)이 서버와 같다. 숨김 정보(자원)는 생성기에 없다.
// - 개발자 2차맵 시험(/dev/second-map)도 같은 워커를 쓴다: 키 대신 시험 자리 종류(preset), 8이웃(neighbours), 행성 칸 값(cell).
// 던지지 않는다: 받지 않는 입력은 rejected, 맞는 자리가 없으면 none, 그 밖의 오류는 failed로 답한다.
import { isCellKey, stepCell } from "@terra/planet";
import {
  type PlanetGeneratorInput,
  planetInputFromDefinition,
  runPlanetGenerator,
  validatePlanetInput,
} from "@terra/planet/generator";
import {
  type MapPreset,
  type MapPropInput,
  type PlanetValues,
  type SecondMapTerrain,
  compileMapProps,
  findMapPreset,
  generateSecondMap,
  mapPropInputsFromJson,
  planetCellValues,
  planetValuesFromGeneration,
} from "@terra/planet/secondMap";
import type {
  SecondMapPreviewReply,
  SecondMapPreviewRequest,
  SecondMapPreviewStage,
  SecondMapPreviewTerrain,
} from "./secondMapPreviewProtocol.ts";

/** 워커가 들고 있는 행성 값(하나만)과 그 행성에서 찾은 시험 자리 */
export interface PlanetValuesSlot {
  key: string | null;
  values: PlanetValues | null;
  presets: Map<MapPreset, number | null>;
}

export function emptyPlanetSlot(): PlanetValuesSlot {
  return { key: null, values: null, presets: new Map() };
}

/** 생성 결과 → 화면에 넘길 2차맵(배열은 그대로, 넘길 버퍼를 모은다) */
function previewTerrain(terrain: SecondMapTerrain, buffers: Set<ArrayBuffer>): SecondMapPreviewTerrain {
  const { heightsCm, waterLevelCm, surface, cover, art } = terrain;
  for (const array of [heightsCm, waterLevelCm, surface, cover, art]) {
    if (array.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
  }
  return {
    mapKey: terrain.mapKey,
    generatorVersion: terrain.generatorVersion,
    heightsCm,
    waterLevelCm,
    surface,
    cover,
    art,
    cellSizeMm: terrain.cellSizeMm,
    hash: terrain.hash,
  };
}

/** 면 칸 8이웃 키(정육면체 꼭짓점 쪽은 7개) */
function neighbourKeys(mapKey: number): number[] {
  if (!isCellKey(mapKey)) return [];
  const out: number[] = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const next = stepCell(mapKey, di, dj);
      if (next !== null && !out.includes(next)) out.push(next);
    }
  }
  return out;
}

export interface SecondMapWorkOptions {
  readonly onStage?: (stage: SecondMapPreviewStage) => void;
  /** 시계(ms). 기본 performance.now */
  readonly now?: () => number;
}

export interface SecondMapWorkOutput {
  readonly reply: SecondMapPreviewReply;
  readonly transfer: ArrayBuffer[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 일 하나를 끝까지 한다(slot을 고친다) */
export function runSecondMapJob(
  request: SecondMapPreviewRequest,
  slot: PlanetValuesSlot,
  options: SecondMapWorkOptions = {},
): SecondMapWorkOutput {
  const { id } = request;
  const now = options.now ?? (() => performance.now());
  const onStage = options.onStage ?? (() => undefined);
  const reject = (error: unknown): SecondMapWorkOutput => ({
    reply: { kind: "error", id, code: "rejected", message: messageOf(error) },
    transfer: [],
  });
  let props: MapPropInput[];
  let input: PlanetGeneratorInput;
  try {
    const { definition } = request;
    if (request.input) input = request.input;
    else if (definition)
      input = planetInputFromDefinition(definition.entry, definition.biomes, definition.faceLevel);
    else throw new TypeError("request needs input or definition");
    validatePlanetInput(input);
    props = mapPropInputsFromJson(request.props);
  } catch (error) {
    return reject(error);
  }
  const biomeIds = input.biomes.map((biome) => biome.id);
  let rules: ReturnType<typeof compileMapProps>;
  try {
    rules = compileMapProps(props, biomeIds);
  } catch (error) {
    return reject(error);
  }
  try {
    let planetMs: number | null = null;
    let values = slot.key === request.planetKey ? slot.values : null;
    if (!values) {
      // 옛 행성 값을 먼저 놓는다(F9 약 22MB): 새 생성과 함께 들고 있지 않게
      slot.key = null;
      slot.values = null;
      slot.presets.clear();
      onStage("planet");
      const started = now();
      const details = runPlanetGenerator(input);
      values = planetValuesFromGeneration(details.fields, details, biomeIds);
      planetMs = now() - started;
      slot.key = request.planetKey;
      slot.values = values;
    }
    const planet = values;
    let mapKey = request.mapKey;
    if (mapKey === null) {
      const preset = request.preset ?? "river";
      if (!slot.presets.has(preset)) slot.presets.set(preset, findMapPreset(planet, preset));
      mapKey = slot.presets.get(preset) ?? null;
      if (mapKey === null) {
        return {
          reply: { kind: "error", id, code: "none", message: `no place for ${preset}` },
          transfer: [],
        };
      }
    }
    onStage("map");
    const mapStarted = now();
    const terrain = generateSecondMap(planet, mapKey, rules);
    const mapMs = now() - mapStarted;
    const buffers = new Set<ArrayBuffer>();
    const main = previewTerrain(terrain, buffers);
    const neighbours = request.neighbours
      ? neighbourKeys(mapKey).map((key) => previewTerrain(generateSecondMap(planet, key, rules), buffers))
      : [];
    return {
      reply: {
        kind: "result",
        id,
        result: { terrain: main, cell: planetCellValues(planet, mapKey), neighbours, planetMs, mapMs },
      },
      transfer: [...buffers],
    };
  } catch (error) {
    return { reply: { kind: "error", id, code: "failed", message: messageOf(error) }, transfer: [] };
  }
}
