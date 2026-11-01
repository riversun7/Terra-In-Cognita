// 시뮬레이터 전투 — docs/adr/2026-10-31-combat-core.md "시뮬레이터"
// 시나리오에 combat 칸이 있으면 대리 규칙의 도시 빼앗기를 공성 전투로 정하고(공격 쪽이 이기면 도시가 넘어감), 세력 판단마다
// 확률로 조우 전투를 연다. 모든 전투는 무관측 빨리감기(같은 판정, D-189)로 끝까지 돌린다.
// [임시] 전투 유닛 사양은 기술 단계에서 만든 시험값이다(1차 스탯·장비·스킬, 기획 Step 5·9). 유닛 부상·포로는 세계 쪽 일이다.
import { mix32 } from "../math/hash.ts";
import { runBattle } from "../combat/battle.ts";
import type { BattleInit, BattleResult, CombatUnitSpec } from "../combat/battleTypes.ts";
import type { BattleMapInput } from "../combat/battleMap.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "../combat/coefficients.ts";
import {
  type CombatCatalog,
  TEST_COMBAT_CATALOG,
  UNARMED,
  UNARMED_ELEMENTAL,
  skillsOf,
} from "../combat/catalog.ts";
import { type EquippedItem, itemAt, loadoutOf, skillSlotCount } from "../combat/equipment.ts";
import type { CombatSkill } from "../combat/skills.ts";
import { specFromStats } from "../combat/unitSpec.ts";
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
  /**
   * 반란(D-253·D-256): 도시 안 공성. 공격 변이 없고(반란군은 시청 둘레에서 시작), 반란군은 AI만·퇴각 없음.
   * 정부 편 = 남은 유닛. 반란군이 시청(넥서스)을 무너뜨리거나 정부 편을 모두 쓰러뜨리면 true
   */
  rebellion(
    government: SimFaction,
    rebels: readonly SimUnit[],
    loyal: readonly SimUnit[],
    nowMs: number,
  ): boolean;
  summary(): CombatSummary;
}

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

/** [임시] 시뮬레이터 유닛의 장비·스킬(사람형 칸 차례: 무기·보조·머리·몸·장신구 2). 팩에 없는 ID는 비운다 */
const LOADOUT = {
  kind: "human",
  items: ["test_sword", null, "test_helmet", "test_vest", "test_ring", null],
  skills: ["power_strike", "iron_skin", "first_aid"],
} as const;

/** 팩 자료로 시뮬레이터 유닛의 칸·장비·스킬을 만든다(유닛마다 같다) */
function kitOf(catalog: CombatCatalog) {
  const kind = catalog.unitKinds.find((entry) => entry.id === LOADOUT.kind);
  const slots = kind?.slots ?? [];
  const equipped: (EquippedItem | null)[] = slots.map((slot, index) => {
    const id = LOADOUT.items[index] ?? null;
    const def = id === null ? undefined : catalog.equipment.find((item) => item.id === id);
    return def && def.slot === slot ? itemAt(def, 500) : null;
  });
  const known = new Set(catalog.skills.map((skill) => skill.id));
  const innate = LOADOUT.skills.filter((id) => known.has(id));
  const skillSlots = kind ? skillSlotCount(kind.skillSlots.base, 0, kind.skillSlots.max) : 0;
  return {
    slots,
    equipped,
    innate,
    skillSlots,
    unarmed: kind?.naturalWeapon ?? UNARMED,
    unarmedElemental: kind?.naturalElementalWeapon ?? UNARMED_ELEMENTAL,
  };
}

/** [임시] 1차 스탯 = 40 + 기술 단계 × 8(모두 같게, 48 §3.5 예의 Lv30 휴먼 근처), 장비·스킬은 kitOf, 2차는 스탯 계산기 */
function specOf(
  unit: SimUnit,
  tech: number,
  catalog: CombatCatalog,
  kit: ReturnType<typeof kitOf>,
  skillCache: Map<string, CombatSkill[]>,
  place: { side: number; party: number; x: number; y: number },
  c: CombatCoefficients,
): CombatUnitSpec {
  const p = 40 + tech * 8;
  const out = loadoutOf({
    base: { str: p, dex: p, agi: p, vit: p, int: p, wis: p },
    slots: kit.slots,
    equipped: kit.equipped,
    table: catalog.statTable,
    unarmed: kit.unarmed,
    innateSkills: kit.innate,
    skillSlots: kit.skillSlots,
  });
  const key = out.skills.join(",");
  let skills = skillCache.get(key);
  if (!skills) {
    skills = skillsOf(catalog, out.skills);
    skillCache.set(key, skills);
  }
  return specFromStats(
    {
      id: unit.id,
      ...place,
      stats: out.stats,
      weapon: out.weapon,
      naturalWeapon: kit.unarmed,
      naturalElementalWeapon: kit.unarmedElemental,
      primaries: out.primaries,
      skills,
      moveIntervalMs: 1000,
      buildingMulPm: 2000,
    },
    c,
  );
}

/** 공격 쪽 = 편 1(서쪽 변), 수비 쪽 = 편 2(동쪽 변) */
function sides(attacker: SimFaction, defender: SimFaction) {
  return [
    { id: 1, faction: attacker.id, defender: false, edge: 3 as const },
    { id: 2, faction: defender.id, defender: true, edge: 1 as const },
  ] as const;
}

function partiesOf(units: readonly CombatUnitSpec[]) {
  return [...new Set(units.map((unit) => unit.party))].map((id) => ({
    id,
    side: units.find((unit) => unit.party === id)?.side ?? 1,
    retreatHpPct: 0,
  }));
}

export function attachCombat(
  world: SimWorld,
  settings: ScenarioCombat,
  recorder: MetricsRecorder,
  catalog: CombatCatalog = TEST_COMBAT_CATALOG,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): CombatRun {
  const kit = kitOf(catalog);
  const skillCache = new Map<string, CombatSkill[]>();
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
        catalog,
        kit,
        skillCache,
        {
          side,
          party: partyBase + Math.floor(index / PARTY_SIZE),
          x: x + Math.floor(index / 24),
          y: center + offset,
        },
        c,
      );
    });

  const fight = (
    kind: "siege" | "encounter",
    attacker: SimFaction,
    defender: SimFaction,
    init: BattleInit,
    nowMs: number,
  ): BattleResult => {
    const { result, state } = runBattle(init, [], undefined, c);
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
    rebellion(government, rebels, loyal, nowMs) {
      const size = settings.siegeMapSize;
      const center = size / 2;
      const map = openMap(size);
      const nexus = [center - 1, center].flatMap((y) => [center - 1, center].map((x) => y * size + x));
      map.buildings = [{ id: 1, cells: nexus, durability: settings.nexusDurability, nexus: true }];
      const take = settings.siegeUnits;
      const units = [
        ...line(rebels.slice(0, take), government.tech, 1, center - 10, center, 1),
        ...line(loyal.slice(0, take), government.tech, 2, center - 3, center, 101),
      ];
      if (units.every((unit) => unit.side === 1)) return true;
      if (units.every((unit) => unit.side === 2)) return false;
      sieges += 1;
      const result = fight(
        "siege",
        government,
        government,
        {
          id: battles + 1,
          kind: "siege",
          seed: mix32(world.seed ^ Math.imul(battles + 1, 0x9e37_79b1)),
          map,
          sides: sides(government, government),
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
