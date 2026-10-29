import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTerrain } from "../mock/mockTerrain.ts";
import type { TerrainWorkerReply, TerrainWorkerRequest } from "./terrainBuilder.ts";
import { runTerrainJob } from "./terrainJob.ts";
import { NOISE_TEXTURE_SIZE, buildNoiseTextureData } from "./terrainNoise.ts";

const NOISE_BYTES = NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE * 4;
const expectedNoise = buildNoiseTextureData();

/** 빌더 모듈은 만든 잡음을 들고 있다 — 시험마다 새로 불러온다 */
async function freshBuilderModule(): Promise<typeof import("./terrainBuilder.ts")> {
  vi.resetModules();
  return import("./terrainBuilder.ts");
}

type Listener = (event: { data: TerrainWorkerReply }) => void;

/**
 * 가짜 워커: 실제 워커가 하는 일(runTerrainJob)을 받은 순서대로 다음 마이크로태스크에 답한다(실제 워커도 순서를 지킨다).
 * failNoise면 잡음 부탁에 실패로 답한다
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static failNoise = false;
  readonly requests: TerrainWorkerRequest[] = [];
  terminated = false;
  private readonly listeners: Listener[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (type === "message") this.listeners.push(listener);
  }

  postMessage(request: TerrainWorkerRequest): void {
    this.requests.push(request);
    queueMicrotask(() => {
      if (this.terminated) return;
      const reply: TerrainWorkerReply =
        FakeWorker.failNoise && request.kind === "noise"
          ? { id: request.id, ok: false, message: "noise failed" }
          : runTerrainJob(request).reply;
      for (const listener of this.listeners) listener({ data: reply });
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
  FakeWorker.failNoise = false;
});

describe("createTerrainBuilder", () => {
  it("워커가 없으면 화면 스레드에서 만들고, 잡음은 한 번 만들어 같이 쓴다", async () => {
    expect(typeof Worker).toBe("undefined");
    const { createTerrainBuilder } = await freshBuilderModule();
    const builder = createTerrainBuilder();
    const first = await builder.build(createMockTerrain(1));
    const second = await builder.build(createMockTerrain(2));
    expect(first.source).toBe("main");
    expect(first.noise.length).toBe(NOISE_BYTES);
    expect(first.noise).toEqual(expectedNoise);
    expect(second.noise).toBe(first.noise);
    // 다음 화면(새 빌더)도 같은 자료
    const next = await createTerrainBuilder().build(createMockTerrain(3));
    expect(next.noise).toBe(first.noise);
    builder.dispose();
  });

  it("워커가 있으면 만들자마자 잡음을 먼저 부탁하고, 메시 답에 그 잡음을 준다", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { createTerrainBuilder } = await freshBuilderModule();
    const builder = createTerrainBuilder();
    const worker = FakeWorker.instances[0];
    // 지형을 받기 전에 이미 잡음을 부탁했다
    expect(worker?.requests.map((request) => request.kind)).toEqual(["noise"]);

    const built = await builder.build(createMockTerrain(5));
    expect(built.source).toBe("worker");
    expect(built.noise).toEqual(expectedNoise);
    expect(worker?.requests.map((request) => request.kind)).toEqual(["noise", "mesh"]);

    // 다음 화면의 빌더도 워커를 바로 띄우지만 잡음을 다시 부탁하지 않는다
    builder.dispose();
    expect(worker?.terminated).toBe(true);
    const next = createTerrainBuilder();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1]?.requests).toEqual([]);
    const again = await next.build(createMockTerrain(6));
    expect(FakeWorker.instances[1]?.requests.map((request) => request.kind)).toEqual(["mesh"]);
    expect(again.noise).toBe(built.noise);
    next.dispose();
  });

  it("잡음 부탁이 실패하면 메시 답 때 화면 스레드에서 만든다", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.failNoise = true;
    const { createTerrainBuilder } = await freshBuilderModule();
    const builder = createTerrainBuilder();
    const built = await builder.build(createMockTerrain(7));
    expect(built.source).toBe("worker");
    expect(built.noise).toEqual(expectedNoise);
    builder.dispose();
  });

  it("틀린 지형은 워커 답으로 실패한다", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { createTerrainBuilder } = await freshBuilderModule();
    const builder = createTerrainBuilder();
    const terrain = { ...createMockTerrain(8), heights: new Int16Array(3) };
    await expect(builder.build(terrain)).rejects.toThrow(/invalid terrain/);
    builder.dispose();
  });
});
