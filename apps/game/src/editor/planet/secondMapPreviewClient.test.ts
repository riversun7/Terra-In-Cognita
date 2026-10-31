// 편집기 2차맵 미리보기 워커 손잡이 시험 — 가짜 워커로 답·단계·죽음·버리기, 결과 → 엔진 지형 입력.
import { planetInputFromDefinition } from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import {
  type SecondMapJob,
  SecondMapPreviewError,
  type SecondMapWorkerHandlers,
  createSecondMapPreviewClient,
  previewTerrainInput,
} from "./secondMapPreviewClient.ts";
import type { SecondMapPreviewRequest, SecondMapPreviewTerrain } from "./secondMapPreviewProtocol.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const NO_WATER = -2_147_483_648;
const INPUT = planetInputFromDefinition(TEST_PLANET, PACK_BIOMES, 5);

function fakeTerrain(): SecondMapPreviewTerrain {
  const heightsCm = new Int32Array(129 * 129).fill(1234);
  const waterLevelCm = new Int32Array(129 * 129).fill(NO_WATER);
  waterLevelCm[0] = 2000;
  return {
    mapKey: 1,
    generatorVersion: 1,
    heightsCm,
    waterLevelCm,
    surface: new Uint8Array(128 * 128).fill(1),
    cover: new Uint8Array(256 * 256).fill(2),
    art: new Uint8Array(256 * 256).fill(1),
    cellSizeMm: 11_500,
    hash: "0a0b0c0d",
  };
}

function fakeWorld() {
  const posted: SecondMapPreviewRequest[] = [];
  let handlers: SecondMapWorkerHandlers | null = null;
  let created = 0;
  let terminated = 0;
  const client = createSecondMapPreviewClient((next) => {
    handlers = next;
    created += 1;
    return { post: (request) => posted.push(request), terminate: () => (terminated += 1) };
  });
  const handlersNow = (): SecondMapWorkerHandlers => {
    if (!handlers) throw new Error("no worker");
    return handlers;
  };
  return {
    client,
    posted,
    handlers: handlersNow,
    created: () => created,
    terminated: () => terminated,
  };
}

const job = (planetKey: string): SecondMapJob => ({
  planetKey,
  input: INPUT,
  mapKey: 42,
  props: [],
});

describe("2차맵 미리보기 손잡이", () => {
  it("처음 부탁에 워커를 띄우고, 단계·결과를 넘기고, 결과의 행성을 기억한다", async () => {
    const world = fakeWorld();
    expect(world.created()).toBe(0);
    const stages: string[] = [];
    const promise = world.client.request(job("p1"), (stage) => stages.push(stage));
    expect(world.created()).toBe(1);
    const [request] = world.posted;
    expect(request).toMatchObject({ kind: "secondMap", planetKey: "p1", mapKey: 42 });
    const id = request?.id ?? 0;
    world.handlers().onReply({ kind: "stage", id, stage: "planet" });
    world.handlers().onReply({ kind: "stage", id, stage: "map" });
    expect(world.client.hasPlanet("p1")).toBe(false);
    world.handlers().onReply({
      kind: "result",
      id,
      result: { terrain: fakeTerrain(), planetMs: 10, mapMs: 1 },
    });
    await expect(promise).resolves.toMatchObject({ planetMs: 10 });
    expect(stages).toEqual(["planet", "map"]);
    expect(world.client.hasPlanet("p1")).toBe(true);
    expect(world.client.hasPlanet("p2")).toBe(false);
    // 다음 부탁은 같은 워커
    void world.client.request(job("p1")).catch(() => undefined);
    expect(world.created()).toBe(1);
  });

  it("워커 답의 실패는 그 코드로, 죽으면 기다리던 것 모두 crashed, 다음 부탁에 새 워커", async () => {
    const world = fakeWorld();
    const first = world.client.request(job("p1"));
    world.handlers().onReply({ kind: "error", id: world.posted[0]?.id ?? 0, code: "rejected", message: "x" });
    await expect(first).rejects.toMatchObject({ code: "rejected" });

    const a = world.client.request(job("p1"));
    const b = world.client.request(job("p2"));
    world.handlers().onCrash();
    await expect(a).rejects.toBeInstanceOf(SecondMapPreviewError);
    await expect(b).rejects.toMatchObject({ code: "crashed" });
    expect(world.terminated()).toBe(1);
    void world.client.request(job("p1")).catch(() => undefined);
    expect(world.created()).toBe(2);
  });

  it("버리면 기다리던 것은 closed, 행성 값도 잊고, 그 뒤 부탁은 새 워커(React StrictMode 효과 두 번)", async () => {
    const world = fakeWorld();
    const waiting = world.client.request(job("p1"));
    world.handlers().onReply({
      kind: "result",
      id: world.posted[0]?.id ?? 0,
      result: { terrain: fakeTerrain(), planetMs: 1, mapMs: 1 },
    });
    await waiting;
    expect(world.client.hasPlanet("p1")).toBe(true);
    const pending = world.client.request(job("p1"));
    world.client.dispose();
    await expect(pending).rejects.toMatchObject({ code: "closed" });
    expect(world.client.hasPlanet("p1")).toBe(false);
    expect(world.terminated()).toBe(1);
    void world.client.request(job("p1")).catch(() => undefined);
    expect(world.created()).toBe(2);
  });
});

describe("결과 → 엔진 지형 입력", () => {
  it("서버 지형 파일과 같은 바꾸기: 높이 0.1m, 물 없음, 실제 칸 크기, 소품·엄폐 층", () => {
    const input = previewTerrainInput(fakeTerrain());
    expect(input.heights[0]).toBe(123);
    expect(input.cellSizeM).toBeCloseTo(11.5);
    expect(input.waterLevels?.[0]).toBe(200);
    expect(input.waterLevels?.[1]).toBe(-32_768);
    expect(input.art?.length).toBe(256 * 256);
    expect(input.cover?.[0]).toBe(2);
  });
});
