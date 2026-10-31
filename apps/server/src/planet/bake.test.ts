// 행성 굽기 시험 — 콘텐츠 팩 행성 원본(생성기, 출력 판 = GENERATOR_VERSION), 정의 해시, 타일 덩어리(pack), 실제 워커 스레드(src/planet/bakeWorker.ts를 그대로 띄운다)
import { gunzipSync } from "node:zlib";
import { ID_PATTERN } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import {
  MAX_FACE_LEVEL,
  MIN_FACE_LEVEL,
  PLANET_TILE_CELLS,
  assertPlanetFields,
  buildPlanetTiles,
  planetTileCount,
  planetTileIds,
} from "@terra/planet";
import { GENERATOR_VERSION, planetInputFromDefinition } from "@terra/planet/generator";
import {
  PLANET_FACE_LEVEL_MAX,
  PLANET_FACE_LEVEL_MIN,
  PLANET_ID_PATTERN,
  PLANET_TILE_MAX_CELLS,
  decodePlanetTile,
  planetBiomeSchema,
} from "@terra/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { bakePlanetTiles, highestCell } from "./bake.ts";
import { type PlanetBaker, createInlineBaker, createWorkerBaker } from "./baker.ts";
import {
  type PlanetSourceSpec,
  createPlanetSource,
  definitionHashOf,
  planetSpecsFromPack,
} from "./sources.ts";
import { packTestPlanetSpec, smallSource } from "./testSupport.ts";

const WORKER_URL = new URL("./bakeWorker.ts", import.meta.url);

let baker: PlanetBaker | undefined;
afterEach(async () => {
  await baker?.close();
  baker = undefined;
});

/** 설명 → 원본의 정의 해시 */
const hashOf = (spec: PlanetSourceSpec): string => createPlanetSource(spec).definitionHash;

/** 검증한 저장소 팩 */
function pack() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.pack) throw new Error("content/core does not validate");
  return loaded.pack;
}

describe("상수 일치 (protocol = planet = content)", () => {
  it("타일 한 변·면 레벨 범위·행성 ID 형식이 같다", () => {
    expect(PLANET_TILE_MAX_CELLS).toBe(PLANET_TILE_CELLS);
    expect([PLANET_FACE_LEVEL_MIN, PLANET_FACE_LEVEL_MAX]).toEqual([MIN_FACE_LEVEL, MAX_FACE_LEVEL]);
    expect(PLANET_ID_PATTERN.source).toBe(ID_PATTERN.source);
  });
});

describe("콘텐츠 팩 행성 원본", () => {
  it("팩 행성마다 설명 하나: 생성기 입력 = planetInputFromDefinition, 범례 = 행성 biomes 순서의 색·이름", () => {
    const content = pack();
    const specs = planetSpecsFromPack(content);
    const planets = content.entries.get("planets") ?? [];
    const biomes = content.entries.get("biomes") ?? [];
    expect(specs.map((spec) => spec.id)).toEqual(planets.map((planet) => planet.id));
    const spec = packTestPlanetSpec();
    const planet = planets.find((entry) => entry.id === "s2_test_planet");
    expect(spec).toMatchObject({ kind: "generator", name: { ko: "S2 시험 행성", en: "S2 test planet" } });
    expect(spec.input).toEqual(planetInputFromDefinition(planet, biomes));
    expect(spec.input.faceLevel).toBe(9);
    expect(spec.biomes.map((biome) => biome.index)).toEqual(spec.input.biomes.map((_, index) => index));
    expect(spec.biomes.map((biome) => biome.id)).toEqual(spec.input.biomes.map((biome) => biome.id));
    expect(spec.biomes[0]).toEqual({
      index: 0,
      id: "ocean_deep",
      colour: "#1c3d6e",
      name: { ko: "심해", en: "Deep ocean" },
    });
    for (const biome of spec.biomes) expect(planetBiomeSchema.parse(biome)).toEqual(biome);
    // 워커로 보낼 수 있다(구조화 복제)
    expect(structuredClone(spec)).toEqual(spec);
  });

  it("생성기가 받지 않는 정의(호수 규칙 없는 바이옴 표)면 시작하지 않게 던진다", () => {
    const content = pack();
    const planets = (content.entries.get("planets") ?? []).map((planet) => ({
      ...planet,
      biomes: ["ocean_deep", "tundra"],
    }));
    const broken = { ...content, entries: new Map([...content.entries, ["planets", planets]]) };
    expect(() => planetSpecsFromPack(broken)).toThrow(/ocean, one lake and one land/);
  });

  it("면 레벨 10 행성은 시작하지 않게 던진다(생성기 상한 9 — NAS 앱 컨테이너 1GiB 안에서 굽게, ADR 36)", () => {
    const content = pack();
    const planets = (content.entries.get("planets") ?? []).map((planet) => ({ ...planet, faceLevel: 10 }));
    const broken = { ...content, entries: new Map([...content.entries, ["planets", planets]]) };
    expect(() => planetSpecsFromPack(broken)).toThrow(/faceLevel must be an integer in \[4, 9\]/);
  });

  it("원본: 생성기 버전 = GENERATOR_VERSION, 정의 해시는 이름·색과 무관하고 타일 내용을 정하는 값에 달려 있다", () => {
    const spec = packTestPlanetSpec();
    const source = createPlanetSource(spec);
    expect(source).toMatchObject({ id: "s2_test_planet", faceLevel: 9, generatorVersion: GENERATOR_VERSION });
    expect(source.definitionHash).toMatch(/^[0-9a-f]{64}$/);
    // 이름·색은 타일 내용이 아니다
    expect(hashOf({ ...spec, name: { ko: "다른 이름", en: "Other" } })).toBe(source.definitionHash);
    expect(hashOf({ ...spec, biomes: spec.biomes.map((biome) => ({ ...biome, colour: "#000000" })) })).toBe(
      source.definitionHash,
    );
    // 시드·면 레벨·세부 수치·바이옴 규칙·숲 밀도·순서는 타일 내용을 바꾼다
    const input = spec.input;
    const changes: PlanetSourceSpec["input"][] = [
      { ...input, seed: input.seed + 1 },
      { ...input, faceLevel: 8 },
      { ...input, settings: { ...input.settings, landPercent: input.settings.landPercent + 1 } },
      {
        ...input,
        biomes: input.biomes.map((biome, at) => (at === 5 ? { ...biome, forestDensity: 1 } : biome)),
      },
      { ...input, biomes: input.biomes.toReversed() },
      {
        ...input,
        biomes: input.biomes.map((biome) =>
          biome.rule.kind === "land" ? { ...biome, rule: { kind: "land" as const } } : biome,
        ),
      },
    ];
    // 대륙 배치(ADR 2026-10-31-continent-layouts)도 타일 내용을 바꾼다: 배치 종류·대륙 수마다 다른 해시
    const earthlike = { ...input, continents: { layout: "earthlike" as const, count: 3 } };
    changes.push(earthlike, { ...input, continents: { layout: "earthlike" as const, count: 4 } });
    changes.push({ ...input, continents: { layout: "hemisphere" as const, count: 3 } });
    const hashes = changes.map((changed) => hashOf({ ...spec, input: changed }));
    for (const hash of hashes) expect(hash).not.toBe(source.definitionHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    // 키 순서만 다르면 같은 해시
    expect(definitionHashOf({ a: 1, b: { c: 2, d: 3 } })).toBe(definitionHashOf({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("대륙 배치가 없는 팩 행성의 정의 해시는 대륙 배치를 더하기 전과 같다(캐시·타일 주소 그대로, NAS가 다시 굽지 않는다)", () => {
    // main 7bec7cb·9d08a20에서 잰 값(2026-10-31). 정의 해시에 넣는 값이 바뀌면 두 행성을 모두 다시 굽는다
    const hashes = Object.fromEntries(planetSpecsFromPack(pack()).map((spec) => [spec.id, hashOf(spec)]));
    expect(hashes).toEqual({
      s2_test_planet: "e04dd3cb58134c676649a8c5232b43e054dfb54489218f5b7f8144f412402cf6",
      s2_editor_planet: "00b0ffd1c4772163aea9c5ed858378f19b2eeaea18b0955d852b2c9a49a2a924",
    });
  });

  it("팩 행성 정의를 면 레벨 5로 생성하면 생성기 골든 해시와 같다(팩 → 원본 → 생성기 입력이 맞다)", async () => {
    const spec = packTestPlanetSpec();
    const { fields } = await createPlanetSource({
      ...spec,
      input: { ...spec.input, faceLevel: 5 },
    }).generate();
    expect(() => assertPlanetFields(fields)).not.toThrow();
    // packages/planet generator/generate.test.ts "S2 시험 행성 설정" F5 골든 값(출력 판 3)
    expect(fields.meta.hash).toBe("884e2b28");
    expect(fields.meta).toMatchObject({
      generatorVersion: GENERATOR_VERSION,
      faceLevel: 5,
      seed: 20_261_029,
    });
  });
});

describe("타일 덩어리 굽기", () => {
  it("타일마다 gzip을 planetTileIds 순서로 잇고, 풀면 타일 만들기 결과 + 머리 값이다", async () => {
    const { fields } = await smallSource({ faceLevel: 6, seed: 3 }).generate();
    const header = { generatorVersion: 1, definitionHash: "cd".repeat(32) };
    const baked = bakePlanetTiles(fields, header);
    expect(baked.tiles).toHaveLength(planetTileCount(6));
    expect(baked.tiles.map(([key]) => key)).toEqual(planetTileIds(6).map((id) => id.key));
    expect(baked.tiles.reduce((sum, [, length]) => sum + length, 0)).toBe(baked.pack.byteLength);
    expect(baked.fieldsHash).toBe(fields.meta.hash);
    expect(baked.maxElevationM).toBe(Math.max(0, ...fields.elevationM));
    expect(baked.maxElevationM).toBeGreaterThan(0);
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

describe("가장 높은 땅", () => {
  it("가장 높은 칸 높이, 모두 해수면 아래면 0", () => {
    expect(highestCell(Int16Array.from([-30, 12, 830, 5]))).toBe(830);
    expect(highestCell(Int16Array.from([-300, -1]))).toBe(0);
    expect(highestCell(new Int16Array(0))).toBe(0);
  });
});

// 워커 스레드를 띄우는 시험은 기계가 바쁘면 기본 5초를 넘을 때가 있다(혼자 1~1.6초, 부하 10에서 5.1초를 봤다)
const WORKER_TEST_TIMEOUT_MS = 30_000;

describe("굽는 곳", () => {
  it("워커에서 구운 결과가 같은 스레드에서 구운 것과 같다 (pack SHA-256)", {
    timeout: WORKER_TEST_TIMEOUT_MS,
  }, async () => {
    const source = smallSource({ faceLevel: 6, seed: 11 });
    const inline = await createInlineBaker().bake(source);
    baker = createWorkerBaker({ workerUrl: WORKER_URL });
    const viaWorker = await baker.bake(source);
    expect(viaWorker.packSha256).toBe(inline.packSha256);
    expect(viaWorker.tiles).toEqual(inline.tiles);
    expect(Buffer.from(viaWorker.pack).equals(Buffer.from(inline.pack))).toBe(true);
    expect(viaWorker.fieldsHash).toBe(inline.fieldsHash);
    expect(viaWorker.peakWorkerMb).toBeGreaterThan(0);
    expect(viaWorker.generateMs).toBeGreaterThan(0);
  });

  it("워커가 다시 만든 원본이 메인 스레드와 다르면 굽지 않는다 / spec이 없으면 워커로 굽지 못한다", {
    timeout: WORKER_TEST_TIMEOUT_MS,
  }, async () => {
    baker = createWorkerBaker({ workerUrl: WORKER_URL });
    const source = smallSource();
    await expect(baker.bake({ ...source, definitionHash: "00".repeat(32) })).rejects.toThrow(
      /differs in the worker/,
    );
    await expect(baker.bake({ ...source, spec: undefined })).rejects.toThrow(/no spec/);
  });

  it("닫으면 굽는 중인 것은 실패로 끝나고, 그 뒤 굽기는 거절한다", {
    timeout: WORKER_TEST_TIMEOUT_MS,
  }, async () => {
    baker = createWorkerBaker({ workerUrl: WORKER_URL });
    const pending = baker.bake(smallSource({ faceLevel: 8 }));
    await baker.close();
    await expect(pending).rejects.toThrow();
    await expect(baker.bake(smallSource())).rejects.toThrow(/closed/);
  });
});
