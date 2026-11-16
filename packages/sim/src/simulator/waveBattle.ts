// 정원사 웨이브 공성 전투의 시작 자료 — docs/adr/2026-11-01-gardener-r5b.md 2절, 기획 D-193·D-273·D-5050, D-464(질문 214·218)
// 시뮬레이터(gardenerRun.ts → runBattle)와 서버(NPC 런타임 → 전투 서비스 battles.start)가 같은 함수로 만든다.
// - 지도: 공성 전투맵(시나리오 siegeMapSize, 49 C3 128). 도시 배치(layout)가 있으면 그 2차맵 구역(넥서스 = 행정 건물 실제 칸, 다른 건물 =
//   장애물, D-533·질문 1046 가, combat/siegeArena.ts)이고 웨이브는 attackEdge 변(모함 쪽, 질문 1067 가)에서 온다. 넥서스 내구도 = 행정 건물의
//   지금 내구도(질문 1069 가). 없으면 가운데 넥서스(시청)의 열린 맵, 서쪽 변.
//   수비는 넥서스 앞(시뮬 공성과 같은 자리).
// - 수비: 그 도시 휴먼(앞에서부터 공성 인원 상한까지, 질문 218 가) — 시뮬 공성과 같은 [임시] 휴먼 사양(combatRun.ts specOf).
// - 웨이브: 정원사 크리쳐 strength마리. 한 마리의 몸은 [임시] 수비 휴먼과 같은 사양(같은 1차 스탯·방어구·스킬)이라 웨이브 세기는
//   마리 수로 정해진다(D-322 "세기 = 세력 규모"). 물리형(공성 크리쳐, 돌진형, D-273·D-5050)은 칼(근접 물리)에 건물 피해 배율
//   [임시] 4,000‰, 마법형은 지팡이(속성 무기)라 건물을 부수지 못하고(D-5043 "건물은 물리 피해만", 배율도 0) 유닛을 사거리에서 친다.
//   [임시] 진형: 물리형은 줄 끝(가운데에서 먼 자리).
//   잰 결과로 고른 것(ADR 4절): 크리쳐 종류의 타고난 무기는 장비 든 휴먼에게 늘 졌고, 마법형을 칼 든 건물 피해 0으로 두면 웨이브가
//   클 때 마법형이 넥서스 둘레를 막아 공성 크리쳐가 닿지 못해 공성 제한 30분을 다 썼다(전투 하나 CPU 약 20초). 지팡이는 사거리가 길어
//   넥서스 둘레를 막지 않는다. 크리쳐 에디터 값(D-5024)·전투 줄기 값이 생기면 바꾼다. 전투 공식은 건드리지 않는다(전투 API만 부른다).
import type {
  Battle,
  BattleInit,
  BattleInput,
  BattleResult,
  BattleState,
  CombatUnitSpec,
} from "../combat/battleTypes.ts";
import type { CombatCoefficients } from "../combat/coefficients.ts";
import type { CombatCatalog } from "../combat/catalog.ts";
import { itemAt } from "../combat/equipment.ts";
import type { Edge } from "../combat/battleTypes.ts";
import {
  type SiegeArena,
  type SiegeLayout,
  type SiegePlacer,
  oppositeEdge,
  siegeArena,
  siegeNexusDurability,
  siegePlacer,
} from "../combat/siegeArena.ts";
import type { CombatSkill } from "../combat/skills.ts";
import { PARTY_SIZE, kitOf, openMap, specOf } from "./combatRun.ts";
import type { SimUnit } from "./world.ts";

/** 정원사 편의 세력 칸(소유 주체가 아니다: 포로·탈취를 받지 않는다, D-193·D-321) */
export const GARDENER_SIDE_FACTION = 0;
/** [임시] 물리형 공성 크리쳐의 건물 피해 배율(‰, 휴먼 사양은 2,000). 마법형은 0 */
const SIEGE_BUILDING_MUL_PM = 4000;
const MAGIC_BUILDING_MUL_PM = 0;
/** [임시] 마법형 크리쳐의 무기(팩 시험 지팡이, 속성 무기). 아이템 편집기 코드 참조 표가 읽는다(SIM_ITEM_REFS) */
export const MAGIC_WEAPON = "test_staff";

export interface WaveBattleInput {
  readonly battleId: number;
  readonly seed: number;
  /** 수비 세력(그 도시 주인의 소유 주체·세력 ID) */
  readonly defenderFaction: number;
  /** 수비 휴먼(앞에서부터 쓴다) */
  readonly defenders: readonly SimUnit[];
  readonly defenderTech: number;
  /** 정원사 크리쳐 수와 그 가운데 물리형 수 */
  readonly strength: number;
  readonly physical: number;
  /** 정원사 크리쳐 1차 스탯의 기술 단계([임시] 수비 세력 기술과 같다) */
  readonly creatureTech: number;
  /** 정원사 크리쳐 전투 유닛 ID의 시작(세계 유닛 ID와 겹치지 않게) */
  readonly firstCreatureId: number;
  readonly mapSize: number;
  /**
   * 넥서스 내구도: 옛 열린 맵·배치에 넥서스 건물이 없을 때만 쓴다. 배치가 있으면 행정 건물의 지금 내구도(질문 1069 가,
   * combat/siegeArena.ts siegeNexusDurability)
   */
  readonly nexusDurability: number;
  /** 수비 인원 상한(질문 218 가 → D-558 1547: 고정 10명 대신 설정 칸 d558_wave_defenders_max, gardener waveDefendersMaxOf) */
  readonly maxDefenders: number;
  /**
   * 수비 편성(D-558 1547 "군단이 존재하면 군단이고 각각의 파티분대 만있으면 각파티형태로 참전, 파티도 없으면 유닛들 개별 참전"): 수비 유닛
   * ID → 파티 묶음 키(같은 키 = 한 파티, 수비 편 전체가 한 군단). 없거나 undefined면 그 유닛 혼자 한 파티(개별 참전). 세계 휴먼에는 아직
   * 파티가 없어 모두 개별이다
   */
  readonly defenderPartyOf?: ((unitId: number) => number | undefined) | undefined;
  /**
   * 수비 군단 묶음(D-571 답 1970 "편성이 잘리지 않게"): 파티 묶음 키 → 군단 키(같은 키 = 한 군단). 없으면 파티마다 따로. 상한을 고를 때만
   * 본다(waveDefenderPick) — 전투 안에서는 수비 편 전체가 한 군단이다
   */
  readonly defenderLegionOf?: ((partyKey: number) => number | undefined) | undefined;
  /**
   * 공성 제한 시간(ms, C2). 없으면 전투를 만드는 쪽의 계수표 값. 서버 전투 서비스는 시험 계수표로 전투를 만들므로 설정 칸
   * 실효 값을 여기로 넘긴다
   */
  readonly limitMs?: number | undefined;
  /**
   * 도시의 실제 2차맵 건물 배치(D-533, 질문 1046 가 — combat/siegeArena.ts). 있으면 넥서스 = 행정 건물 실제 칸, 다른 건물 = 장애물,
   * 웨이브는 attackEdge 변에서 들어온다. 없으면 옛 열린 맵(가운데 넥서스, 서쪽 변). 시뮬레이터 도시는 평지 배치(city/citySiege.ts)
   */
  readonly layout?: SiegeLayout | undefined;
  /** 웨이브가 들어오는 변(0 북, 1 동, 2 남, 3 서). 배치가 있을 때만 본다. 없으면 서 */
  readonly attackEdge?: Edge | undefined;
  /**
   * 같은 배치·변으로 미리 만든 공성 전투맵과 시작 자리(배치가 있을 때만 본다). 주면 다시 만들지 않고 쓴다 — 부르는 쪽(서버 전투 보고서)이
   * 같은 자리 차례를 이어 써서 유닛을 더 세운다. 결과는 주지 않았을 때와 같다
   */
  readonly prepared?: { readonly arena: SiegeArena; readonly placer: SiegePlacer } | undefined;
}

/**
 * 웨이브 수비 인원 상한 안에서 편성을 자르지 않고 고른다(D-558 1547 "군단이 존재하면 군단이고 … 파티분대 만있으면 각파티형태로 참전, 파티도
 * 없으면 유닛들 개별 참전" → D-571 답 1970 "편성이 잘리지 않게", 질문 2105 → 2181): 수비 차례대로 편성(군단 → 파티 → 혼자인 유닛) 하나씩
 * 본다. 통째로 들어가면 넣고, 넘치면 그 편성을 통째로 건너뛴다(군단도 파티로 나누지 않는다 — 군단은 군단으로). 뒤 편성이 남은 자리에 들어갈
 * 수 있으면 넣는다. 아무도 못 넣었으면(상한이 첫 편성보다 작다) 첫 편성을 통째로 넣는다(전투에 수비가 없지 않게, 자르지 않으므로 상한을 넘을
 * 수 있다 [임시] 질문 2181). 차례는 수비 목록 차례 그대로다. 묶음 함수가 없으면 앞에서부터 상한만큼(옛 꼴 — 모두 혼자인 유닛과 같다)
 */
export function waveDefenderPick<T extends { readonly id: number }>(
  defenders: readonly T[],
  max: number,
  partyOf?: (unitId: number) => number | undefined,
  legionOf?: (partyKey: number) => number | undefined,
): T[] {
  const cap = Math.max(0, Math.trunc(max));
  if (!partyOf) return defenders.slice(0, cap);
  // 편성: 군단 = 파티 묶음들, 파티 = 유닛들, 혼자 = 유닛 하나(처음 나온 차례)
  type Group = { units: T[]; parties: T[][] | null };
  const groups: Group[] = [];
  const legions = new Map<number, Group>();
  const parties = new Map<number, T[]>();
  for (const unit of defenders) {
    const key = partyOf(unit.id);
    if (key === undefined) {
      groups.push({ units: [unit], parties: null });
      continue;
    }
    let party = parties.get(key);
    if (!party) {
      party = [];
      parties.set(key, party);
      const legionKey = legionOf?.(key);
      if (legionKey === undefined) groups.push({ units: party, parties: null });
      else {
        let legion = legions.get(legionKey);
        if (!legion) {
          legion = { units: [], parties: [] };
          legions.set(legionKey, legion);
          groups.push(legion);
        }
        legion.parties?.push(party);
      }
    }
    party.push(unit);
  }
  const picked = new Set<T>();
  let left = cap;
  const take = (units: readonly T[]): void => {
    for (const unit of units) picked.add(unit);
    left -= units.length;
  };
  const unitsOf = (group: Group): readonly T[] => (group.parties ? group.parties.flat() : group.units);
  for (const group of groups) {
    const all = unitsOf(group);
    if (all.length <= left) take(all);
  }
  // 아무도 못 넣었으면 첫 편성을 통째로(상한이 0이면 수비 없음)
  const first = groups[0];
  if (picked.size === 0 && cap > 0 && first) take(unitsOf(first));
  return defenders.filter((unit) => picked.has(unit));
}

/** 공성 크리쳐가 남았는지 보는 간격(틱). 결과는 간격과 상관없다(멈춘 틱만 이만큼 늦을 수 있다) */
export const WAVE_CHECK_TICKS = 50;

/** 정원사 편 공성인가(공격 편 세력 칸이 정원사) */
export function isWaveBattle(init: Pick<BattleInit, "kind" | "sides">): boolean {
  return (
    init.kind === "siege" &&
    init.sides.some((side) => !side.defender && side.faction === GARDENER_SIDE_FACTION)
  );
}

/**
 * 웨이브가 이길 수 없게 됐나: 넥서스가 서 있고 공격 편에 건물을 부술 수 있는(건물 피해 배율 > 0) 유닛이 하나도 서 있지 않다.
 * 건물은 물리 피해만 받고(D-5043) 공성 수비 편은 넥서스가 서 있는 동안 지지 않으므로 이 뒤의 결과는 늘 수비 승이다
 */
export function waveSiegeSpent(state: BattleState): boolean {
  if (state.result || !state.buildings.some((building) => building.durability > 0)) return false;
  const attacker = state.sides.find((side) => !side.defender)?.id;
  return !state.units.some(
    (unit) => unit.side === attacker && unit.buildingMulPm > 0 && unit.status === "alive" && unit.hp > 0,
  );
}

/**
 * 웨이브 전투 빨리감기: 끝나거나, 공성 크리쳐를 모두 잃어 이길 수 없게 되면 멈춘다 — 웨이브는 물러난다(실패, D-230
 * "실패는 진 경우와 시간 초과"). 그때 결과는 수비 승(사유 timeout과 같게 적는다)이고 state.result에도 적는다.
 * 공성 제한 시간(C2 30분)까지 남은 웨이브를 빨리감기하면 크리쳐 수십에 수 초가 걸린다(ADR 4절 잰 값). 서버 전투 서비스도 이 함수를 쓴다
 */
export function runWaveToEnd(
  battle: Battle,
  inputs: readonly BattleInput[],
  onSnapshot?: (snapshot: string, tick: number) => void,
): { state: BattleState; result: BattleResult | null; rejected: number } {
  for (;;) {
    const from = battle.state.tick;
    const run = battle.runToEnd(
      inputs.filter((input) => input.tick >= from),
      WAVE_CHECK_TICKS,
      onSnapshot,
    );
    if (run.result) return run;
    if (waveSiegeSpent(battle.state))
      return { state: battle.state, result: finishSpentWave(battle.state), rejected: run.rejected };
  }
}

/** 이길 수 없게 된 웨이브를 끝낸다: 수비 승(사유 timeout과 같게)을 state.result에 적고 돌려준다 */
export function finishSpentWave(state: BattleState): BattleResult {
  const defender = state.sides.find((side) => side.defender)?.id ?? 0;
  const result: BattleResult = { winner: defender, reason: "timeout", endTick: state.tick };
  state.result = result;
  return result;
}

/** i번째를 가운데에서 위아래로 번갈아(0, +1, −1, +2, …) */
const spreadY = (index: number, center: number): number =>
  center + ((index + 1) >> 1) * (index % 2 === 0 ? 1 : -1);

/** 크리쳐 전투 유닛(사양 함수가 읽는 칸은 ID뿐이다) */
function creatureUnit(id: number): SimUnit {
  return {
    id,
    city: 0,
    owner: GARDENER_SIDE_FACTION,
    job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
    pos: { x: 0, y: 0 },
    tripStep: 0,
    eventId: undefined,
    satisfactionMilli: 0,
    bornAtMs: 0,
    lifespanMs: 0,
    recruit: null,
    rebirths: 0,
  };
}

/** 웨이브 공성 전투의 시작 자료. 수비 휴먼이 없으면 부르는 쪽이 전투 없이 웨이브가 이긴 것으로 한다 */
export function waveBattleInit(
  input: WaveBattleInput,
  catalog: CombatCatalog,
  c: CombatCoefficients,
): BattleInit {
  const size = input.mapSize;
  const center = size / 2;
  const edge: Edge = input.layout ? (input.attackEdge ?? 3) : 3;
  const arena = input.layout
    ? (input.prepared?.arena ??
      siegeArena(input.layout, size, siegeNexusDurability(input.layout, input.nexusDurability)))
    : undefined;
  const placer = arena ? (input.prepared?.placer ?? siegePlacer(arena, edge)) : undefined;
  let map = arena?.map;
  if (!map) {
    const open = openMap(size);
    const nexus = [center - 1, center].flatMap((y) => [center - 1, center].map((x) => y * size + x));
    open.buildings = [{ id: 1, cells: nexus, durability: input.nexusDurability, nexus: true }];
    map = open;
  }
  const kit = kitOf(catalog);
  // 마법형: 같은 몸에 무기만 지팡이(속성 무기 — 건물 피해 0, 사거리가 길어 넥서스 둘레를 막지 않는다). 팩에 없으면 같은 몸
  const staff = catalog.equipment.find((item) => item.id === MAGIC_WEAPON);
  const magicKit = staff
    ? {
        ...kit,
        equipped: kit.equipped.map((item, slot) =>
          kit.slots[slot] === staff.slot && slot === kit.slots.indexOf(staff.slot)
            ? itemAt(staff, 500)
            : item,
        ),
      }
    : kit;
  const skillCache = new Map<string, CombatSkill[]>();
  const units: CombatUnitSpec[] = [];
  for (let index = 0; index < input.strength; index++) {
    const physical = index >= input.strength - input.physical;
    // 배치가 있으면 들어오는 변의 3칸째 줄 빈 칸(없으면 그 크리쳐는 빠진다 — 128칸 맵에서는 일어나지 않는다)
    const at = placer ? placer.attacker(index) : { x: 2 + Math.floor(index / 24), y: spreadY(index, center) };
    if (!at) continue;
    const spec = specOf(
      creatureUnit(input.firstCreatureId + index),
      input.creatureTech,
      catalog,
      physical ? kit : magicKit,
      skillCache,
      {
        side: 1,
        party: 1 + Math.floor(index / PARTY_SIZE),
        x: at.x,
        y: at.y,
      },
      c,
    );
    units.push({ ...spec, buildingMulPm: physical ? SIEGE_BUILDING_MUL_PM : MAGIC_BUILDING_MUL_PM });
  }
  // 수비 파티 ID: 묶음 키마다 하나(처음 나온 차례), 묶음이 없는 유닛은 혼자 하나 — 101부터
  const groupIds = new Map<number, number>();
  let nextParty = 101;
  const defenderParty = (unitId: number): number => {
    const key = input.defenderPartyOf?.(unitId);
    if (key === undefined) return nextParty++;
    const known = groupIds.get(key);
    if (known !== undefined) return known;
    groupIds.set(key, nextParty);
    return nextParty++;
  };
  waveDefenderPick(
    input.defenders,
    input.maxDefenders,
    input.defenderPartyOf,
    input.defenderLegionOf,
  ).forEach((unit, index) => {
    const at = placer
      ? placer.defender(index)
      : { x: center - 3 + Math.floor(index / 24), y: spreadY(index, center) };
    if (!at) return;
    units.push(
      specOf(
        unit,
        input.defenderTech,
        catalog,
        kit,
        skillCache,
        {
          side: 2,
          party: defenderParty(unit.id),
          x: at.x,
          y: at.y,
        },
        c,
      ),
    );
  });
  const parties = [...new Set(units.map((unit) => unit.party))].map((id) => ({
    id,
    side: units.find((unit) => unit.party === id)?.side ?? 1,
    retreatHpPct: 0,
  }));
  return {
    id: input.battleId,
    kind: "siege",
    seed: input.seed,
    map,
    sides: [
      { id: 1, faction: GARDENER_SIDE_FACTION, defender: false, edge },
      { id: 2, faction: input.defenderFaction, defender: true, edge: oppositeEdge(edge) },
    ],
    parties,
    units,
    ...(input.limitMs === undefined ? {} : { limitMs: input.limitMs }),
  };
}
