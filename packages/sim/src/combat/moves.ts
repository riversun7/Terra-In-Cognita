// 이동 부품·달리기·은신 판정 — docs/adr/2026-11-15-combat-moves.md 1·2절과 "바뀜 (D-564·D-568)". battle.ts가 부른다.
// D-564: 은신은 맞아도 풀리지 않는다, 점멸은 사정거리(cells) 안 아군 시야 칸, 도약은 성벽까지 넘는다, 돌진은 아군에도 막힌다,
// 밀치기는 벽·건물·뒤 유닛에 부딪히면 피해(D-570 1803: 막은 쪽도 — 시전자 편 빼고), 몸 크기(S 더·L 덜·XL 훨씬 덜)·보스·밀림 저항(효과
// 사전 밀림 상태이상 항목의 resist = VIT, 질문 1806 → D-429·D-570 1805)이 밀치기·끌어오기 칸 수만 줄인다(묶기 지속은 그대로).
// 모두 칸 단위 정수다. 굴림을 뽑지 않고, 후보 칸은 (점수, 시작에서 거리, 칸 번호) 차례로 고른다 → 같은 입력이면 같은 칸.
// 새 상태 칸(running·stealthUntilMs·detectUntilMs·detectCells)은 켜졌을 때만 둔다(안 쓰는 전투의 상태 JSON이 그대로).
// 곧은 줄은 주축 좌표가 한 칸씩, 부축은 반올림(정수)이다(시선 los.ts와 같은 모양). 걸음마다 모서리 규칙(fields.ts stepAllowed)과
// 점유를 본다(공중 유닛은 지형·점유를 보지 않는다, 걸음과 같다).
import type { BattleMap } from "./battleMap.ts";
import type { BattleTrace } from "./battleTrace.ts";
import type { UnitState } from "./battleTypes.ts";
import { type CombatCoefficients, specStaminaCostMilli } from "./coefficients.ts";
import { DEFAULT_DISPLACE_RESIST, displacedCells, moveCoefficientsOf, scalePm } from "./curves.ts";
import { type EffectDef, applyEffect, moveIntervalMs, statusResistPm } from "./effects.ts";
import { stepAllowed } from "./fields.ts";
import { sightRadius } from "./formula.ts";
import { lineClear } from "./los.ts";
import type { CombatDisplace, SkillMotionMove, SkillMove, StealthCause } from "./moveParts.ts";
import { isMotionMove } from "./moveParts.ts";
import { resolveSkill, type CombatSkill } from "./skills.ts";

/** 이동 부품이 보는 그 틱의 전투(battle.ts가 만든다) */
export interface MoveWorld {
  readonly map: BattleMap;
  readonly gone: ReadonlySet<number>;
  /** 그 틱의 점유 격자(지상 유닛 ID, 0 = 빔). 이동 부품이 고친다 */
  readonly occupied: Int32Array;
  readonly units: readonly UnitState[];
  readonly c: CombatCoefficients;
  readonly nowMs: number;
  readonly trace?: BattleTrace | undefined;
  /** 사거리·시선 확인(battle.ts reach, 스킬과 같다) */
  readonly reach: (from: UnitState, goal: UnitState, range: number) => boolean;
  /**
   * 부딪힘 피해를 건물에(D-570 1803 "건물 포함"): 시전자 편 건물(성문 편·공성 수비 편)이 아니면 내구도에서 뺀다(battle.ts). 없으면 건물은
   * 받지 않는다(시험 세계)
   */
  readonly hitBuilding?: ((source: UnitState, building: number, amount: number) => void) | undefined;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(ax > bx ? ax - bx : bx - ax, ay > by ? ay - by : by - ay);

/** (x0, y0)에서 (x1, y1)까지 곧은 줄의 칸(시작 칸 빼고, 끝 칸 넣고). 주축은 한 칸씩, 부축은 반올림 */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  const n = ax > ay ? ax : ay;
  const out: [number, number][] = [];
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  // 부축 = ⌊(2·i·|d| + n) ÷ 2n⌋(반올림, 정수)
  const round = (i: number, d: number): number => Math.floor((2 * i * d + n) / (2 * n));
  for (let i = 1; i <= n; i++) {
    if (ax >= ay) out.push([x0 + sx * i, y0 + sy * round(i, ay)]);
    else out.push([x0 + sx * round(i, ax), y0 + sy * i]);
  }
  return out;
}

/** (x, y)에서 (fromX, fromY)의 반대쪽으로 cells칸 곧은 줄(같은 칸이면 빈 줄) */
function awayLine(x: number, y: number, fromX: number, fromY: number, cells: number): [number, number][] {
  const vx = x - fromX;
  const vy = y - fromY;
  const major = Math.max(vx < 0 ? -vx : vx, vy < 0 ? -vy : vy);
  if (major === 0 || cells <= 0) return [];
  const k = Math.ceil(cells / major);
  return lineCells(x, y, x + vx * k, y + vy * k).slice(0, cells);
}

/** 이 유닛이 칸에 설 수 있나(지상 = 지나갈 수 있고 빈 칸, 공중 = 전투맵 안) */
function canStand(world: MoveWorld, unit: UnitState, cell: number): boolean {
  const size = world.map.size;
  if (cell < 0 || cell >= size * size) return false;
  if (unit.air) return true;
  const holder = world.occupied[cell] ?? 0;
  return world.map.passableFor(cell, unit.side, world.gone) && (holder === 0 || holder === unit.id);
}

/** 한 걸음(이웃 칸)을 갈 수 있나: 모서리 규칙 + 점유 */
function canStep(world: MoveWorld, unit: UnitState, x: number, y: number, nx: number, ny: number): boolean {
  const size = world.map.size;
  const pass = unit.air ? () => true : (cell: number) => world.map.passableFor(cell, unit.side, world.gone);
  if (!stepAllowed(size, x, y, nx - x, ny - y, pass)) return false;
  return canStand(world, unit, ny * size + nx);
}

/** 유닛을 칸으로 옮긴다(점유·다음 걸음 시각) */
function relocate(world: MoveWorld, unit: UnitState, x: number, y: number): void {
  const size = world.map.size;
  if (!unit.air) {
    if (world.occupied[unit.y * size + unit.x] === unit.id) world.occupied[unit.y * size + unit.x] = 0;
    world.occupied[y * size + x] = unit.id;
  }
  unit.x = x;
  unit.y = y;
  unit.nextMoveMs = world.nowMs + moveIntervalMs(unit, walkIntervalMs(unit, world.c));
}

/** 줄을 따라 한 칸씩, 막히면 멈춘다(stop이 참이 되는 칸에 닿아도 멈춘다). 실제로 옮긴 칸 수 */
function walkLine(
  world: MoveWorld,
  unit: UnitState,
  line: readonly [number, number][],
  stop: (x: number, y: number) => boolean,
): number {
  let moved = 0;
  let x = unit.x;
  let y = unit.y;
  for (const [nx, ny] of line) {
    if (stop(x, y) || !canStep(world, unit, x, y, nx, ny)) break;
    x = nx;
    y = ny;
    moved += 1;
  }
  if (moved > 0) relocate(world, unit, x, y);
  return moved;
}

/**
 * 칸이 이 편 시야 안인가(점멸, D-564 1585 "아군 시야 내"): 산 같은 편 유닛 누구라도 시야 반지름(높이 보너스 포함, sight.ts와 같은
 * dx² + dy² ≤ r² + r) 안이고 시선이 열려 있으면. 수풀은 칸을 가리지 않는다(유닛을 숨길 뿐)
 */
function seenBySide(world: MoveWorld, side: number, x: number, y: number): boolean {
  const size = world.map.size;
  const ground = world.map.height[y * size + x] ?? 0;
  for (const ally of world.units) {
    if (ally.side !== side || ally.status !== "alive") continue;
    const dx = ally.x - x;
    const dy = ally.y - y;
    const heightDiff = ally.air ? 0 : (world.map.height[ally.y * size + ally.x] ?? 0) - ground;
    const r = sightRadius(ally.sight, heightDiff, world.c);
    if (dx * dx + dy * dy > r * r + r) continue;
    if (lineClear(world.map, ally, { x, y, eye: ally.eye, air: false }, world.gone)) return true;
  }
  return false;
}

/**
 * 후보 칸 가운데 하나(도약·점멸): 시작에서 cells칸(체비쇼프) 안, 설 수 있고 ok인 칸. 점수가 작을수록 좋고, 같으면 시작에 가까운 칸,
 * 그다음 칸 번호. 지금 칸의 점수보다 좋아야 고른다. 없으면 undefined
 */
function bestCell(
  world: MoveWorld,
  unit: UnitState,
  cells: number,
  score: (x: number, y: number) => number,
  ok: (x: number, y: number) => boolean,
): [number, number] | undefined {
  const size = world.map.size;
  let best: [number, number] | undefined;
  let bestScore = score(unit.x, unit.y);
  let bestDistance = 0;
  for (let y = Math.max(0, unit.y - cells); y <= Math.min(size - 1, unit.y + cells); y++)
    for (let x = Math.max(0, unit.x - cells); x <= Math.min(size - 1, unit.x + cells); x++) {
      if (x === unit.x && y === unit.y) continue;
      if (!canStand(world, unit, y * size + x) || !ok(x, y)) continue;
      const s = score(x, y);
      const d = chebyshev(unit.x, unit.y, x, y);
      if (s > bestScore || (s === bestScore && (best === undefined || d >= bestDistance))) continue;
      best = [x, y];
      bestScore = s;
      bestDistance = d;
    }
  return best;
}

/**
 * 자기 몸을 옮기는 부품을 한다(돌진·도약·점멸·뒷걸음). 목표는 방향 기준이다. 옮겼으면 관찰자에게 motion을 알린다.
 * 돌아오는 값: 끝에서 스킬이 목표에 붙을 수 있나(돌진·도약은 목표가 닿는 칸 안, 점멸·뒷걸음은 새 자리에서 스킬 사거리·시선)
 */
export function performMotion(
  world: MoveWorld,
  unit: UnitState,
  move: SkillMotionMove,
  goal: UnitState,
  skillRange: number,
): boolean {
  const fromX = unit.x;
  const fromY = unit.y;
  const cells = Math.max(0, Math.trunc(move.cells));
  if (move.kind === "dash") {
    const hit = Math.max(1, move.hitRange ?? 1);
    const line = lineCells(unit.x, unit.y, goal.x, goal.y).slice(0, cells);
    walkLine(world, unit, line, (x, y) => chebyshev(x, y, goal.x, goal.y) <= hit);
  } else if (move.kind === "backstep") {
    walkLine(world, unit, awayLine(unit.x, unit.y, goal.x, goal.y, cells), () => false);
  } else if (move.kind === "leap") {
    // 도약: 길을 보지 않는다 — 유닛·바위·나무·수풀에 더해 성벽·성문도 넘는다(D-564 1586·D-568). 내릴 칸만 설 수 있으면 된다
    const spot = bestCell(
      world,
      unit,
      cells,
      (x, y) => chebyshev(x, y, goal.x, goal.y),
      () => true,
    );
    if (spot) relocate(world, unit, spot[0], spot[1]);
  } else {
    // 점멸: 사정거리(cells) 안이고 아군(자기 포함) 누구라도 보는 칸(D-564 1585)
    const toward = move.dir === "toward";
    const spot = bestCell(
      world,
      unit,
      cells,
      (x, y) => (toward ? 1 : -1) * chebyshev(x, y, goal.x, goal.y),
      (x, y) => seenBySide(world, unit.side, x, y),
    );
    if (spot) relocate(world, unit, spot[0], spot[1]);
  }
  if (unit.x !== fromX || unit.y !== fromY) world.trace?.motion?.(unit, move.kind, fromX, fromY);
  if (move.kind === "dash")
    return chebyshev(unit.x, unit.y, goal.x, goal.y) <= Math.max(1, move.hitRange ?? 1);
  if (move.kind === "leap") return chebyshev(unit.x, unit.y, goal.x, goal.y) <= 1;
  return world.reach(unit, goal, skillRange);
}

/**
 * 묶기(displace root)가 거는 상태이상의 판정 기본값(효과 사전 move_root 항목이 실리지 않은 스킬 — 옛 시작 자료·항목 없는 계열표).
 * 항목이 있으면 그 항목을 건다. 밀림 저항은 지속을 줄이지 않는다(D-570 1805 "거리만 줄임")
 */
const MOVE_ROOT: EffectDef = {
  id: "move_root",
  kind: "status",
  valueMode: "flat",
  durationMs: 0,
  tickMs: 0,
  stacking: "refresh",
  maxStacks: 1,
  status: "root",
};

/** 부딪힘 피해의 리플레이·보고서 이름(지속 피해 사건으로 싣는다, 효과 사전에는 없다) */
export const MOVE_COLLISION = "move_collision";

/**
 * 이 유닛의 밀림 저항(‰, 0~1000): 스탯 몫 + 보스 몸 저항. 스탯 몫은 효과 사전 밀림 상태이상 항목(def)의 저항(질문 1806 답 → D-429 모양,
 * D-570 "스탯 기여도는 VIT", 저항 칸이 없는 항목은 0). def가 없으면(항목을 싣기 전 시작 자료·항목 없는 계열표) 같은 값의 기본 칸
 */
export function unitDisplaceResistPm(unit: UnitState, def?: EffectDef): number {
  const statPm = statusResistPm(def ?? DEFAULT_DISPLACE_DEF, unit.primaries);
  return Math.max(0, Math.min(1000, statPm + Math.max(0, unit.displaceResistPm ?? 0)));
}

/** 항목이 없을 때 저항을 셀 자리 항목(curves.ts DEFAULT_DISPLACE_RESIST, 판정은 resist만 읽는다) */
const DEFAULT_DISPLACE_DEF: EffectDef = {
  id: "move_knockback",
  kind: "status",
  valueMode: "flat",
  durationMs: 0,
  tickMs: 0,
  stacking: "refresh",
  maxStacks: 1,
  status: "knockback",
  resist: DEFAULT_DISPLACE_RESIST,
};

/**
 * 부딪힘 피해(D-564 1587): 방어를 거치지 않고 체력에서 뺀다(지속 피해와 같다 — 아머·쉴드는 그대로). 0이면 아무것도 하지 않는다.
 * 쓰러지면 대기 명령을 비운다(takeDamage와 같다). 관찰자에게 밀어낸 유닛과 함께 알린다
 */
function impact(world: MoveWorld, source: UnitState, unit: UnitState, amount: number): void {
  if (amount <= 0 || unit.status !== "alive") return;
  const before = unit.hp;
  unit.hp -= amount;
  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.status = "down";
    unit.command = null;
  }
  world.trace?.collision?.(source, unit, before - unit.hp);
}

/** 밀려 가다 멈춘 까닭: 다 감(null), 벽(못 지나가는 칸·모서리 규칙), 건물, 다른 유닛, 전투맵 끝 */
type PushStop =
  | { readonly kind: "wall" }
  | { readonly kind: "building"; readonly building: number }
  | { readonly kind: "unit"; readonly blocker: number }
  | null;

/**
 * 밀린 대상이 줄의 다음 칸으로 못 간 까닭(지형이 막으면 벽 — 그 칸이 서 있는 건물이면 건물, 지형은 열렸는데 점유면 유닛, 맵 밖이면 끝 =
 * 피해 없음)
 */
function pushStop(world: MoveWorld, unit: UnitState, nx: number, ny: number): PushStop {
  const size = world.map.size;
  if (nx < 0 || ny < 0 || nx >= size || ny >= size) return null;
  const pass = unit.air ? () => true : (cell: number) => world.map.passableFor(cell, unit.side, world.gone);
  if (!stepAllowed(size, unit.x, unit.y, nx - unit.x, ny - unit.y, pass)) {
    const cell = ny * size + nx;
    const building = world.map.buildingAt[cell] ?? 0;
    return building !== 0 && !pass(cell) ? { kind: "building", building } : { kind: "wall" };
  }
  const holder = world.occupied[ny * size + nx] ?? 0;
  return holder !== 0 && holder !== unit.id && !unit.air ? { kind: "unit", blocker: holder } : null;
}

/**
 * 맞은 대상 하나를 옮긴다(밀치기·끌어오기) 또는 묶는다. 쓰러진 대상은 그대로. 밀림 저항은 칸 수(거리)만 줄인다(D-570 1805 — 묶기 지속은
 * 그대로): 칸 = ⌊칸 × 크기 배율 × (1000 − 저항) ÷ 1000000⌋, 원래 칸이 1 이상이면 적어도 1칸(D-572 — 저항 1000만 0칸, curves.ts displacedCells).
 * 밀치기가 줄 끝까지 못 가고 벽에 막히면 밀린 대상이 한 방 피해 × wallPm, 건물에 막히면 밀린 대상과 그 건물(시전자 편 건물 빼고, 판정
 * hitBuilding)이 × wallPm, 유닛에 막히면 밀린 대상과 막은 유닛(시전자 편이 아니면 누구나 — 중립 포함)이 × unitPm을 받는다(D-564 1587,
 * D-570 1801·1803). hitDamage = 밀어낸 한 방의 피해(피해 없는 스킬은 0 → 부딪힘 피해 없음)
 */
export function displaceTarget(
  world: MoveWorld,
  source: UnitState,
  target: UnitState,
  part: CombatDisplace,
  hitDamage = 0,
): void {
  if (target.status !== "alive") return;
  if (part.kind === "root") {
    if (part.durationMs > 0) applyEffect(target, part.def ?? MOVE_ROOT, 0, part.durationMs, world.nowMs);
    return;
  }
  const fromX = target.x;
  const fromY = target.y;
  const cells = displacedCells(
    part.cells,
    target.displaceSizePm ?? 1000,
    unitDisplaceResistPm(target, part.def),
  );
  if (part.kind === "knockback") {
    const line = awayLine(target.x, target.y, source.x, source.y, cells);
    const moved = walkLine(world, target, line, () => false);
    if (moved > 0) world.trace?.motion?.(target, part.kind, fromX, fromY);
    const next = line[moved];
    if (!next || hitDamage <= 0) return;
    const stop = pushStop(world, target, next[0], next[1]);
    const k = moveCoefficientsOf(world.c).knockback;
    if (stop?.kind === "wall") impact(world, source, target, scalePm(hitDamage, k.wallPm));
    else if (stop?.kind === "building") {
      const amount = scalePm(hitDamage, k.wallPm);
      impact(world, source, target, amount);
      if (amount > 0) world.hitBuilding?.(source, stop.building, amount);
    } else if (stop?.kind === "unit") {
      const amount = scalePm(hitDamage, k.unitPm);
      impact(world, source, target, amount);
      const blocker = world.units.find((other) => other.id === stop.blocker);
      if (blocker && blocker.side !== source.side) impact(world, source, blocker, amount);
    }
    return;
  }
  const moved = walkLine(
    world,
    target,
    lineCells(target.x, target.y, source.x, source.y).slice(0, cells),
    (x, y) => chebyshev(x, y, source.x, source.y) <= 1,
  );
  if (moved > 0) world.trace?.motion?.(target, part.kind, fromX, fromY);
}

/** 은신 중인가(틱 처음 updateStealth가 끝난 은신을 지운다) */
export function isStealthed(unit: UnitState): boolean {
  return unit.stealthUntilMs !== undefined;
}

/** 은신을 깬다(은신 중이 아니면 아무것도 하지 않는다) */
export function breakStealth(unit: UnitState, cause: StealthCause, trace?: BattleTrace): void {
  if (unit.stealthUntilMs === undefined) return;
  unit.stealthUntilMs = undefined;
  trace?.stealth?.(unit, false, cause);
}

/** 이 유닛의 감지 반지름(칸): 기본, 감지 부품이 켜져 있으면 그것과 큰 쪽 */
function detectRadius(unit: UnitState, nowMs: number, c: CombatCoefficients): number {
  const base = moveCoefficientsOf(c).detectCells;
  return unit.detectUntilMs !== undefined && unit.detectUntilMs > nowMs
    ? Math.max(base, unit.detectCells ?? 0)
    : base;
}

/**
 * 틱 처음(시야 전): 끝난 감지를 지우고, 은신이 끝났거나 들킨(산 적 유닛의 감지 반지름 안 + 시선) 유닛의 은신을 깬다. 유닛 배열 차례
 */
export function updateStealth(
  map: BattleMap,
  units: readonly UnitState[],
  gone: ReadonlySet<number>,
  nowMs: number,
  c: CombatCoefficients,
  trace?: BattleTrace,
): void {
  for (const unit of units)
    if (unit.detectUntilMs !== undefined && unit.detectUntilMs <= nowMs) {
      unit.detectUntilMs = undefined;
      unit.detectCells = undefined;
    }
  for (const unit of units) {
    if (unit.stealthUntilMs === undefined) continue;
    if (unit.status !== "alive" || unit.stealthUntilMs <= nowMs) {
      breakStealth(unit, "expired", trace);
      continue;
    }
    const seen = units.some(
      (enemy) =>
        enemy.side !== unit.side &&
        enemy.status === "alive" &&
        chebyshev(enemy.x, enemy.y, unit.x, unit.y) <= detectRadius(enemy, nowMs, c) &&
        lineClear(map, enemy, unit, gone),
    );
    if (seen) breakStealth(unit, "detected", trace);
  }
}

/** 자기에게 거는 부품(은신·감지) */
function applySelfMove(unit: UnitState, move: SkillMove, nowMs: number, trace?: BattleTrace): void {
  if (move.kind === "stealth") {
    if (move.durationMs <= 0) return;
    const was = unit.stealthUntilMs !== undefined;
    unit.stealthUntilMs = nowMs + move.durationMs;
    if (!was) trace?.stealth?.(unit, true, "skill");
  } else if (move.kind === "detect") {
    if (move.durationMs <= 0) return;
    unit.detectUntilMs = nowMs + move.durationMs;
    unit.detectCells = Math.max(0, Math.trunc(move.cells));
  }
}

/**
 * 이동 부품이 있는 스킬을 푼다(ADR 2절 판정 차례): 자기 이동 → (붙을 수 있으면) 대상에게 피해·효과 → 맞은 대상마다 displace →
 * 은신·감지. 자원·쿨은 startSkill이 이미 썼다
 */
export function fireMoveSkill(
  world: MoveWorld,
  unit: UnitState,
  skill: CombatSkill,
  goal: UnitState,
  rng: { nextInt(n: number): number },
): void {
  const move = skill.move;
  let lands = true;
  if (move && isMotionMove(move)) lands = performMotion(world, unit, move, goal, skill.range);
  const displace = skill.displace;
  const hasPayload = skill.damage !== "none" || skill.effects.length > 0 || displace !== undefined;
  if (lands && hasPayload && skill.target === "enemy")
    resolveSkill(
      unit,
      skill,
      goal,
      world.units,
      rng,
      world.nowMs,
      world.c,
      world.trace,
      displace ? (target, damage) => displaceTarget(world, unit, target, displace, damage) : undefined,
    );
  else if (skill.target !== "enemy")
    resolveSkill(unit, skill, goal, world.units, rng, world.nowMs, world.c, world.trace);
  if (move && !isMotionMove(move)) applySelfMove(unit, move, world.nowMs, world.trace);
}

/** 달리는 중의 한 칸 간격(ms): 걷기 간격 × 달리기 배율(‰, 1 아래 없음). 달리지 않으면 걷기 간격 그대로 */
export function walkIntervalMs(unit: UnitState, c: CombatCoefficients): number {
  if (unit.running !== true) return unit.moveIntervalMs;
  return Math.max(1, scalePm(unit.moveIntervalMs, moveCoefficientsOf(c).run.intervalPm));
}

/** 달리기 초당 소모(밀리점, STA 배율 N13을 거친 값) */
function runCostPerSecMilli(unit: UnitState, c: CombatCoefficients): number {
  return specStaminaCostMilli(unit, moveCoefficientsOf(c).run.staminaPerSec, c);
}

/** 달리기 다시 켤 수 있는 스태미나(밀리점): 초당 소모 × resumeSec */
function runResumeMilli(unit: UnitState, c: CombatCoefficients): number {
  return runCostPerSecMilli(unit, c) * Math.max(1, moveCoefficientsOf(c).run.resumeSec);
}

/** 달리기를 켜거나 끈다(바뀔 때만 관찰자에게 알린다). 켤 때는 resumeSec 몫의 스태미나가 있어야 한다 */
export function setRunning(unit: UnitState, on: boolean, c: CombatCoefficients, trace?: BattleTrace): void {
  if (on === (unit.running === true)) return;
  if (on && unit.staminaMilli < runResumeMilli(unit, c)) return;
  unit.running = on ? true : undefined;
  trace?.run?.(unit, on);
}

/**
 * 달리는 동안 틱마다 스태미나를 뺀다: 틱 0..t의 합 = ⌊초당 × (t + 1) × tickMs ÷ 1000⌋(버림 손실 없음). 모자라면 달리기를 끈다
 */
export function drainRun(unit: UnitState, tick: number, c: CombatCoefficients, trace?: BattleTrace): void {
  if (unit.running !== true) return;
  const perSec = runCostPerSecMilli(unit, c);
  const share =
    Math.floor((perSec * (tick + 1) * c.tickMs) / 1000) - Math.floor((perSec * tick * c.tickMs) / 1000);
  if (unit.staminaMilli < share) {
    setRunning(unit, false, c, trace);
    return;
  }
  unit.staminaMilli -= share;
}
