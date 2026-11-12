// 1차맵 자원 분포 지도 — ADR 2026-11-07-planet-view "바뀜 (2026-11-12)", 사용자 요청(2026-11-12) "자원별 분포 레이아웃".
// 공개 행성(세계 행성) 칸마다 여섯 원자재의 몫을 서버 NPC 경제와 같은 함수로 셈한다: @terra/shared/catchment cellSharesPm "supply"
// (채집 다툼의 칸 재고 상한 — npc/catchmentGeometry.ts와 같은 호출)·highOrePm(높은 티어 광석). 규칙 = 세계 설정 칸(worldSeed).
// - 셈은 처음 요청 때 한 번(행성 값 F9 157만 칸), 이벤트 루프를 막지 않게 조각마다 양보한다. 결과는 원자재마다 gzip으로만 들고 있다.
// - 설정 칸(몫 규칙)이 바뀌면 다음 요청에서 다시 셈한다(규칙 열쇠가 다르면 옛 결과를 버린다). ETag = 정의 해시 + 규칙 열쇠 + 형식 판.
// - 격자 = 면 레벨 min(F, 9). F가 9보다 크면 하위 칸 몫 평균(내림)으로 모은다.
// 숨김 정보가 아니다: 공개 1차맵 값(ADR 2026-10-28-fog-and-map-visibility)과 공통 규칙(설정 칸)에서 나오는 땅 몫이다. 2차맵 자원 배치(숨김)는 주지 않는다.
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { planetValuesReader } from "@terra/planet/secondMap";
import {
  PLANET_RESOURCE_FORMAT_VERSION,
  PLANET_RESOURCE_MAX_LEVEL,
  encodePlanetResource,
  pmToByte,
} from "@terra/protocol";
import {
  CATCHMENT_MATERIALS,
  type CatchmentLandRules,
  type CatchmentMaterial,
  cellSharesPm,
  highOrePm,
} from "@terra/shared/catchment";

const gzipAsync = promisify(gzip);

/** 한 번에 셈하는 칸 수(그다음 이벤트 루프에 양보한다) */
const SLICE_CELLS = 8_192;

/** 원자재 하나의 지도(압축한 이진 + ETag) */
export interface ResourceMapFile {
  readonly gzip: Uint8Array;
  readonly etag: string;
  readonly rawBytes: number;
}

export type ResourceMapAnswer =
  | { readonly kind: "ok"; readonly file: ResourceMapFile }
  | { readonly kind: "unknown_planet" }
  | { readonly kind: "unknown_material" }
  | { readonly kind: "not_ready" };

export interface ResourceMapOptions {
  /** 공개 행성(세계 행성) ID — 이 행성만 준다(편집 전용 행성은 세계 규칙이 들지 않는다) */
  readonly planetId: string;
  /** 행성이 다 구워졌는지(아니면 not_ready) */
  readonly ready: () => boolean;
  /** 행성 값 파일(TCPV) */
  readonly values: () => Promise<Uint8Array>;
  /** 칸 몫 규칙(세계 설정 칸 worldSeed) */
  readonly rules: () => CatchmentLandRules;
  /** 행성 정의 해시(ETag에 넣는다) */
  readonly definitionHash: string;
  /** 시험용: 조각 사이 양보(기본 setImmediate) */
  readonly yieldNow?: () => Promise<void>;
}

export interface ResourceMapService {
  get(planetId: string, material: string): Promise<ResourceMapAnswer>;
}

/** 규칙 열쇠: 몫에 드는 칸만 차례대로(설정 칸 값이 바뀌면 달라진다) */
export function resourceRulesKey(rules: CatchmentLandRules): string {
  return [
    rules.lumberMinForestPct,
    rules.mineMinHeightM,
    rules.farmMinTempC,
    rules.farmMinRainMm,
    rules.oreShareLowPm,
    rules.oreShareHillM,
    rules.oreShareHillPm,
  ].join(",");
}

const isMaterial = (value: string): value is CatchmentMaterial =>
  (CATCHMENT_MATERIALS as readonly string[]).includes(value);

/** 여섯 원자재 몫 판(바이트) + 높은 티어 광석 판을 셈한다(면 레벨 min(F, 9)) */
export async function computeResourcePlanes(
  bytes: Uint8Array,
  rules: CatchmentLandRules,
  yieldNow: () => Promise<void>,
): Promise<{ faceLevel: number; level: number; planes: Uint8Array[]; high: Uint8Array }> {
  const reader = planetValuesReader(bytes);
  const faceLevel = reader.faceLevel;
  const level = Math.min(faceLevel, PLANET_RESOURCE_MAX_LEVEL);
  const n = 1 << faceLevel;
  const m = 1 << level;
  const shift = faceLevel - level;
  const out = 6 * m * m;
  // 모을 때는 칸 몫(‰) 합, 아니면 바로 바이트
  const sums = Array.from({ length: 7 }, () => new Uint32Array(out));
  for (let start = 0; start < reader.count; start += SLICE_CELLS) {
    const end = Math.min(reader.count, start + SLICE_CELLS);
    for (let c = start; c < end; c++) {
      const land = reader.cell(c);
      const shares = cellSharesPm(land, rules, "supply");
      const face = Math.floor(c / (n * n));
      const rest = c - face * n * n;
      const j = Math.floor(rest / n) >> shift;
      const i = (rest % n) >> shift;
      const target = face * m * m + j * m + i;
      CATCHMENT_MATERIALS.forEach((material, k) => {
        const plane = sums[k];
        if (plane) plane[target] = (plane[target] ?? 0) + shares[material];
      });
      const high = sums[6];
      if (high) high[target] = (high[target] ?? 0) + highOrePm(land, rules);
    }
    if (end < reader.count) await yieldNow();
  }
  const per = 1 << (2 * shift);
  const toBytes = (sum: Uint32Array): Uint8Array => {
    const plane = new Uint8Array(out);
    for (let k = 0; k < out; k++) plane[k] = pmToByte(Math.floor((sum[k] ?? 0) / per));
    return plane;
  };
  const planes = sums.slice(0, 6).map(toBytes);
  return { faceLevel, level, planes, high: toBytes(sums[6] ?? new Uint32Array(out)) };
}

export function createResourceMaps(options: ResourceMapOptions): ResourceMapService {
  const yieldNow = options.yieldNow ?? (() => new Promise<void>((resolve) => setImmediate(resolve)));
  let cached: { key: string; files: Promise<Map<CatchmentMaterial, ResourceMapFile>> } | null = null;

  const build = async (key: string, rules: CatchmentLandRules) => {
    const bytes = await options.values();
    const { faceLevel, level, planes, high } = await computeResourcePlanes(bytes, rules, yieldNow);
    const files = new Map<CatchmentMaterial, ResourceMapFile>();
    for (const [index, material] of CATCHMENT_MATERIALS.entries()) {
      const share = planes[index] ?? new Uint8Array(6 << (2 * level));
      const raw = encodePlanetResource({
        faceLevel,
        level,
        material: index,
        share,
        high: material === "ore" ? high : null,
      });
      const etag = `"${createHash("sha256")
        .update(`${PLANET_RESOURCE_FORMAT_VERSION}|${options.definitionHash}|${key}|${material}`)
        .digest("hex")
        .slice(0, 32)}"`;
      files.set(material, { gzip: await gzipAsync(raw), etag, rawBytes: raw.byteLength });
    }
    return files;
  };

  return {
    async get(planetId, material) {
      if (planetId !== options.planetId) return { kind: "unknown_planet" };
      if (!isMaterial(material)) return { kind: "unknown_material" };
      if (!options.ready()) return { kind: "not_ready" };
      const rules = options.rules();
      const key = resourceRulesKey(rules);
      if (cached?.key !== key) {
        const files = build(key, rules);
        cached = { key, files };
        // 실패하면(행성 값 없음 등) 다음 요청이 다시 셈하게 비운다
        files.catch(() => {
          if (cached?.files === files) cached = null;
        });
      }
      const file = (await (cached?.files ?? build(key, rules))).get(material);
      return file ? { kind: "ok", file } : { kind: "unknown_material" };
    },
  };
}
