// 2차맵 소품 규칙(콘텐츠 분류 map_props) → 생성기가 쓰는 정수 표 — ADR 46 4절.
// @terra/planet은 @terra/content를 가져올 수 없어서(경계 규칙) 항목을 느슨한 모양(MapPropInput)으로 받고 여기서 다시 확인한다.
// 콘텐츠 검사(스키마·참조)가 먼저 막으므로 여기서 던지는 오류는 팩을 거치지 않은 입력(시험·측정 스크립트)에서만 난다.
// - 비중: 바이옴 기본 비중(천분율) × 곡선 값(0 ~ 1000)들의 곱 ÷ 1000^곡선 수. 바이옴 번호는 행성의 바이옴 표 순서다.
// - 곡선 경계는 생성기 내부 단위로 바꿔 둔다(기온 1/100°C, 위도 1/1000도, 나머지는 콘텐츠 단위 그대로).
// - 규칙 해시: 같은 규칙이면 같은 값(항목 순서 포함 — 순서가 흩기 우선순위다). 2차맵 결과가 규칙에 달려 있어 캐시 열쇠에 넣는다(WP-3).
import {
  MAP_PROP_CLUMP_CELLS,
  MAP_PROP_CURVE_AXES,
  MAP_PROP_CURVE_AXIS_NAMES,
  type MapPropCurveAxis,
  mapPropArtCode,
} from "@terra/shared";
import { mix32 } from "../generator/random.ts";

/** 곡선 하나(콘텐츠 단위) */
export interface MapPropCurveInput {
  readonly min: number;
  readonly idealMin: number;
  readonly idealMax: number;
  readonly max: number;
}

/** 콘텐츠 항목 하나(팩 파싱 결과 또는 JSON 그대로). 바이옴은 ID 문자열이나 {id}(팩 참조) */
export interface MapPropInput {
  readonly id: string;
  readonly art: string;
  readonly placement: string;
  readonly cover?: number | undefined;
  readonly biomes: readonly { readonly biome: string | { readonly id: string }; readonly weight: number }[];
  readonly curves?: Readonly<Partial<Record<string, MapPropCurveInput | undefined>>> | undefined;
  readonly clump?: { readonly cells: number; readonly threshold: number } | undefined;
  readonly maxShare?: number | undefined;
  /** 물 칸에만 놓는 장식(흩기만, 엄폐 0 — 기획 D-536). 없으면 마른 칸 */
  readonly water?: boolean | undefined;
}

/** 곡선 축 번호(MAP_PROP_CURVE_AXIS_NAMES 순서) */
export const AXIS = {
  temperature: 0,
  humidity: 1,
  precipitation: 2,
  altitude: 3,
  slope: 4,
  latitude: 5,
  waterDistance: 6,
} as const;

/** 축마다 콘텐츠 단위 → 내부 단위 배율 */
const AXIS_SCALE: Readonly<Record<MapPropCurveAxis, number>> = {
  temperatureC: 100,
  humidity: 1,
  precipitationMm: 1,
  realAltitudeM: 1,
  slopePct: 1,
  absLatitude: 1000,
  waterDistance: 1,
};

export interface PropCurve {
  readonly axis: number;
  readonly min: number;
  readonly idealMin: number;
  readonly idealMax: number;
  readonly max: number;
}

export interface PropRule {
  readonly id: string;
  /** 그림 번호(@terra/shared MAP_PROP_ARTS) */
  readonly art: number;
  /** 엄폐 값(흩기만. 숲은 숲 나누기가 정한다) */
  readonly cover: number;
  /** 바이옴 번호 → 기본 비중(천분율, 없으면 0) */
  readonly biomeWeight: Int32Array;
  readonly curves: readonly PropCurve[];
  /** 덩이 노이즈 격자 간격 log2(배치 칸). 0 = 덩이 없음 */
  readonly clumpLog2: number;
  /** 덩이 문턱(천분율) */
  readonly clumpThreshold: number;
  /** 한 2차맵 안 몫 상한(배치 칸 수). 0 = 없음 */
  readonly maxShareCells: number;
  /** ID에서 만든 소금(순서와 무관) */
  readonly salt: number;
  /** 물 칸에만 놓는다(흩기 장식, 엄폐 0) */
  readonly water: boolean;
}

export interface PropRuleSet {
  /** 행성 바이옴 표(번호 → ID) */
  readonly biomeIds: readonly string[];
  /** 숲 칸 나무 그림 후보 */
  readonly forest: readonly PropRule[];
  /** 흩기 소품(앞에서부터 우선) */
  readonly scatter: readonly PropRule[];
  /** 쓰는 곡선 축(축 번호 비트) — 쓰지 않는 환경 값은 계산하지 않는다 */
  readonly axes: number;
  /** 규칙 해시(FNV-1a 32비트 16진수 8자리) */
  readonly hash: string;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnvText(state: number, text: string): number {
  let s = state;
  for (let k = 0; k < text.length; k++) s = Math.imul(s ^ text.charCodeAt(k), FNV_PRIME) >>> 0;
  return Math.imul(s ^ 0xff, FNV_PRIME) >>> 0;
}

function fnvInt(state: number, value: number): number {
  let s = state;
  for (let shift = 0; shift < 32; shift += 8) s = Math.imul(s ^ ((value >>> shift) & 0xff), FNV_PRIME) >>> 0;
  return s;
}

const isInt = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;

function compileCurves(prop: MapPropInput): PropCurve[] {
  const out: PropCurve[] = [];
  const curves = prop.curves ?? {};
  for (const name of Object.keys(curves)) {
    if (!(MAP_PROP_CURVE_AXIS_NAMES as readonly string[]).includes(name)) {
      throw new RangeError(`map prop ${prop.id}: unknown curve axis ${name}`);
    }
  }
  MAP_PROP_CURVE_AXIS_NAMES.forEach((name, axis) => {
    const curve = curves[name];
    if (!curve) return;
    const [low, high] = MAP_PROP_CURVE_AXES[name];
    const { min, idealMin, idealMax, max } = curve;
    if (
      ![min, idealMin, idealMax, max].every((value) => isInt(value, low, high)) ||
      !(min <= idealMin && idealMin <= idealMax && idealMax <= max && min < max)
    ) {
      throw new RangeError(`map prop ${prop.id}: bad ${name} curve`);
    }
    const scale = AXIS_SCALE[name];
    out.push({
      axis,
      min: min * scale,
      idealMin: idealMin * scale,
      idealMax: idealMax * scale,
      max: max * scale,
    });
  });
  return out;
}

/** 항목 하나 → 규칙. 행성에 없는 바이옴의 비중은 버린다 */
function compileProp(
  prop: MapPropInput,
  biomeIndex: ReadonlyMap<string, number>,
  biomeCount: number,
): PropRule {
  const art = mapPropArtCode(prop.art);
  if (art <= 0) throw new RangeError(`map prop ${prop.id}: unknown art ${prop.art}`);
  const scatter = prop.placement === "scatter";
  if (!scatter && prop.placement !== "forest") {
    throw new RangeError(`map prop ${prop.id}: unknown placement ${prop.placement}`);
  }
  const cover = scatter ? prop.cover : 0;
  if (!isInt(cover, 0, 2)) throw new RangeError(`map prop ${prop.id}: cover must be 0, 1 or 2`);
  const biomeWeight = new Int32Array(biomeCount);
  for (const { biome, weight } of prop.biomes) {
    if (!isInt(weight, 1, 1000)) throw new RangeError(`map prop ${prop.id}: weight must be 1 ~ 1000`);
    const index = biomeIndex.get(typeof biome === "string" ? biome : biome.id);
    if (index !== undefined) biomeWeight[index] = weight;
  }
  let clumpLog2 = 0;
  let clumpThreshold = 0;
  if (scatter && prop.clump) {
    const { cells, threshold } = prop.clump;
    // 덩이 크기 표는 2, 4, 8, …이라 표 위치 + 1이 log2다
    const position = (MAP_PROP_CLUMP_CELLS as readonly number[]).indexOf(cells);
    if (position < 0 || !isInt(threshold, 0, 999)) throw new RangeError(`map prop ${prop.id}: bad clump`);
    clumpLog2 = position + 1;
    clumpThreshold = threshold;
  }
  const share = scatter ? (prop.maxShare ?? 0) : 0;
  if (!isInt(share, 0, 1000)) throw new RangeError(`map prop ${prop.id}: maxShare must be 1 ~ 1000`);
  const water = scatter && prop.water === true;
  if (water && cover !== 0) throw new RangeError(`map prop ${prop.id}: water props must have cover 0`);
  return {
    id: prop.id,
    art,
    cover,
    biomeWeight,
    curves: compileCurves(prop),
    clumpLog2,
    clumpThreshold,
    maxShareCells: Math.floor((share * 65_536) / 1000),
    salt: mix32(fnvText(FNV_OFFSET, prop.id)),
    water,
  };
}

/** 규칙 해시: 바이옴 표·항목 차례·모든 정수 값 */
function ruleHash(
  biomeIds: readonly string[],
  forest: readonly PropRule[],
  scatter: readonly PropRule[],
): string {
  let s = FNV_OFFSET;
  for (const id of biomeIds) s = fnvText(s, id);
  for (const [kind, rules] of [
    [1, forest],
    [2, scatter],
  ] as const) {
    for (const rule of rules) {
      s = fnvInt(fnvText(fnvInt(s, kind), rule.id), rule.art);
      s = fnvInt(
        fnvInt(fnvInt(fnvInt(s, rule.cover), rule.clumpLog2), rule.clumpThreshold),
        rule.maxShareCells,
      );
      // 물 위 소품만 표지를 더한다(물 위 소품이 없는 규칙은 앞 판과 같은 해시 — 2026-11-12)
      if (rule.water) s = fnvInt(s, 0x7761_7472);
      for (const weight of rule.biomeWeight) s = fnvInt(s, weight);
      for (const curve of rule.curves) {
        s = fnvInt(
          fnvInt(fnvInt(fnvInt(fnvInt(s, curve.axis), curve.min), curve.idealMin), curve.idealMax),
          curve.max,
        );
      }
    }
  }
  return s.toString(16).padStart(8, "0");
}

/** 콘텐츠 항목들 → 규칙 표. 같은 ID가 두 번이면 RangeError */
export function compileMapProps(props: readonly MapPropInput[], biomeIds: readonly string[]): PropRuleSet {
  const biomeIndex = new Map(biomeIds.map((id, index) => [id, index]));
  const seen = new Set<string>();
  const forest: PropRule[] = [];
  const scatter: PropRule[] = [];
  let axes = 0;
  for (const prop of props) {
    if (seen.has(prop.id)) throw new RangeError(`map prop ${prop.id} appears twice`);
    seen.add(prop.id);
    const rule = compileProp(prop, biomeIndex, biomeIds.length);
    for (const curve of rule.curves) axes |= 1 << curve.axis;
    (prop.placement === "scatter" ? scatter : forest).push(rule);
  }
  return { biomeIds, forest, scatter, axes, hash: ruleHash(biomeIds, forest, scatter) };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalNumber = (value: unknown, what: string): number | undefined => {
  if (value === undefined || typeof value === "number") return value;
  throw new TypeError(`${what} must be a number`);
};

function curveOf(value: unknown, what: string): MapPropCurveInput {
  if (!isRecord(value)) throw new TypeError(`${what} must be an object`);
  const { min, idealMin, idealMax, max } = value;
  if (
    typeof min !== "number" ||
    typeof idealMin !== "number" ||
    typeof idealMax !== "number" ||
    typeof max !== "number"
  ) {
    throw new TypeError(`${what} needs min, idealMin, idealMax and max`);
  }
  return { min, idealMin, idealMax, max };
}

function biomeWeightOf(value: unknown, what: string): MapPropInput["biomes"][number] {
  if (!isRecord(value) || typeof value.weight !== "number") {
    throw new TypeError(`${what} needs a biome and a weight`);
  }
  const { biome, weight } = value;
  if (typeof biome === "string") return { biome, weight };
  if (isRecord(biome) && typeof biome.id === "string") return { biome: { id: biome.id }, weight };
  throw new TypeError(`${what}.biome must be an id`);
}

/**
 * map_props 원본 항목(팩 파일 JSON, 바이옴 = ID 문자열) → 입력 모양. 편집기 2차맵 미리보기(기기 워커)가 서버 정의 조회의 원본 항목을
 * 읽는다. 모양만 본다: 값 범위·참조는 compileMapProps가 다시 본다(서버가 검증한 팩의 항목이라 보통 통과한다). 틀리면 TypeError
 */
export function mapPropInputsFromJson(list: readonly unknown[]): MapPropInput[] {
  return list.map((raw, index): MapPropInput => {
    const what = `map_props[${index}]`;
    if (!isRecord(raw)) throw new TypeError(`${what} must be an object`);
    const { id, art, placement, biomes, curves, clump } = raw;
    if (typeof id !== "string" || typeof art !== "string" || typeof placement !== "string") {
      throw new TypeError(`${what} needs id, art and placement`);
    }
    if (!Array.isArray(biomes)) throw new TypeError(`${what}.biomes must be an array`);
    const biomeList: readonly unknown[] = biomes;
    let curveMap: Record<string, MapPropCurveInput> | undefined;
    if (curves !== undefined) {
      if (!isRecord(curves)) throw new TypeError(`${what}.curves must be an object`);
      curveMap = {};
      for (const [axis, curve] of Object.entries(curves)) curveMap[axis] = curveOf(curve, `${what}.${axis}`);
    }
    let clumpValue: MapPropInput["clump"];
    if (clump !== undefined) {
      if (!isRecord(clump) || typeof clump.cells !== "number" || typeof clump.threshold !== "number") {
        throw new TypeError(`${what}.clump needs cells and threshold`);
      }
      clumpValue = { cells: clump.cells, threshold: clump.threshold };
    }
    return {
      id,
      art,
      placement,
      biomes: biomeList.map((item, k) => biomeWeightOf(item, `${what}.biomes[${k}]`)),
      curves: curveMap,
      cover: optionalNumber(raw.cover, `${what}.cover`),
      clump: clumpValue,
      maxShare: optionalNumber(raw.maxShare, `${what}.maxShare`),
      water: raw.water === true ? true : undefined,
    };
  });
}

/** 소품이 없는 규칙 표(숲 칸은 엄폐 값만 있고 그림은 0) */
export function emptyPropRules(biomeIds: readonly string[]): PropRuleSet {
  return compileMapProps([], biomeIds);
}

/** 곡선 값(0 ~ 1000): min 이하·max 이상 0, idealMin ~ idealMax 1000, 사이는 곧게(내림) */
export function curveValue(curve: PropCurve, value: number): number {
  if (value < curve.min || value > curve.max) return 0;
  if (value < curve.idealMin) return Math.floor(((value - curve.min) * 1000) / (curve.idealMin - curve.min));
  if (value <= curve.idealMax) return 1000;
  return Math.floor(((curve.max - value) * 1000) / (curve.max - curve.idealMax));
}
