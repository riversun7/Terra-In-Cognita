// 시뮬레이터 전투 — docs/adr/2026-10-31-combat-core.md "시뮬레이터"
// 시나리오에 combat 칸이 있으면 대리 규칙의 도시 빼앗기를 공성 전투로 정하고(공격 쪽이 이기면 도시가 넘어감), 세력 판단마다
// 확률로 조우 전투를 연다. 모든 전투는 무관측 빨리감기(같은 판정, D-189)로 끝까지 돌린다.
// [임시] 전투 유닛 사양은 기술 단계에서 만든 시험값이다(스탯·종 데이터는 기획 Step 5·9). 유닛 부상·포로는 R4가 세계에 붙인다.
import { mix32 } from "../math/hash.ts";
import { type BattleInit, type BattleResult, type CombatUnitSpec, runBattle } from "../combat/battle.ts";
import type { BattleMapInput } from "../combat/battleMap.ts";
import { ELEMENT_COUNT } from "../combat/formula.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { ScenarioCombat } from "./scenario.ts";
import type { SimFaction, SimUnit, SimWorld } from "./world.ts";

export interface CombatSummary {
  readonly battles: number;
  readonly sieges: number;
  readonly encounters: number;
  readonly attackerWins: number;
  readonly timeouts: number;
  readonly downed: number;
  readonly ticks: number;
}

export interface CombatRun {
  /** 공성: 공격 쪽이 이기면 true */
  siege(attacker: SimFaction, defender: SimFaction, cityId: number, nowMs: number): boolean;
  /** 조우: 다른 살아 있는 세력 하나와 작은 전투 */
  encounter(faction: SimFaction, roll: number, nowMs: number): void;
  summary(): CombatSummary;
}

const ZERO = Array.from({ length: ELEMENT_COUNT }, () => 0);
const PARTY_SIZE = 6;

function openMap(size: number): BattleMapInput {
  const cells = size * size;
  return {
    size,
    passable: new Uint8Array(cells).fill(1),
    cover: new Uint8Array(cells),
    height: new Int32Array(cells),
    buildings: [],
  };
}

/** [임시] 기술 단계가 오를수록 조금 세다 */
function specOf(
  unit: SimUnit,
  tech: number,
  side: number,
  party: number,
  x: number,
  y: number,
): CombatUnitSpec {
  return {
    id: unit.id,
    side,
    party,
    x,
    y,
    maxHp: 100 + tech * 10,
    armorHp: 10,
    shieldHp: 0,
    attack: {
      attack: 18 + tech * 2,
      kind: "physical",
      penetrationPm: 0,
      critChanceBp: 1000,
      critMulPm: 1500,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: ZERO,
      skillElementsPm: ZERO,
    },
    defense: { defenseRatioPm: 100, defenseFlat: 1, elements: ZERO },
    range: 1,
    arc: false,
    attackTicks: 5,
    moveTicks: 5,
    wis: 20,
    agi: 10,
    eye: 16 * 180,
    air: false,
    commandCap: 0,
    cyborg: false,
    buildingMulPm: 2000,
  };
}

export function attachCombat(
  world: SimWorld,
  settings: ScenarioCombat,
  recorder: MetricsRecorder,
): CombatRun {
  let battles = 0;
  let sieges = 0;
  let encounters = 0;
  let attackerWins = 0;
  let timeouts = 0;
  let downed = 0;
  let ticks = 0;

  const pick = (faction: SimFaction, count: number, cityId?: number): SimUnit[] => {
    const out: SimUnit[] = [];
    for (const id of [...faction.units].toSorted((a, b) => a - b)) {
      const unit = world.units.get(id);
      if (!unit || (cityId !== undefined && unit.city !== cityId)) continue;
      out.push(unit);
      if (out.length >= count) break;
    }
    return out;
  };

  /** 한 편의 유닛을 열(x)에 세로로 늘어세운다(파티 6명씩) */
  const line = (
    units: readonly SimUnit[],
    tech: number,
    side: number,
    x: number,
    center: number,
    partyBase: number,
  ): CombatUnitSpec[] =>
    units.map((unit, index) => {
      const offset = ((index + 1) >> 1) * (index % 2 === 0 ? 1 : -1);
      return specOf(
        unit,
        tech,
        side,
        partyBase + Math.floor(index / PARTY_SIZE),
        x + Math.floor(index / 24),
        center + offset,
      );
    });

  const fight = (
    kind: "siege" | "encounter",
    attacker: SimFaction,
    defender: SimFaction,
    init: BattleInit,
    nowMs: number,
  ): BattleResult => {
    const { result, state } = runBattle(init, []);
    battles += 1;
    ticks += result.endTick;
    if (result.winner === 1) attackerWins += 1;
    if (result.reason === "timeout") timeouts += 1;
    const down = { attacker: 0, defender: 0 };
    for (const unit of state.units) {
      if (unit.hp > 0) continue;
      downed += 1;
      if (unit.side === 1) down.attacker += 1;
      else down.defender += 1;
    }
    recorder.battle(nowMs, {
      kind,
      attacker: attacker.id,
      defender: defender.id,
      winner: result.winner === 1 ? attacker.id : defender.id,
      reason: result.reason,
      ticks: result.endTick,
      downed: down,
    });
    return result;
  };

  const sides = (attacker: SimFaction, defender: SimFaction) =>
    [
      { id: 1, faction: attacker.id, defender: false, edge: 3 as const },
      { id: 2, faction: defender.id, defender: true, edge: 1 as const },
    ] as const;

  const partiesOf = (units: readonly CombatUnitSpec[]) =>
    [...new Set(units.map((unit) => unit.party))].map((id) => ({
      id,
      side: units.find((unit) => unit.party === id)?.side ?? 1,
      retreatHpPct: 0,
    }));

  return {
    siege(attacker, defender, cityId, nowMs) {
      const size = settings.siegeMapSize;
      const center = size / 2;
      const map = openMap(size);
      const nexus = [center - 1, center].flatMap((y) => [center - 1, center].map((x) => y * size + x));
      map.buildings = [{ id: 1, cells: nexus, durability: settings.nexusDurability, nexus: true }];
      // 공격 쪽은 서쪽 변의 3칸째 줄(D-222), 수비 쪽은 넥서스 앞
      const units = [
        ...line(pick(attacker, settings.siegeUnits), attacker.tech, 1, 2, center, 1),
        ...line(pick(defender, settings.siegeUnits, cityId), defender.tech, 2, center - 3, center, 101),
      ];
      sieges += 1;
      const result = fight(
        "siege",
        attacker,
        defender,
        {
          id: battles + 1,
          kind: "siege",
          seed: mix32(world.seed ^ Math.imul(battles + 1, 0x9e37_79b1)),
          map,
          sides: sides(attacker, defender),
          parties: partiesOf(units),
          units,
        },
        nowMs,
      );
      return result.winner === 1;
    },
    encounter(faction, roll, nowMs) {
      const others = [...world.factions.values()].filter(
        (other) => other.alive && other.id !== faction.id && other.units.size > 0,
      );
      const defender = others[roll % Math.max(1, others.length)];
      if (!defender || faction.units.size === 0) return;
      const size = settings.mapSize;
      const center = size / 2;
      const units = [
        ...line(pick(faction, settings.encounterUnits), faction.tech, 1, center - 5, center, 1),
        ...line(pick(defender, settings.encounterUnits), defender.tech, 2, center + 5, center, 101),
      ];
      encounters += 1;
      fight(
        "encounter",
        faction,
        defender,
        {
          id: battles + 1,
          kind: "normal",
          seed: mix32(world.seed ^ Math.imul(battles + 1, 0x9e37_79b1)),
          map: openMap(size),
          sides: sides(faction, defender),
          parties: partiesOf(units),
          units,
        },
        nowMs,
      );
    },
    summary() {
      return { battles, sieges, encounters, attackerWins, timeouts, downed, ticks };
    },
  };
}
