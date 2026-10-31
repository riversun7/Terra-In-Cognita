// 2차맵 시험 자료 받기 시험 — 서버 길(지형 주소·이웃 주소), 기기 길(시험 2차맵 자리·초지·키 레벨), 오류 코드, 무거운 생성 확인
import type { TerrainInput } from "@terra/engine";
import { cellKey } from "@terra/planet";
import { S1_TEST_MAP_KEY, terrainPath } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import { neighbourSpots } from "../../map/secondMapNeighbours.ts";
import type { SecondMapJob, SecondMapPreviewClient } from "../planet/secondMapPreviewClient.ts";
import type { SecondMapPreviewResult } from "../planet/secondMapPreviewProtocol.ts";
import { PACK_BIOMES, TEST_PLANET } from "../planet/testDefinitions.ts";
import { type LabAnswer, LabLoadError, createLabSource } from "./labSource.ts";

const CELL = {
  mapKey: S1_TEST_MAP_KEY,
  face: 0,
  i: 282,
  j: 328,
  biomeId: "grassland",
  elevationM: 20,
  temperatureC: 14,
  humidity: 120,
  precipitationMm: 700,
  water: 0,
  riverOrder: 0,
  forest: 30,
};

function terrainStub(tag: number): TerrainInput {
  return {
    heights: new Int16Array(129 * 129).fill(tag),
    surface: new Uint8Array(128 * 128),
    baseHeightM: 0,
    cellSizeM: 11.7,
    waterLevelM: 0,
  };
}

function rawTerrain(mapKey: number): SecondMapPreviewResult["terrain"] {
  return {
    mapKey,
    generatorVersion: 1,
    heightsCm: new Int32Array(129 * 129),
    waterLevelCm: new Int32Array(129 * 129).fill(-2_147_483_648),
    surface: new Uint8Array(128 * 128),
    cover: new Uint8Array(256 * 256),
    art: new Uint8Array(256 * 256),
    cellSizeMm: 11_700,
    hash: "00ff00ff",
  };
}

function fakeDevice() {
  const jobs: SecondMapJob[] = [];
  let has = false;
  const device: SecondMapPreviewClient = {
    hasPlanet: () => has,
    request(job) {
      jobs.push(job);
      has = true;
      const key = job.mapKey ?? cellKey(0, 7, 3, 3);
      const neighbours = job.neighbours ? neighbourSpots(key).map((spot) => rawTerrain(spot.key)) : [];
      return Promise.resolve({ terrain: rawTerrain(key), cell: CELL, neighbours, planetMs: 5, mapMs: 1 });
    },
    dispose: () => undefined,
  };
  return { device, jobs };
}

const DEFINITIONS = {
  planets: [
    { id: "s2_test_planet", kind: "pack" as const, entry: TEST_PLANET },
    { id: "small", kind: "template" as const, entry: { ...TEST_PLANET, id: "small", faceLevel: 7 } },
  ],
  biomes: PACK_BIOMES,
  mapProps: [],
};

function source(answer: LabAnswer | Error) {
  const fetched: string[] = [];
  const { device, jobs } = fakeDevice();
  const lab = createLabSource({
    query: () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)),
    fetchTerrain: (url) => {
      fetched.push(url);
      return Promise.resolve(terrainStub(fetched.length));
    },
    device,
    definitions: DEFINITIONS,
  });
  return { lab, fetched, jobs };
}

describe("2차맵 시험 자료 — 서버 길", () => {
  const url = terrainPath(S1_TEST_MAP_KEY, "1.3.abc.def");
  const answer: LabAnswer = {
    kind: "server",
    planetId: "s2_test_planet",
    faceLevel: 9,
    mapKey: S1_TEST_MAP_KEY,
    terrainUrl: url,
    cell: CELL,
    testMapKey: S1_TEST_MAP_KEY,
  };

  it("지형 주소로 받고, 이웃은 같은 판 표지 주소로 받는다(기기 워커는 쓰지 않는다)", async () => {
    const { lab, fetched, jobs } = source(answer);
    const map = await lab.load("s2_test_planet", { kind: "test" });
    expect(map).toMatchObject({ source: "server", mapKey: S1_TEST_MAP_KEY, faceLevel: 9, cell: CELL });
    expect(fetched).toEqual([url]);
    const neighbours = await lab.neighbours(map);
    const spots = neighbourSpots(S1_TEST_MAP_KEY);
    expect(neighbours.map((item) => item.mapKey)).toEqual(spots.map((spot) => spot.key));
    expect(fetched.slice(1)).toEqual(spots.map((spot) => terrainPath(spot.key, "1.3.abc.def")));
    expect(jobs).toEqual([]);
  });

  it("서버 오류·자리 없음을 실패 코드로", async () => {
    const badKey = Object.assign(new Error("x"), { data: { code: "BAD_REQUEST", reason: "bad_map_key" } });
    await expect(source(badKey).lab.load("s2_test_planet", { kind: "test" })).rejects.toMatchObject({
      code: "bad_key",
    });
    const notReady = Object.assign(new Error("x"), { data: { code: "PRECONDITION_FAILED" } });
    await expect(source(notReady).lab.load("s2_test_planet", { kind: "test" })).rejects.toMatchObject({
      code: "not_ready",
    });
    await expect(
      source({ kind: "none" }).lab.load("s2_test_planet", { kind: "preset", preset: "coast" }),
    ).rejects.toBeInstanceOf(LabLoadError);
  });
});

describe("2차맵 시험 자료 — 기기 길", () => {
  it("월드 행성이 아니면 워커가 만든다: F9 행성의 시험 2차맵은 월드 시험 자리, 다른 레벨은 초지 자리", async () => {
    const f9 = source({ kind: "device" });
    expect(f9.lab.heavyLevel("s2_test_planet")).toBe(9);
    const map = await f9.lab.load("s2_test_planet", { kind: "test" });
    expect(map).toMatchObject({ source: "device", mapKey: S1_TEST_MAP_KEY, hash: "00ff00ff", planetMs: 5 });
    expect(f9.jobs[0]).toMatchObject({ mapKey: S1_TEST_MAP_KEY, neighbours: false });
    expect(f9.lab.heavyLevel("s2_test_planet")).toBeNull();
    // 이웃: 같은 워커에 neighbours를 붙여 다시 부탁한다
    const neighbours = await f9.lab.neighbours(map);
    expect(f9.jobs[1]).toMatchObject({ mapKey: S1_TEST_MAP_KEY, neighbours: true });
    expect(neighbours).toHaveLength(neighbourSpots(S1_TEST_MAP_KEY).length);

    const small = source({ kind: "device" });
    const smallMap = await small.lab.load("small", { kind: "test" });
    expect(small.jobs[0]).toMatchObject({ mapKey: null, preset: "grassland" });
    expect(smallMap.faceLevel).toBe(7);
  });

  it("아직 만들지 않은 행성은 만들기 전에 묻고, 아니라고 하면 cancelled(워커에 부탁하지 않는다)", async () => {
    const asked: number[] = [];
    const no = source({ kind: "device" });
    await expect(
      no.lab.load(
        "s2_test_planet",
        { kind: "test" },
        { beforeBuild: (level) => (asked.push(level), Promise.resolve(false)) },
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(asked).toEqual([9]);
    expect(no.jobs).toEqual([]);
    const yes = source({ kind: "device" });
    await yes.lab.load("s2_test_planet", { kind: "test" }, { beforeBuild: () => Promise.resolve(true) });
    // 두 번째는 행성이 있어 묻지 않는다
    await yes.lab.load(
      "s2_test_planet",
      { kind: "preset", preset: "river" },
      {
        beforeBuild: () => Promise.reject(new Error("should not ask")),
      },
    );
    expect(yes.jobs).toHaveLength(2);
  });

  it("키 레벨이 행성과 다르면 bad_key, 없는 행성은 unknown_planet", async () => {
    const { lab } = source({ kind: "device" });
    await expect(lab.load("small", { kind: "key", mapKey: S1_TEST_MAP_KEY })).rejects.toMatchObject({
      code: "bad_key",
    });
    await expect(lab.load("nope", { kind: "test" })).rejects.toMatchObject({ code: "unknown_planet" });
  });
});
