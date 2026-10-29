// 행성 디스크 캐시 시험 — 쓰고 읽기, 틀린 캐시 알아보기, 다른 버전 지우기
import { readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATOR_VERSION } from "@terra/planet/generator";
import { afterEach, describe, expect, it } from "vitest";
import { createInlineBaker } from "./baker.ts";
import {
  PLANET_CACHE_FORMAT,
  type PlanetCacheIndex,
  type PlanetCacheKey,
  cacheFileStem,
  planetCacheIndexSchema,
  prunePlanetCache,
  readPlanetCache,
  writePlanetCache,
} from "./cache.ts";
import { smallSource, temporaryDir } from "./testSupport.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function prepared() {
  const { dir, remove } = await temporaryDir();
  cleanups.push(remove);
  const source = smallSource({ faceLevel: 5, seed: 3 });
  const output = await createInlineBaker().bake(source);
  const key: PlanetCacheKey = {
    planetId: source.id,
    faceLevel: source.faceLevel,
    generatorVersion: source.generatorVersion,
    definitionHash: source.definitionHash,
  };
  const index: PlanetCacheIndex = {
    format: PLANET_CACHE_FORMAT,
    ...key,
    tileFormatVersion: 1,
    tileCount: output.tiles.length,
    packBytes: output.pack.byteLength,
    packSha256: output.packSha256,
    rawBytes: output.rawBytes,
    fieldsHash: output.fieldsHash,
    maxElevationM: output.maxElevationM,
    bakedAt: "2026-10-29T00:00:00.000Z",
    bakeMs: 12.3,
    tiles: output.tiles,
  };
  return { dir, key, index, pack: output.pack, stem: path.join(dir, cacheFileStem(key)) };
}

describe("행성 디스크 캐시", () => {
  it("쓴 것을 그대로 읽는다. 파일은 pack과 목록 두 개, 이름에 행성·생성기·형식 버전·해시 앞부분", async () => {
    const { dir, key, index, pack } = await prepared();
    await writePlanetCache(dir, index, pack);
    expect((await readdir(dir)).toSorted()).toEqual([
      `${cacheFileStem(key)}.index.json`,
      `${cacheFileStem(key)}.pack`,
    ]);
    // 키의 생성기 버전은 원본 값(= 지금 GENERATOR_VERSION)이다. 버전이 오르면 파일 이름이 바뀌어 옛 캐시를 읽지 않는다
    expect(key.generatorVersion).toBe(GENERATOR_VERSION);
    expect(cacheFileStem(key)).toBe(
      `test_planet-g${GENERATOR_VERSION}-t1-${key.definitionHash.slice(0, 16)}`,
    );
    const result = await readPlanetCache(dir, key);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cached.index).toEqual(index);
    expect(Buffer.from(result.cached.pack).equals(Buffer.from(pack))).toBe(true);
  });

  it("없는 폴더·없는 캐시는 missing", async () => {
    const { dir, key } = await prepared();
    expect(await readPlanetCache(dir, key)).toEqual({ ok: false, reason: "missing" });
    expect(await readPlanetCache(path.join(dir, "nope"), key)).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["pack 한 바이트가 바뀜", async (stem: string) => flipByte(`${stem}.pack`, 100), "SHA-256"],
    ["pack이 잘림", async (stem: string) => truncate(`${stem}.pack`), "size"],
    ["pack이 없음", async (stem: string) => rm(`${stem}.pack`), "missing"],
    ["목록이 JSON이 아님", async (stem: string) => writeFile(`${stem}.index.json`, "{"), "JSON"],
    [
      "목록 모양이 틀림",
      async (stem: string) => editIndex(stem, (index) => ({ ...index, extra: 1 })),
      "schema",
    ],
    [
      "옛 목록 형식(가장 높은 땅이 없는 1판)",
      async (stem: string) =>
        editIndex(stem, ({ maxElevationM: _dropped, ...index }) => ({ ...index, format: 1 })),
      "schema",
    ],
    [
      "다른 생성기 버전의 목록",
      async (stem: string) =>
        editIndex(stem, (index) => ({ ...index, generatorVersion: index.generatorVersion + 1 })),
      "another",
    ],
    [
      "타일 순서가 다름",
      async (stem: string) => editIndex(stem, (index) => ({ ...index, tiles: index.tiles.toReversed() })),
      "tile list",
    ],
    [
      "길이 합이 pack과 다름",
      async (stem: string) =>
        editIndex(stem, (index) => ({
          ...index,
          tiles: index.tiles.map(([key, length]) => [key, length + 1]),
        })),
      "add up",
    ],
  ])("%s → invalid(다시 굽는다)", async (_name, breakIt, detail) => {
    const { dir, key, index, pack, stem } = await prepared();
    await writePlanetCache(dir, index, pack);
    await breakIt(stem);
    const result = await readPlanetCache(dir, key);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "invalid")
      throw new Error(`expected invalid, got ${JSON.stringify(result)}`);
    expect(result.detail).toContain(detail);
  });

  it("다른 버전은 가장 최근 하나만 남기고 지운다. 지금 것과 다른 행성은 남기고, 10분 넘은 임시 파일은 지운다", async () => {
    const { dir, index, pack } = await prepared();
    const versions = [3, 4, 5].map((generatorVersion) => ({ ...index, generatorVersion }));
    for (const [at, version] of versions.entries()) {
      await writePlanetCache(dir, version, pack);
      // 바뀐 시각을 차례로(3 < 4 < 5)
      const stem = path.join(dir, cacheFileStem(version));
      const when = new Date(Date.UTC(2026, 9, 29, 0, at));
      await utimes(`${stem}.index.json`, when, when);
    }
    await writePlanetCache(dir, { ...index, planetId: "other_planet" }, pack);
    await writeFile(path.join(dir, `${cacheFileStem(index)}.pack.tmp-1-old`), "x");
    await writeFile(path.join(dir, `${cacheFileStem(index)}.pack.tmp-2-new`), "x");
    const old = new Date(Date.now() - 20 * 60_000);
    await utimes(path.join(dir, `${cacheFileStem(index)}.pack.tmp-1-old`), old, old);
    await writePlanetCache(dir, index, pack);

    const removed = await prunePlanetCache(dir, index.planetId, cacheFileStem(index));
    const stemOf = (generatorVersion: number) => cacheFileStem({ ...index, generatorVersion });
    expect(removed.toSorted()).toEqual(
      [
        `${stemOf(3)}.index.json`,
        `${stemOf(3)}.pack`,
        `${stemOf(4)}.index.json`,
        `${stemOf(4)}.pack`,
        `${cacheFileStem(index)}.pack.tmp-1-old`,
      ].toSorted(),
    );
    const left = await readdir(dir);
    expect(left).toContain(`${cacheFileStem(index)}.pack`);
    expect(left).toContain(`${stemOf(5)}.pack`);
    expect(left).toContain(`${cacheFileStem({ ...index, planetId: "other_planet" })}.pack`);
    expect(left).toContain(`${cacheFileStem(index)}.pack.tmp-2-new`);
  });
});

async function flipByte(file: string, at: number): Promise<void> {
  const bytes = await readFile(file);
  bytes[at] = (bytes[at] ?? 0) ^ 0xff;
  await writeFile(file, bytes);
}

async function truncate(file: string): Promise<void> {
  const bytes = await readFile(file);
  await writeFile(file, bytes.subarray(0, bytes.byteLength - 10));
}

async function editIndex(stem: string, edit: (index: PlanetCacheIndex) => object): Promise<void> {
  const file = `${stem}.index.json`;
  const index = planetCacheIndexSchema.parse(JSON.parse(await readFile(file, "utf8")));
  await writeFile(file, JSON.stringify(edit(index)));
}
