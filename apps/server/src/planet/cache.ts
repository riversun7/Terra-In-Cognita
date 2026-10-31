// 행성 타일 디스크 캐시 (PLANET_CACHE_DIR, NAS는 볼륨) — ADR 2026-10-29-s2-planet-lod "서버 굽기·전송"
// (행성 ID, generatorVersion, 정의 해시, 타일 형식 버전)마다 파일 셋:
//   <이름>.pack        압축한 타일을 이은 것(굽기 결과 그대로)
//   <이름>.values      행성 값 파일(TCPV, 2차맵 생성기 입력, ADR 2026-10-31-second-map-from-planet 1절)
//   <이름>.index.json  타일 목록([타일 ID, 압축 길이], pack 순서)·pack·values SHA-256·잰 값
// 쓰기: 임시 파일에 쓴 뒤 이름을 바꾼다(pack·values 먼저, 목록 나중). 목록이 있으면 다 쓴 것이다.
// 읽기: 목록 형식·키·타일 목록(이 행성의 planetTileIds와 같은 순서)·길이 합·pack 크기·SHA-256·첫 타일 머리,
// values 크기·SHA-256을 확인한다.
// 하나라도 틀리면 쓰지 않고 다시 굽는다. 캐시는 지워도 된다(다시 굽는다). 숨김 정보는 없다(ADR 26).
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { planetTileIds } from "@terra/planet";
import { PLANET_FIELDS_HASH_PATTERN, PLANET_TILE_FORMAT_VERSION, decodePlanetTile } from "@terra/protocol";
import { z } from "zod";

/**
 * 캐시 목록 형식 버전(목록 JSON 모양이 바뀌면 올린다). 2: maxElevationM을 더했다. 3: 행성 값 파일(values)을 더했다.
 * 옛 형식 목록은 스키마에서 틀려 다시 굽는다(목록에 없는 값을 지어내지 않는다)
 */
export const PLANET_CACHE_FORMAT = 3;

export interface PlanetCacheKey {
  planetId: string;
  faceLevel: number;
  generatorVersion: number;
  definitionHash: string;
}

/** 캐시 목록(.index.json) 모양 */
export const planetCacheIndexSchema = z.strictObject({
  format: z.literal(PLANET_CACHE_FORMAT),
  planetId: z.string(),
  faceLevel: z.number().int(),
  generatorVersion: z.number().int(),
  definitionHash: z.string(),
  tileFormatVersion: z.number().int(),
  tileCount: z.number().int().nonnegative(),
  packBytes: z.number().int().nonnegative(),
  packSha256: z.string().regex(/^[0-9a-f]{64}$/),
  rawBytes: z.number().int().nonnegative(),
  /** 행성 값 파일 크기·SHA-256 */
  valuesBytes: z.number().int().positive(),
  valuesSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /**
   * 생성 결과 해시(생성기 meta.hash) — 목록 정보 fieldsHash(ADR 38 4절). 목록 정보와 같은 모양만 받는다: 틀린 값이면 캐시를
   * 쓰지 않고 다시 굽는다(틀린 값을 목록 정보에 실으면 기기가 목록 정보 전체를 거절한다)
   */
  fieldsHash: z.string().regex(PLANET_FIELDS_HASH_PATTERN),
  /** 가장 높은 땅(게임 m, 0 이상) — 목록 정보 maxElevationM */
  maxElevationM: z.number().int().min(0),
  /** 구운 시각(ISO 8601, 참고용) */
  bakedAt: z.string(),
  /** 굽기 잰 값(ms, 참고용) */
  bakeMs: z.number().nonnegative(),
  tiles: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().positive()])),
});
export type PlanetCacheIndex = z.output<typeof planetCacheIndexSchema>;

export interface CachedPlanet {
  index: PlanetCacheIndex;
  pack: Uint8Array;
  values: Uint8Array;
}

export type CacheReadResult =
  | { ok: true; cached: CachedPlanet }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "invalid"; detail: string };

/** 파일 이름 앞부분: <행성 ID>-g<생성기 버전>-t<타일 형식 버전>-<정의 해시 앞 16자> */
export function cacheFileStem(key: PlanetCacheKey): string {
  return `${key.planetId}-g${key.generatorVersion}-t${PLANET_TILE_FORMAT_VERSION}-${key.definitionHash.slice(0, 16)}`;
}

const PACK_SUFFIX = ".pack";
const VALUES_SUFFIX = ".values";
const INDEX_SUFFIX = ".index.json";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function invalid(detail: string): CacheReadResult {
  return { ok: false, reason: "invalid", detail };
}

/** 캐시를 읽고 확인한다. 없으면 missing, 틀리면 invalid(이유) */
export async function readPlanetCache(dir: string, key: PlanetCacheKey): Promise<CacheReadResult> {
  const stem = path.join(dir, cacheFileStem(key));
  let indexText: string;
  try {
    indexText = await readFile(`${stem}${INDEX_SUFFIX}`, "utf8");
  } catch (error) {
    if (isMissing(error)) return { ok: false, reason: "missing" };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(indexText);
  } catch {
    return invalid("index is not JSON");
  }
  const result = planetCacheIndexSchema.safeParse(parsed);
  if (!result.success) return invalid("index does not match its schema");
  const index = result.data;
  if (
    index.planetId !== key.planetId ||
    index.faceLevel !== key.faceLevel ||
    index.generatorVersion !== key.generatorVersion ||
    index.definitionHash !== key.definitionHash ||
    index.tileFormatVersion !== PLANET_TILE_FORMAT_VERSION
  ) {
    return invalid("index is for another planet version");
  }
  const expected = planetTileIds(key.faceLevel);
  if (
    index.tileCount !== expected.length ||
    index.tiles.length !== expected.length ||
    index.tiles.some(([tileKey], at) => tileKey !== expected[at]?.key)
  ) {
    return invalid("tile list does not match the planet");
  }
  const total = index.tiles.reduce((sum, [, length]) => sum + length, 0);
  if (total !== index.packBytes) return invalid("tile lengths do not add up to the pack size");
  let pack: Uint8Array;
  try {
    pack = await readFile(`${stem}${PACK_SUFFIX}`);
  } catch (error) {
    if (isMissing(error)) return invalid("pack file is missing");
    throw error;
  }
  if (pack.byteLength !== index.packBytes) return invalid("pack size differs from the index");
  if (createHash("sha256").update(pack).digest("hex") !== index.packSha256) {
    return invalid("pack SHA-256 differs from the index");
  }
  // 첫 타일 하나는 풀어서 머리를 본다(형식·버전이 맞는지)
  const first = index.tiles[0];
  if (first) {
    try {
      const tile = decodePlanetTile(gunzipSync(pack.subarray(0, first[1])));
      if (
        tile.faceLevel !== key.faceLevel ||
        tile.generatorVersion !== key.generatorVersion ||
        tile.definitionHash !== key.definitionHash
      ) {
        return invalid("first tile header differs from the index");
      }
    } catch {
      return invalid("first tile does not decode");
    }
  }
  let values: Uint8Array;
  try {
    values = await readFile(`${stem}${VALUES_SUFFIX}`);
  } catch (error) {
    if (isMissing(error)) return invalid("values file is missing");
    throw error;
  }
  if (values.byteLength !== index.valuesBytes) return invalid("values size differs from the index");
  if (createHash("sha256").update(values).digest("hex") !== index.valuesSha256) {
    return invalid("values SHA-256 differs from the index");
  }
  return { ok: true, cached: { index, pack, values } };
}

/** 임시 파일에 쓰고 이름을 바꾼다(같은 폴더 안이라 원자적이다) */
async function writeAtomically(target: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** 캐시를 쓴다(폴더가 없으면 만든다). pack·values 먼저, 목록 나중 */
export async function writePlanetCache(
  dir: string,
  index: PlanetCacheIndex,
  pack: Uint8Array,
  values: Uint8Array,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const stem = path.join(
    dir,
    cacheFileStem({
      planetId: index.planetId,
      faceLevel: index.faceLevel,
      generatorVersion: index.generatorVersion,
      definitionHash: index.definitionHash,
    }),
  );
  await writeAtomically(`${stem}${PACK_SUFFIX}`, pack);
  await writeAtomically(`${stem}${VALUES_SUFFIX}`, values);
  await writeAtomically(`${stem}${INDEX_SUFFIX}`, `${JSON.stringify(index)}\n`);
}

/** 이보다 오래된 임시 파일은 끝나지 못한 쓰기의 찌꺼기로 본다(다른 프로세스가 쓰는 중인 것은 남긴다) */
const STALE_TEMPORARY_MS = 10 * 60_000;

/**
 * 같은 행성의 다른 버전 캐시를 지운다. 지금 것(keepStem)과, 되돌림 배포를 위해 가장 최근 다른 버전 `keepOthers`개는 남긴다.
 * 10분 넘은 임시 파일(.tmp-*)도 지운다. 지운 파일 이름을 돌려준다.
 */
export async function prunePlanetCache(
  dir: string,
  planetId: string,
  keepStem: string,
  keepOthers = 1,
  nowMs = Date.now(),
): Promise<string[]> {
  const prefix = `${planetId}-g`;
  const names = (await readdir(dir)).filter((name) => name.startsWith(prefix));
  const temporary: string[] = [];
  for (const name of names.filter((entry) => entry.includes(".tmp-"))) {
    const info = await stat(path.join(dir, name)).catch(() => undefined);
    if (info && nowMs - info.mtimeMs > STALE_TEMPORARY_MS) temporary.push(name);
  }
  // 다른 버전: 목록 파일 기준, 바뀐 시각이 최근인 것부터
  const others: { stem: string; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.endsWith(INDEX_SUFFIX) || name.includes(".tmp-")) continue;
    const stem = name.slice(0, -INDEX_SUFFIX.length);
    if (stem === keepStem) continue;
    others.push({ stem, mtimeMs: (await stat(path.join(dir, name))).mtimeMs });
  }
  const keep = new Set([
    keepStem,
    ...others
      .toSorted((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, keepOthers)
      .map((other) => other.stem),
  ]);
  const removed = names.filter((name) => {
    if (temporary.includes(name)) return true;
    const suffix = [INDEX_SUFFIX, PACK_SUFFIX, VALUES_SUFFIX].find((end) => name.endsWith(end));
    const stem = suffix === undefined ? undefined : name.slice(0, -suffix.length);
    return stem !== undefined && !keep.has(stem);
  });
  await Promise.all(removed.map((name) => rm(path.join(dir, name), { force: true })));
  return removed;
}
