// 행성 값 2차맵을 서버에 잇기(ADR 46 WP-3) — 팩 S2 시험 행성 F9(한 번 생성, 약 10초).
// - 지형 서비스: 판 표지, TCTR 2판(물·엄폐·소품 그림), 지형 비용, 메모리 LRU, 디스크 캐시(다시 읽기·틀린 파일 다시 만들기),
//   워커와 같은 스레드가 같은 결과, 닫으면 기다리던 요청이 실패.
// - 시험 2차맵 줄(64장)이 지금 생성기 판에서 땅·초지이고 둘레에 바다·호수가 없다(생성기가 해안을 옮기면 여기서 실패한다).
// - 월드: 지형 서비스가 있으면 시험 2차맵이 행성 값 지형이고 봇이 서며, 이웃 8장을 미리 만든다.
// - 지형 경로: 띄우지 않은 이웃 2차맵은 볼 수 있는 2차맵의 이웃일 때만, 지금 판 표지로만 준다.
// - (DB) 옛 시험 2차맵 행 정리와 감사 기록, 고정본: 처음 건물을 놓으면 쓰고, 다시 켜면 고정본 지형을 쓴다.
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";
import { type CellKey, cellKey, stepCell } from "@terra/planet";
import { decodePlanetValues, encodePlanetValues } from "@terra/planet/secondMap";
import { TERRAIN_SURFACE, decodeTerrain, terrainPath } from "@terra/protocol";
import { placementCostsFromLayers } from "@terra/sim";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createPlanetSource } from "../planet/sources.ts";
import { packTestPlanetSpec } from "../planet/testSupport.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { tsWorkerUrl } from "../testWorkers.ts";
import type { Viewer } from "../trpc/context.ts";
import { TERRAIN_VERSION_PATTERN } from "./mapTerrain.ts";
import { mapPropInputsFromPack } from "./mapProps.ts";
import { ensureTestNpcOwner } from "./persist/load.ts";
import { loadPins, retireTestMaps } from "./pins.ts";
import { registerTerrainRoute } from "./terrainRoute.ts";
import { type TerrainService, type TerrainServiceOptions, createTerrainService } from "./terrainService.ts";
import {
  RETIRED_TEST_MAPS,
  TEST_MAP_KEY,
  TEST_PLANET_ID,
  type World,
  retiredTestMapKey,
  startWorld,
  testMapKey,
} from "./world.ts";

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const spec = packTestPlanetSpec();
const source = createPlanetSource(spec);
const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content/core does not validate");
const props = mapPropInputsFromPack(loaded.pack);
let valuesBytes: Uint8Array = new Uint8Array();
const dirs: string[] = [];
const services: TerrainService[] = [];

async function freshDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "terra-terrain-test-"));
  dirs.push(dir);
  return dir;
}

function service(options: Partial<TerrainServiceOptions> = {}): TerrainService {
  const created = createTerrainService({
    planetId: TEST_PLANET_ID,
    values: () => Promise.resolve(valuesBytes),
    props,
    planetGeneratorVersion: source.generatorVersion,
    definitionHash: source.definitionHash,
    runner: { kind: "inline" },
    log: silent,
    ...options,
  });
  services.push(created);
  return created;
}

async function until(check: () => boolean, timeoutMs = 20_000): Promise<void> {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(async () => {
  expect(spec.input.faceLevel).toBe(9);
  const { values } = await source.generate();
  valuesBytes = encodePlanetValues(values);
}, 120_000);

afterAll(async () => {
  for (const created of services.splice(0)) await created.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("2차맵 지형 서비스", () => {
  it("판 표지, TCTR 2판(물·엄폐·소품 그림), 파일과 같은 지형 비용", async () => {
    const terrain = await service().get(TEST_MAP_KEY);
    expect(terrain.version).toMatch(TERRAIN_VERSION_PATTERN);
    expect(
      terrain.version.startsWith(`1.${source.generatorVersion}.${source.definitionHash.slice(0, 8)}.`),
    ).toBe(true);
    const data = decodeTerrain(gunzipSync(terrain.file().gzip));
    expect(data.mapKey).toBe(TEST_MAP_KEY);
    expect(data.waterLevels?.length).toBe(129 * 129);
    expect(data.cover?.length).toBe(256 * 256);
    expect(data.art?.length).toBe(256 * 256);
    expect(data.cellSizeMm).toBeGreaterThan(10_000);
    expect(terrain.costs).toEqual(
      placementCostsFromLayers({
        heights: data.heights,
        surface: data.surface,
        cover: data.cover,
        art: data.art,
      }),
    );
  });

  it("시험 2차맵 줄 64장은 지금 생성기 판에서 땅·초지이고 둘레에 바다·호수가 없다", async () => {
    const values = decodePlanetValues(valuesBytes);
    const n = 512;
    const allowed = new Set(["grassland", "savanna", "temperate_forest"]);
    for (let k = 0; k < 64; k++) {
      const key = testMapKey(k);
      expect(key).toBe(cellKey(0, 9, 282 + k, 328));
      // 면 0, j = 328: 칸 번호 = j × n + i
      const cell = 328 * n + 282 + k;
      expect((values.water[cell] ?? 0) & 3, `map ${k} ocean or lake`).toBe(0);
      expect(allowed.has(values.biomeIds[values.biome[cell] ?? 0] ?? ""), `map ${k} biome`).toBe(true);
      for (const near of [
        cell - n - 1,
        cell - n,
        cell - n + 1,
        cell - 1,
        cell + 1,
        cell + n - 1,
        cell + n,
        cell + n + 1,
      ]) {
        expect((values.water[near] ?? 0) & 3, `map ${k} neighbour water`).toBe(0);
      }
    }
    // 첫 2차맵은 거의 마른 땅이다(꼭짓점의 1% 아래만 물)
    const data = decodeTerrain(gunzipSync((await service().get(TEST_MAP_KEY)).file().gzip));
    let wet = 0;
    for (let v = 0; v < data.heights.length; v++)
      if ((data.waterLevels?.[v] ?? -1e9) > (data.heights[v] ?? 0)) wet++;
    expect(wet / data.heights.length).toBeLessThan(0.01);
    let water = 0;
    for (const kind of data.surface) if (kind === TERRAIN_SURFACE.water) water++;
    expect(water / data.surface.length).toBeLessThan(0.01);
  });

  it("메모리 LRU: 같은 키는 다시 만들지 않고, 넘치면 오래 안 쓴 것부터 버린다", async () => {
    const terrains = service({ memoryEntries: 2 });
    const [a, b, c] = [testMapKey(1), testMapKey(2), testMapKey(3)];
    const first = await terrains.get(a);
    expect(await terrains.get(a)).toBe(first);
    await terrains.get(b);
    await terrains.get(c);
    expect(terrains.peek(a)).toBeUndefined();
    expect(terrains.peek(c)).toBeDefined();
    const metrics = terrains.takeMetrics();
    expect(metrics).toMatchObject({ terrainBuilt: 3, terrainMemoryHits: 1, terrainMemory: 2 });
  });

  it("디스크 캐시: 다시 켜면 읽고, 틀린 파일은 지우고 다시 만든다", async () => {
    const dir = await freshDir();
    const key = testMapKey(4);
    const first = service({ cacheDir: dir });
    const made = await first.get(key);
    expect(first.takeMetrics()).toMatchObject({ terrainBuilt: 1, terrainFromDisk: 0 });
    const files = await readdir(path.join(dir, "second-maps"));
    expect(files).toEqual([`${TEST_PLANET_ID}-${made.version}-${key}.tctr.gz`]);

    const second = service({ cacheDir: dir });
    const read = await second.get(key);
    expect(second.takeMetrics()).toMatchObject({ terrainBuilt: 0, terrainFromDisk: 1 });
    expect(Buffer.compare(read.file().raw, made.file().raw)).toBe(0);
    expect(read.costs).toEqual(made.costs);

    await writeFile(path.join(dir, "second-maps", files[0] ?? ""), "broken");
    const third = service({ cacheDir: dir });
    await third.get(key);
    expect(third.takeMetrics()).toMatchObject({ terrainBuilt: 1, terrainFromDisk: 0 });
  });

  it("워커와 같은 스레드가 같은 지형을 낸다", async () => {
    const key = testMapKey(5);
    const inline = await service().get(key);
    const worker = service({
      runner: { kind: "worker", workerUrl: tsWorkerUrl("./terrainWorker.ts", import.meta.url) },
    });
    const fromWorker = await worker.get(key);
    expect(fromWorker.version).toBe(inline.version);
    expect(Buffer.compare(fromWorker.file().raw, inline.file().raw)).toBe(0);
    expect(fromWorker.costs).toEqual(inline.costs);
  }, 60_000);

  it("닫으면 행성 값을 기다리던 요청이 실패한다(끄기가 멈추지 않는다)", async () => {
    const waiting = createTerrainService({
      planetId: TEST_PLANET_ID,
      values: () => new Promise<Uint8Array>(() => {}),
      props,
      planetGeneratorVersion: source.generatorVersion,
      definitionHash: source.definitionHash,
      runner: { kind: "inline" },
      log: silent,
    });
    const pending = waiting.get(TEST_MAP_KEY);
    await waiting.close();
    await expect(pending).rejects.toThrow("closed");
  });
});

describe("월드와 지형 경로", () => {
  let world: World;
  let terrains: TerrainService;

  beforeAll(async () => {
    terrains = service();
    world = startWorld({
      testBots: 30,
      paths: { kind: "inline" },
      terrain: terrains,
      now: () => Date.now(),
      log: silent,
    });
    await world.ready;
  }, 60_000);

  afterAll(async () => {
    await world?.stop();
  });

  it("시험 2차맵이 행성 값 지형이고 봇이 서며, 이웃 8장을 미리 만든다", async () => {
    const map = world.maps.get(TEST_MAP_KEY);
    expect(map?.terrainVersion).toBe(terrains.version());
    expect(map?.gauges().units).toBe(30);
    const neighbours: CellKey[] = [];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const next = di === 0 && dj === 0 ? null : stepCell(TEST_MAP_KEY, di, dj);
        if (next !== null) neighbours.push(next);
      }
    }
    expect(neighbours).toHaveLength(8);
    await until(() => neighbours.every((key) => terrains.peek(key) !== undefined));
  });

  it("지형 경로: 띄우지 않은 이웃은 볼 수 있는 2차맵의 이웃·지금 판 표지일 때만 준다", async () => {
    const app = Fastify({ logger: false });
    const viewers: Record<string, Viewer> = {
      admin: {
        id: "00000000-0000-4000-8000-000000000001",
        loginId: "Fake_Admin",
        roles: ["player", "admin"],
      },
      player: { id: "00000000-0000-4000-8000-000000000002", loginId: "Fake_Player", roles: ["player"] },
    };
    registerTerrainRoute(app, {
      world,
      terrain: terrains,
      viewer: (request) => Promise.resolve(viewers[String(request.headers["x-test-user"] ?? "")] ?? null),
    });
    const version = terrains.version() ?? "";
    const neighbour = stepCell(TEST_MAP_KEY, 0, 1) ?? 0;
    const far = cellKey(0, 9, 100, 100);
    const get = (key: number, user: string, v = version) =>
      app.inject({ method: "GET", url: terrainPath(key, v), headers: { "x-test-user": user } });
    expect((await get(TEST_MAP_KEY, "admin")).statusCode).toBe(200);
    const ok = await get(neighbour, "admin");
    expect(ok.statusCode).toBe(200);
    expect(decodeTerrain(ok.rawPayload).mapKey).toBe(neighbour);
    // 판 표지가 다르면 지금 표지 주소로 넘긴다(307 — 사용자 지적 2026-11-21 회색 2차맵, terrainRoute.ts)
    const moved = await get(neighbour, "admin", "1.1.00000000.00000000");
    expect(moved.statusCode).toBe(307);
    expect(moved.headers.location).toBe(terrainPath(neighbour, version));
    expect((await get(far, "admin")).statusCode).toBe(200);
    // 플레이어는 볼 수 있는 2차맵이 없어(탐사·유닛 없음) 이웃도 못 본다
    expect((await get(neighbour, "player")).statusCode).toBe(404);
    expect((await get(neighbour, "")).statusCode).toBe(401);
    await app.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("옛 시험 2차맵 정리·고정본 (DB)", () => {
  let test: TestDatabase;

  beforeAll(async () => {
    test = await createTestDatabase();
  });

  afterAll(async () => {
    await test?.drop();
  });

  it("옛 시험 2차맵의 유닛·건물·탐사 기록을 지우고 감사 기록을 남긴다. 다시 부르면 지울 것이 없다", async () => {
    const pool = test.db.$client;
    const old = retiredTestMapKey(3);
    expect(RETIRED_TEST_MAPS).toBe(64);
    const ownerId = await ensureTestNpcOwner(pool, Date.now());
    await pool.query(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, planet_id, path, depart_at_ms)
       values (777001, $1, 0, 1, 1000, $2, $3, '{100,100}', 0)`,
      [ownerId, old, TEST_PLANET_ID],
    );
    await pool.query(
      `insert into world_buildings (id, map_key, planet_id, x, y, width, height, rotation) values (777002, $1, $2, 5, 5, 2, 2, 0)`,
      [old, TEST_PLANET_ID],
    );
    const first = await retireTestMaps(
      pool,
      TEST_PLANET_ID,
      Array.from({ length: RETIRED_TEST_MAPS }, (_, index) => retiredTestMapKey(index)),
    );
    expect(first).toEqual({ units: 1, buildings: 1, exploration: 0 });
    const audit = await pool.query(`select action from audit_log where action = 'world.retire_test_maps'`);
    expect(audit.rows).toHaveLength(1);
    const again = await retireTestMaps(pool, TEST_PLANET_ID, [old]);
    expect(again).toEqual({ units: 0, buildings: 0, exploration: 0 });
  });

  it("처음 건물을 놓으면 고정본을 쓰고, 다시 켜면 고정본 지형을 쓴다", async () => {
    const pool = test.db.$client;
    const terrains = service();
    const first = startWorld({
      testBots: 0,
      paths: { kind: "inline" },
      terrain: terrains,
      now: () => Date.now(),
      log: silent,
      pool,
    });
    await first.ready;
    const map = first.maps.get(TEST_MAP_KEY);
    if (!map) throw new Error("test map missing");
    let placed = false;
    for (let y = 20; y < 200 && !placed; y += 7) {
      for (let x = 20; x < 200 && !placed; x += 7) {
        placed = map.placeBuilding({ x, y, width: 2, height: 2, rotation: 0 }).ok;
      }
    }
    expect(placed).toBe(true);
    let pins = new Map<number, unknown>();
    for (let tries = 0; tries < 100 && pins.size === 0; tries++) {
      pins = await loadPins(pool, TEST_PLANET_ID, [TEST_MAP_KEY]);
      if (pins.size === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(pins.size).toBe(1);
    await first.stop();

    // 고정본의 판 표지를 바꿔 두면(생성기가 바뀐 것과 같다) 다시 켠 월드가 그 표지를 쓴다
    await pool.query(
      `update second_map_pins set terrain_version = '9.9.deadbeef.deadbeef' where map_key = $1`,
      [TEST_MAP_KEY],
    );
    const second = startWorld({
      testBots: 0,
      paths: { kind: "inline" },
      terrain: terrains,
      now: () => Date.now(),
      log: silent,
      pool,
    });
    await second.ready;
    expect(second.maps.get(TEST_MAP_KEY)?.terrainVersion).toBe("9.9.deadbeef.deadbeef");
    expect(second.maps.get(testMapKey(1))).toBeUndefined();
    await second.stop();
  }, 60_000);
});
