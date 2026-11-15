// 전투 리플레이 이진 부호화 — docs/adr/2026-11-01-battle-replay.md 2절. 모양은 battleReplay.ts.
// 브라우저·Node 공통(TextEncoder·DataView 없이 바이트 배열만). 배치:
//   0  u8×4  마법 값 "TCBR"
//   4  u16   형식 판(작은 끝)
//   6~       가변 길이 정수 흐름: 부호 없는 값은 7비트씩(LEB128, 2^53 미만), 부호 있는 값은 지그재그 뒤 같은 방식.
//            사건 틱은 앞 사건과의 차이, 건물 칸 번호는 앞 칸과의 차이, 통과·엄폐 층은 (값, 길이) 연속 길이, 글자는 UTF-8.
//            자원(vitals) 사건의 다섯 값은 그 유닛의 앞 vitals 사건(없으면 첫 키프레임) 값과의 차이(지그재그)다.
// 쓰기는 번호·범위가 틀린 리플레이를 RangeError로, 읽기는 틀린 바이트를 ProtocolError로 거절한다.
import {
  BATTLE_REPLAY_FORMAT_VERSION,
  BATTLE_REPLAY_MAGIC,
  BATTLE_REPLAY_MIN_FORMAT_VERSION,
  REPLAY_MOTION_KINDS,
  REPLAY_STEALTH_CAUSES,
  type BattleReplay,
  REPLAY_DAMAGE_KINDS,
  REPLAY_EFFECT_KINDS,
  REPLAY_END_REASONS,
  REPLAY_EVENT_KINDS,
  REPLAY_OUTCOMES,
  REPLAY_SKILL_SHAPES,
  REPLAY_UNIT_STATUSES,
  type ReplayArena,
  type ReplayEvent,
  type ReplayHit,
  type ReplayKeyframe,
  type ReplayName,
  type ReplayUnit,
  type ReplayUnitFrame,
} from "./battleReplay.ts";
import { base64ToBytes, bytesToBase64 } from "./bytes.ts";
import { Reader, Writer, readLayer, writeLayer } from "./binaryStream.ts";
import { ProtocolError } from "./errors.ts";

/** 쓰기 쪽 번호 검사 */
function checkIndex(value: number, size: number, what: string, allowNone = false): number {
  if (allowNone && value === -1) return value;
  if (!Number.isInteger(value) || value < 0 || value >= size)
    throw new RangeError(`${what} out of range: ${value}`);
  return value;
}

function codeOf<T>(values: readonly T[], value: T, what: string): number {
  const code = values.indexOf(value);
  if (code < 0) throw new RangeError(`unknown ${what}: ${String(value)}`);
  return code;
}

function writeName(w: Writer, name: ReplayName | null): void {
  w.u8(name ? 1 : 0);
  if (name) {
    w.str(name.ko);
    w.str(name.en);
  }
}

function readName(r: Reader): ReplayName | null {
  return r.bool() ? { ko: r.str(), en: r.str() } : null;
}

function writeArena(w: Writer, arena: ReplayArena): void {
  w.uvar(arena.size);
  w.u8(arena.ref ? 1 : 0);
  if (arena.ref) {
    w.uvar(arena.ref.mapKey);
    w.str(arena.ref.terrainVersion);
    w.uvar(arena.ref.originX);
    w.uvar(arena.ref.originY);
  }
  const cells = arena.size * arena.size;
  writeLayer(w, arena.passable, cells);
  writeLayer(w, arena.cover, cells);
  w.uvar(arena.buildings.length);
  for (const building of arena.buildings) {
    w.svar(building.id);
    w.svar(building.durability);
    w.u8(building.nexus ? 1 : 0);
    w.u8(building.gateSide === null ? 0 : 1);
    if (building.gateSide !== null) w.svar(building.gateSide);
    w.uvar(building.cells.length);
    let previous = -1;
    for (const cell of building.cells) {
      if (cell <= previous || cell >= cells)
        throw new RangeError("building cells must be ascending and inside");
      w.uvar(cell - previous - 1);
      previous = cell;
    }
  }
}

function readArena(r: Reader): ReplayArena {
  const size = r.uvar();
  if (size < 1 || size > 1024) throw new ProtocolError("battle replay arena size out of range");
  const ref = r.bool()
    ? { mapKey: r.uvar(), terrainVersion: r.str(), originX: r.uvar(), originY: r.uvar() }
    : null;
  const cells = size * size;
  const passable = readLayer(r, cells);
  const cover = readLayer(r, cells);
  const buildings = Array.from({ length: r.count() }, () => {
    const id = r.svar();
    const durability = r.svar();
    const nexus = r.bool();
    const gateSide = r.bool() ? r.svar() : null;
    let previous = -1;
    const list = Array.from({ length: r.count() }, () => {
      previous += r.uvar() + 1;
      if (previous >= cells) throw new ProtocolError("battle replay building cell out of range");
      return previous;
    });
    return { id, cells: list, durability, nexus, gateSide };
  });
  return { size, ref, passable, cover, buildings };
}

function writeUnit(w: Writer, unit: ReplayUnit, skillCount: number): void {
  w.svar(unit.id);
  w.svar(unit.side);
  w.svar(unit.party);
  w.str(unit.name);
  w.str(unit.kind);
  w.uvar(unit.joinTick);
  w.uvar(unit.x);
  w.uvar(unit.y);
  w.u8(unit.facing);
  for (const value of [unit.maxHp, unit.armorHp, unit.shieldHp, unit.mpMax, unit.staminaMax, unit.range])
    w.uvar(value);
  w.u8(unit.attack === "elemental" ? 1 : 0);
  w.uvar(unit.moveIntervalMs);
  w.u8((unit.cyborg ? 1 : 0) + (unit.air ? 2 : 0));
  w.uvar(unit.skills.length);
  for (const skill of unit.skills) w.uvar(checkIndex(skill, skillCount, "unit skill"));
}

function readUnit(r: Reader, skillCount: number): ReplayUnit {
  const id = r.svar();
  const side = r.svar();
  const party = r.svar();
  const name = r.str();
  const kind = r.str();
  const joinTick = r.uvar();
  const x = r.uvar();
  const y = r.uvar();
  const facing = r.facing();
  const [maxHp = 0, armorHp = 0, shieldHp = 0, mpMax = 0, staminaMax = 0, range = 0] = Array.from(
    { length: 6 },
    () => r.uvar(),
  );
  const attack = r.u8() === 1 ? "elemental" : "physical";
  const moveIntervalMs = r.uvar();
  const flags = r.u8();
  if (flags > 3) throw new ProtocolError("battle replay unit flags out of range");
  const skills = Array.from({ length: r.count() }, () => r.index(skillCount));
  return {
    id,
    side,
    party,
    name,
    kind,
    joinTick,
    x,
    y,
    facing,
    maxHp,
    armorHp,
    shieldHp,
    mpMax,
    staminaMax,
    range,
    attack,
    moveIntervalMs,
    cyborg: (flags & 1) !== 0,
    air: (flags & 2) !== 0,
    skills,
  };
}

interface Sizes {
  readonly units: number;
  readonly skills: number;
  readonly effects: number;
  /** 유닛마다 앞 vitals 값(체력·아머·쉴드·MP·스태미나). 쓰기·읽기가 같은 차례로 고친다 */
  readonly vitals: number[][];
}

const VITAL_FIELDS = ["hp", "armor", "shield", "mp", "stamina"] as const;

/** 첫 키프레임 값(없으면 0)에서 시작하는 vitals 기준 */
function vitalsBase(units: number, keyframe: ReplayKeyframe | undefined): number[][] {
  return Array.from({ length: units }, (_, index) => {
    const frame = keyframe?.units[index];
    return frame ? VITAL_FIELDS.map((field) => frame[field]) : [0, 0, 0, 0, 0];
  });
}

/** 키프레임 상태 바이트: 아래 2비트 = 상태 코드, 4 = 은신, 8 = 달리기(형식 2. 형식 1 바이트는 표지 비트가 0이다) */
const FRAME_STEALTH = 4;
const FRAME_RUNNING = 8;

function writeFrame(w: Writer, unit: ReplayUnitFrame, sizes: Sizes): void {
  w.u8(
    codeOf(REPLAY_UNIT_STATUSES, unit.status, "unit status") +
      (unit.stealth ? FRAME_STEALTH : 0) +
      (unit.running ? FRAME_RUNNING : 0),
  );
  w.uvar(unit.x);
  w.uvar(unit.y);
  w.u8(unit.facing);
  for (const value of [unit.hp, unit.armor, unit.shield, unit.mp, unit.stamina]) w.uvar(value);
  w.uvar(unit.effects.length);
  for (const effect of unit.effects) {
    w.uvar(checkIndex(effect.effect, sizes.effects, "frame effect"));
    w.uvar(effect.stacks);
    w.svar(effect.untilTick);
  }
  w.u8(unit.cast ? 1 : 0);
  if (unit.cast) {
    w.uvar(checkIndex(unit.cast.skill, sizes.skills, "frame cast skill"));
    w.uvar(checkIndex(unit.cast.target, sizes.units, "frame cast target"));
    w.uvar(unit.cast.endTick);
  }
}

function readFrame(r: Reader, sizes: Sizes): ReplayUnitFrame {
  const byte = r.u8();
  const status = REPLAY_UNIT_STATUSES[byte & 3];
  if (status === undefined || byte > 15) throw new ProtocolError("battle replay frame status out of range");
  const x = r.uvar();
  const y = r.uvar();
  const facing = r.facing();
  const [hp = 0, armor = 0, shield = 0, mp = 0, stamina = 0] = Array.from({ length: 5 }, () => r.uvar());
  const effects = Array.from({ length: r.count() }, () => ({
    effect: r.index(sizes.effects),
    stacks: r.uvar(),
    untilTick: r.svar(),
  }));
  const cast = r.bool()
    ? { skill: r.index(sizes.skills), target: r.index(sizes.units), endTick: r.uvar() }
    : null;
  return {
    status,
    x,
    y,
    facing,
    hp,
    armor,
    shield,
    mp,
    stamina,
    effects,
    cast,
    ...((byte & FRAME_STEALTH) !== 0 ? { stealth: true as const } : {}),
    ...((byte & FRAME_RUNNING) !== 0 ? { running: true as const } : {}),
  };
}

function writeHit(w: Writer, hit: ReplayHit): void {
  w.u8(codeOf(REPLAY_OUTCOMES, hit.outcome, "outcome") + (hit.crit ? 4 : 0));
  for (const value of [hit.physical, hit.elemental, hit.hp, hit.armor, hit.shield]) w.uvar(value);
}

function readHit(r: Reader): ReplayHit {
  const flags = r.u8();
  const outcome = REPLAY_OUTCOMES[flags % 4];
  if (outcome === undefined || flags > 7) throw new ProtocolError("battle replay hit flags out of range");
  const [physical = 0, elemental = 0, hp = 0, armor = 0, shield = 0] = Array.from({ length: 5 }, () =>
    r.uvar(),
  );
  return { outcome, crit: flags >= 4, physical, elemental, hp, armor, shield };
}

function writeEvent(w: Writer, e: ReplayEvent, s: Sizes): void {
  const unit = (value: number) => w.uvar(checkIndex(value, s.units, `${e.k} unit`));
  const skill = (value: number, allowNone = false) =>
    allowNone
      ? w.svar(checkIndex(value, s.skills, `${e.k} skill`, true))
      : w.uvar(checkIndex(value, s.skills, `${e.k} skill`));
  const effect = (value: number, allowNone = false) =>
    allowNone
      ? w.svar(checkIndex(value, s.effects, `${e.k} effect`, true))
      : w.uvar(checkIndex(value, s.effects, `${e.k} effect`));
  switch (e.k) {
    case "move":
      unit(e.u);
      w.uvar(e.x);
      w.uvar(e.y);
      w.u8(e.facing);
      return;
    case "attack":
      unit(e.u);
      unit(e.target);
      w.u8(e.facing);
      writeHit(w, e);
      return;
    case "building":
      unit(e.u);
      w.svar(e.building);
      w.uvar(e.damage);
      w.svar(e.durability);
      return;
    case "cast":
      unit(e.u);
      skill(e.skill);
      unit(e.target);
      w.uvar(e.endTick - e.t);
      return;
    case "skill":
      unit(e.u);
      skill(e.skill);
      unit(e.target);
      w.uvar(e.x);
      w.uvar(e.y);
      w.u8(e.facing);
      return;
    case "skillHit":
      unit(e.u);
      skill(e.skill);
      unit(e.target);
      writeHit(w, e);
      return;
    case "fizzle":
    case "interrupt":
      unit(e.u);
      skill(e.skill);
      return;
    case "projectile":
      unit(e.u);
      unit(e.target);
      skill(e.skill, true);
      return;
    case "heal":
      w.svar(checkIndex(e.u, s.units, "heal source", true));
      unit(e.target);
      w.uvar(e.amount);
      w.uvar(e.hp);
      w.uvar(e.shieldGain);
      w.uvar(e.shield);
      effect(e.effect, true);
      return;
    case "dot":
      unit(e.target);
      effect(e.effect);
      w.uvar(e.amount);
      w.uvar(e.hp);
      return;
    case "effectOn":
      unit(e.target);
      effect(e.effect);
      w.uvar(e.stacks);
      w.svar(e.untilTick);
      return;
    case "effectOff":
      unit(e.target);
      effect(e.effect);
      return;
    case "down":
    case "retreat":
      unit(e.u);
      return;
    case "vitals": {
      unit(e.u);
      const base = s.vitals[e.u] ?? [0, 0, 0, 0, 0];
      VITAL_FIELDS.forEach((field, index) => {
        if (!Number.isSafeInteger(e[field]) || e[field] < 0)
          throw new RangeError(`vitals ${field} out of range`);
        w.svar(e[field] - (base[index] ?? 0));
        base[index] = e[field];
      });
      return;
    }
    case "vision":
      w.svar(e.side);
      unit(e.u);
      w.u8(e.on ? 1 : 0);
      return;
    case "end":
      w.svar(e.winner);
      w.u8(codeOf(REPLAY_END_REASONS, e.reason, "end reason"));
      return;
    case "motion":
      unit(e.u);
      w.u8(codeOf(REPLAY_MOTION_KINDS, e.kind, "motion kind"));
      w.uvar(e.fromX);
      w.uvar(e.fromY);
      w.uvar(e.x);
      w.uvar(e.y);
      w.u8(e.facing);
      return;
    case "stealth":
      unit(e.u);
      w.u8((e.on ? 1 : 0) + 2 * codeOf(REPLAY_STEALTH_CAUSES, e.cause, "stealth cause"));
      return;
    case "run":
      unit(e.u);
      w.u8(e.on ? 1 : 0);
      return;
    case "multishot":
      unit(e.u);
      unit(e.target);
      skill(e.skill);
      if (!Number.isInteger(e.shots) || e.shots < 1 || e.shots > 255)
        throw new RangeError(`multishot shots out of range: ${e.shots}`);
      w.u8(e.shots);
      return;
    default: {
      const unknown: never = e;
      throw new RangeError(`unknown replay event ${String(unknown)}`);
    }
  }
}

function readEvent(r: Reader, k: ReplayEvent["k"], t: number, s: Sizes): ReplayEvent {
  const unit = () => r.index(s.units);
  const skill = () => r.index(s.skills);
  const effect = () => r.index(s.effects);
  switch (k) {
    case "move":
      return { k, t, u: unit(), x: r.uvar(), y: r.uvar(), facing: r.facing() };
    case "attack":
      return { k, t, u: unit(), target: unit(), facing: r.facing(), ...readHit(r) };
    case "building":
      return { k, t, u: unit(), building: r.svar(), damage: r.uvar(), durability: r.svar() };
    case "cast": {
      const u = unit();
      const castSkill = skill();
      const target = unit();
      return { k, t, u, skill: castSkill, target, endTick: t + r.uvar() };
    }
    case "skill":
      return {
        k,
        t,
        u: unit(),
        skill: skill(),
        target: unit(),
        x: r.uvar(),
        y: r.uvar(),
        facing: r.facing(),
      };
    case "skillHit":
      return { k, t, u: unit(), skill: skill(), target: unit(), ...readHit(r) };
    case "fizzle":
    case "interrupt":
      return { k, t, u: unit(), skill: skill() };
    case "projectile":
      return { k, t, u: unit(), target: unit(), skill: r.index(s.skills, true) };
    case "heal":
      return {
        k,
        t,
        u: r.index(s.units, true),
        target: unit(),
        amount: r.uvar(),
        hp: r.uvar(),
        shieldGain: r.uvar(),
        shield: r.uvar(),
        effect: r.index(s.effects, true),
      };
    case "dot":
      return { k, t, target: unit(), effect: effect(), amount: r.uvar(), hp: r.uvar() };
    case "effectOn":
      return { k, t, target: unit(), effect: effect(), stacks: r.uvar(), untilTick: r.svar() };
    case "effectOff":
      return { k, t, target: unit(), effect: effect() };
    case "down":
    case "retreat":
      return { k, t, u: unit() };
    case "vitals": {
      const u = unit();
      const base = s.vitals[u] ?? [0, 0, 0, 0, 0];
      const [hp = 0, armor = 0, shield = 0, mp = 0, stamina = 0] = VITAL_FIELDS.map((_, index) => {
        const value = (base[index] ?? 0) + r.svar();
        if (!Number.isSafeInteger(value) || value < 0)
          throw new ProtocolError("battle replay vitals out of range");
        base[index] = value;
        return value;
      });
      return { k, t, u, hp, armor, shield, mp, stamina };
    }
    case "vision":
      return { k, t, side: r.svar(), u: unit(), on: r.bool() };
    case "end":
      return { k, t, winner: r.svar(), reason: r.pick(REPLAY_END_REASONS) };
    case "motion":
      return {
        k,
        t,
        u: unit(),
        kind: r.pick(REPLAY_MOTION_KINDS),
        fromX: r.uvar(),
        fromY: r.uvar(),
        x: r.uvar(),
        y: r.uvar(),
        facing: r.facing(),
      };
    case "stealth": {
      const u = unit();
      const byte = r.u8();
      const cause = REPLAY_STEALTH_CAUSES[byte >> 1];
      if (cause === undefined) throw new ProtocolError("battle replay stealth cause out of range");
      return { k, t, u, on: (byte & 1) !== 0, cause };
    }
    case "run":
      return { k, t, u: unit(), on: r.bool() };
    case "multishot": {
      const u = unit();
      const target = unit();
      const shotSkill = skill();
      const shots = r.u8();
      if (shots < 1) throw new ProtocolError("battle replay multishot shots out of range");
      return { k, t, u, target, skill: shotSkill, shots };
    }
    default: {
      const unknown: never = k;
      throw new ProtocolError(`unknown replay event ${String(unknown)}`);
    }
  }
}

export function encodeBattleReplay(replay: BattleReplay): Uint8Array {
  const w = new Writer();
  for (const byte of BATTLE_REPLAY_MAGIC) w.u8(byte);
  w.u8(BATTLE_REPLAY_FORMAT_VERSION & 0xff);
  w.u8(BATTLE_REPLAY_FORMAT_VERSION >> 8);
  w.uvar(replay.simVersion);
  w.uvar(replay.seed);
  w.uvar(replay.tickMs);
  w.u8(replay.kind === "siege" ? 1 : 0);
  w.uvar(replay.limitTicks);
  w.svar(replay.result.winner);
  w.u8(codeOf(REPLAY_END_REASONS, replay.result.reason, "end reason"));
  w.uvar(replay.result.endTick);
  writeArena(w, replay.arena);
  w.uvar(replay.sides.length);
  for (const side of replay.sides) {
    w.svar(side.id);
    w.u8(side.defender ? 1 : 0);
    w.u8(side.edge);
  }
  w.uvar(replay.skills.length);
  for (const skill of replay.skills) {
    w.str(skill.id);
    w.u8(codeOf(REPLAY_SKILL_SHAPES, skill.shape, "skill shape"));
    w.u8(codeOf(REPLAY_DAMAGE_KINDS, skill.damage, "damage kind"));
    w.svar(skill.element);
    w.uvar(skill.range);
    w.uvar(skill.radius);
    w.uvar(skill.castMs);
    writeName(w, skill.name);
  }
  w.uvar(replay.effects.length);
  for (const effect of replay.effects) {
    w.str(effect.id);
    w.u8(codeOf(REPLAY_EFFECT_KINDS, effect.kind, "effect kind"));
    writeName(w, effect.name);
  }
  const sizes: Sizes = {
    units: replay.units.length,
    skills: replay.skills.length,
    effects: replay.effects.length,
    vitals: vitalsBase(replay.units.length, replay.keyframes[0]),
  };
  w.uvar(replay.units.length);
  for (const unit of replay.units) writeUnit(w, unit, sizes.skills);
  w.uvar(replay.keyframes.length);
  let lastTick = 0;
  for (const keyframe of replay.keyframes) {
    if (keyframe.tick < lastTick) throw new RangeError("keyframes must be in tick order");
    if (keyframe.units.length !== sizes.units) throw new RangeError("keyframe must list every unit");
    w.uvar(keyframe.tick - lastTick);
    lastTick = keyframe.tick;
    for (const unit of keyframe.units) writeFrame(w, unit, sizes);
  }
  w.uvar(replay.events.length);
  lastTick = 0;
  for (const event of replay.events) {
    if (!Number.isInteger(event.t) || event.t < lastTick)
      throw new RangeError("events must be in tick order");
    w.uvar(event.t - lastTick);
    lastTick = event.t;
    w.u8(codeOf(REPLAY_EVENT_KINDS, event.k, "event kind"));
    writeEvent(w, event, sizes);
  }
  return w.bytes();
}

export function decodeBattleReplay(input: Uint8Array | ArrayBuffer): BattleReplay {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const r = new Reader(data);
  for (const byte of BATTLE_REPLAY_MAGIC) if (r.u8() !== byte) throw new ProtocolError("not a battle replay");
  const formatVersion = r.u8() + r.u8() * 256;
  if (formatVersion < BATTLE_REPLAY_MIN_FORMAT_VERSION || formatVersion > BATTLE_REPLAY_FORMAT_VERSION)
    throw new ProtocolError(`unsupported battle replay format ${formatVersion}`);
  const simVersion = r.uvar();
  const seed = r.uvar();
  const tickMs = r.uvar();
  const kind = r.bool() ? "siege" : "normal";
  const limitTicks = r.uvar();
  const result = { winner: r.svar(), reason: r.pick(REPLAY_END_REASONS), endTick: r.uvar() };
  const arena = readArena(r);
  const sides = Array.from({ length: r.count() }, () => ({ id: r.svar(), defender: r.bool(), edge: r.u8() }));
  const skills = Array.from({ length: r.count() }, () => ({
    id: r.str(),
    shape: r.pick(REPLAY_SKILL_SHAPES),
    damage: r.pick(REPLAY_DAMAGE_KINDS),
    element: r.svar(),
    range: r.uvar(),
    radius: r.uvar(),
    castMs: r.uvar(),
    name: readName(r),
  }));
  const effects = Array.from({ length: r.count() }, () => ({
    id: r.str(),
    kind: r.pick(REPLAY_EFFECT_KINDS),
    name: readName(r),
  }));
  const unitCount = r.count();
  const units = Array.from({ length: unitCount }, () => readUnit(r, skills.length));
  const tables = { units: units.length, skills: skills.length, effects: effects.length, vitals: [] };
  let tick = 0;
  const keyframes: ReplayKeyframe[] = Array.from({ length: r.count() }, () => {
    tick += r.uvar();
    return { tick, units: Array.from({ length: unitCount }, () => readFrame(r, tables)) };
  });
  const sizes: Sizes = { ...tables, vitals: vitalsBase(units.length, keyframes[0]) };
  tick = 0;
  const events = Array.from({ length: r.count() }, () => {
    tick += r.uvar();
    return readEvent(r, r.pick(REPLAY_EVENT_KINDS), tick, sizes);
  });
  if (!r.done) throw new ProtocolError("battle replay has trailing bytes");
  return {
    formatVersion,
    simVersion,
    seed,
    tickMs,
    kind,
    limitTicks,
    result,
    arena,
    sides,
    skills,
    effects,
    units,
    keyframes,
    events,
  };
}

/** 바이트 → base64(tRPC 응답에 싣는다) */
export function replayToBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function replayFromBase64(text: string): Uint8Array {
  return base64ToBytes(text);
}
