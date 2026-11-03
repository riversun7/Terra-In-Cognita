import { type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import { TEST_COMBAT_CATALOG, TEST_COMBAT_COEFFICIENTS, createBattleMap } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  ARENA_SIZE,
  type ArenaJob,
  arenaInit,
  flatArena,
  runArenaBattle,
  runArenaMonteCarlo,
} from "./arena.ts";
import { type LabRules, buildLabUnit } from "./build.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};

const fighter = (patch: Partial<LabUnit> = {}): LabUnit => ({
  ...newLabUnit("human"),
  level: 30,
  weapon: { kind: "item", id: "test_sword", pm: 500 },
  ...patch,
});

const party = (units: LabUnit[]) => ({
  units: units.map((unit) => ({ spec: buildLabUnit(unit, rules).spec, row: unit.row, pos: unit.pos })),
  retreatHpPct: 0,
});

function job(a: LabUnit[], b: LabUnit[], patch: Partial<ArenaJob> = {}): ArenaJob {
  return {
    a: party(a),
    b: party(b),
    map: flatArena(),
    coefficients: TEST_COMBAT_COEFFICIENTS,
    limitMs: 120_000,
    seed: 1,
    ...patch,
  };
}

describe("전투장(팀 A 대 팀 B, 파티 하나씩 최대 6명)", () => {
  it("진형: 전열이 가운데 쪽, 후열이 뒤. 좌우로 마주 보고 같은 줄은 위아래로 벌린다. 편을 바꾸면 팀이 반대쪽", () => {
    const units = [fighter({ row: "front" }), fighter({ row: "back" }), fighter({ row: "front" })];
    const init = arenaInit(job(units, units), 1, false);
    const a = init.units.filter((unit) => unit.side === 1);
    const b = init.units.filter((unit) => unit.side === 2);
    expect(a).toHaveLength(3);
    const center = ARENA_SIZE / 2;
    expect(a[0]?.x).toBeLessThan(center);
    expect(b[0]?.x).toBeGreaterThanOrEqual(center);
    // 후열은 전열보다 멀다
    expect(Math.abs((a[1]?.x ?? 0) - center)).toBeGreaterThan(Math.abs((a[0]?.x ?? 0) - center));
    expect(a[0]?.y).not.toBe(a[2]?.y);
    // 칸이 겹치지 않는다
    const cells = new Set(init.units.map((unit) => unit.y * ARENA_SIZE + unit.x));
    expect(cells.size).toBe(init.units.length);
    // 팀 A ID는 편과 무관하게 1~, 팀 B는 101~
    const swapped = arenaInit(job(units, units), 1, true);
    expect(swapped.units.find((unit) => unit.id === 1)?.side).toBe(2);
    expect(init.parties.find((entry) => entry.id === 1)?.side).toBe(1);
    expect(() => createBattleMap(init.map)).not.toThrow();
  });

  it("자유 배치 좌표(pos): 9×6 배치 구역(x: -4..+4, y: 0..5)의 좌표대로 전투맵에 세운다", () => {
    const vWing = [
      fighter({ pos: { x: -4, y: 0 } }),
      fighter({ pos: { x: 4, y: 0 } }),
      fighter({ pos: { x: 0, y: 4 } }),
    ];
    const init = arenaInit(job(vWing, vWing), 1, false);
    const center = ARENA_SIZE / 2;
    const a = init.units.filter((unit) => unit.side === 1);
    const b = init.units.filter((unit) => unit.side === 2);
    // 서쪽 편(1): x = center - (4 + pos.y), y = center + pos.x
    expect({ x: a[0]?.x, y: a[0]?.y }).toEqual({ x: center - 4, y: center - 4 });
    expect({ x: a[1]?.x, y: a[1]?.y }).toEqual({ x: center - 4, y: center + 4 });
    expect({ x: a[2]?.x, y: a[2]?.y }).toEqual({ x: center - 8, y: center });
    // 동쪽 편(2): x = center + (4 + pos.y) - 1, y = center + pos.x
    expect({ x: b[0]?.x, y: b[0]?.y }).toEqual({ x: center + 3, y: center - 4 });
    expect({ x: b[2]?.x, y: b[2]?.y }).toEqual({ x: center + 7, y: center });
  });

  it("막힌 칸이면 가장 가까운 빈칸에 세운다", () => {
    const map = flatArena();
    const passable = new Uint8Array(map.passable);
    // 왼쪽 절반을 거의 막는다(한 줄만 열어 둠)
    for (let y = 0; y < ARENA_SIZE; y++)
      for (let x = 0; x < ARENA_SIZE / 2; x++) passable[y * ARENA_SIZE + x] = 0;
    for (let x = 0; x < ARENA_SIZE; x++) passable[3 * ARENA_SIZE + x] = 1;
    const init = arenaInit(job([fighter(), fighter()], [fighter()], { map: { ...map, passable } }), 1, false);
    for (const unit of init.units) expect(passable[unit.y * ARENA_SIZE + unit.x]).toBe(1);
  });

  it("한 판: 같은 입력이면 같은 결과. 사건 기록·유닛 요약(준 피해 합 ≤ 받은 피해 합, 쓰러뜨림)이 나온다", () => {
    const a = [fighter(), fighter({ row: "back" })];
    const b = [fighter({ initial: { str: 6, vit: 6, int: 6, wis: 6, dex: 6, agi: 6 } })];
    const first = runArenaBattle(job(a, b), 50);
    const second = runArenaBattle(job(a, b), 50);
    expect(second).toEqual(first);
    expect(first.winner).toBe("a");
    expect(first.units).toHaveLength(3);
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.events.length).toBeLessThanOrEqual(50);
    const dealt = first.units.filter((u) => u.team === "a").reduce((sum, u) => sum + u.dealt, 0);
    const taken = first.units.filter((u) => u.team === "b").reduce((sum, u) => sum + u.taken, 0);
    expect(dealt).toBe(taken);
    expect(first.units.find((u) => u.key === "b0")?.status).toBe("down");
    expect(first.units.filter((u) => u.team === "a").reduce((sum, u) => sum + u.kills, 0)).toBe(1);
  });

  it("시간 초과는 남은 몫 판정(D-467 229): 닿지 못하면 같음(이긴 팀 없음)", () => {
    const map = flatArena();
    const passable = new Uint8Array(map.passable);
    const cover = new Uint8Array(map.cover);
    for (let y = 0; y < ARENA_SIZE; y++) {
      passable[y * ARENA_SIZE + ARENA_SIZE / 2] = 0;
      cover[y * ARENA_SIZE + ARENA_SIZE / 2] = 2;
    }
    const result = runArenaBattle(
      job([fighter()], [fighter()], { map: { ...map, passable, cover }, limitMs: 30_000 }),
      10,
    );
    expect(result.reason).toBe("timeout");
    expect(result.winner).toBeNull();
    expect(result.remainingPm).toEqual({ a: 1000, b: 1000 });
  });

  it("몬테카를로: 편을 반씩 바꾼다. 같은 팀끼리면 승률이 50% 근처, 센 팀은 높다. 유닛 통계·중앙 시간", () => {
    const even = runArenaMonteCarlo(job([fighter()], [fighter()]), 20);
    expect(even.runs).toBe(20);
    expect(even.sides.normal.runs).toBe(10);
    expect(even.sides.swapped.runs).toBe(10);
    expect(even.teams.a.scorePm + even.teams.b.scorePm).toBe(1000);
    expect(even.teams.a.scorePm).toBeGreaterThanOrEqual(200);
    expect(even.teams.a.scorePm).toBeLessThanOrEqual(800);
    const strong = runArenaMonteCarlo(
      job([fighter(), fighter()], [fighter({ initial: { str: 5, vit: 5, int: 5, wis: 5, dex: 5, agi: 5 } })]),
      10,
    );
    expect(strong.teams.a.scorePm).toBeGreaterThan(800);
    expect(strong.units).toHaveLength(3);
    const b0 = strong.units.find((unit) => unit.key === "b0");
    expect(b0?.survivalPm).toBeLessThan(500);
    expect(strong.medianMs).toBeGreaterThan(0);
    expect(strong.avgMs).toBeGreaterThan(0);
  }, 60_000);
});
