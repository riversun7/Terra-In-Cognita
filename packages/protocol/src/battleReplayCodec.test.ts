import { describe, expect, it } from "vitest";
import {
  BATTLE_REPLAY_FORMAT_VERSION,
  REPLAY_EVENT_KINDS,
  type BattleReplay,
  type ReplayEvent,
  type ReplayUnitFrame,
  facingBetween,
} from "./battleReplay.ts";
import {
  decodeBattleReplay,
  encodeBattleReplay,
  replayFromBase64,
  replayToBase64,
} from "./battleReplayCodec.ts";
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from "./bytes.ts";
import { ProtocolError } from "./errors.ts";

const frame = (over: Partial<ReplayUnitFrame> = {}): ReplayUnitFrame => ({
  status: "alive",
  x: 3,
  y: 4,
  facing: 2,
  hp: 100,
  armor: 20,
  shield: 10,
  mp: 30,
  stamina: 1000,
  effects: [],
  cast: null,
  ...over,
});

/** 사건 종류를 모두 담은 작은 리플레이 */
function sample(): BattleReplay {
  const size = 32;
  const passable = new Uint8Array(size * size).fill(1);
  passable[5] = 0;
  const cover = new Uint8Array(size * size);
  cover[40] = 1;
  cover[41] = 2;
  const events: ReplayEvent[] = [
    { k: "move", t: 1, u: 0, x: 4, y: 4, facing: 2 },
    {
      k: "attack",
      t: 3,
      u: 0,
      target: 1,
      facing: 2,
      outcome: "hit",
      crit: true,
      physical: 25,
      elemental: 3,
      hp: 80,
      armor: 0,
      shield: 7,
    },
    {
      k: "attack",
      t: 3,
      u: 1,
      target: 0,
      facing: 6,
      outcome: "evade",
      crit: false,
      physical: 0,
      elemental: 0,
      hp: 100,
      armor: 20,
      shield: 10,
    },
    { k: "building", t: 4, u: 0, building: 9, damage: 30, durability: -5 },
    { k: "cast", t: 5, u: 1, skill: 0, target: 0, endTick: 13 },
    { k: "skill", t: 13, u: 1, skill: 0, target: 0, x: 4, y: 4, facing: 6 },
    { k: "projectile", t: 13, u: 1, target: 0, skill: 0 },
    {
      k: "skillHit",
      t: 13,
      u: 1,
      skill: 0,
      target: 0,
      outcome: "miss",
      crit: false,
      physical: 0,
      elemental: 0,
      hp: 100,
      armor: 20,
      shield: 10,
    },
    { k: "fizzle", t: 14, u: 1, skill: 0 },
    { k: "interrupt", t: 15, u: 1, skill: 0 },
    { k: "heal", t: 16, u: -1, target: 1, amount: 12, hp: 92, shieldGain: 0, shield: 0, effect: 1 },
    { k: "heal", t: 16, u: 0, target: 0, amount: 5, hp: 100, shieldGain: 4, shield: 10, effect: -1 },
    { k: "dot", t: 17, target: 1, effect: 0, amount: 5, hp: 87 },
    { k: "effectOn", t: 18, target: 1, effect: 0, stacks: 2, untilTick: 48 },
    { k: "effectOn", t: 18, target: 0, effect: 1, stacks: 1, untilTick: -1 },
    { k: "effectOff", t: 49, target: 1, effect: 0 },
    { k: "vitals", t: 50, u: 0, hp: 100, armor: 20, shield: 10, mp: 31, stamina: 999 },
    { k: "vision", t: 50, side: 2, u: 0, on: true },
    { k: "vision", t: 51, side: 2, u: 0, on: false },
    { k: "down", t: 60, u: 1 },
    { k: "retreat", t: 61, u: 0 },
    // 형식 2: 움직임 사건(docs/adr/2026-11-15-combat-moves.md 5절)
    { k: "motion", t: 61, u: 0, kind: "dash", fromX: 3, fromY: 4, x: 8, y: 4, facing: 2 },
    { k: "motion", t: 61, u: 1, kind: "knockback", fromX: 9, fromY: 4, x: 11, y: 4, facing: 6 },
    { k: "stealth", t: 61, u: 1, on: true, cause: "skill" },
    { k: "stealth", t: 61, u: 1, on: false, cause: "detected" },
    { k: "run", t: 61, u: 0, on: true },
    { k: "multishot", t: 61, u: 1, target: 0, skill: 0, shots: 3 },
    { k: "end", t: 62, winner: 1, reason: "wipe" },
  ];
  return {
    formatVersion: BATTLE_REPLAY_FORMAT_VERSION,
    simVersion: 4,
    seed: 0xdead_beef,
    tickMs: 100,
    kind: "normal",
    limitTicks: 6000,
    result: { winner: 1, reason: "wipe", endTick: 62 },
    arena: {
      size,
      ref: { mapKey: 2 ** 51 + 12_345, terrainVersion: "1.3.abcd0123.0f0f0f0f", originX: 96, originY: 112 },
      passable,
      cover,
      buildings: [{ id: 9, cells: [100, 101, 132, 133], durability: 500, nexus: true, gateSide: null }],
    },
    sides: [
      { id: 1, defender: false, edge: 3 },
      { id: 2, defender: true, edge: 1 },
    ],
    skills: [
      {
        id: "fire_bolt",
        shape: "projectile",
        damage: "elemental",
        element: 2,
        range: 6,
        radius: 0,
        castMs: 800,
        name: { ko: "화염구", en: "Fire Bolt" },
      },
    ],
    effects: [
      { id: "burn", kind: "dot", name: null },
      { id: "guard", kind: "buff", name: { ko: "수호", en: "Guard" } },
    ],
    units: [
      {
        id: 100_001,
        side: 1,
        party: 1,
        name: "A1",
        kind: "warrior",
        joinTick: 0,
        x: 3,
        y: 4,
        facing: 2,
        maxHp: 100,
        armorHp: 20,
        shieldHp: 10,
        mpMax: 30,
        staminaMax: 1000,
        range: 1,
        attack: "physical",
        moveIntervalMs: 1000,
        cyborg: true,
        air: false,
        skills: [],
      },
      {
        id: 200_001,
        side: 2,
        party: 1001,
        name: "",
        kind: "mage",
        joinTick: 2,
        x: 10,
        y: 4,
        facing: 6,
        maxHp: 100,
        armorHp: 0,
        shieldHp: 0,
        mpMax: 60,
        staminaMax: 500,
        range: 6,
        attack: "elemental",
        moveIntervalMs: 1000,
        cyborg: false,
        air: false,
        skills: [0],
      },
    ],
    keyframes: [
      { tick: 0, units: [frame(), frame({ status: "absent", x: 10, facing: 6 })] },
      {
        tick: 30,
        units: [
          frame({ effects: [{ effect: 1, stacks: 1, untilTick: -1 }], stealth: true, running: true }),
          frame({ x: 10, cast: { skill: 0, target: 0, endTick: 38 }, hp: Number.MAX_SAFE_INTEGER }),
        ],
      },
    ],
    events,
  };
}

describe("전투 리플레이 이진 형식", () => {
  it("모든 사건 종류를 담은 리플레이가 그대로 돌아온다", () => {
    const replay = sample();
    const bytes = encodeBattleReplay(replay);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x54, 0x43, 0x42, 0x52]);
    expect(decodeBattleReplay(bytes)).toEqual(replay);
  });

  it("모든 사건 종류 번호를 시험 자료가 쓴다(새 종류를 더하면 시험 자료에도)", () => {
    const used = new Set(sample().events.map((event) => event.k));
    expect(REPLAY_EVENT_KINDS.filter((kind) => !used.has(kind))).toEqual([]);
  });

  it("형식 1(움직임 사건·표지 없음) 리플레이도 읽는다", () => {
    const old = sample();
    const v1: BattleReplay = {
      ...old,
      formatVersion: 1,
      events: old.events.filter((event) => !["motion", "stealth", "run", "multishot"].includes(event.k)),
      keyframes: old.keyframes.map((keyframe) => ({
        ...keyframe,
        units: keyframe.units.map(({ stealth: _stealth, running: _running, ...rest }) => rest),
      })),
    };
    const bytes = encodeBattleReplay(v1);
    bytes[4] = 1;
    bytes[5] = 0;
    expect(decodeBattleReplay(bytes)).toEqual(v1);
  });

  it("base64로 tRPC에 싣고 다시 읽는다", () => {
    const bytes = encodeBattleReplay(sample());
    const text = replayToBase64(bytes);
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(replayFromBase64(text)).toEqual(bytes);
  });

  it("경기장 참조가 없는 평지도 읽는다", () => {
    const replay = { ...sample(), arena: { ...sample().arena, ref: null, buildings: [] } };
    expect(decodeBattleReplay(encodeBattleReplay(replay))).toEqual(replay);
  });

  it("마법 값·판이 틀리면 읽지 않는다", () => {
    const bytes = encodeBattleReplay(sample());
    const badMagic = bytes.slice();
    badMagic[0] = 0;
    expect(() => decodeBattleReplay(badMagic)).toThrow(ProtocolError);
    const badVersion = bytes.slice();
    badVersion[4] = 99;
    expect(() => decodeBattleReplay(badVersion)).toThrow(ProtocolError);
  });

  it("잘린 자료와 뒤에 남은 바이트는 읽지 않는다", () => {
    const bytes = encodeBattleReplay(sample());
    for (const cut of [5, 20, Math.floor(bytes.length / 2), bytes.length - 1])
      expect(() => decodeBattleReplay(bytes.subarray(0, cut))).toThrow(ProtocolError);
    const extra = new Uint8Array(bytes.length + 1);
    extra.set(bytes);
    expect(() => decodeBattleReplay(extra)).toThrow(ProtocolError);
  });

  it("없는 유닛·스킬 번호를 가리키는 사건은 쓰지도 읽지도 않는다", () => {
    const replay = sample();
    const bad = { ...replay, events: [{ k: "down", t: 1, u: 7 } as const] };
    expect(() => encodeBattleReplay(bad)).toThrow(RangeError);
    const badSkill = { ...replay, events: [{ k: "fizzle", t: 1, u: 0, skill: 3 } as const] };
    expect(() => encodeBattleReplay(badSkill)).toThrow(RangeError);
  });

  it("사건 틱이 거꾸로 가면 쓰지 않는다", () => {
    const replay = sample();
    const bad = {
      ...replay,
      events: [
        { k: "down", t: 5, u: 0 },
        { k: "down", t: 4, u: 1 },
      ] as const,
    };
    expect(() => encodeBattleReplay(bad)).toThrow(RangeError);
  });

  it("바라보는 쪽은 8방향이다(차이가 두 배를 넘으면 곧은 방향)", () => {
    expect(facingBetween(5, 5, 5, 1, 4)).toBe(0);
    expect(facingBetween(5, 5, 9, 1, 4)).toBe(1);
    expect(facingBetween(5, 5, 15, 6, 4)).toBe(2);
    expect(facingBetween(5, 5, 7, 8, 4)).toBe(3);
    expect(facingBetween(5, 5, 5, 9, 0)).toBe(4);
    expect(facingBetween(5, 5, 1, 9, 0)).toBe(5);
    expect(facingBetween(5, 5, 0, 5, 0)).toBe(6);
    expect(facingBetween(5, 5, 2, 2, 0)).toBe(7);
    expect(facingBetween(5, 5, 5, 5, 3)).toBe(3);
  });
});

describe("바이트 도우미", () => {
  it("UTF-8·base64를 전역 없이 바꾼다", () => {
    const utf8: [string, number[]][] = [
      ["", []],
      ["A1", [0x41, 0x31]],
      ["\u00e9", [0xc3, 0xa9]],
      ["화염구", [0xed, 0x99, 0x94, 0xec, 0x97, 0xbc, 0xea, 0xb5, 0xac]],
      ["\u{1f525}", [0xf0, 0x9f, 0x94, 0xa5]],
    ];
    for (const [text, bytes] of utf8) {
      expect(Array.from(utf8Encode(text))).toEqual(bytes);
      expect(utf8Decode(Uint8Array.from(bytes))).toBe(text);
    }
    const base64: [number[], string][] = [
      [[], ""],
      [[0x4d], "TQ=="],
      [[0x4d, 0x61], "TWE="],
      [[0x4d, 0x61, 0x6e], "TWFu"],
      [[0xff, 0xfe, 0x00, 0x01], "//4AAQ=="],
    ];
    for (const [bytes, text] of base64) {
      expect(bytesToBase64(Uint8Array.from(bytes))).toBe(text);
      expect(Array.from(base64ToBytes(text))).toEqual(bytes);
    }
    expect(() => base64ToBytes("abc")).toThrow(ProtocolError);
    expect(() => utf8Decode(Uint8Array.from([0xc3]))).toThrow(ProtocolError);
    expect(() => utf8Decode(Uint8Array.from([0xed, 0xa0, 0x80]))).toThrow(ProtocolError);
  });
});
