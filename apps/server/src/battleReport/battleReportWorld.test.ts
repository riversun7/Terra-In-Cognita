// 전투 보고서 실제 세계 도시·웨이브 팀 수비·군단 시험 — docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-14, 실제 도시·웨이브 수비·군단)".
// - 군단: 파티 둘씩이면 파티 넷·유닛 ID·줄 키, 파티 하나뿐인 군단은 옛 전투장(arenaInit)과 같은 시작 자료, 군단 퇴각 명령이 판정 퇴각이 된다.
// - 웨이브 팀 수비(1384): 팀 B 군단이 수비, 무리 줄 대신 파티 유닛 줄.
// - 실제 도시(1383): 평평한 시험 2차맵에 NPC 시작 도시 기본 시설을 세운 가짜 세계에서 스냅숏(넥서스 = 행정 건물), 세계 수비 길(비활성 빼기·
//   생명 수치·수호신)이 세계 유닛에만 걸림, 실험실 ID가 세계 ID와 겹치지 않음, 스냅숏 지문·바뀜 알림, 일 서비스(저장·unknown_city·견주기).
// 값은 형식 확인용 가짜다.
import { type LabParty, type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import { type ReportSetup, type ReportStartInput, reportProblem } from "@terra/shared/battleReport";
import { reportCityChanges } from "@terra/shared/battleReportCity";
import {
  START_WORLD_SEED,
  type SimUnit,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
} from "@terra/sim";
import { afterEach, describe, expect, it } from "vitest";
import { arenaInit, arenaLegionInit, flatArena } from "../battleLab/arena.ts";
import { type LabRules, buildLabUnit } from "../battleLab/build.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import type { Database } from "../db/client.ts";
import { facilityCatalogOf } from "../facilities/catalog.ts";
import { seedNpcFacilities } from "../facilities/npcSeed.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import type { GuardianRow } from "../temple/rows.ts";
import type { Viewer } from "../trpc/context.ts";
import { createTuningShared } from "../tuning/services.ts";
import { createTuningState } from "../tuning/state.ts";
import { type TestMap, createTestMap } from "../world/testSupport.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { runReport } from "./batch.ts";
import { inlineReportRunner } from "./runner.ts";
import { createReportService } from "./services.ts";
import { playSetupOf } from "./setup.ts";
import type { insertReport } from "./store.ts";
import { type ReportCityWorld, createReportCities } from "./worldCity.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};
const fighter = (level: number): LabUnit => ({
  ...newLabUnit("human"),
  level,
  weapon: { kind: "item", id: "test_sword", pm: 500 },
});
const party = (...units: LabUnit[]): LabParty => ({ units, retreatHpPct: 0 });
const ctx = { rules, society: TEST_SOCIETY_COEFFICIENTS, arenaMap: flatArena() };
const clock = (): number => 0;

const arenaUnit = (level: number) => ({
  spec: buildLabUnit(fighter(level), rules).spec,
  row: "front" as const,
});

describe("군단(파티 여럿)", () => {
  it("파티 하나뿐인 군단은 옛 전투장 시작 자료와 같다", () => {
    const a = { units: [arenaUnit(10), arenaUnit(11)], retreatHpPct: 20 };
    const b = { units: [arenaUnit(12)], retreatHpPct: 0 };
    const job = { a, b, map: flatArena(), coefficients: TEST_COMBAT_COEFFICIENTS, limitMs: 60_000, seed: 0 };
    for (const swapped of [false, true])
      expect(arenaLegionInit({ ...job, a: [a], b: [b] }, 0, swapped)).toEqual(arenaInit(job, 0, swapped));
  });

  it("파티 둘씩: 파티 넷, 팀마다 파티 ID·유닛 ID가 겹치지 않고 줄 키는 <팀><파티>.<자리>, 군단 모양이 결과에 든다", async () => {
    const setup: ReportSetup = {
      mode: "arena",
      a: { parties: [party(fighter(10), fighter(10)), party(fighter(10))], retreatAtSec: 0 },
      b: { parties: [party(fighter(10)), party(fighter(10), fighter(10))], retreatAtSec: 0 },
      terrain: "flat",
      limitSec: 60,
    };
    expect(reportProblem({ setup, variant: null, runs: 2, seed: 1 })).toBeNull();
    const { play } = await playSetupOf(setup, ctx);
    expect(play.normal.parties.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(new Set(play.normal.units.map((u) => u.id)).size).toBe(6);
    expect(play.normal.units.map((u) => u.id).toSorted((x, y) => x - y)).toEqual([1, 2, 7, 101, 107, 108]);
    expect(play.rows.map((row) => row.key)).toEqual(["a0.0", "a0.1", "a1.0", "b0.0", "b1.0", "b1.1"]);
    const [result] = runReport({ setups: [play], runs: 2, seed: 3 }, clock);
    expect(result?.legion?.a).toMatchObject({ parties: 2, units: 3 });
    expect(result?.legion?.b).toMatchObject({ parties: 2, units: 3 });
  });

  it("군단 퇴각 명령: 그 시각에 군단 명령 하나 — 지휘 정원 안 모든 파티가 물러난다(판정 군단 퇴각, 1463)", async () => {
    const setup: ReportSetup = {
      mode: "arena",
      a: { parties: [party(fighter(10)), party(fighter(10))], retreatAtSec: 1 },
      b: party(fighter(10), fighter(10)),
      terrain: "flat",
      limitSec: 120,
    };
    const { play } = await playSetupOf(setup, ctx);
    expect(play.inputs).toEqual([{ tick: 10, kind: "legion", side: 1, order: { kind: "retreat" } }]);
    // 편 바꾼 판은 팀 A가 편 2
    expect(play.swappedInputs).toEqual([{ tick: 10, kind: "legion", side: 2, order: { kind: "retreat" } }]);
    // 실험실 휴먼(1차 10)의 지휘 정원 = 3(설정 칸 C7 출발값) ≥ 파티 2
    expect(play.legion?.a).toMatchObject({ commandCap: 3, uncommanded: 0 });
    const [result] = runReport({ setups: [play], runs: 2, seed: 5 }, clock);
    expect(result?.sides.a.retreats).toBeGreaterThan(0);
  });

  it("검사: 파티 수 상한·빈 파티·퇴각 시각·웨이브 팀 수비의 팀·세계 수비의 실제 도시", () => {
    const base = { variant: null, runs: 2, seed: 1 } as const;
    const many: ReportSetup = {
      mode: "arena",
      a: { parties: Array.from({ length: 21 }, () => party(fighter(1))), retreatAtSec: 0 },
      b: party(fighter(1)),
      terrain: "flat",
      limitSec: 60,
    };
    expect(reportProblem({ ...base, setup: many })).toBe("invalid_settings");
    const late: ReportSetup = { ...many, a: { parties: [party(fighter(1))], retreatAtSec: 61 } };
    expect(reportProblem({ ...base, setup: late })).toBe("invalid_settings");
    const wave: ReportSetup = {
      mode: "wave",
      strength: 2,
      physical: 1,
      creatureTech: 1,
      defenders: 2,
      defenderTech: 1,
      city: { layout: "open", housing: 0, adminLevel: 1 },
      nexusDurability: 100,
      limitSec: 300,
      defense: "party",
    };
    expect(reportProblem({ ...base, setup: wave })).toBe("invalid_settings");
    expect(reportProblem({ ...base, setup: { ...wave, b: party(fighter(1)) } })).toBeNull();
    expect(reportProblem({ ...base, setup: { ...wave, defense: "world" } })).toBe("invalid_settings");
    const noId = {
      ...wave,
      defense: "sim" as const,
      city: { layout: "world" as const, housing: 0, adminLevel: 1 },
    };
    expect(reportProblem({ ...base, setup: noId })).toBe("invalid_settings");
  });
});

describe("웨이브 팀 수비(1384)", () => {
  it("팀 B 군단이 넥서스를 지킨다: 무리 줄 대신 파티 유닛 줄, 파티 ID는 크리쳐 파티와 겹치지 않는다", async () => {
    const setup: ReportSetup = {
      mode: "wave",
      strength: 6,
      physical: 3,
      creatureTech: 2,
      defenders: 4,
      defenderTech: 2,
      city: { layout: "city", housing: 20, adminLevel: 1 },
      nexusDurability: 800,
      limitSec: 300,
      defense: "party",
      b: { parties: [party(fighter(20), fighter(20)), party(fighter(20))], retreatAtSec: 0 },
    };
    const { play } = await playSetupOf(setup, ctx);
    expect(play.rows.map((row) => row.key)).toEqual(["wave_physical", "wave_magic", "b0.0", "b0.1", "b1.0"]);
    const defenders = play.normal.units.filter((unit) => unit.side === 2);
    expect(defenders.map((unit) => unit.id)).toEqual([101, 102, 107]);
    expect(new Set(defenders.map((unit) => unit.party))).toEqual(new Set([101, 102]));
    const creatureParties = new Set(play.normal.units.filter((u) => u.side === 1).map((u) => u.party));
    for (const id of creatureParties) expect(id).toBeLessThan(101);
    const [result] = runReport({ setups: [play], runs: 2, seed: 7 }, clock);
    expect(result?.outcome.runs).toBe(2);
    expect(result?.siege?.nexusMax).toBeGreaterThan(0);
    expect(result?.legion?.b.parties).toBe(2);
  });
});

// ── 실제 도시(가짜 세계) ─────────────────────────────────────────────────────────
const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();
const maps: TestMap[] = [];
afterEach(() => {
  for (const test of maps.splice(0)) test.map.stop();
});

const human = (id: number): SimUnit => ({
  id,
  city: 1,
  owner: 7,
  job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
  pos: { x: 0, y: 0 },
  tripStep: 0,
  eventId: undefined,
  satisfactionMilli: 60_000,
  bornAtMs: 0,
  lifespanMs: 0,
  recruit: null,
  rebirths: 0,
});

/** 시험 2차맵에 NPC 시작 도시 하나(행정 건물·창고 …)와 휴먼 14명. 수비 길 단계는 시험이 고친다 */
function fakeWorld(patch: Partial<ReportCityWorld> = {}) {
  const test = createTestMap({ mapKey: 9 });
  maps.push(test);
  const records = new Map<number, FacilityRecord>();
  seedNpcFacilities({
    maps: new Map([[9, test.map]]),
    cities: [{ id: 1, factionId: 100, planetId: "p", mapKey: 9, cellX: 128, cellY: 128, start: true }],
    planetId: "p",
    ownerOfFaction: () => 7,
    service: {
      facilities: records,
      seedBuilt: (record: FacilityRecord) => records.set(record.buildingId, record),
    },
    catalog,
    seed: START_WORLD_SEED,
    nowMs: 1_000,
  });
  const units = new Map(Array.from({ length: 14 }, (_, i) => [500 + i, human(500 + i)] as const));
  const world: ReportCityWorld = {
    sim: {
      cities: new Map([[1, { id: 1, owner: 100, start: true }]]),
      factions: new Map([[100, { code: "fake_nation", tech: 2 }]]),
      units,
    },
    places: new Map([
      [1, { planetId: "p", mapKey: 9, cellX: 128, cellY: 128, foundedAtMs: 0, name: "Fake Town" }],
    ]),
    maps: new Map([[9, test.map]]),
    facilities: records,
    catalog,
    rules: TEST_SOCIETY_COEFFICIENTS,
    bodies: { battleStart: (init) => init, build: () => undefined },
    vitals: { battleStart: (init) => init },
    items: { battleStart: (init) => init },
    isInactive: () => false,
    guardianCanFight: () => false,
    guardians: () => Promise.resolve([]),
    ...patch,
  };
  return { world, records, units };
}

const worldSiege = (cityId = 1): ReportSetup => ({
  mode: "siege",
  a: { parties: [party(fighter(30), fighter(30)), party(fighter(30))], retreatAtSec: 0 },
  b: party(fighter(1)),
  city: { layout: "world", housing: 0, adminLevel: 1, cityId },
  nexusDurability: 500,
  limitSec: 300,
  defense: "world",
});

describe("실제 세계 도시(1383)", () => {
  it("도시 목록: 이름·ID로 찾고 휴먼 수·행정 건물·2차맵이 떠 있나를 보인다", () => {
    const { world } = fakeWorld();
    const cities = createReportCities({ world: () => world, now: () => 2_000 });
    const all = cities.list({});
    expect(all.available).toBe(true);
    expect(all.cities).toEqual([
      expect.objectContaining({ id: 1, name: "Fake Town", humans: 14, hall: true, loaded: true }),
    ]);
    expect(cities.list({ query: "fake t" }).cities).toHaveLength(1);
    expect(cities.list({ query: "1" }).cities).toHaveLength(1);
    expect(cities.list({ query: "nothing" }).cities).toHaveLength(0);
    expect(createReportCities({ world: () => undefined, now: clock }).list({})).toEqual({
      available: false,
      cities: [],
    });
  });

  it("파티 공성: 넥서스 = 행정 건물 지금 내구도, 세계 수비 군단(지휘관 정원만큼 파티, 비활성 빼고)·생명 수치는 세계 유닛만, 실험실 ID는 세계 ID와 안 겹침", async () => {
    // 세계 유닛 ID가 실험실 옛 ID(1~)와 겹치는 경우도 본다: 휴먼 하나를 ID 1로
    const { world, units } = fakeWorld({
      isInactive: (id) => id === 503,
      vitals: {
        battleStart: (init) => ({
          ...init,
          units: init.units.map((unit) => ({ ...unit, start: { hp: 1, armor: 0, shield: 0 } })),
        }),
      },
    });
    units.set(1, { ...human(1) });
    const cities = createReportCities({ world: () => world, now: () => 2_000 });
    const snapshot = cities.snapshot(1);
    expect(snapshot?.layout).toBeDefined();
    const built = await playSetupOf(worldSiege(), { ...ctx, city: snapshot });
    const init = built.play.normal;
    const worldUnits = init.units.filter((unit) => unit.side === 2);
    // 정원사 차례(defenseOrder = ID 차례)로 휴먼 15명 → 비활성 503 빠짐 → 14명(파티 3개 = 지휘관 정원 3 안, 사용자 1464·1466)
    expect(worldUnits.map((unit) => unit.id)).toEqual([
      1, 500, 501, 502, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513,
    ]);
    expect(worldUnits.every((unit) => unit.start?.hp === 1)).toBe(true);
    const lab = init.units.filter((unit) => unit.side === 1);
    expect(lab).toHaveLength(3);
    expect(lab.every((unit) => unit.id >= 2_000_000_001 && unit.start === undefined)).toBe(true);
    expect(built.play.rows.at(-1)).toMatchObject({ key: "defenders", members: 14 });
    expect(built.city).toMatchObject({ cityId: 1, name: "Fake Town", hall: true, humans: 15, defenders: 14 });
    expect(built.city?.nexusDurability).toBe(init.map.buildings.find((b) => b.nexus)?.durability);
    expect(built.city?.nexusDurability).toBeGreaterThan(0);
    const [result] = runReport({ setups: [built.play], runs: 2, seed: 9 }, clock);
    expect(result?.outcome.runs).toBe(2);
  });

  it("세계 수비 군단: 휴먼이 많아도 지휘관 정원(파티 수)만큼 앞 파티만 든다(사용자 1464·1466)", async () => {
    const { world, units } = fakeWorld();
    for (let i = 0; i < 46; i++) units.set(600 + i, human(600 + i));
    const snapshot = createReportCities({ world: () => world, now: () => 2_000 }).snapshot(1);
    const built = await playSetupOf(worldSiege(), { ...ctx, city: snapshot });
    const defenders = built.play.normal.units.filter((unit) => unit.side === 2);
    // 휴먼 60명 → 파티 6명씩 10개 → 정원 7(휴먼 INT·WIS 56: 2 + ⌊56 ÷ 10⌋, 설정 칸 C7 출발값) → 앞 7파티 42명
    expect(defenders.every((unit) => unit.commandCap === 7)).toBe(true);
    expect(defenders).toHaveLength(42);
    const kept = [101, 102, 103, 104, 105, 106, 107];
    expect(new Set(defenders.map((unit) => unit.party))).toEqual(new Set(kept));
    expect(built.play.normal.parties.filter((party) => party.side === 2).map((party) => party.id)).toEqual(
      kept,
    );
    expect(built.city).toMatchObject({ humans: 60, defenders: 42 });
    expect(built.play.legion?.b).toMatchObject({ parties: 7, units: 42, commandCap: 7, uncommanded: 0 });
  });

  it("수호신: 싸울 수 있으면 수비 편 새 파티로 들고 세계 유닛으로 센다", async () => {
    const guardian: GuardianRow = {
      unitId: 9001,
      ownerId: 7,
      cityId: 1,
      templeId: 1,
      level: 5,
      rebirths: 0,
      stats: [10, 10, 10, 10, 10, 10],
      elements: null,
      faith: 0,
      deifiedAtMs: 0,
      buff: "defense",
    };
    const sample = buildLabUnit(fighter(5), rules).spec;
    const { world } = fakeWorld({
      guardians: () => Promise.resolve([guardian]),
      guardianCanFight: (id) => id === 9001,
      bodies: {
        battleStart: (init) => init,
        build: (unitId, place) => ({
          ...sample,
          id: unitId,
          side: place.side,
          party: place.party,
          x: place.x,
          y: place.y,
        }),
      },
    });
    const snapshot = createReportCities({ world: () => world, now: () => 2_000 }).snapshot(1);
    const built = await playSetupOf(worldSiege(), { ...ctx, city: snapshot });
    expect(built.play.normal.units.some((unit) => unit.id === 9001 && unit.side === 2)).toBe(true);
    expect(built.city?.guardians).toBe(1);
    expect(built.city?.defenders).toBe(15);
  });

  it("스냅숏은 복사본·지문은 같으면 같다, 행정 건물 내구도가 바뀌면 nexus, 휴먼이 바뀌면 defense, 도시가 없으면 gone", async () => {
    const { world, records, units } = fakeWorld();
    const cities = createReportCities({ world: () => world, now: () => 2_000 });
    const first = await playSetupOf(worldSiege(), { ...ctx, city: cities.snapshot(1) });
    const again = await playSetupOf(worldSiege(), { ...ctx, city: cities.snapshot(1) });
    if (!first.city || !again.city) throw new Error("city info");
    expect(reportCityChanges(first.city, again.city)).toEqual([]);
    // 행정 건물이 닳으면 넥서스 내구도가 바뀐다(배치 구조는 그대로)
    const hallId = [...records.values()].find(
      (r) => catalog.facility(r.facilityId)?.stage === "government",
    )?.buildingId;
    const hall = hallId === undefined ? undefined : records.get(hallId);
    if (!hall) throw new Error("hall");
    records.set(hall.buildingId, { ...hall, conditionPpm: Math.floor(hall.conditionPpm / 2) });
    units.delete(500);
    const later = await playSetupOf(worldSiege(), { ...ctx, city: cities.snapshot(1) });
    if (!later.city) throw new Error("city info");
    expect(reportCityChanges(first.city, later.city)).toEqual(["nexus", "defense"]);
    expect(reportCityChanges(first.city, null)).toEqual(["gone"]);
    expect(cities.snapshot(2)).toBeUndefined();
  });
});

describe("일 서비스: 실제 도시", () => {
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
  const state = createTuningState(tuningEntriesOf(loaded.source), statRowsOf(loaded.source));
  const log = { info: () => undefined, warn: () => undefined };
  const tuning = createTuningShared({
    state,
    pack: { packId: "core", contentVersion: loaded.content.version, contentHash: loaded.content.hash },
    now: Date.now,
    log,
  });
  const roster = rosterCatalogOf(
    loaded.source,
    () => state.society(),
    () => state.statTable(),
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 쓰이지 않는 자리 채움
  const db = {} as Database;

  it("시작 → 결과에 도시 스냅숏, 견주기(city)·한 대 풀이 same, 모르는 도시는 unknown_city", async () => {
    const { world } = fakeWorld();
    const saved: Parameters<typeof insertReport>[1][] = [];
    const service = createReportService({
      tuning,
      roster,
      terrains: { list: () => [], map: () => Promise.resolve(null) },
      runner: inlineReportRunner(),
      now: () => 3_000,
      log,
      audit: () => Promise.resolve(),
      cities: createReportCities({ world: () => world, now: () => 3_000 }),
      store: {
        insert: (_db, row) => {
          saved.push(row);
          return Promise.resolve();
        },
        list: () => Promise.resolve({ reports: [], next: null }),
        read: (_db, id) =>
          Promise.resolve(
            saved
              .filter((row) => row.id === id)
              .map((row) => ({
                id: row.id,
                name: row.input.name,
                mode: row.input.setup.mode,
                runs: row.input.runs,
                seed: row.input.seed,
                variant: false,
                scorePm: row.report.a.outcome.scorePm,
                scoreBPm: null,
                createdAtMs: 0,
                createdBy: null,
                contentVersion: row.contentVersion,
                contentHash: row.contentHash,
                simVersion: row.simVersion,
                tuningRevision: row.tuningRevision,
                durationMs: row.durationMs,
                note: "",
                input: row.input,
                report: row.report,
              }))[0] ?? null,
          ),
      },
    });
    const viewer: Viewer = { id: "u1", loginId: "u1", roles: ["dev"] };
    const input: ReportStartInput = {
      name: "city",
      note: "",
      setup: worldSiege(),
      variant: null,
      runs: 2,
      seed: 4,
    };
    const job = await service.start(db, viewer, "127.0.0.1", input);
    for (let i = 0; i < 2000 && service.status(viewer, job.id).job.state === "running"; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    const status = service.status(viewer, job.id);
    expect(status.job.state).toBe("done");
    const city = status.report?.report.a.city;
    expect(city).toMatchObject({ cityId: 1, hall: true, atMs: 3_000 });
    const now = await service.city(1);
    expect(now.info && city ? reportCityChanges(city, now.info) : ["missing"]).toEqual([]);
    expect((await service.city(99)).info).toBeNull();
    const reportId = status.job.reportId ?? "";
    const trace = await service.trace(db, viewer, { reportId, which: "a", run: 0 });
    expect(trace.same).toBe(true);
    await expect(service.start(db, viewer, "127.0.0.1", { ...input, setup: worldSiege(42) })).rejects.toThrow(
      /BATTLE_REPORT_REJECTED/,
    );
    expect(service.cities({ query: "fake" }).cities).toHaveLength(1);
  });
});
