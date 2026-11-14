// 전투 보고서 실제 세계 도시 DB 통합 시험(기획 D-543·D-545 1383·1384, docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-14, 실제 도시·웨이브 수비·군단)").
// 실제 월드(NPC 사회 런타임 + 시작 도시 기본 시설 + 휴먼)를 띄우고:
// - 도시 목록·스냅숏(넥서스 = 행정 건물), 세계 수비 길(몸·비활성·수호신·생명 수치·물약 — 진짜 서비스)로 파티 공성·웨이브 공성 보고서를 돌린다.
// - 세계를 바꾸지 않는다: 메모리(시설 줄·세계 거울 휴먼·도시)와 DB(세계 표 지문)가 앞뒤로 같다.
// - 워커 일(서버와 같은 진입 파일)로 돌리는 동안 주 스레드 이벤트 루프 지연을 잰다(값은 표준 출력, 작업 기록에 옮긴다).
// TEST_DATABASE_URL이 있을 때만. 계정·이름은 가짜 값이다.
import { monitorEventLoopDelay } from "node:perf_hooks";
import { loadContentPack } from "@terra/content/node";
import { newLabUnit } from "@terra/shared/battleLab";
import type { ReportSetup, ReportStartInput, ReportStatusResponse } from "@terra/shared/battleReport";
import { reportCityChanges } from "@terra/shared/battleReportCity";
import { DAY_MS } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArenaTerrains } from "../battleLab/terrain.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { tsWorkerUrl } from "../testWorkers.ts";
import type { Viewer } from "../trpc/context.ts";
import { createTuningShared } from "../tuning/services.ts";
import { createTuningState } from "../tuning/state.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { workerReportRunner } from "./runner.ts";
import { createReportService } from "./services.ts";
import { type ReportCitySource, worldReportCities } from "./worldCity.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const server = loadServerContent(DEFAULT_CONTENT_DIR);
if (!server.ok) throw new Error(server.lines.join("\n"));

/** 세계 표 지문(줄 수 + 내용 md5) — 보고서 앞뒤로 같아야 한다 */
const WORLD_TABLES = [
  "world_buildings",
  "world_facilities",
  "world_humans",
  "world_cities",
  "world_battles",
  "unit_vitals",
];

describe.skipIf(!TEST_DATABASE_URL)("전투 보고서 실제 도시 (DB)", () => {
  let test: TestDatabase;
  let world: World;
  let cities: ReportCitySource;
  const clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;

  beforeAll(async () => {
    test = await createTestDatabase();
    world = startWorld({
      testBots: 12,
      paths: { kind: "inline" },
      now: () => clock,
      log: silentLog,
      pool: test.db.$client,
      writeIntervalMs: 10,
      onFatal: (error) => {
        throw error;
      },
      npc: { testNations: 2, manual: true },
      holdings: { content: () => pack },
      facilities: { content: () => pack },
      roster: () => rosterCatalogOf(loaded.source ?? server.source),
    });
    await world.ready;
    await world.persistence?.writer.durable();
    cities = worldReportCities(world, () => clock);
  }, 180_000);

  afterAll(async () => {
    await world?.stop().catch(() => undefined);
    await test?.drop();
  });

  const tableSigs = async (): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    for (const table of WORLD_TABLES) {
      const found = await rows<{ n: string; h: string | null }>(
        test.db,
        `select count(*)::text as n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from ${table} t`,
        [],
      );
      out[table] = `${found[0]?.n}:${found[0]?.h}`;
    }
    return out;
  };
  const memorySig = (): string => {
    const npc = world.npc;
    const facilities = world.persistence?.facilities.service.facilities;
    return JSON.stringify([
      [...(facilities?.values() ?? [])],
      [...(npc?.world.units.values() ?? [])].map((unit) => ({ ...unit, eventId: null })),
      [...(npc?.world.cities.values() ?? [])].map((city) => ({ ...city, recruitDraw: null })),
    ]);
  };

  it("도시 목록 → 스냅숏 → 파티 공성·웨이브 공성(세계 수비·팀 수비) 보고서, 세계는 그대로, 루프 지연", async () => {
    const list = cities.list({});
    expect(list.available).toBe(true);
    const target = list.cities.find((city) => city.hall && city.loaded && city.humans > 0);
    if (!target) throw new Error(`no city with hall: ${JSON.stringify(list.cities)}`);

    const beforeMemory = memorySig();
    const beforeTables = await tableSigs();

    const state = createTuningState(tuningEntriesOf(server.source), statRowsOf(server.source));
    const log = { info: () => undefined, warn: () => undefined };
    const tuning = createTuningShared({
      state,
      pack: { packId: "core", contentVersion: server.content.version, contentHash: server.content.hash },
      now: () => clock,
      log,
    });
    const report = createReportService({
      tuning,
      roster: rosterCatalogOf(
        server.source,
        () => state.society(),
        () => state.statTable(),
      ),
      terrains: createArenaTerrains({ test: () => Promise.reject(new Error("no terrain")) }),
      runner: workerReportRunner({ workerUrl: tsWorkerUrl("../balance/duelWorker.ts", import.meta.url) }),
      now: () => Date.now(),
      log,
      cities,
    });
    const made = await rows<{ id: string }>(
      test.db,
      "insert into users (name, email, username) values ($1, $2, $3) returning id",
      ["Fake_RepCity", "fake_repcity@id.placeholder.invalid", "fake_repcity"],
    );
    const viewer: Viewer = { id: String(made[0]?.id), loginId: "Fake_RepCity", roles: ["dev"] };
    const soldier = {
      ...newLabUnit("human"),
      level: 30,
      weapon: { kind: "item" as const, id: "test_sword", pm: 500 },
    };
    const party = { units: Array.from({ length: 6 }, () => soldier), retreatHpPct: 0 };
    const city = { layout: "world" as const, housing: 0, adminLevel: 1, cityId: target.id };
    const siege: ReportSetup = {
      mode: "siege",
      a: { parties: [party, party], retreatAtSec: 0 },
      b: party,
      city,
      nexusDurability: 1000,
      limitSec: 600,
      defense: "world",
    };
    const wave: ReportSetup = {
      mode: "wave",
      strength: 12,
      physical: 6,
      creatureTech: 3,
      defenders: 10,
      defenderTech: 3,
      city,
      nexusDurability: 1000,
      limitSec: 600,
      defense: "party",
      b: { parties: [party], retreatAtSec: 0 },
    };
    const lags: Record<string, { maxMs: number; p99Ms: number; ms: number }> = {};
    const records: Record<string, ReportStatusResponse> = {};
    // 견줄 기준: 옛 시뮬 도시 파티 공성(실제 도시 전과 같은 설정 종류)
    const simSiege: ReportSetup = {
      ...siege,
      city: { layout: "city", housing: 40, adminLevel: 1 },
      defense: "party",
    };
    for (const [name, setup] of [
      ["simSiege", simSiege],
      ["siege", siege],
      ["wave", wave],
    ] as const) {
      const input: ReportStartInput = {
        name: `Fake ${name}`,
        note: "",
        setup,
        variant: null,
        runs: 20,
        seed: 3,
      };
      const histogram = monitorEventLoopDelay({ resolution: 5 });
      histogram.enable();
      const started = performance.now();
      const job = await report.start(test.db, viewer, "127.0.0.1", input);
      for (let i = 0; i < 6000 && report.status(viewer, job.id).job.state === "running"; i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
      histogram.disable();
      const status = report.status(viewer, job.id);
      expect(status.job.state).toBe("done");
      records[name] = status;
      // 지연 = 잰 값 − resolution(src/metrics.ts와 같은 셈)
      lags[name] = {
        maxMs: Math.round((histogram.max / 1e6 - 5) * 10) / 10,
        p99Ms: Math.round((histogram.percentile(99) / 1e6 - 5) * 10) / 10,
        ms: Math.round(performance.now() - started),
      };
    }
    console.info(`battle report world city loop lag: ${JSON.stringify(lags)}`);
    const siegeCity = records.siege?.report?.report.a.city;
    expect(siegeCity).toMatchObject({ cityId: target.id, hall: true });
    expect(siegeCity?.defenders).toBeGreaterThan(0);
    expect(records.siege?.report?.report.a.legion?.a.parties).toBe(2);
    expect(records.wave?.report?.report.a.units.map((row) => row.key)).toContain("b0.5");
    // 저장된 기록: 다시 열면 도시 칸이 그대로
    const saved = records.siege?.job.reportId;
    if (!saved) throw new Error("not saved");
    const record = await report.get(test.db, saved);
    expect(record.report.a.city?.layoutHash).toBe(siegeCity?.layoutHash);
    // 지금 도시와 견주기: 세계가 그대로라 바뀐 곳 없음
    const now = await report.city(target.id);
    expect(now.info && siegeCity ? reportCityChanges(siegeCity, now.info) : ["missing"]).toEqual([]);
    // 세계는 그대로(메모리·DB)
    await world.persistence?.writer.durable();
    expect(memorySig()).toBe(beforeMemory);
    expect(await tableSigs()).toEqual(beforeTables);
    // 루프 지연 상한(공유 CPU라 넉넉히 — 잰 값은 작업 기록)
    for (const lag of Object.values(lags)) expect(lag.maxMs).toBeLessThan(250);
  }, 600_000);
});
