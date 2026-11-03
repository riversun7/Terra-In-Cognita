// 전투 상태 만들기와 유닛 도우미 — battle.ts가 쓴다. docs/adr/2026-10-31-combat-core.md
import { type CombatCoefficients, msToTicks, specStaminaCostMilli } from "./coefficients.ts";
import { applyPassives } from "./skills.ts";
import type { BattleInit, BattleState, CombatUnitSpec, SideState, UnitState } from "./battleTypes.ts";

/** 살아 있고 빠지지 않은 유닛 */
export function active(unit: UnitState): boolean {
  return unit.status === "alive";
}

/** 행동할 수 있나: 다음 행동 시각이 됐고 자원이 충분(D-418) */
export function ready(unit: UnitState, nowMs: number, c: CombatCoefficients): boolean {
  return (
    nowMs >= unit.nextActionMs &&
    unit.staminaMilli >= specStaminaCostMilli(unit, unit.staminaCost, c) &&
    (unit.attack.kind !== "elemental" || unit.mpMilli >= unit.mpCost * 1000)
  );
}

/** 행동을 쓴다: 자원을 쓰고 다음 행동 시각을 정한다(빗나가도 쓴다) */
export function spend(unit: UnitState, nowMs: number, c: CombatCoefficients): void {
  unit.staminaMilli -= specStaminaCostMilli(unit, unit.staminaCost, c);
  if (unit.attack.kind === "elemental") unit.mpMilli -= unit.mpCost * 1000;
  unit.nextActionMs = nowMs + unit.attackIntervalMs;
}

export function unitFrom(spec: CombatUnitSpec): UnitState {
  const unit: UnitState = {
    ...spec,
    hp: spec.maxHp,
    armor: spec.armorHp,
    shield: spec.shieldHp,
    staminaMilli: spec.staminaMax * 1000,
    mpMilli: spec.mpMax * 1000,
    status: "alive",
    nextActionMs: 0,
    nextMoveMs: 0,
    revealUntilMs: -1,
    bandSinceMs: -1,
    effects: [],
    skillReadyMs: spec.skills.map(() => 0),
    cast: null,
    command: null,
    lastCommandMs: -1_000_000_000,
  };
  applyPassives(unit);
  return unit;
}

/** 지휘관 = 남은 유닛 가운데 지휘 정원이 가장 큰 유닛(같으면 작은 ID), 정원 밖 파티는 지휘 없음(D-331) */
export function electCommander(state: BattleState, side: SideState): void {
  let best: UnitState | undefined;
  for (const unit of state.units) {
    if (unit.side !== side.id || unit.status !== "alive" || unit.commandCap <= 0) continue;
    if (!best || unit.commandCap > best.commandCap) best = unit;
  }
  side.commander = best?.id ?? 0;
  const parties = state.parties
    .filter((party) => party.side === side.id && !party.retreated)
    .map((party) => party.id);
  side.uncommanded = parties.slice(best ? best.commandCap : 0);
}

export function initialState(init: BattleInit, c: CombatCoefficients): BattleState {
  const limitMs = init.limitMs ?? (init.kind === "siege" ? c.limitMs.siege : c.limitMs.normal);
  if (!Number.isInteger(limitMs) || limitMs < c.tickMs || limitMs > c.limitMs.max)
    throw new RangeError(`limitMs must be in [${c.tickMs}, ${c.limitMs.max}]`);
  const limit = msToTicks(limitMs, c);
  const units = init.units.map(unitFrom).toSorted((a, b) => a.id - b.id);
  const parties = init.parties
    .map((party) => ({
      ...party,
      maxHpSum: units.filter((unit) => unit.party === party.id).reduce((sum, unit) => sum + unit.maxHp, 0),
      retreating: false,
      retreated: false,
    }))
    .toSorted((a, b) => a.id - b.id);
  const state: BattleState = {
    tick: 0,
    kind: init.kind,
    seed: init.seed >>> 0,
    limitTicks: limit,
    units,
    parties,
    sides: init.sides
      .map((side) => ({ ...side, commander: 0, uncommanded: [], visible: [], lastSeen: [] }))
      .toSorted((a, b) => a.id - b.id),
    buildings: init.map.buildings.map((building) => ({ id: building.id, durability: building.durability })),
    rejected: 0,
    result: null,
  };
  for (const side of state.sides) electCommander(state, side);
  return state;
}
