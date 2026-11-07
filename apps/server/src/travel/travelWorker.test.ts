// 2차맵 사이 이동 × 운영 경로 워커(createWorkerPathService, 실제 워커 스레드 src/world/pathWorker.ts) — WP9가 같은 스레드 길 찾기로만 본
// 넘기기를 운영과 같은 길 찾기로 본다(docs/adr/2026-11-07-play-flow.md "WP11"). 워커 사본은 지형·건물만 들고 유닛은 들지 않으므로,
// 옆 2차맵으로 넘긴(transferIn) 유닛의 다음 구간 길도 그 2차맵 사본으로 풀린다. 시계는 가상(가짜 타이머를 쓰지 않는다 — 워커 답은 진짜
// 비동기라), 확인은 runDue를 직접 부른다.
import { WALK_SPEED, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tsWorkerUrl } from "../testWorkers.ts";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createWorkerPathService } from "../world/pathPool.ts";
import type { PathService } from "../world/pathService.ts";
import { type SecondMap, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { type TravelService, createTravelService } from "./service.ts";

const WORKER_URL = tsWorkerUrl("../world/pathWorker.ts", import.meta.url);
const START = 1_798_000_000_000;
const OWNER = 7;
const USER = "user-a";
const K = [testMapKey(0), testMapKey(1)];

let pool: PathService | undefined;
let travel: TravelService | undefined;
afterEach(async () => {
  travel?.stop();
  travel = undefined;
  await pool?.close();
  pool = undefined;
});

describe("2차맵 사이 이동 × 경로 워커", () => {
  it("워커가 푼 길로 변 끝까지 걷고, 옆 2차맵에서도 워커가 푼 길로 목표에 닿는다", async () => {
    let clock = START;
    const now = () => clock;
    const maps = new Map<number, SecondMap>();
    const paths = createWorkerPathService({
      workerUrl: WORKER_URL,
      workers: 1,
      sources: () => [...maps.values()].map((map) => map.replicaInit()),
      log: { warn: () => {}, error: () => {} },
    });
    pool = paths;
    for (const mapKey of K)
      maps.set(
        mapKey,
        createSecondMap({
          mapKey,
          terrain: mapTerrainFromTemp(mapKey, flatTerrain()),
          paths,
          now,
          stats: emptyWorldStats(),
          log: silentLog,
          persist: { saveUnit: () => {}, saveBuilding: () => {}, removeBuilding: () => {} },
        }),
      );
    paths.start();
    const first = maps.get(K[0] ?? 0);
    const second = maps.get(K[1] ?? 0);
    if (!first || !second) throw new Error("no maps");
    expect(
      first.addUnit({
        id: 1,
        size: 1,
        speed: WALK_SPEED,
        cellX: 240,
        cellY: 100,
        ownerId: OWNER,
        kind: UNIT_KIND_HUMAN,
      }),
    ).toBe(true);
    const service = createTravelService({
      maps,
      planetId: "s2_test_planet",
      now,
      log: silentLog,
      ownerOf: (userId) => (userId === USER ? OWNER : undefined),
      ready: () => true,
    });
    travel = service;

    expect(await service.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 20, y: 100, kind: "move" })).toEqual(
      expect.objectContaining({ ok: true, maps: 2 }),
    );
    const leg = first.unitInfo(1);
    expect(leg && positionAt(leg.motion, arrivalAt(leg.motion))).toEqual(anchorCenter(255, 100, 1));

    // 변 끝에 닿은 시각: 넘기고(같은 동기 처리) 다음 구간 길을 워커에 묻는다
    clock = leg ? arrivalAt(leg.motion) : clock;
    service.runDue();
    expect(first.unitInfo(1)).toBeUndefined();
    expect(second.unitInfo(1)).toBeDefined();
    await vi.waitFor(
      () => {
        const info = second.unitInfo(1);
        expect(info && positionAt(info.motion, arrivalAt(info.motion))).toEqual(anchorCenter(20, 100, 1));
      },
      { timeout: 10_000, interval: 20 },
    );
    const last = second.unitInfo(1);
    clock = last ? arrivalAt(last.motion) : clock;
    service.runDue();
    expect(service.active).toBe(0);
    expect(service.list(USER)).toMatchObject([
      { unitId: 1, state: "arrived", mapKey: K[1], cellX: 20, cellY: 100 },
    ]);
  });
});
