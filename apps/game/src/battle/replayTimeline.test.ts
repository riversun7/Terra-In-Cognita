import type { BattleReplay, ReplayEvent, ReplayUnit, ReplayUnitFrame } from "@terra/protocol/battleReplay";
import { describe, expect, it } from "vitest";
import { NUMBER_MS, createReplayTimeline } from "./replayTimeline.ts";

const unit = (over: Partial<ReplayUnit>): ReplayUnit => ({
  id: 1,
  side: 1,
  party: 1,
  name: "A1",
  kind: "warrior",
  joinTick: 0,
  x: 3,
  y: 4,
  facing: 2,
  maxHp: 100,
  armorHp: 10,
  shieldHp: 10,
  mpMax: 50,
  staminaMax: 100,
  range: 1,
  attack: "physical",
  moveIntervalMs: 1000,
  cyborg: false,
  air: false,
  skills: [],
  ...over,
});

const frameOf = (row: ReplayUnit): ReplayUnitFrame => ({
  status: "alive",
  x: row.x,
  y: row.y,
  facing: row.facing,
  hp: row.maxHp,
  armor: row.armorHp,
  shield: row.shieldHp,
  mp: row.mpMax,
  stamina: row.staminaMax,
  effects: [],
  cast: null,
});

const hit = { crit: false, armor: 0, shield: 0 };

/** 편마다 둘: A1(0)·A2(1) 서쪽, B1(2)·B2(3) 동쪽. 스킬 표: 0 화살(투사체·불), 1 폭발(범위 2), 2 번개 사슬(연쇄), 3 치유(회복) */
function replay(): BattleReplay {
  const units = [
    unit({ id: 1, name: "A1", x: 3, y: 4 }),
    unit({ id: 2, name: "A2", x: 3, y: 6, range: 6, attack: "elemental", skills: [0, 1, 2, 3] }),
    unit({ id: 3, side: 2, party: 2, name: "B1", x: 10, y: 4, facing: 6 }),
    unit({ id: 4, side: 2, party: 2, name: "B2", x: 10, y: 6, facing: 6 }),
  ];
  const events: ReplayEvent[] = [
    { k: "vision", t: 0, side: 1, u: 2, on: true },
    { k: "move", t: 9, u: 0, x: 4, y: 4, facing: 2 },
    {
      k: "attack",
      t: 10,
      u: 0,
      target: 2,
      facing: 2,
      outcome: "hit",
      physical: 20,
      elemental: 0,
      hp: 80,
      ...hit,
    },
    {
      k: "attack",
      t: 11,
      u: 2,
      target: 0,
      facing: 6,
      outcome: "evade",
      physical: 0,
      elemental: 0,
      hp: 100,
      ...hit,
    },
    { k: "cast", t: 12, u: 1, skill: 0, target: 3, endTick: 20 },
    { k: "projectile", t: 20, u: 1, target: 3, skill: 0 },
    { k: "skill", t: 20, u: 1, skill: 0, target: 3, x: 10, y: 6, facing: 2 },
    {
      k: "skillHit",
      t: 20,
      u: 1,
      skill: 0,
      target: 3,
      outcome: "hit",
      physical: 0,
      elemental: 30,
      hp: 70,
      ...hit,
      crit: true,
    },
    { k: "skill", t: 30, u: 1, skill: 1, target: 2, x: 10, y: 4, facing: 2 },
    {
      k: "skillHit",
      t: 30,
      u: 1,
      skill: 1,
      target: 2,
      outcome: "hit",
      physical: 5,
      elemental: 15,
      hp: 60,
      ...hit,
    },
    { k: "skill", t: 40, u: 1, skill: 2, target: 2, x: 10, y: 4, facing: 2 },
    {
      k: "skillHit",
      t: 40,
      u: 1,
      skill: 2,
      target: 2,
      outcome: "hit",
      physical: 0,
      elemental: 60,
      hp: 0,
      ...hit,
    },
    {
      k: "skillHit",
      t: 40,
      u: 1,
      skill: 2,
      target: 3,
      outcome: "miss",
      physical: 0,
      elemental: 0,
      hp: 70,
      ...hit,
    },
    { k: "down", t: 40, u: 2 },
    { k: "skill", t: 45, u: 1, skill: 3, target: 1, x: 3, y: 6, facing: 2 },
    { k: "heal", t: 45, u: 1, target: 0, amount: 0, hp: 100, shieldGain: 6, shield: 10, effect: -1 },
    { k: "vitals", t: 49, u: 1, hp: 100, armor: 10, shield: 10, mp: 5, stamina: 90 },
    { k: "end", t: 60, winner: 1, reason: "wipe" },
  ];
  return {
    formatVersion: 1,
    simVersion: 4,
    seed: 1,
    tickMs: 100,
    kind: "normal",
    limitTicks: 6000,
    result: { winner: 1, reason: "wipe", endTick: 60 },
    arena: {
      size: 32,
      ref: null,
      passable: new Uint8Array(1024).fill(1),
      cover: new Uint8Array(1024),
      buildings: [],
    },
    sides: [
      { id: 1, defender: false, edge: 3 },
      { id: 2, defender: true, edge: 1 },
    ],
    skills: [
      {
        id: "bolt",
        shape: "projectile",
        damage: "elemental",
        element: 2,
        range: 6,
        radius: 0,
        castMs: 800,
        name: null,
      },
      {
        id: "blast",
        shape: "area",
        damage: "elemental",
        element: 3,
        range: 6,
        radius: 2,
        castMs: 0,
        name: null,
      },
      {
        id: "arc",
        shape: "chain",
        damage: "elemental",
        element: 5,
        range: 6,
        radius: 0,
        castMs: 0,
        name: null,
      },
      { id: "mend", shape: "heal", damage: "none", element: -1, range: 0, radius: 0, castMs: 0, name: null },
    ],
    effects: [],
    units,
    keyframes: [{ tick: 0, units: units.map(frameOf) }],
    events,
  };
}

describe("리플레이 해석", () => {
  it("걸음은 새 칸에 판정 시각에 닿게 앞 걸음 간격 동안 옮겨 간다", () => {
    const timeline = createReplayTimeline(replay());
    // move t=9 → 닿는 시각 (9 + 1) × 100 = 1000ms, 걸음 간격 1000ms
    expect(timeline.unitsAt(0)[0]).toMatchObject({ x: 3.5, y: 4.5 });
    expect(timeline.unitsAt(500)[0]).toMatchObject({ x: 4, y: 4.5, facing: 2 });
    expect(timeline.unitsAt(1000)[0]).toMatchObject({ x: 4.5, y: 4.5 });
  });

  it("틱 T의 사건은 (T + 1) × 틱부터 보인다", () => {
    const timeline = createReplayTimeline(replay());
    expect(timeline.unitsAt(1099)[2]?.hp).toBe(100);
    expect(timeline.unitsAt(1100)[2]?.hp).toBe(80);
    expect(timeline.unitsAt(4100)[2]?.status).toBe("down");
    expect(timeline.unitsAt(5000)[1]).toMatchObject({ mp: 5, stamina: 90 });
  });

  it("떠오르는 숫자: 크리·속성 몫을 나누고, 빗나감·회피는 글자, 수명이 지나면 사라진다", () => {
    const timeline = createReplayTimeline(replay());
    expect(timeline.numbersAt(1100)).toEqual([
      expect.objectContaining({ unit: 2, kind: "damage", value: 20, age: 0 }),
    ]);
    expect(timeline.numbersAt(1200).map((n) => n.kind)).toEqual(["damage", "evade"]);
    expect(timeline.numbersAt(2100).filter((n) => n.unit === 3)).toEqual([
      expect.objectContaining({ kind: "elemental", value: 30, crit: true }),
    ]);
    expect(
      timeline
        .numbersAt(3100)
        .filter((n) => n.unit === 2)
        .map((n) => [n.kind, n.value]),
    ).toEqual([
      ["damage", 5],
      ["elemental", 15],
    ]);
    expect(timeline.numbersAt(1100 + NUMBER_MS).some((n) => n.value === 20)).toBe(false);
    // 쉴드 회복(회복 사건의 shieldGain)은 쉴드 숫자, 오른 체력 0은 숫자 없음
    expect(
      timeline
        .numbersAt(4600)
        .filter((n) => n.unit === 0)
        .map((n) => [n.kind, n.value]),
    ).toEqual([["shield", 6]]);
  });

  it("투사체는 맞는 시각에 닿게 앞서 날고, 범위는 고리, 연쇄는 맞은 차례대로 빔, 시전은 차오르는 고리", () => {
    const timeline = createReplayTimeline(replay());
    const flying = timeline.fxAt(2000).find((fx) => fx.kind === "projectile");
    expect(flying).toMatchObject({
      fromX: 3.5,
      fromY: 6.5,
      toX: 10.5,
      toY: 6.5,
      tone: { kind: "element", element: 2 },
    });
    expect(flying?.kind === "projectile" ? flying.progress : -1).toBeGreaterThan(0);
    expect(timeline.fxAt(2100).some((fx) => fx.kind === "projectile")).toBe(false);
    expect(timeline.fxAt(2100).some((fx) => fx.kind === "flash")).toBe(true);
    expect(timeline.fxAt(3200).find((fx) => fx.kind === "ring")).toMatchObject({
      x: 10.5,
      y: 4.5,
      radiusCells: 2,
    });
    const beams = timeline.fxAt(4150).filter((fx) => fx.kind === "beam");
    expect(beams).toHaveLength(2);
    expect(beams[1]).toMatchObject({ fromX: 10.5, fromY: 4.5, toX: 10.5, toY: 6.5 });
    // 시전 t=12~20: 1300ms에 시작해 2100ms에 끝난다
    const charge = timeline.fxAt(1700).find((fx) => fx.kind === "ring" && fx.radiusCells === 0);
    expect(charge?.kind === "ring" ? charge.progress : -1).toBeCloseTo(0.5, 5);
    expect(timeline.fxAt(4600).some((fx) => fx.kind === "glow" && fx.tone.kind === "heal")).toBe(true);
  });

  it("되감고 건너뛰어도 같은 시각이면 같은 모습", () => {
    const timeline = createReplayTimeline(replay());
    const fresh = (ms: number) => createReplayTimeline(replay()).unitsAt(ms);
    for (const ms of [5000, 300, 4150, 4149, 2100, 0, 6100, 1000])
      expect(timeline.unitsAt(ms)).toEqual(fresh(ms));
  });

  it("기록 줄·시야·끝 요약", () => {
    const timeline = createReplayTimeline(replay());
    expect(timeline.logCountAt(1100)).toBe(1);
    expect(timeline.logAt(6100, 3).map((index) => timeline.replay.events[index]?.k)).toEqual([
      "skill",
      "heal",
      "end",
    ]);
    expect(timeline.visibleTo(1, 2, 50)).toBe(false);
    expect(timeline.visibleTo(1, 2, 100)).toBe(true);
    expect(timeline.visibleTo(1, 3, 100)).toBe(false);
    expect(timeline.visibleTo(2, 3, 0)).toBe(true);
    const summary = timeline.summary();
    expect(summary.durationMs).toBe(6000);
    expect(summary.units[1]).toMatchObject({ dealt: 110, kills: 1 });
    expect(summary.units[2]).toMatchObject({ taken: 100, status: "down" });
    expect(summary.sides).toEqual([
      expect.objectContaining({ side: 1, alive: 2, down: 0, dealt: 130 }),
      expect.objectContaining({ side: 2, alive: 1, down: 1 }),
    ]);
  });
});
