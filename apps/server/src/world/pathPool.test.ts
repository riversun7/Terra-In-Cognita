// 경로 워커 풀 시험 — 실제 워커 스레드(src/world/pathWorker.ts를 그대로 띄운다)
// 사본 만들기, 편집을 따라 한 뒤의 경로, 어긋난 사본이면 워커를 새로 띄우기, 닫으면 기다리던 작업은 busy
import { anchorCenter, createPlacementGrid } from "@terra/sim";
import { afterEach, describe, expect, it } from "vitest";
import { tsWorkerUrl } from "../testWorkers.ts";
import type { MapReplicaInit } from "./pathMessages.ts";
import { createWorkerPathService } from "./pathPool.ts";
import type { PathRequest, PathService } from "./pathService.ts";

const WORKER_URL = tsWorkerUrl("./pathWorker.ts", import.meta.url);
const MAP = 9;
const center = (x: number, y: number) => anchorCenter(x, y, 1);

let pool: PathService | undefined;
afterEach(async () => {
  await pool?.close();
  pool = undefined;
});

function replica(): MapReplicaInit & { buildings: MapReplicaInit["buildings"] } {
  const grid = createPlacementGrid();
  return { mapKey: MAP, version: 0, terrainCost: grid.terrainCost, road: grid.road, buildings: [] };
}

function job(patch: Partial<PathRequest> = {}): PathRequest {
  return {
    mapKey: MAP,
    from: center(10, 10),
    to: center(40, 10),
    size: 1,
    nodeBudget: 65_536,
    priority: "bot",
    isCurrent: () => true,
    ...patch,
  };
}

function start(state: MapReplicaInit, workers = 1) {
  const errors: string[] = [];
  const service = createWorkerPathService({
    workerUrl: WORKER_URL,
    workers,
    sources: () => [state],
    log: { warn: (_obj, message) => errors.push(message), error: (_obj, message) => errors.push(message) },
  });
  service.start();
  pool = service;
  return { service, errors };
}

describe("경로 워커 풀", () => {
  it("워커가 사본으로 경로를 풀고, 결과에 격자 버전·계산 시간을 붙인다", async () => {
    const { service } = start(replica());
    const outcome = await service.request(job());
    expect(outcome).toMatchObject({
      status: "found",
      version: 0,
      waypoints: [center(10, 10), center(40, 10)],
    });
    if (outcome.status === "found") {
      expect(outcome.computeMs).toBeGreaterThanOrEqual(0);
      expect(outcome.waitMs).toBeGreaterThanOrEqual(outcome.computeMs);
    }
  });

  it("편집 뒤에 보낸 요청은 편집한 격자로 푼다(버전이 오른다)", async () => {
    const state = replica();
    const { service } = start(state);
    // 사본을 만든 뒤 원본에 건물을 놓고 같은 순서로 편집을 보낸다
    const placement = { x: 25, y: 0, width: 2, height: 30, rotation: 0 as const };
    state.version = 1;
    state.buildings = [{ id: 1, placement }];
    service.edit(MAP, 1, { op: "place", id: 1, placement });
    const outcome = await service.request(job());
    expect(outcome.status).toBe("found");
    if (outcome.status === "found") {
      expect(outcome.version).toBe(1);
      expect(outcome.waypoints.length).toBeGreaterThan(2);
    }
  });

  it("명령은 봇보다 먼저, 쓸모없어진 작업은 풀지 않는다", async () => {
    const { service } = start(replica());
    const order: string[] = [];
    // 워커 하나에 2개까지 먼저 보내므로 뒤에 넣은 것들의 순서를 본다
    const first = service.request(job()).then(() => order.push("bot-1"));
    const second = service.request(job()).then(() => order.push("bot-2"));
    const stale = service.request(job({ isCurrent: () => false }));
    const bot = service.request(job()).then(() => order.push("bot-3"));
    const command = service.request(job({ priority: "command" })).then(() => order.push("command"));
    expect(await stale).toMatchObject({ status: "dropped" });
    await Promise.all([first, second, bot, command]);
    expect(order.indexOf("command")).toBeLessThan(order.indexOf("bot-3"));
  });

  it("사본이 어긋나면 그 워커를 지금 상태로 새로 띄우고 계속 푼다", async () => {
    const state = replica();
    const { service, errors } = start(state);
    expect((await service.request(job())).status).toBe("found");
    // 버전 1을 건너뛴 편집 → 워커가 어긋남을 알린다
    service.edit(MAP, 2, { op: "remove", id: 7 });
    const outcome = await service.request(job());
    expect(outcome.status).toBe("found");
    expect(errors).toContain("path replica diverged");
  });

  it("닫으면 기다리던 작업은 busy, 그 뒤 요청도 busy", async () => {
    const { service } = start(replica());
    const pending = service.request(job());
    await service.close();
    expect(["found", "busy"]).toContain((await pending).status);
    expect(await service.request(job())).toMatchObject({ status: "busy" });
  });
});
