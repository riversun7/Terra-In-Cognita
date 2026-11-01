// 밸런스 화면 서버 시험 — docs/adr/2026-11-01-balance-screen.md 3·4절·"꼬임 점검". 저장소 팩을 서버 시작과 같은 길로 읽는다.
// 기여·대결 계산, 서비스(표·기여·대결·설정 검사·속도 제한·한 번에 하나), 워커 결과 = 같은 스레드 결과,
// 꼬임 가드: 요청 때 표(일에 담긴 표는 그 뒤 덮어쓰기와 상관없음), 진행 중인 전투(사양 고정·현재 값 ≤ 최대), 화면 자료 캐시(다음 읽기부터).
import { TRPCError } from "@trpc/server";
import { loadContentPack } from "@terra/content/node";
import type { BalanceDuelsInput } from "@terra/shared/balance";
import {
  type DuelReport,
  TEST_STAT_TABLE,
  createBattle,
  duelInit,
  restoreBattle,
  runBattle,
  snapshotBattle,
  statFighterSpecs,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { bodyView } from "../roster/body.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { ErrorReason } from "../trpc/init.ts";
import type { Viewer } from "../trpc/context.ts";
import { createTuningShared } from "../tuning/services.ts";
import { type TuningOverrideRecord, createTuningState } from "../tuning/state.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { type DuelJob, combineOrders, contributionOf, runDuelJob } from "./compute.ts";
import { type DuelRunner, inlineDuelRunner, workerDuelRunner } from "./runner.ts";
import { BALANCE_DEFAULTS, createBalanceServices } from "./services.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
const source = loaded.source;
if (!source) throw new Error("content pack");
const packSource = source;

const noop = (): void => {};
const silent = { info: noop, warn: noop };
const viewer = (id = "u1"): Viewer => ({ id, loginId: id, roles: ["dev"] });
const flat = (value: number) => ({ str: value, vit: value, int: value, wis: value, dex: value, agi: value });

const record = (id: string, value: number, packValue: number): TuningOverrideRecord => ({
  id,
  value,
  packValue,
  unit: "pm",
  contentVersion: "core@18",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs: 1,
});

function setup(options: { runner?: DuelRunner; duelCapacity?: number } = {}) {
  const state = createTuningState(tuningEntriesOf(packSource), statRowsOf(packSource));
  const roster = rosterCatalogOf(
    packSource,
    () => state.society(),
    () => state.statTable(),
  );
  const tuning = createTuningShared({
    state,
    pack: { packId: "core", contentVersion: "core@18", contentHash: "hash" },
    now: () => 0,
    log: silent,
  });
  const services = createBalanceServices({
    tuning,
    roster,
    runner: options.runner ?? inlineDuelRunner(),
    now: () => 0,
    log: silent,
    limits: { duelsPerUser: { capacity: options.duelCapacity ?? 100, refillPerMinute: 1 } },
  });
  return { state, roster, services };
}

/** 작은 대결 설정(시험 시간): 1명, 2판, 30초 */
const small = (extra: Partial<BalanceDuelsInput> = {}): BalanceDuelsInput => ({
  ...BALANCE_DEFAULTS,
  runs: 2,
  limitSec: 30,
  edits: [],
  ...extra,
});

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

const report = (over: Partial<DuelReport>): DuelReport => ({
  runs: 5,
  aWins: 0,
  bWins: 0,
  timeouts: 0,
  avgMs: 0,
  aTimeoutLeads: 0,
  bTimeoutLeads: 0,
  shareLeadPmSum: 0,
  ...over,
});

describe("기여 계산(1차 +10 → 2차 스탯)", () => {
  it("시험 표에서는 모든 1차가 무엇인가를 바꾼다. 한 1차의 가중치를 모두 지우면 그 1차가 '가치 없는 1차'", () => {
    const base = contributionOf(TEST_STAT_TABLE, flat(10));
    expect(base.worthless).toEqual([]);
    const hp = base.stats.find((row) => row.id === "hp");
    // HP 가중치(STR 1.5·DEX 1.0·AGI 1.5·VIT 3.0·INT 1.0·WIS 1.2) × 10
    expect(hp).toEqual({
      id: "hp",
      value: 92,
      plus: { str: 15, vit: 30, int: 10, wis: 12, dex: 10, agi: 15 },
    });
    const noWis = TEST_STAT_TABLE.map((row) => ({
      ...row,
      weights: row.weights.map((w, i) => (i === 5 ? 0 : w)),
    }));
    expect(contributionOf(noWis, flat(10)).worthless).toEqual(["wis"]);
  });

  it("두 편 차례를 '기준 + 10' 쪽에서 합친다(시간 초과는 편 2 승으로 세어진 것을 뺀다)", () => {
    // r1: 기준 + 10 = 편 1. 3승, 2는 시간 초과(편 2 승으로 셈), 그 가운데 1번 앞섬
    const r1 = report({
      aWins: 3,
      bWins: 2,
      timeouts: 2,
      avgMs: 100_000,
      aTimeoutLeads: 1,
      shareLeadPmSum: 2000,
    });
    // r2: 기준 + 10 = 편 2. 편 1이 1승, 편 2가 4(그 가운데 시간 초과 1, 앞섬 없음 → 같음)
    const r2 = report({ aWins: 1, bWins: 4, timeouts: 1, avgMs: 200_000, shareLeadPmSum: -1500 });
    expect(combineOrders("str", r1, r2)).toEqual({
      primary: "str",
      runs: 10,
      wins: 6,
      losses: 1,
      timeoutWins: 1,
      timeoutLosses: 0,
      timeoutEven: 2,
      avgMs: 150_000,
      // (6 + 1 + 2 ÷ 2) ÷ 10
      scorePm: 800,
      // (2000 − (−1500)) ÷ 10
      marginPm: 350,
    });
  });
});

describe("밸런스 서비스", () => {
  it("table: 켜진 행마다 모양의 칸(팩 값·실효 값·덮어쓰기), 무기 목록(맨손 + 팩 무기, 공격력 칸), 기본 유닛", async () => {
    const { state, services } = setup();
    state.install([record("hp.vit", 3500, 3000)], 4);
    const table = await services.table();
    expect(table.revision).toBe(4);
    expect(table.rows.map((row) => row.id)).toEqual(TEST_STAT_TABLE.map((row) => row.id));
    const hp = table.rows.find((row) => row.id === "hp");
    expect(hp?.cells.map((cell) => cell.field)).toEqual(["str", "dex", "agi", "vit", "int", "wis", "base"]);
    expect(hp?.cells.find((cell) => cell.field === "vit")).toMatchObject({ pack: 3000, value: 3500 });
    expect(hp?.cells.find((cell) => cell.field === "vit")?.override?.value).toBe(3500);
    const evade = table.rows.find((row) => row.id === "evade");
    expect(evade?.cells.map((cell) => cell.field)).toEqual([
      "str",
      "dex",
      "agi",
      "vit",
      "int",
      "wis",
      "cap",
      "half",
    ]);
    const weapons = new Map(table.weapons.map((weapon) => [weapon.id, weapon]));
    expect(weapons.get("unarmed")).toMatchObject({ basic: "physical", elemental: null });
    expect(weapons.get("test_staff")?.elemental).not.toBeNull();
    expect(table.defaults).toEqual(BALANCE_DEFAULTS);
  });

  it("contribution: 지금 표와 고친 표(담은 변경), tuning.save가 받지 않을 묶음이면 그 까닭", async () => {
    const { services } = setup();
    const plain = await services.contribution({ primaries: flat(10), edits: [] });
    expect(plain.edited).toBeNull();
    expect(plain.problem).toBeNull();
    const edited = await services.contribution({
      primaries: flat(10),
      edits: [{ key: "hp.vit", value: 6000 }],
    });
    const hpOf = (table: typeof plain.current) => table.stats.find((row) => row.id === "hp")?.plus.vit;
    expect(hpOf(edited.current)).toBe(30);
    expect(edited.edited && hpOf(edited.edited)).toBe(60);
    expect(edited.problem).toBeNull();
    const zeroWis = TEST_STAT_TABLE.filter((row) => (row.weights[5] ?? 0) !== 0).map((row) => ({
      key: `${row.id}.wis`,
      value: 0,
    }));
    const broken = await services.contribution({ primaries: flat(10), edits: zeroWis });
    expect(broken.edited?.worthless).toEqual(["wis"]);
    expect(broken.problem).toEqual({
      reason: "rules_conflict",
      key: null,
      problems: ["stat_primary_unused"],
    });
  });

  it("duels: 1차 6개 결과(두 편 차례 합침), 같은 입력이면 같은 결과, 담은 변경이 있으면 고친 표도", async () => {
    const { services } = setup();
    const first = await services.duels(viewer(), small());
    expect(first.current.map((row) => row.primary)).toEqual(["str", "vit", "int", "wis", "dex", "agi"]);
    expect(first.current.every((row) => row.runs === 2)).toBe(true);
    expect(first.edited).toBeNull();
    const again = await services.duels(viewer(), small());
    expect(again.current).toEqual(first.current);
    const edited = await services.duels(viewer(), small({ edits: [{ key: "hp.vit", value: 6000 }] }));
    expect(edited.edited).toHaveLength(6);
    expect(edited.settings).toEqual({ ...BALANCE_DEFAULTS, runs: 2, limitSec: 30 });
  });

  it("duels 거절: 상한 밖 설정·모르는 무기(BAD_REQUEST), 사용자 속도 제한·다른 대결이 도는 중(TOO_MANY_REQUESTS)", async () => {
    const { services } = setup({ duelCapacity: 1 });
    expect(await reasonOf(services.duels(viewer(), small({ runs: 3 })))).toEqual({
      code: "BAD_REQUEST",
      reason: "invalid_settings",
    });
    expect(await reasonOf(services.duels(viewer(), small({ runs: 40, limitSec: 300 })))).toEqual({
      code: "BAD_REQUEST",
      reason: "invalid_settings",
    });
    expect(await reasonOf(services.duels(viewer(), small({ weapon: "no_such_item" })))).toEqual({
      code: "BAD_REQUEST",
      reason: "unknown_weapon",
    });
    await services.duels(viewer(), small());
    expect(await reasonOf(services.duels(viewer(), small()))).toEqual({
      code: "TOO_MANY_REQUESTS",
      reason: "rate_limited",
    });
  });

  it("서버 전체 한 번에 하나: 앞 대결이 끝나기 전 다른 사람의 대결은 busy, 끝나면 다시 받는다", async () => {
    let release: () => void = noop;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inline = inlineDuelRunner();
    const { services } = setup({ runner: (job) => gate.then(() => inline(job)) });
    const running = services.duels(viewer("a"), small());
    expect(await reasonOf(services.duels(viewer("b"), small()))).toEqual({
      code: "TOO_MANY_REQUESTS",
      reason: "busy",
    });
    release();
    await running;
    await expect(services.duels(viewer("b"), small())).resolves.toMatchObject({ edited: null });
  });
});

describe("꼬임 가드", () => {
  it("요청 때 표: 대결 일은 시작할 때의 표·계수를 담는다(돌던 중에 덮어쓰기가 바뀌어도 그 일은 앞 표)", async () => {
    let captured: DuelJob | undefined;
    let release: () => void = noop;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { state, services } = setup({
      runner: (job) => {
        captured = job;
        return gate.then(() => runDuelJob(job));
      },
    });
    const before = state.statTable();
    const running = services.duels(viewer(), small());
    state.install([record("hp.vit", 9000, 3000)], 9);
    release();
    const result = await running;
    expect(captured?.tables.current).toEqual(before);
    expect(result.revision).toBe(0);
    expect(state.statTable().find((row) => row.id === "hp")?.weights[3]).toBe(9000);
  });

  it("진행 중인 전투: 사양(최대 HP 등)은 시작 자료·스냅숏에 고정되어 표를 바꿔도 다시 계산(복구)이 같고, 현재 값은 최대를 넘지 않는다", () => {
    const { state, roster } = setup();
    const sword = roster.combat.equipment.find((item) => item.id === "test_sword")?.weapon;
    if (!sword) throw new Error("test_sword");
    const specs = statFighterSpecs({ primaries: flat(40), weapon: sword, count: 2 }, state.statTable());
    const init = duelInit(specs, specs, 7, 32);
    const snapshots: string[] = [];
    const full = runBattle(init, [], (snapshot) => snapshots.push(snapshot));
    // 전투 도중에 가중치 표를 크게 바꾼다(HP를 낮춤) — 전투는 표를 읽지 않는다
    state.install([record("hp.vit", 100, 3000), record("hp.str", 100, 1500)], 1);
    const restored = restoreBattle(init, snapshots[0] ?? "");
    const resumed = restored.runToEnd([]);
    expect(snapshotBattle(resumed.state)).toBe(full.finalState);
    // 새 표로 만든 사양은 다르다(다음 전투부터만 든다)
    const lower = statFighterSpecs({ primaries: flat(40), weapon: sword, count: 2 }, state.statTable());
    expect(lower[0]?.maxHp).toBeLessThan(specs[0]?.maxHp ?? 0);
    const battle = createBattle(init);
    for (let i = 0; i < 300; i++) {
      battle.step([]);
      for (const unit of battle.state.units) {
        expect(unit.maxHp).toBe(specs[0]?.maxHp);
        expect(unit.hp).toBeLessThanOrEqual(unit.maxHp);
        expect(unit.shield).toBeLessThanOrEqual(unit.shieldHp);
        expect(unit.armor).toBeLessThanOrEqual(unit.armorHp);
      }
    }
  });

  it("캐시: 화면 자료(roster.combat)는 덮어쓰기 다음 읽기부터 새 표, 표가 같으면 같은 묶음", () => {
    const { state, roster } = setup();
    const spec = {
      kind: "human",
      initial: flat(10),
      kPm: null,
      level: 1,
      rebirths: 0,
      equipped: new Map(),
      innateSkills: [],
      source: "computed" as const,
    };
    const hpNow = () => bodyView(roster, spec).stats.secondary.find((row) => row.id === "hp")?.value;
    const combat = roster.combat;
    expect(roster.combat).toBe(combat);
    expect(hpNow()).toBe(92);
    state.install([record("hp.vit", 6000, 3000)], 1);
    expect(roster.combat).not.toBe(combat);
    expect(hpNow()).toBe(122);
    // 받아 둔 옛 묶음은 그대로(그 요청 안에서만 쓴다)
    expect(combat.statTable.find((row) => row.id === "hp")?.weights[3]).toBe(3000);
  });
});

describe("대결 워커", () => {
  it("워커 스레드 결과 = 같은 스레드 결과(같은 일)", async () => {
    const { roster, state } = setup();
    const unarmed = roster.combat.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon;
    if (!unarmed) throw new Error("unarmed");
    const job: DuelJob = {
      tables: { current: [...state.statTable()], edited: null },
      coefficients: (await import("@terra/sim")).TEST_COMBAT_COEFFICIENTS,
      primaries: flat(10),
      weapon: unarmed,
      count: 1,
      runs: 2,
      seed: 3,
      limitMs: 30_000,
      mapSize: 32,
    };
    const worker = workerDuelRunner({ workerUrl: new URL("./duelWorker.ts", import.meta.url) });
    expect(await worker(job)).toEqual(runDuelJob(job));
  });

  it("제한 시간이 지나면 워커를 끝내고 timeout", async () => {
    const { state } = setup();
    const job = {
      tables: { current: [...state.statTable()], edited: null },
      coefficients: (await import("@terra/sim")).TEST_COMBAT_COEFFICIENTS,
      primaries: flat(10),
      weapon: (await import("@terra/sim")).UNARMED,
      count: 3,
      runs: 40,
      seed: 1,
      limitMs: 60_000,
      mapSize: 32,
    } satisfies DuelJob;
    const worker = workerDuelRunner({
      workerUrl: new URL("./duelWorker.ts", import.meta.url),
      timeoutMs: 50,
    });
    await expect(worker(job)).rejects.toMatchObject({ reason: "timeout" });
  });
});
