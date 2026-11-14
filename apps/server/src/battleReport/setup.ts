// 보고서 설정 → 판 재료(PlaySetup) — docs/adr/2026-11-14-battle-report.md "설정", "바뀜 (2026-11-14, 실제 도시·웨이브 수비·군단)"
// - 팀 = 군단(파티 6명 기본 단위를 여럿 묶음, 기획 D-179·D-545). 옛 기록의 파티 하나는 파티 하나뿐인 군단으로 읽는다(같은 ID·자리라 같은 결과).
//   군단 명령 = 정한 시각에 군단의 모든 파티에 퇴각 명령(판정 입력), 파티 명령 = 파티 퇴각 기준선(⑦).
// - 파티 대 파티: 전투 실험실과 같은 사양 만들기(buildLabUnit)·같은 전투장 배치(arenaLegionInit — 파티 하나면 arenaInit와 같다, 홀수 판은 편을 바꾼다).
// - 파티 공성: 서버 웨이브·건물 공격과 같은 공성 전투맵(siegeArena)과 시작 자리(siegePlacer). 팀 A가 서쪽 변(3)에서 들어온다.
//   [임시] 공격 편 건물 피해 배율 2,000‰(건물 공격 facilities/attack.ts와 같은 사람형 값). 수비 = 팀 B 군단 또는 실제 도시의 세계 수비.
// - 웨이브 공성: 서버 정원사·시뮬레이터와 같은 시작 자료 함수(waveBattleInit). 수비 = 시뮬 휴먼 N명, 팀 B 군단(D-543·D-545 1384),
//   또는 실제 도시의 세계 수비.
// - 도시: 시뮬 도시 평지 배치(simCitySiegeLayout), 열린 맵, 또는 실제 세계 도시 스냅숏(worldCity.ts — 읽기만, 1383).
//   세계 수비는 서버 정원사와 같은 수비 휴먼 + 세계 전투 시작 길(몸·비활성·수호신·생명 수치·물약)을 지난다.
// 시작 자료는 시드만 판마다 바꾼다(유닛 자리는 시드와 상관없다). 이 파일은 주 스레드에서 돈다(워커는 결과 재료만 받는다).
import { LAB_LIMITS, type LabDropped, type LabParty } from "@terra/shared/battleLab";
import {
  type ReportCity,
  type ReportLegion,
  type ReportLegionView,
  type ReportSetup,
  legionOf,
  reportDefense,
} from "@terra/shared/battleReport";
import { REPORT_WORLD_DEFENDERS, type ReportCityInfo } from "@terra/shared/battleReportCity";
import {
  type BattleInit,
  type BattleInput,
  type BattleMapInput,
  type CombatUnitSpec,
  type Edge,
  type SimUnit,
  type SocietyCoefficients,
  waveBattleInit,
} from "@terra/sim";
import { type SiegeCityKit, TEST_SIEGE_KIT, simCitySiegeLayout } from "@terra/sim/city";
import {
  type SiegeArena,
  type SiegeLayout,
  oppositeEdge,
  siegeArena,
  siegeNexusDurability,
  siegePlacer,
} from "@terra/sim/siegeArena";
import { type ArenaParty, arenaLegionInit, arenaPartyId, arenaUnitId } from "../battleLab/arena.ts";
import { type LabRules, buildLabUnit } from "../battleLab/build.ts";
import type { PlayRow, PlaySetup } from "./play.ts";
import { type ReportCitySnapshot, reportCityInfo } from "./worldCity.ts";

/** 공성 전투맵 한 변(서버 정원사 웨이브와 같은 128) */
export const REPORT_SIEGE_MAP_SIZE = 128;
/** [임시] 파티 공성 공격 편 건물 피해 배율(‰, 건물 공격의 사람형 값) */
export const REPORT_SIEGE_BUILDING_MUL_PM = 2000;
/** 웨이브 크리쳐 전투 유닛 ID 시작(수비 휴먼 ID 1~와 겹치지 않게) */
const CREATURE_ID_BASE = 1_000_000;
/** 세계 수비와 싸울 때 크리쳐 ID 시작(서버 정원사 WAVE_CREATURE_ID_BASE와 같다 — 세계 유닛 ID와 겹치지 않게) */
const WORLD_CREATURE_ID_BASE = 1_900_000_000;
/** 세계 수비와 싸울 때 실험실 유닛 ID 시작(세계 유닛·크리쳐 ID와 겹치지 않게, int32 안) */
const WORLD_LAB_ID_BASE = 2_000_000_001;
/** 수비 파티 ID 시작(웨이브 크리쳐 파티 1~와 겹치지 않게, 웨이브 시뮬 수비와 같다) */
const DEFENDER_PARTY_BASE = 101;
/** 공성 공격 편이 들어오는 변(서쪽, 시뮬 공성·맞추기 도구와 같다) */
const SIEGE_EDGE: Edge = 3;
/** 실험실 공격 편 세력 칸(세계 수비와 싸울 때 — 어느 세계 주인과도 다르게, 수호신이 공격 편 주인 것으로 빠지지 않게) */
const LAB_ATTACKER_FACTION = -1;

export interface SetupContext {
  readonly rules: LabRules;
  readonly society: SocietyCoefficients;
  /** 파티 대 파티 전투장(지형) */
  readonly arenaMap: BattleMapInput | null;
  readonly kit?: SiegeCityKit | undefined;
  /** 실제 세계 도시 스냅숏(설정이 실제 도시를 쓸 때) */
  readonly city?: ReportCitySnapshot | undefined;
}

export interface BuiltSetup {
  readonly play: PlaySetup;
  readonly dropped: LabDropped[];
  /** 실제 도시를 썼으면 그 스냅숏 정보 */
  readonly city: ReportCityInfo | null;
}

/** 팀 A·B 군단 유닛 ID(전투장·공성 팀 수비 — 파티 하나면 옛 ID와 같다) */
const idA = (p: number, index: number): number => arenaUnitId("a", p, index);
const idB = (p: number, index: number): number => arenaUnitId("b", p, index);
/** 세계 수비와 싸우는 팀 A 유닛 ID */
const worldIdA = (p: number, index: number): number => WORLD_LAB_ID_BASE + p * LAB_LIMITS.partyMax + index;

/**
 * 이벤트 루프에 한 번 양보한다. 공성 재료(전투맵·시작 자리·사양)는 주 스레드에서 만들고 한 덩이가 수~수십 ms라, 덩이 사이에 실제 플레이어
 * 요청이 끼게 한다(ADR "부하" — 주 스레드 루프 지연)
 */
const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** 줄 이름: 표시 이름, 없으면 종류 ID */
const labelOf = (unit: LabParty["units"][number]): string => unit.label.trim() || unit.kind;

/** 군단 → 파티마다 사양 */
function legionSpecs(
  legion: ReportLegion,
  rules: LabRules,
): { parties: { party: LabParty; specs: CombatUnitSpec[] }[]; dropped: LabDropped[] } {
  const dropped: LabDropped[] = [];
  const parties = legion.parties.map((party) => ({
    party,
    specs: party.units.map((unit) => {
      const built = buildLabUnit(unit, rules);
      dropped.push(...built.dropped);
      return built.spec;
    }),
  }));
  return { parties, dropped };
}

/** 전투장 파티(사양 + 줄·자리) */
const arenaParty = (p: LabParty, specs: CombatUnitSpec[]): ArenaParty => ({
  units: specs.map((spec, index) => ({
    spec,
    row: p.units[index]?.row ?? "front",
    pos: p.units[index]?.pos,
  })),
  retreatHpPct: p.retreatHpPct,
});

/** 군단 유닛 줄(키 `<팀><파티>.<자리>`)과 유닛 ID → 줄 */
function legionRows(
  team: "a" | "b",
  legion: ReportLegion,
  idOf: (p: number, index: number) => number,
  rows: PlayRow[],
  rowOf: Record<number, number>,
): void {
  legion.parties.forEach((party, p) => {
    party.units.forEach((unit, index) => {
      rowOf[idOf(p, index)] = rows.length;
      rows.push({ key: `${team}${p}.${index}`, team, label: labelOf(unit), members: 1 });
    });
  });
}

/** 군단 퇴각 명령 → 판정 입력(그 시각 틱에 군단 모든 유닛에 퇴각 — 판정은 파티 퇴각으로 받는다) */
function legionInputs(
  legion: ReportLegion,
  idOf: (p: number, index: number) => number,
  tickMs: number,
): BattleInput[] {
  if (legion.retreatAtSec <= 0) return [];
  const tick = Math.ceil((legion.retreatAtSec * 1000) / tickMs);
  return legion.parties.flatMap((party, p) =>
    party.units.map((_, index) => ({
      tick,
      kind: "command" as const,
      unit: idOf(p, index),
      command: { kind: "retreat" as const },
    })),
  );
}

/** 시뮬 도시 평지 배치(시작 도시, 주거·행정 레벨) — 열린 맵이면 undefined */
export function reportLayout(
  city: ReportCity,
  society: SocietyCoefficients,
  kit: SiegeCityKit,
): SiegeLayout | undefined {
  if (city.layout === "open" || city.layout === "world") return undefined;
  return simCitySiegeLayout({
    cityId: 1,
    start: true,
    housing: city.housing,
    adminLevel: city.adminLevel,
    seed: society.worldSeed,
    kit,
    runtime: society.facilityRuntime,
    bedsPerLevel: society.logistics.lodgingBedsPerLevel,
    layoutSeed: 1,
  });
}

/** 열린 공성 맵(가운데 2×2 넥서스, waveBattleInit의 옛 열린 맵과 같다) */
function openSiege(size: number, nexusDurability: number): SiegeArena {
  const cells = size * size;
  const center = size / 2;
  const nexus = [center - 1, center].flatMap((y) => [center - 1, center].map((x) => y * size + x));
  return {
    map: {
      size,
      passable: new Uint8Array(cells).fill(1),
      cover: new Uint8Array(cells),
      height: new Int32Array(cells),
      buildings: [{ id: 1, cells: nexus, durability: nexusDurability, nexus: true }],
    },
    origin: { x: 0, y: 0 },
    nexusId: 1,
    sources: new Map(),
  };
}

/** 성벽·성문 ID와 넥서스 */
function buildingsOf(init: BattleInit): { wallIds: number[]; nexusId: number | null; nexusMax: number } {
  const nexus = init.map.buildings.find((building) => building.nexus);
  return {
    wallIds: init.map.buildings
      .filter((building) => building.wall === true || building.gateSide !== undefined)
      .map((building) => building.id),
    nexusId: nexus?.id ?? null,
    nexusMax: nexus?.durability ?? 0,
  };
}

/** 웨이브 수비 휴먼(시뮬 휴먼, 사양 함수가 읽는 칸은 ID뿐 — gardener-cal과 같다) */
function defender(id: number): SimUnit {
  return {
    id,
    city: 1,
    owner: 1,
    job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
    pos: { x: 0, y: 0 },
    tripStep: 0,
    eventId: undefined,
    satisfactionMilli: 60_000,
    bornAtMs: 0,
    lifespanMs: 0,
    recruit: null,
    rebirths: 0,
  };
}

/** 편 하나의 군단 모양(시작 자료에서) */
function legionView(init: BattleInit, inTeam: (id: number) => boolean): ReportLegionView {
  const units = init.units.filter((unit) => inTeam(unit.id));
  const parties = new Set(units.map((unit) => unit.party)).size;
  const commandCap = units.reduce((max, unit) => Math.max(max, unit.commandCap), 0);
  return {
    parties,
    units: units.length,
    commandCap,
    uncommanded: commandCap > 0 ? Math.max(0, parties - commandCap) : parties,
  };
}

/** 실제 도시 스냅숏이 필요한 설정에서 스냅숏(없으면 RangeError — 부르는 쪽이 unknown_city로 바꾼다) */
function cityOf(
  setup: Exclude<ReportSetup, { mode: "arena" }>,
  ctx: SetupContext,
): ReportCitySnapshot | undefined {
  if (setup.city.layout !== "world") return undefined;
  if (!ctx.city || ctx.city.cityId !== setup.city.cityId) throw new CityMissingError();
  return ctx.city;
}

export class CityMissingError extends Error {
  constructor() {
    super("report city snapshot missing");
  }
}

/** 공성 판의 지도 재료: 배치(실제 도시 스냅숏·시뮬 도시·열린 맵) → 전투맵과 시작 자리 */
function siegeMaterial(
  setup: Exclude<ReportSetup, { mode: "arena" }>,
  ctx: SetupContext,
  city: ReportCitySnapshot | undefined,
): { layout: SiegeLayout | undefined; arena: SiegeArena } {
  const layout = city ? city.layout : reportLayout(setup.city, ctx.society, ctx.kit ?? TEST_SIEGE_KIT);
  const size = REPORT_SIEGE_MAP_SIZE;
  const arena = layout
    ? siegeArena(layout, size, siegeNexusDurability(layout, setup.nexusDurability))
    : openSiege(size, setup.nexusDurability);
  return { layout, arena };
}

/** 설정 → 판 재료. 모르는 유닛 종류는 LabUnitError(부르는 쪽이 invalid_unit), 실제 도시 스냅숏이 없으면 CityMissingError */
export async function playSetupOf(setup: ReportSetup, ctx: SetupContext): Promise<BuiltSetup> {
  const { rules } = ctx;
  const coefficients = rules.coefficients;
  const tickMs = coefficients.tickMs;
  const limitMs = setup.limitSec * 1000;
  const rows: PlayRow[] = [];
  const rowOf: Record<number, number> = {};

  if (setup.mode === "arena") {
    if (!ctx.arenaMap) throw new RangeError("arena map missing");
    const la = legionOf(setup.a);
    const lb = legionOf(setup.b);
    const a = legionSpecs(la, rules);
    const b = legionSpecs(lb, rules);
    const job = {
      a: a.parties.map((entry) => arenaParty(entry.party, entry.specs)),
      b: b.parties.map((entry) => arenaParty(entry.party, entry.specs)),
      map: ctx.arenaMap,
      limitMs,
    };
    legionRows("a", la, idA, rows, rowOf);
    legionRows("b", lb, idB, rows, rowOf);
    const normal = arenaLegionInit(job, 0, false);
    const inputs = [...legionInputs(la, idA, tickMs), ...legionInputs(lb, idB, tickMs)];
    return {
      play: {
        mode: "arena",
        normal,
        swapped: arenaLegionInit(job, 0, true),
        coefficients,
        rows,
        rowOf,
        timeoutByShare: true,
        wallIds: [],
        nexusId: null,
        nexusMax: 0,
        inputs,
        legion: {
          a: legionView(normal, (id) => rows[rowOf[id] ?? -1]?.team === "a"),
          b: legionView(normal, (id) => rows[rowOf[id] ?? -1]?.team === "b"),
        },
      },
      dropped: [...a.dropped, ...b.dropped],
      city: null,
    };
  }

  const city = cityOf(setup, ctx);
  const defense = reportDefense(setup);
  const worldDefense = defense === "world";
  if (worldDefense && !city) throw new CityMissingError();
  const { layout, arena } = siegeMaterial(setup, ctx, city);
  const size = REPORT_SIEGE_MAP_SIZE;
  const edge = SIEGE_EDGE;
  await yieldToLoop();
  // 시작 자리는 한 번만 만들어 웨이브 시작 자료와 이어 쓴다(자리 찾기가 공성 재료에서 가장 비싸다 — 주 스레드 루프 지연)
  const placer = siegePlacer(arena, edge);
  const prepared = layout ? { arena, placer } : undefined;
  await yieldToLoop();
  const dropped: LabDropped[] = [];
  const inputs: BattleInput[] = [];
  let init: BattleInit;
  /** 세계 수비 유닛 ID(세계 전투 시작 길을 지난다) */
  let worldIds: ReadonlySet<number> = new Set<number>();
  /** 세계 수비 시작 자료(크리쳐 strength마리 + 세계 휴먼) — 실제 도시 스냅숏의 기술 단계·수비 상한 */
  const worldWave = (
    snapshot: ReportCitySnapshot,
    strength: number,
    physical: number,
    creatureTech: number,
  ) =>
    waveBattleInit(
      {
        battleId: 1,
        seed: 0,
        defenderFaction: snapshot.owner,
        defenders: snapshot.defenders,
        defenderTech: snapshot.defenderTech,
        strength,
        physical,
        creatureTech,
        firstCreatureId: WORLD_CREATURE_ID_BASE,
        mapSize: size,
        nexusDurability: setup.nexusDurability,
        maxDefenders: REPORT_WORLD_DEFENDERS,
        limitMs,
        layout,
        attackEdge: edge,
        prepared,
      },
      rules.catalog,
      coefficients,
    );

  if (setup.mode === "wave") {
    const creatureBase = worldDefense ? WORLD_CREATURE_ID_BASE : CREATURE_ID_BASE;
    rows.push(
      { key: "wave_physical", team: "a", label: "", members: 0 },
      { key: "wave_magic", team: "a", label: "", members: 0 },
    );
    const waveInput = {
      battleId: 1,
      seed: 0,
      defenderFaction: 1,
      defenders:
        defense === "sim" ? Array.from({ length: setup.defenders }, (_, index) => defender(index + 1)) : [],
      defenderTech: setup.defenderTech,
      strength: setup.strength,
      physical: setup.physical,
      creatureTech: setup.creatureTech,
      firstCreatureId: CREATURE_ID_BASE,
      mapSize: size,
      nexusDurability: setup.nexusDurability,
      maxDefenders: setup.defenders,
      limitMs,
      layout,
      attackEdge: edge,
      prepared,
    };
    if (worldDefense && city) {
      init = worldWave(city, setup.strength, setup.physical, setup.creatureTech);
      worldIds = new Set(city.defenders.slice(0, REPORT_WORLD_DEFENDERS).map((unit) => unit.id));
    } else init = waveBattleInit(waveInput, rules.catalog, coefficients);
    await yieldToLoop();
    for (const unit of init.units)
      if (unit.side === 1 && unit.id >= creatureBase)
        rowOf[unit.id] = unit.id - creatureBase >= setup.strength - setup.physical ? 0 : 1;
    if (defense === "party") {
      // 팀 B 군단이 넥서스 앞에서 지킨다(웨이브 시뮬 수비와 같은 자리 차례)
      const lb = legionOf(setup.b ?? { parties: [], retreatAtSec: 0 });
      const b = legionSpecs(lb, rules);
      dropped.push(...b.dropped);
      const units: CombatUnitSpec[] = [];
      let at = 0;
      b.parties.forEach((entry, p) => {
        entry.specs.forEach((spec, index) => {
          const cell = placer.defender(at);
          at += 1;
          if (!cell) return;
          units.push({
            ...spec,
            id: idB(p, index),
            side: 2,
            party: DEFENDER_PARTY_BASE + p,
            x: cell.x,
            y: cell.y,
          });
        });
      });
      legionRows("b", lb, idB, rows, rowOf);
      inputs.push(...legionInputs(lb, idB, tickMs));
      init = {
        ...init,
        units: [...init.units, ...units],
        parties: [
          ...init.parties,
          ...lb.parties.map((party, p) => ({
            id: DEFENDER_PARTY_BASE + p,
            side: 2,
            retreatHpPct: party.retreatHpPct,
          })),
        ],
      };
    }
  } else {
    // 파티 공성: 팀 A 군단이 서쪽에서 친다
    const la = legionOf(setup.a);
    const a = legionSpecs(la, rules);
    dropped.push(...a.dropped);
    const attackerId = worldDefense ? worldIdA : idA;
    const attackers: CombatUnitSpec[] = [];
    let at = 0;
    a.parties.forEach((entry, p) => {
      entry.specs.forEach((spec, index) => {
        const cell = placer.attacker(at);
        at += 1;
        if (!cell) return;
        attackers.push({
          ...spec,
          id: attackerId(p, index),
          side: 1,
          party: arenaPartyId("a", p),
          x: cell.x,
          y: cell.y,
          buildingMulPm: REPORT_SIEGE_BUILDING_MUL_PM,
        });
      });
    });
    legionRows("a", la, attackerId, rows, rowOf);
    inputs.push(...legionInputs(la, attackerId, tickMs));
    const attackerParties = la.parties.map((party, p) => ({
      id: arenaPartyId("a", p),
      side: 1,
      retreatHpPct: party.retreatHpPct,
    }));
    if (worldDefense && city) {
      // 실제 도시 수비: 서버 정원사와 같은 수비 휴먼·자리(크리쳐 없이 만든 웨이브 시작 자료의 수비 몫) + 실험실 공격 편
      await yieldToLoop();
      const base = worldWave(city, 0, 0, 1);
      worldIds = new Set(base.units.map((unit) => unit.id));
      init = {
        ...base,
        sides: [
          { id: 1, faction: LAB_ATTACKER_FACTION, defender: false, edge },
          { id: 2, faction: city.owner, defender: true, edge: oppositeEdge(edge) },
        ],
        parties: [...attackerParties, ...base.parties],
        units: [...attackers, ...base.units],
      };
    } else {
      const lb = legionOf(setup.b);
      const b = legionSpecs(lb, rules);
      dropped.push(...b.dropped);
      const defenders: CombatUnitSpec[] = [];
      let bt = 0;
      b.parties.forEach((entry, p) => {
        entry.specs.forEach((spec, index) => {
          const cell = placer.defender(bt);
          bt += 1;
          if (!cell) return;
          defenders.push({
            ...spec,
            id: idB(p, index),
            side: 2,
            party: arenaPartyId("b", p),
            x: cell.x,
            y: cell.y,
          });
        });
      });
      legionRows("b", lb, idB, rows, rowOf);
      inputs.push(...legionInputs(lb, idB, tickMs));
      init = {
        id: 1,
        kind: "siege",
        seed: 0,
        map: arena.map,
        sides: [
          { id: 1, faction: 1, defender: false, edge },
          { id: 2, faction: 2, defender: true, edge: oppositeEdge(edge) },
        ],
        parties: [
          ...attackerParties,
          ...lb.parties.map((party, p) => ({
            id: arenaPartyId("b", p),
            side: 2,
            retreatHpPct: party.retreatHpPct,
          })),
        ].toSorted((x, y) => x.id - y.id),
        units: [...attackers, ...defenders],
        limitMs,
      };
    }
  }

  // 세계 수비: 세계 전투 시작 길(몸·비활성·수호신·생명 수치·물약 — 읽기만)
  let guardians = 0;
  if (worldDefense && city) {
    const prepared = await city.prepare(init, worldIds);
    init = prepared.init;
    worldIds = prepared.worldIds;
    guardians = prepared.guardians;
  }
  // 수비 무리 줄: 실험실 군단이 아닌 수비 편 유닛(시뮬 휴먼·세계 수비·수호신)
  if (defense !== "party") {
    const at = rows.length;
    rows.push({ key: "defenders", team: "b", label: "", members: 0 });
    const defenderSide = init.sides.find((side) => side.defender)?.id ?? 2;
    for (const unit of init.units)
      if (unit.side === defenderSide && rowOf[unit.id] === undefined) rowOf[unit.id] = at;
  }
  const members = rows.map(() => 0);
  for (const unit of init.units) {
    const row = rowOf[unit.id];
    if (row !== undefined) members[row] = (members[row] ?? 0) + 1;
  }
  const inTeam = (team: "a" | "b") => (id: number) => rows[rowOf[id] ?? -1]?.team === team;
  return {
    play: {
      mode: setup.mode,
      normal: init,
      swapped: null,
      coefficients,
      rows: rows.map((row, index) => (row.members === 1 ? row : { ...row, members: members[index] ?? 0 })),
      rowOf,
      timeoutByShare: false,
      ...buildingsOf(init),
      inputs: inputs.toSorted((x, y) => x.tick - y.tick),
      legion: { a: legionView(init, inTeam("a")), b: legionView(init, inTeam("b")) },
    },
    dropped,
    city: city ? reportCityInfo(city, init, worldIds, guardians) : null,
  };
}

/** 지금 도시 정보(견주기 — 저장된 스냅숏과 같은 셈: 크리쳐 없는 웨이브 시작 자료의 세계 수비) */
export async function cityInfoNow(snapshot: ReportCitySnapshot, ctx: SetupContext): Promise<ReportCityInfo> {
  const built = await playSetupOf(
    {
      mode: "wave",
      strength: 1,
      physical: 0,
      creatureTech: 1,
      defenders: 1,
      defenderTech: 1,
      city: { layout: "world", housing: 0, adminLevel: 1, cityId: snapshot.cityId },
      nexusDurability: 1,
      limitSec: 60,
      defense: "world",
    },
    { ...ctx, city: snapshot },
  );
  if (!built.city) throw new CityMissingError();
  return built.city;
}
