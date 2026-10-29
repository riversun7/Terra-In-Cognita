// 행성 굽기 시험 — 합성 원본, 타일 덩어리(pack), 실제 워커 스레드(src/planet/bakeWorker.ts를 그대로 띄운다)
import { gunzipSync } from "node:zlib";
import { ID_PATTERN } from "@terra/content";
import {
  FACES,
  MAX_FACE_LEVEL,
  MIN_FACE_LEVEL,
  PLANET_TILE_CELLS,
  WATER_COAST,
  WATER_OCEAN,
  assertPlanetFields,
  buildPlanetTiles,
  planetTileCount,
  planetTileIds,
  wrapFaceIJ,
} from "@terra/planet";
import {
  PLANET_FACE_LEVEL_MAX,
  PLANET_FACE_LEVEL_MIN,
  PLANET_ID_PATTERN,
  PLANET_TILE_MAX_CELLS,
  decodePlanetTile,
} from "@terra/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { bakePlanetTiles } from "./bake.ts";
import { type PlanetBaker, createInlineBaker, createWorkerBaker } from "./baker.ts";
import { TEMP_S2_PLANET, createPlanetSource, definitionHashOf } from "./sources.ts";
import { SYNTHETIC_BIOMES, SYNTHETIC_GENERATOR_VERSION, generateSyntheticPlanet } from "./synthetic.ts";
import { smallSource } from "./testSupport.ts";

const WORKER_URL = new URL("./bakeWorker.ts", import.meta.url);

let baker: PlanetBaker | undefined;
afterEach(async () => {
  await baker?.close();
  baker = undefined;
});

describe("상수 일치 (protocol = planet = content)", () => {
  it("타일 한 변·면 레벨 범위·행성 ID 형식이 같다", () => {
    expect(PLANET_TILE_MAX_CELLS).toBe(PLANET_TILE_CELLS);
    expect([PLANET_FACE_LEVEL_MIN, PLANET_FACE_LEVEL_MAX]).toEqual([MIN_FACE_LEVEL, MAX_FACE_LEVEL]);
    expect(PLANET_ID_PATTERN.source).toBe(ID_PATTERN.source);
  });
});

describe("[임시] 합성 행성", () => {
  it("같은 시드면 같은 출력(해시), 시드가 다르면 다른 출력", () => {
    const a = generateSyntheticPlanet({ faceLevel: 5, seed: 1 });
    expect(() => assertPlanetFields(a)).not.toThrow();
    expect(generateSyntheticPlanet({ faceLevel: 5, seed: 1 })).toEqual(a);
    expect(generateSyntheticPlanet({ faceLevel: 5, seed: 2 }).meta.hash).not.toBe(a.meta.hash);
    expect(a.meta).toMatchObject({ generatorVersion: SYNTHETIC_GENERATOR_VERSION, faceLevel: 5, seed: 1 });
    expect(a.meta.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("바다는 고도 0 아래, 해안은 4이웃(면 경계 너머 포함)에 바다가 있는 땅, 바이옴은 범례 안", () => {
    const fields = generateSyntheticPlanet({ faceLevel: 6, seed: 20_261_029 });
    const n = 64;
    let oceans = 0;
    for (let at = 0; at < fields.elevationM.length; at++) {
      const elevation = fields.elevationM[at] ?? 0;
      const water = fields.water[at] ?? 0;
      expect((water & WATER_OCEAN) !== 0).toBe(elevation < 0);
      if (elevation < 0) oceans += 1;
      expect(SYNTHETIC_BIOMES.some((biome) => biome.index === fields.biome[at])).toBe(true);
      const face = FACES[Math.floor(at / (n * n))];
      if (face === undefined) throw new Error("face");
      const j = Math.floor((at % (n * n)) / n);
      const i = at % n;
      const oceanNear = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([di = 0, dj = 0]) => {
        const next = wrapFaceIJ(face, 6, i + di, j + dj);
        return (
          next !== null && ((fields.water[next.face * n * n + next.j * n + next.i] ?? 0) & WATER_OCEAN) !== 0
        );
      });
      expect((water & WATER_COAST) !== 0).toBe(elevation >= 0 && oceanNear);
    }
    // 땅과 바다가 둘 다 있다
    expect(oceans).toBeGreaterThan(fields.elevationM.length * 0.2);
    expect(oceans).toBeLessThan(fields.elevationM.length * 0.8);
  });

  it("원본: 정의 해시는 이름과 무관하고 종류·면 레벨·시드에 달려 있다", () => {
    const source = createPlanetSource(TEMP_S2_PLANET);
    expect(source).toMatchObject({
      id: "s2_synthetic",
      faceLevel: 9,
      generatorVersion: SYNTHETIC_GENERATOR_VERSION,
    });
    expect(source.definitionHash).toMatch(/^[0-9a-f]{64}$/);
    const renamed = createPlanetSource({ ...TEMP_S2_PLANET, name: { ko: "다른 이름", en: "Other" } });
    expect(renamed.definitionHash).toBe(source.definitionHash);
    expect(createPlanetSource({ ...TEMP_S2_PLANET, seed: 1 }).definitionHash).not.toBe(source.definitionHash);
    // 키 순서만 다르면 같은 해시
    expect(definitionHashOf({ a: 1, b: { c: 2, d: 3 } })).toBe(definitionHashOf({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe("타일 덩어리 굽기", () => {
  it("타일마다 gzip을 planetTileIds 순서로 잇고, 풀면 타일 만들기 결과 + 머리 값이다", () => {
    const fields = generateSyntheticPlanet({ faceLevel: 6, seed: 3 });
    const header = { generatorVersion: 1, definitionHash: "cd".repeat(32) };
    const baked = bakePlanetTiles(fields, header);
    expect(baked.tiles).toHaveLength(planetTileCount(6));
    expect(baked.tiles.map(([key]) => key)).toEqual(planetTileIds(6).map((id) => id.key));
    expect(baked.tiles.reduce((sum, [, length]) => sum + length, 0)).toBe(baked.pack.byteLength);
    expect(baked.fieldsHash).toBe(fields.meta.hash);
    let offset = 0;
    let raw = 0;
    const built = [...buildPlanetTiles(fields)];
    baked.tiles.forEach(([, length], at) => {
      const bytes = gunzipSync(baked.pack.subarray(offset, offset + length));
      raw += bytes.byteLength;
      offset += length;
      expect(decodePlanetTile(bytes)).toEqual({ ...built[at]?.tile, ...header });
    });
    expect(raw).toBe(baked.rawBytes);
  });
});

describe("굽는 곳", () => {
  it("워커에서 구운 결과가 같은 스레드에서 구운 것과 같다 (pack SHA-256)", async () => {
    const source = smallSource({ faceLevel: 6, seed: 11 });
    const inline = await createInlineBaker().bake(source);
    baker = createWorkerBaker({ workerUrl: WORKER_URL });
    const viaWorker = await baker.bake(source);
    expect(viaWorker.packSha256).toBe(inline.packSha256);
    expect(viaWorker.tiles).toEqual(inline.tiles);
    expect(Buffer.from(viaWorker.pack).equals(Buffer.from(inline.pack))).toBe(true);
    expect(viaWorker.peakWorkerMb).toBeGreaterThan(0);
    expect(viaWorker.generateMs).toBeGreaterThan(0);
  });

  it("워커가 다시 만든 원본이 메인 스레드와 다르면 굽지 않는다 / spec이 없으면 워커로 굽지 못한다", async () => {
    baker = createWorkerBaker({ workerUrl: WORKER_URL });
    const source = smallSource();
    await expect(baker.bake({ ...source, definitionHash: "00".repeat(32) })).rejects.toThrow(
      /differs in the worker/,
    );
    await expect(baker.bake({ ...source, spec: undefined })).rejects.toThrow(/no spec/);
  });

  it("닫으면 굽는 중인 것은 실패로 끝나고, 그 뒤 굽기는 거절한다", async () => {
    baker = createWorkerBaker({ workerUrl: WORKER_URL });
    const pending = baker.bake(smallSource({ faceLevel: 8 }));
    await baker.close();
    await expect(pending).rejects.toThrow();
    await expect(baker.bake(smallSource())).rejects.toThrow(/closed/);
  });
});
