// 행성 서비스 시험 — 굽는 중 → 완료, 디스크 캐시로 다시 켜기, 틀린 캐시·쓸 수 없는 폴더, 실패 뒤 다시 굽기
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { planetTileIds } from "@terra/planet";
import { decodePlanetTile, planetManifestSchema, planetTileVersion } from "@terra/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PLANET_CACHE_DIR, readConfig } from "../config.ts";
import { createInlineBaker } from "./baker.ts";
import { planetCacheIndexSchema } from "./cache.ts";
import { type PlanetService, createPlanetService } from "./service.ts";
import { controlledSource, recordingLog, smallSource, temporaryDir } from "./testSupport.ts";

const services: PlanetService[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function cacheDir(): Promise<string> {
  const { dir, remove } = await temporaryDir();
  cleanups.push(remove);
  return dir;
}

function start(
  options: Partial<Parameters<typeof createPlanetService>[0]> & {
    source?: ReturnType<typeof controlledSource>;
  },
) {
  const source = options.source ?? controlledSource(smallSource());
  const log = recordingLog();
  const service = createPlanetService({
    sources: [source],
    baker: createInlineBaker(),
    log,
    retryDelayMs: () => 5,
    ...options,
  });
  services.push(service);
  service.start();
  return { service, source, log, version: planetTileVersion(source.generatorVersion, source.definitionHash) };
}

/** 원본 목록으로 서비스만 만든다(시작하지 않음) */
function make(sources: ReturnType<typeof smallSource>[]): PlanetService {
  return createPlanetService({ sources, baker: createInlineBaker(), log: recordingLog() });
}

describe("행성 서비스", () => {
  it("굽는 동안은 generating·not_ready, 끝나면 ready와 압축한 타일 (목록 정보는 스키마에 맞다)", async () => {
    const source = controlledSource(smallSource());
    source.hold = true;
    const { service, version } = start({ source });
    await Promise.resolve();
    const first = planetTileIds(5)[0]?.key ?? 0;
    expect(service.manifest("test_planet")?.status).toBe("generating");
    // 가장 높은 땅·결과 해시는 구운 뒤에만 안다
    expect(service.manifest("test_planet")).not.toHaveProperty("maxElevationM");
    expect(service.manifest("test_planet")).not.toHaveProperty("fieldsHash");
    expect(service.tile("test_planet", first, version)).toEqual({ kind: "not_ready" });
    // 이 행성의 타일 ID가 아니면 굽는 중이어도 없는 타일, 버전이 틀리면 먼저 그것
    expect(service.tile("test_planet", 12_345, version)).toEqual({ kind: "unknown_tile" });
    expect(service.tile("test_planet", first, "1.1.0")).toEqual({ kind: "wrong_version" });
    source.release();
    await service.whenIdle();
    const manifest = service.manifest("test_planet");
    expect(planetManifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifest).toMatchObject({
      id: "test_planet",
      status: "ready",
      faceLevel: 5,
      tileUrlTemplate: `/api/planets/test_planet/tiles/{tileKey}?v=${version}`,
    });
    const fields = await smallSource().generate();
    expect(manifest?.maxElevationM).toBe(Math.max(0, ...fields.elevationM));
    // 생성 결과 해시는 구운 결과의 meta.hash(값은 생성기 판에 따라 바뀌므로 적지 않고 견준다, ADR 38 4절)
    expect(manifest?.fieldsHash).toBe(fields.meta.hash);
    const found = service.tile("test_planet", first, version);
    if (found.kind !== "ok") throw new Error(`expected a tile, got ${found.kind}`);
    expect(decodePlanetTile(gunzipSync(found.gzip))).toMatchObject({ faceLevel: 5, mapLevel: 1, face: 0 });
    expect(service.tile("test_planet", first, "0.0.0")).toEqual({ kind: "wrong_version" });
    expect(service.tile("test_planet", 12_345, version)).toEqual({ kind: "unknown_tile" });
    expect(service.tile("nope", first, version)).toEqual({ kind: "unknown_planet" });
    expect(service.manifest("nope")).toBeUndefined();
    expect(source.calls).toBe(1);
    expect(service.takeMetrics()).toMatchObject({
      planets: 1,
      planetsReady: 1,
      planetTiles: 30,
      planetBakes: 1,
    });
  });

  it("다시 켜면 디스크 캐시에서 읽고 굽지 않는다(cache hit). 캐시 폴더가 없으면 만든다", async () => {
    const dir = path.join(await cacheDir(), "nested", "planets");
    const first = start({ cacheDir: dir });
    await first.service.whenIdle();
    expect(first.service.takeMetrics()).toMatchObject({
      planetBakes: 1,
      planetCacheMisses: 1,
      planetCacheHits: 0,
    });
    expect(await readdir(dir)).toHaveLength(2);

    const second = start({ cacheDir: dir });
    await second.service.whenIdle();
    expect(second.source.calls).toBe(0);
    expect(second.service.manifest("test_planet")?.status).toBe("ready");
    // 가장 높은 땅·결과 해시는 캐시 목록에서 온다(구운 값과 같다)
    expect(second.service.manifest("test_planet")?.maxElevationM).toBe(
      first.service.manifest("test_planet")?.maxElevationM,
    );
    const baked = await smallSource().generate();
    expect(first.service.manifest("test_planet")?.fieldsHash).toBe(baked.meta.hash);
    expect(second.service.manifest("test_planet")?.fieldsHash).toBe(baked.meta.hash);
    expect(planetManifestSchema.parse(second.service.manifest("test_planet"))).toEqual(
      second.service.manifest("test_planet"),
    );
    const metrics = second.service.takeMetrics();
    expect(metrics).toMatchObject({
      planetBakes: 0,
      planetCacheHits: 1,
      planetCacheMisses: 0,
      planetTiles: 30,
    });
    expect(metrics.planetCacheLoadMs).toBeGreaterThanOrEqual(0);
    expect(second.log.lines.find((line) => line.message === "planet ready")?.obj).toMatchObject({
      from: "cache",
    });
    // 같은 타일 바이트
    const key = planetTileIds(5)[7]?.key ?? 0;
    const a = first.service.tile("test_planet", key, first.version);
    const b = second.service.tile("test_planet", key, second.version);
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("tiles missing");
    expect(Buffer.from(a.gzip).equals(Buffer.from(b.gzip))).toBe(true);
    // 지표 구간은 부르면 비워진다
    expect(second.service.takeMetrics()).toMatchObject({ planetCacheHits: 0, planetsReady: 1 });
  });

  it("틀린 캐시는 경고를 남기고 다시 구워 덮어쓴다", async () => {
    const dir = await cacheDir();
    const first = start({ cacheDir: dir });
    await first.service.whenIdle();
    const pack = (await readdir(dir)).find((name) => name.endsWith(".pack")) ?? "";
    await writeFile(path.join(dir, pack), "broken");
    const second = start({ cacheDir: dir });
    await second.service.whenIdle();
    expect(second.source.calls).toBe(1);
    expect(second.log.messages("warn")).toContain("planet cache is invalid, baking again");
    const third = start({ cacheDir: dir });
    await third.service.whenIdle();
    expect(third.source.calls).toBe(0);
  });

  it("캐시 목록의 결과 해시가 목록 정보 모양이 아니면 캐시를 쓰지 않고 다시 굽는다", async () => {
    const dir = await cacheDir();
    const first = start({ cacheDir: dir });
    await first.service.whenIdle();
    const indexName = (await readdir(dir)).find((name) => name.endsWith(".index.json")) ?? "";
    const indexPath = path.join(dir, indexName);
    const index = planetCacheIndexSchema.parse(JSON.parse(await readFile(indexPath, "utf8")));
    await writeFile(indexPath, JSON.stringify({ ...index, fieldsHash: "NOT-A-HASH" }));
    const second = start({ cacheDir: dir });
    await second.service.whenIdle();
    expect(second.source.calls).toBe(1);
    expect(second.log.messages("warn")).toContain("planet cache is invalid, baking again");
    expect(second.service.manifest("test_planet")?.fieldsHash).toBe(
      first.service.manifest("test_planet")?.fieldsHash,
    );
  });

  it("캐시를 쓸 수 없으면(폴더 자리에 파일) 경고만 남기고 메모리로 준다", async () => {
    const file = path.join(await cacheDir(), "not-a-dir");
    await writeFile(file, "x");
    const { service, log } = start({ cacheDir: file });
    await service.whenIdle();
    expect(service.manifest("test_planet")?.status).toBe("ready");
    expect(log.messages("warn")).toContain("planet cache write failed, serving from memory");
  });

  it("굽기가 실패하면 오류를 남기고 늦춰 다시 굽는다(그동안 generating)", async () => {
    const source = controlledSource(smallSource());
    source.failNext = 2;
    const delays: number[] = [];
    const { service, log } = start({
      source,
      retryDelayMs: (failures) => {
        delays.push(failures);
        return 5;
      },
    });
    await service.whenIdle();
    expect(service.manifest("test_planet")?.status).toBe("generating");
    for (let tries = 0; tries < 100 && service.manifest("test_planet")?.status !== "ready"; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await service.whenIdle();
    }
    expect(service.manifest("test_planet")?.status).toBe("ready");
    expect(source.calls).toBe(3);
    expect(delays).toEqual([1, 2]);
    expect(log.messages("error")).toEqual(["planet bake failed", "planet bake failed"]);
    expect(service.takeMetrics()).toMatchObject({ planetBakeFailures: 2, planetBakes: 1 });
  });

  it("닫으면 기다리던 다시 굽기를 하지 않는다", async () => {
    const source = controlledSource(smallSource());
    source.failNext = 1;
    const { service } = start({ source, retryDelayMs: () => 20 });
    await service.whenIdle();
    await service.close();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(source.calls).toBe(1);
  });

  it("같은 ID가 두 번이거나 목록 정보 스키마에 맞지 않는 원본이면 만들지 않는다", () => {
    const source = smallSource();
    expect(() => make([source, source])).toThrow(/twice/);
    expect(() => make([{ ...source, id: "Bad-Id" }])).toThrow();
    expect(() => make([{ ...source, definitionHash: "abc" }])).toThrow();
  });

  it("경로가 답한 결과를 센다 (200 바이트 합, 409·404·429·401)", () => {
    const { service } = start({});
    service.recordTileResponse(200, 100);
    service.recordTileResponse(200, 50);
    service.recordTileResponse(409, 0);
    service.recordTileResponse(404, 0);
    service.recordTileResponse(429, 0);
    service.recordTileResponse(401, 0);
    expect(service.takeMetrics()).toMatchObject({
      planetTilesServed: 2,
      planetTileBytesServed: 150,
      planetTilesNotReady: 1,
      planetTilesNotFound: 1,
      planetTilesRateLimited: 1,
      planetTilesSignedOut: 1,
    });
  });
});

describe("설정", () => {
  it("PLANET_CACHE_DIR: 기본은 apps/server/.planet-cache, 주면 그 폴더", () => {
    expect(readConfig({}).planetCacheDir).toBe(DEFAULT_PLANET_CACHE_DIR);
    expect(DEFAULT_PLANET_CACHE_DIR.endsWith(path.join("apps", "server", ".planet-cache"))).toBe(true);
    expect(readConfig({ PLANET_CACHE_DIR: "/data/planets" }).planetCacheDir).toBe("/data/planets");
  });
});
