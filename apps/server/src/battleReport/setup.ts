// 보고서 설정 → 판 재료(PlaySetup) — docs/adr/2026-11-14-battle-report.md "설정"
// - 파티 대 파티: 전투 실험실과 같은 사양 만들기(buildLabUnit)·같은 전투장 배치(arenaInit, 홀수 판은 편을 바꾼다).
// - 파티 공성: 서버 웨이브·건물 공격과 같은 공성 전투맵(siegeArena — 시뮬 도시 평지 배치 + 성벽, simCitySiegeLayout)과 시작 자리(siegePlacer).
//   팀 A가 서쪽 변(3)에서 들어와 팀 B가 넥서스 앞에서 지킨다. [임시] 공격 편 건물 피해 배율 2,000‰(건물 공격 facilities/attack.ts와 같은 사람형 값).
// - 웨이브 공성: 서버 정원사·시뮬레이터와 같은 시작 자료 함수(waveBattleInit). 수비 휴먼은 시뮬 휴먼 사양(ID만 다르다).
// 시작 자료는 시드만 판마다 바꾼다(유닛 자리는 시드와 상관없다). 이 파일은 주 스레드에서 돈다(워커는 결과 재료만 받는다).
import type { LabDropped, LabParty, LabUnit } from "@terra/shared/battleLab";
import type { ReportCity, ReportSetup } from "@terra/shared/battleReport";
import {
  type BattleInit,
  type BattleMapInput,
  type CombatUnitSpec,
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
import { type ArenaParty, arenaInit } from "../battleLab/arena.ts";
import { type LabRules, buildLabUnit } from "../battleLab/build.ts";
import type { PlayRow, PlaySetup } from "./play.ts";

/** 공성 전투맵 한 변(서버 정원사 웨이브와 같은 128) */
export const REPORT_SIEGE_MAP_SIZE = 128;
/** [임시] 파티 공성 공격 편 건물 피해 배율(‰, 건물 공격의 사람형 값) */
export const REPORT_SIEGE_BUILDING_MUL_PM = 2000;
/** 웨이브 크리쳐 전투 유닛 ID 시작(수비 휴먼 ID 1~와 겹치지 않게) */
const CREATURE_ID_BASE = 1_000_000;
/** 공성 공격 편이 들어오는 변(서쪽, 시뮬 공성·맞추기 도구와 같다) */
const SIEGE_EDGE = 3;

export interface SetupContext {
  readonly rules: LabRules;
  readonly society: SocietyCoefficients;
  /** 파티 대 파티 전투장(지형) */
  readonly arenaMap: BattleMapInput | null;
  readonly kit?: SiegeCityKit | undefined;
}

/** 줄 이름: 표시 이름, 없으면 종류 ID */
const labelOf = (unit: LabUnit): string => unit.label.trim() || unit.kind;

function partySpecs(party: LabParty, rules: LabRules): { specs: CombatUnitSpec[]; dropped: LabDropped[] } {
  const dropped: LabDropped[] = [];
  const specs = party.units.map((unit) => {
    const built = buildLabUnit(unit, rules);
    dropped.push(...built.dropped);
    return built.spec;
  });
  return { specs, dropped };
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

/** 팀 A ID 1~, 팀 B 101~(전투 실험실과 같다) → 줄 */
function partyRows(a: LabParty, b: LabParty): { rows: PlayRow[]; rowOf: Record<number, number> } {
  const rows: PlayRow[] = [];
  const rowOf: Record<number, number> = {};
  a.units.forEach((unit, index) => {
    rowOf[1 + index] = rows.length;
    rows.push({ key: `a${index}`, team: "a", label: labelOf(unit), members: 1 });
  });
  b.units.forEach((unit, index) => {
    rowOf[101 + index] = rows.length;
    rows.push({ key: `b${index}`, team: "b", label: labelOf(unit), members: 1 });
  });
  return { rows, rowOf };
}

/** 시뮬 도시 평지 배치(시작 도시, 주거·행정 레벨) — 열린 맵이면 undefined */
export function reportLayout(
  city: ReportCity,
  society: SocietyCoefficients,
  kit: SiegeCityKit,
): SiegeLayout | undefined {
  if (city.layout === "open") return undefined;
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

/** 설정 → 판 재료. 모르는 유닛 종류는 LabUnitError(부르는 쪽이 invalid_unit) */
export function playSetupOf(
  setup: ReportSetup,
  ctx: SetupContext,
): { play: PlaySetup; dropped: LabDropped[] } {
  const { rules } = ctx;
  const coefficients = rules.coefficients;
  const limitMs = setup.limitSec * 1000;
  if (setup.mode === "arena") {
    if (!ctx.arenaMap) throw new RangeError("arena map missing");
    const a = partySpecs(setup.a, rules);
    const b = partySpecs(setup.b, rules);
    const job = {
      a: arenaParty(setup.a, a.specs),
      b: arenaParty(setup.b, b.specs),
      map: ctx.arenaMap,
      coefficients,
      limitMs,
      seed: 0,
    };
    const { rows, rowOf } = partyRows(setup.a, setup.b);
    return {
      play: {
        mode: "arena",
        normal: arenaInit(job, 0, false),
        swapped: arenaInit(job, 0, true),
        coefficients,
        rows,
        rowOf,
        timeoutByShare: true,
        wallIds: [],
        nexusId: null,
        nexusMax: 0,
      },
      dropped: [...a.dropped, ...b.dropped],
    };
  }
  const kit = ctx.kit ?? TEST_SIEGE_KIT;
  const layout = reportLayout(setup.city, ctx.society, kit);
  const size = REPORT_SIEGE_MAP_SIZE;
  if (setup.mode === "wave") {
    const init = waveBattleInit(
      {
        battleId: 1,
        seed: 0,
        defenderFaction: 1,
        defenders: Array.from({ length: setup.defenders }, (_, index) => defender(index + 1)),
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
        attackEdge: SIEGE_EDGE,
      },
      rules.catalog,
      coefficients,
    );
    const rows: PlayRow[] = [
      { key: "wave_physical", team: "a", label: "", members: 0 },
      { key: "wave_magic", team: "a", label: "", members: 0 },
      { key: "defenders", team: "b", label: "", members: 0 },
    ];
    const rowOf: Record<number, number> = {};
    const members = [0, 0, 0];
    for (const unit of init.units) {
      let row: number;
      if (unit.id >= CREATURE_ID_BASE)
        row = unit.id - CREATURE_ID_BASE >= setup.strength - setup.physical ? 0 : 1;
      else row = 2;
      rowOf[unit.id] = row;
      members[row] = (members[row] ?? 0) + 1;
    }
    return {
      play: {
        mode: "wave",
        normal: init,
        swapped: null,
        coefficients,
        rows: rows.map((row, index) => ({ ...row, members: members[index] ?? 0 })),
        rowOf,
        timeoutByShare: false,
        ...buildingsOf(init),
      },
      dropped: [],
    };
  }
  // 파티 공성
  const arena = layout
    ? siegeArena(layout, size, siegeNexusDurability(layout, setup.nexusDurability))
    : openSiege(size, setup.nexusDurability);
  const placer = siegePlacer(arena, SIEGE_EDGE);
  const a = partySpecs(setup.a, rules);
  const b = partySpecs(setup.b, rules);
  const units: CombatUnitSpec[] = [];
  a.specs.forEach((spec, index) => {
    const at = placer.attacker(index);
    if (!at) return;
    units.push({
      ...spec,
      id: 1 + index,
      side: 1,
      party: 1,
      x: at.x,
      y: at.y,
      buildingMulPm: REPORT_SIEGE_BUILDING_MUL_PM,
    });
  });
  b.specs.forEach((spec, index) => {
    const at = placer.defender(index);
    if (!at) return;
    units.push({ ...spec, id: 101 + index, side: 2, party: 2, x: at.x, y: at.y });
  });
  const init: BattleInit = {
    id: 1,
    kind: "siege",
    seed: 0,
    map: arena.map,
    sides: [
      { id: 1, faction: 1, defender: false, edge: SIEGE_EDGE },
      { id: 2, faction: 2, defender: true, edge: oppositeEdge(SIEGE_EDGE) },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: setup.a.retreatHpPct },
      { id: 2, side: 2, retreatHpPct: setup.b.retreatHpPct },
    ],
    units,
    limitMs,
  };
  const { rows, rowOf } = partyRows(setup.a, setup.b);
  return {
    play: {
      mode: "siege",
      normal: init,
      swapped: null,
      coefficients,
      rows,
      rowOf,
      timeoutByShare: false,
      ...buildingsOf(init),
    },
    dropped: [...a.dropped, ...b.dropped],
  };
}
