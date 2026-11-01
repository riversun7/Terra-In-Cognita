// 전투 다시보기 서버 시험 — docs/adr/2026-11-01-battle-replay.md 3·4·5절. 저장소 팩을 서버 시작과 같은 길로 읽는다.
// 계산(팩 자료·이름·경기장), 시험 2차맵 경기장(지형 파일 → 전투맵), 서비스(속도 제한·한 번에 하나·실패 이유·경기장 실패 대비),
// 워커 결과 = 같은 스레드 결과, 잰 값(바이트·gzip·계산 ms)을 기록에 남긴다.
import { gzipSync } from "node:zlib";
import { TRPCError } from "@trpc/server";
import { loadContentPack } from "@terra/content/node";
import { encodeTerrain } from "@terra/protocol";
import { decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
import { TEST_COMBAT_COEFFICIENTS, createBattleMap } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { ErrorReason } from "../trpc/init.ts";
import type { Viewer } from "../trpc/context.ts";
import { createTuningShared } from "../tuning/services.ts";
import { createTuningState } from "../tuning/state.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import {
  ARENA_SIZE,
  type ArenaMapSource,
  type ArenaPick,
  arenaOf,
  createArenaSource,
  plainArena,
} from "./arena.ts";
import { type ReplayJob, type ReplayJobResult, runReplayJob } from "./compute.ts";
import { type JobRunner, JobRunError, inlineJobRunner, workerJobRunner } from "./jobRunner.ts";
import { effectNamesOf } from "./names.ts";
import { createBattleReplayServices } from "./services.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
const source = loaded.source;
if (!source) throw new Error("content pack");
const packSource = source;
const noop = (): void => {};
const silent = { info: noop, warn: noop };
const viewer = (id = "u1"): Viewer => ({ id, loginId: id, roles: ["dev"] });

/** 시험 2차맵: 지형 128(꼭짓점 높이 경사), 배치 256, 왼쪽 절반 막힘, 수풀 띠 */
function fakeMap(version = "1.3.00000000.00000000"): ArenaMapSource {
  const terrainSize = 128;
  const placement = 256;
  const heights = new Int32Array((terrainSize + 1) ** 2);
  for (let y = 0; y <= terrainSize; y++)
    for (let x = 0; x <= terrainSize; x++) heights[y * (terrainSize + 1) + x] = 100 * x + 7 * y;
  const cover = new Uint8Array(placement * placement);
  for (let y = 0; y < placement; y++) for (let x = 200; x < 206; x++) cover[y * placement + x] = 1;
  const costs = new Uint16Array(placement * placement).fill(1000);
  for (let y = 0; y < placement; y++) for (let x = 0; x < 128; x++) costs[y * placement + x] = 0;
  const file = encodeTerrain({
    mapKey: 77,
    generatorVersion: 1,
    seed: 3,
    hash: 0,
    terrainSize,
    heights,
    surface: new Uint8Array(terrainSize * terrainSize).fill(1),
    cover,
    placementSize: placement,
  });
  return { mapKey: 77, terrainVersion: version, costs: () => costs, terrainFile: () => file };
}

function setup(
  options: {
    runner?: JobRunner<ReplayJob, ReplayJobResult>;
    arena?: () => ArenaPick | null;
    capacity?: number;
  } = {},
) {
  const state = createTuningState(tuningEntriesOf(packSource), statRowsOf(packSource));
  const roster = rosterCatalogOf(
    packSource,
    () => state.society(),
    () => state.statTable(),
  );
  const tuning = createTuningShared({
    state,
    pack: { packId: "core", contentVersion: "core@test", contentHash: "hash" },
    now: () => 0,
    log: silent,
  });
  const services = createBattleReplayServices({
    tuning,
    roster,
    arena: options.arena ?? (() => null),
    runner: options.runner ?? inlineJobRunner(runReplayJob),
    effectNames: effectNamesOf(packSource),
    now: () => 0,
    log: silent,
    limits: { perUser: { capacity: options.capacity ?? 100, refillPerMinute: 1 } },
  });
  return { services, roster };
}

async function reasonOf(promise: Promise<unknown>): Promise<{ code: string; reason: string | undefined }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError)
      return {
        code: error.code,
        reason: error.cause instanceof ErrorReason ? error.cause.reason : undefined,
      };
    throw error;
  }
  throw new Error("expected rejection");
}

describe("다시보기 경기장 = 시험 2차맵 구역", () => {
  it("지형 파일·비용에서 지나갈 수 있는 창을 고르고 엄폐·높이를 옮긴다", () => {
    const pick = arenaOf(fakeMap());
    expect(pick.map.size).toBe(ARENA_SIZE);
    expect(pick.ref.mapKey).toBe(77);
    expect(pick.ref.originX).toBeGreaterThanOrEqual(128);
    expect(pick.map.passable.every((value) => value === 1)).toBe(true);
    expect(pick.map.cover.some((value) => value === 1)).toBe(true);
    expect(() => createBattleMap(pick.map)).not.toThrow();
  });

  it("판 표지가 같으면 다시 만들지 않는다", () => {
    let calls = 0;
    let version = "1.3.00000000.00000000";
    const arena = createArenaSource(() => {
      calls += 1;
      return fakeMap(version);
    });
    const first = arena();
    expect(arena()).toBe(first);
    version = "1.3.00000000.00000001";
    expect(arena()).not.toBe(first);
    expect(calls).toBe(3);
    expect(createArenaSource(() => undefined)()).toBeNull();
  });
});

describe("다시보기 계산", () => {
  it("팩 자료로 시범 6 대 6을 기록한다(스킬·효과 이름 ko·en, 경기장 참조)", () => {
    const { roster } = setup();
    const pick = arenaOf(fakeMap());
    const started = performance.now();
    const result = runReplayJob({
      catalog: roster.combat,
      coefficients: TEST_COMBAT_COEFFICIENTS,
      map: pick.map,
      arena: pick.ref,
      seed: 1,
      names: { skills: roster.names.skills, effects: effectNamesOf(packSource) },
    });
    const ms = performance.now() - started;
    const bytes = replayFromBase64(result.replay);
    expect(bytes.length).toBe(result.bytes);
    const replay = decodeBattleReplay(bytes);
    expect(replay.units).toHaveLength(12);
    expect(replay.arena.ref).toEqual(pick.ref);
    expect(replay.skills.find((skill) => skill.id === "fire_bolt")?.name).toEqual({
      ko: "불꽃 화살",
      en: "Fire bolt",
    });
    expect(replay.effects.find((effect) => effect.id === "burn")?.name).toEqual({ ko: "화상", en: "Burn" });
    expect(replay.units.map((unit) => unit.name)).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
      "B6",
    ]);
    const gzip = gzipSync(bytes, { level: 9 }).length;
    // 잰 값을 시험 기록에 남긴다(--silent=false로 본다. ADR 결과 절·작업 기록)
    console.info(
      `battle replay demo seed 1 (second-map arena): ${replay.events.length} events, ${replay.result.endTick} ticks, ` +
        `binary ${bytes.length} B, base64 ${result.replay.length} B, gzip ${gzip} B, record+encode ${ms.toFixed(0)} ms`,
    );
  });
});

describe("다시보기 서비스", () => {
  it("빈 평지·시험 2차맵 경기장 모두 리플레이를 돌려준다. 경기장을 못 만들면 평지로 계속한다", async () => {
    const plain = await setup().services.demo(viewer(), { seed: 2 });
    expect(plain.arena).toBe("plain");
    expect(decodeBattleReplay(replayFromBase64(plain.replay)).arena.ref).toBeNull();
    const map = await setup({ arena: () => arenaOf(fakeMap()) }).services.demo(viewer(), { seed: 2 });
    expect(map.arena).toBe("second_map");
    const broken = await setup({
      arena: () => {
        throw new Error("bad terrain");
      },
    }).services.demo(viewer(), { seed: 2 });
    expect(broken.arena).toBe("plain");
  });

  it("같은 시드면 같은 리플레이", async () => {
    const { services } = setup();
    const a = await services.demo(viewer(), { seed: 9 });
    const b = await services.demo(viewer(), { seed: 9 });
    expect(a.replay).toBe(b.replay);
  });

  it("사용자마다 속도 제한, 서버 전체 한 번에 하나, 워커 실패 이유", async () => {
    const limited = setup({ capacity: 1 }).services;
    await limited.demo(viewer(), { seed: 1 });
    expect(await reasonOf(limited.demo(viewer(), { seed: 1 }))).toEqual({
      code: "TOO_MANY_REQUESTS",
      reason: "rate_limited",
    });
    let release = noop;
    const slow = setup({
      runner: (job) =>
        new Promise((resolve) => {
          release = () => resolve(runReplayJob(job));
        }),
    }).services;
    const first = slow.demo(viewer("a"), { seed: 1 });
    expect(await reasonOf(slow.demo(viewer("b"), { seed: 1 }))).toEqual({
      code: "TOO_MANY_REQUESTS",
      reason: "busy",
    });
    release();
    await first;
    const failing = setup({ runner: () => Promise.reject(new JobRunError("timeout", "slow")) }).services;
    expect(await reasonOf(failing.demo(viewer(), { seed: 1 }))).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      reason: "timeout",
    });
  });

  it("워커 스레드 결과 = 같은 스레드 결과", async () => {
    const worker = workerJobRunner<ReplayJob, ReplayJobResult>({
      workerUrl: new URL("./replayWorker.ts", import.meta.url),
      timeoutMs: 60_000,
      heapMb: 128,
    });
    const inline = await setup().services.demo(viewer(), { seed: 4 });
    const threaded = await setup({ runner: worker }).services.demo(viewer(), { seed: 4 });
    expect(threaded.replay).toBe(inline.replay);
  });

  it("빈 평지는 지나갈 수 있는 64칸", () => {
    const map = plainArena();
    expect(map.size).toBe(64);
    expect(map.passable.every((value) => value === 1)).toBe(true);
  });
});
