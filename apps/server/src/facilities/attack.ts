// 건물·영토 비콘 공격(서버 권위) — 질문 381(기획 D-516 "다음 줄기: 전투 결과 → 건물 상태"), D-175(건물은 공격으로만 부순다)·
// D-176(공성 = 수비 쪽 넥서스)·D-5043(건물은 내구도로 물리 피해만)·기획 336 ③(비콘 부수기 = 다른 건물 공격과 같다, 전쟁·악명 규칙
// D-290·D-305). docs/adr/2026-11-07-buildings-runtime.md "바뀜 (전투·건물)".
// - 누가 치나: 336 ③ "다른 건물 공격과 같다" + D-174(시가지 밖 프런티어에서는 누구나 공격, 선공은 악명)·D-305(악명은 벌점일 뿐 막지
//   않는다, 전쟁 상대끼리는 악명 없음) → 누구나 남의 시설·다른 세력 비콘을 칠 수 있다. 도시 시가지(D-146, 영향권 반경 ÷ 3) 안은 공성 시간에만
//   (D-184, 기획 45 "시가지 안의 시설은 공성 시간에 공격받는다") → 공성 선포가 아직 없어 늘 safe_zone. 내 것·내 세력 것은 못 친다
//   (own_target). 전쟁 중인 세력끼리면 전쟁 전투(진 유닛은 포로, D-187). 악명·현상금은 아직 없다(TODO).
// - 전투: 넥서스 = 대상(지금 내구도 점). 전투맵 = 그 2차맵 구역(D-533·질문 1046 가, sim combat/siegeArena.ts — 대상 건물 실제 칸이 넥서스,
//   다른 건물은 실제 칸의 장애물, 지형 복사). 공격 편은 내 유닛들이 있는 쪽 변에서 들어온다. 비콘 자리에 건물이 겹치면 옛 열린 맵(가운데 2×2).
//   공격 = 내 유닛(그 건물·비콘 칸의 2차맵에 있는 것, 비활성·수호신은 unit_busy), 수비 = 그
//   주인(비콘은 그 세력)의 유닛 가운데 근처(ATTACK_DEFENDER_RADIUS칸)에 있는 것(비활성·수호신 빼고 — 그 도시 수호신은 도시 방어가 넣는다,
//   기획 답 452 다·456 가). [임시] 전투맵 한 변은 일반 크기 64. 몸은 세계 전투와 같은 셈(bodies·생명 수치·물약·탄).
// - 결과(battleTargets.ts): 전투 서비스가 끝 시각에 결과를 적용할 때 같은 동기 처리로 상태(ppm)를 줄인다(0이면 폐허 = 기능 정지, 366).
import {
  type BattleInit,
  type BattlePartySpec,
  CELL_UNITS,
  type CombatCoefficients,
  type CombatUnitSpec,
  type Edge,
  PLACEMENT_SIZE,
  footprintRect,
  type SocietyCoefficients,
  positionAt,
} from "@terra/sim";
import { durabilityPoints } from "@terra/shared/facilityRuntime";
import { type SiegeLayout, oppositeEdge, siegeArena, siegePlacer } from "@terra/sim/siegeArena";
import type { TerritoryService } from "../territory/service.ts";
import type { BattleBodies } from "../world/battleBodies.ts";
import {
  type BattleTarget,
  type BuildingDamageSink,
  type WorldBattleInit,
  siegeFacilityTargets,
} from "../world/battleTargets.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import { unavailable } from "../world/unitCondition.ts";
import { isAfloat } from "../world/unitKinds.ts";
import type { FacilityCatalog } from "./catalog.ts";
import { buildingCell } from "./places.ts";
import type { FacilityCommandResult, FacilityService, FacilityTarget } from "./service.ts";
import { beaconSiegeLayout, facilityPoints, siegeLayoutOn } from "./siegeLayout.ts";

/** [임시] 건물 공격 전투맵 한 변(49 C3 일반 크기 64 — 건물 하나라 공성 128보다 작게) */
export const ATTACK_MAP_SIZE = 64;
/** [임시] 수비로 들어오는 주인 유닛: 건물 기준 칸(비콘은 2차맵 가운데) 둘레 이 칸 안(C29 참전 '근처' 32칸과 같은 값) */
export const ATTACK_DEFENDER_RADIUS = 32;
/** [임시] 수비 인원 상한(공격 입력 한도 16과 같다, 가까운 차례) */
export const ATTACK_MAX_DEFENDERS = 16;
/** 넥서스(대상 건물)의 전투 건물 ID */
const NEXUS_ID = 1;
/** [임시] 시뮬·웨이브와 같은 파티 크기·한 칸 1초(C28)·사람형 건물 피해 배율(2,000‰) */
const PARTY_SIZE = 6;
const MOVE_INTERVAL_MS = 1000;
const BUILDING_MUL_PM = 2000;

export interface BuildingAttack {
  /** 내 유닛으로 남의 시설·다른 세력 비콘을 넥서스로 하는 공성 전투를 연다. 성공이면 doneAtMs = 결과 적용 시각 */
  attack(userId: string, target: FacilityTarget, unitIds: readonly number[]): Promise<FacilityCommandResult>;
}

export interface BuildingAttackOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  /** 소유 주체(세력 국고 = factionId가 있는 주체) */
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly service: FacilityService;
  readonly territory: () => TerritoryService | undefined;
  readonly catalog: () => FacilityCatalog;
  readonly rules: () => SocietyCoefficients;
  /** 전투 계수(공성 제한 시간 C2 실효 값). 없으면 전투 서비스의 계수표 값 */
  readonly combatRules?: (() => CombatCoefficients) | undefined;
  readonly bodies: Pick<BattleBodies, "build">;
  /** 세계 전투를 연다(몸·생명 수치·물약·탄을 붙여 전투 서비스로). 전투 ID */
  readonly startBattle: (init: BattleInit, war: boolean) => Promise<number>;
  /** 전투 결과를 적용하는 시각(전투가 없으면 undefined) */
  readonly endsAt: (battleId: number) => Promise<number | undefined>;
  /** 유닛이 노동 계약 중이거나 일하지 않는가(비활성·수호신) — 공격 유닛으로 못 쓴다 */
  readonly unitBusy: (unitId: number) => boolean;
  /**
   * 일하지 않는 유닛인가(비활성 = 전투만 막음 — 기획 답 452 다, 수호신 = 도시 방어가 그 도시 전투에만 따로 넣음 — 456 가). 수비로 고르지 않는다.
   * 없으면 늘 false
   */
  readonly unitAway?: ((unitId: number) => boolean) | undefined;
  readonly seed: () => number;
  readonly now: () => number;
  readonly ready: () => boolean;
}

const fail = (code: Extract<FacilityCommandResult, { ok: false }>["code"]): FacilityCommandResult => ({
  ok: false,
  code,
});

/** i번째를 가운데에서 위아래로 번갈아(0, +1, −1, +2, …) — 정원사 웨이브 진형과 같다 */
const spreadY = (index: number, center: number): number =>
  center + ((index + 1) >> 1) * (index % 2 === 0 ? 1 : -1);

/** 열린 맵 가운데 2×2 넥서스 칸 */
function openNexus(size: number): number[] {
  const center = size / 2;
  return [center - 1, center].flatMap((y) => [center - 1, center].map((x) => y * size + x));
}

/** 유닛이 지금 선 2차맵 배치 칸 */
function unitCell(map: SecondMap, unitId: number, at: number): { x: number; y: number } | undefined {
  const info = map.unitInfo(unitId);
  if (!info) return undefined;
  const point = positionAt(info.motion, at);
  return { x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) };
}

/** 칠 대상 하나 */
interface AttackTarget {
  readonly ref: Omit<BattleTarget, "building">;
  readonly map: SecondMap;
  /** 수비를 고르는 기준 칸(2차맵 배치 칸) */
  readonly center: { readonly x: number; readonly y: number };
  /** 지금 내구도 점(넥서스 내구도) */
  readonly points: number;
  /** 대상의 세력(전쟁 판정, 없으면 null) */
  readonly faction: number | null;
  /** 수비 편의 소유 주체(포로·탈취를 받는다, 없으면 0) */
  readonly defenderOwner: number;
  /** 그 유닛 주인이 수비 편인가 */
  readonly defends: (ownerId: number) => boolean;
  /** 전투맵 입력(2차맵 실제 배치). 없으면 옛 열린 맵 */
  readonly layout: SiegeLayout | undefined;
}

/** 공격 편이 들어오는 변: 넥서스 가운데 → 공격 유닛 평균 자리의 큰 축 쪽(같으면 동서). 유닛 자리를 모르면 서 */
export function arrivalEdge(
  nexus: { readonly x: number; readonly y: number },
  from: readonly { readonly x: number; readonly y: number }[],
): Edge {
  if (from.length === 0) return 3;
  const dx = from.reduce((sum, at) => sum + at.x, 0) - nexus.x * from.length;
  const dy = from.reduce((sum, at) => sum + at.y, 0) - nexus.y * from.length;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/**
 * 수비: 그 주인(비콘은 그 세력)의 쓸 수 있는 유닛 가운데 기준 칸에서 가까운 차례(같으면 작은 ID). 일하지 않는 유닛(비활성·수호신)은 뺀다 —
 * 수호신은 도시 방어(temple/cityDefense.ts)가 그 도시 전투에 넣는다
 */
function pickDefenders(
  target: AttackTarget,
  attackers: ReadonlySet<number>,
  at: number,
  away: (unitId: number) => boolean,
): number[] {
  const found: { id: number; d: number }[] = [];
  target.map.forEachUnit((unit) => {
    if (attackers.has(unit.id) || !target.defends(unit.ownerId) || away(unit.id)) return;
    const info = target.map.unitInfo(unit.id);
    const cell = unitCell(target.map, unit.id, at);
    if (!info || !cell || unavailable(info.condition, at) || isAfloat(info)) return;
    const d = Math.max(Math.abs(cell.x - target.center.x), Math.abs(cell.y - target.center.y));
    if (d <= ATTACK_DEFENDER_RADIUS) found.push({ id: unit.id, d });
  });
  return found
    .toSorted((a, b) => a.d - b.d || a.id - b.id)
    .slice(0, ATTACK_MAX_DEFENDERS)
    .map((entry) => entry.id);
}

export function createBuildingAttack(options: BuildingAttackOptions): BuildingAttack {
  const { maps, pool, now } = options;

  const factionOfUser = async (userId: string): Promise<number | null> => {
    const found = await pool.query(
      `select m.faction_id from faction_members m join factions f on f.id = m.faction_id
       where m.user_id = $1 and f.dissolved_at_ms is null`,
      [userId],
    );
    const row = found.rows[0];
    return row ? Number(row.faction_id) : null;
  };
  /** 소유 주체의 세력: 세력 국고 주체는 그 세력, 사용자 주체는 가입한 세력 */
  const factionOfOwner = async (ownerId: number): Promise<number | null> => {
    const owner = options.owners.get(ownerId);
    if (!owner) return null;
    if (owner.factionId !== null) return owner.factionId;
    return owner.userId === null ? null : factionOfUser(owner.userId);
  };
  const treasuryOf = (factionId: number): number => {
    let best: number | undefined;
    for (const owner of options.owners.values())
      if (owner.factionId === factionId && (best === undefined || owner.id < best)) best = owner.id;
    return best ?? 0;
  };
  const atWar = async (a: number, b: number): Promise<boolean> => {
    if (a === b) return false;
    // NPC 사회 런타임이 쓰기 대기열로 쓴 전쟁 줄까지 본다
    await options.writer.durable();
    const found = await pool.query(
      `select 1 from faction_wars where faction_a = $1 and faction_b = $2 and state = 'war'`,
      [Math.min(a, b), Math.max(a, b)],
    );
    return found.rows.length > 0;
  };
  const layoutSource = (at: number) => ({
    records: options.service.facilities,
    catalog: options.catalog(),
    rules: options.rules(),
    at,
  });
  /** 대상 찾기: 시설(남의 2차맵 건물) 또는 다른 세력 비콘. 칠 수 없으면 결과 코드 */
  const resolve = async (
    me: number,
    myFaction: number | null,
    target: FacilityTarget,
    at: number,
  ): Promise<AttackTarget | Extract<FacilityCommandResult, { ok: false }>["code"]> => {
    const rt = options.rules().facilityRuntime;
    if ("buildingId" in target) {
      const cell = buildingCell(maps, target.buildingId);
      const map = cell ? maps.get(cell.mapKey) : undefined;
      if (!cell || !map) return "unknown_building";
      const record = options.service.facilities.get(target.buildingId);
      if (!record) return "not_facility";
      const def = options.catalog().facility(record.facilityId);
      if (!def) return "unknown_facility";
      if (cell.ownerId === me) return "own_target";
      const owner = cell.ownerId;
      const faction = owner === null ? null : await factionOfOwner(owner);
      if (myFaction !== null && faction === myFaction) return "own_target";
      let rect: ReturnType<typeof footprintRect> | undefined;
      map.forEachBuilding((building) => {
        if (building.id === target.buildingId) rect = footprintRect(building.placement);
      });
      return {
        ref: { kind: "facility", id: target.buildingId },
        map,
        center: { x: cell.x, y: cell.y },
        points: facilityPoints(record, def.durability, at, rt),
        faction,
        defenderOwner: owner ?? 0,
        defends: (ownerId) => owner !== null && ownerId === owner,
        layout: rect ? siegeLayoutOn(map, rect, target.buildingId, layoutSource(at)) : undefined,
      };
    }
    const state = options.territory()?.beaconState(target.beaconId, at);
    if (!state) return "unknown_beacon";
    const { row } = state;
    if (myFaction !== null && row.factionId === myFaction) return "own_target";
    // 1차맵 칸 = 2차맵 하나(키가 같다). 그 2차맵을 이 서버가 띄우지 않았으면 유닛이 닿을 수 없다
    const map = maps.get(row.cellKey);
    if (!map || map.planetId !== row.planetId) return "out_of_reach";
    // 수비 = 그 세력 사람의 유닛: 그 2차맵 유닛 주인마다 세력을 미리 읽는다
    const owners = new Set<number>();
    map.forEachUnit((unit) => owners.add(unit.ownerId));
    const sameFaction = new Set<number>();
    for (const ownerId of owners)
      if ((await factionOfOwner(ownerId)) === row.factionId) sameFaction.add(ownerId);
    return {
      ref: { kind: "beacon", id: target.beaconId },
      map,
      center: { x: PLACEMENT_SIZE >> 1, y: PLACEMENT_SIZE >> 1 },
      points: durabilityPoints(state.conditionPpm, options.rules().territory.beaconDurability),
      faction: row.factionId,
      defenderOwner: treasuryOf(row.factionId),
      defends: (ownerId) => sameFaction.has(ownerId),
      layout: beaconSiegeLayout(map, { x: PLACEMENT_SIZE >> 1, y: PLACEMENT_SIZE >> 1 }, layoutSource(at)),
    };
  };

  /** 공격 유닛 확인: 내 유닛, 겹치지 않음, 그 2차맵, 작업·계약·부상·포로가 아님 */
  const checkAttackers = (
    me: number,
    map: SecondMap,
    unitIds: readonly number[],
    at: number,
  ): Extract<FacilityCommandResult, { ok: false }>["code"] | null => {
    if (new Set(unitIds).size !== unitIds.length) return "unknown_unit";
    for (const unitId of unitIds) {
      let home: SecondMap | undefined;
      for (const candidate of maps.values()) if (candidate.unitInfo(unitId)) home = candidate;
      const info = home?.unitInfo(unitId);
      if (!home || !info) return "unknown_unit";
      if (info.ownerId !== me) return "forbidden";
      if (home !== map) return "out_of_reach";
      // 배·승객은 전투에 들지 않는다(기획 D-541 1278 가)
      if (
        options.service.unitInJob(unitId) ||
        options.unitBusy(unitId) ||
        unavailable(info.condition, at) ||
        isAfloat(info)
      )
        return "unit_busy";
    }
    return null;
  };

  /**
   * 공성 시작 자료. 2차맵 배치가 있으면 그 구역(넥서스 = 대상 실제 칸, 공격 편은 들어오는 변 3칸째 줄, 수비 편은 넥서스 앞), 없으면 열린 맵
   * 가운데 넥서스. 몸을 만들 수 없거나 설 칸이 없으면 undefined
   */
  const initOf = (
    me: number,
    target: AttackTarget,
    attackers: readonly number[],
    defenders: readonly number[],
    at: number,
  ): WorldBattleInit | undefined => {
    const size = ATTACK_MAP_SIZE;
    const center = size / 2;
    const cells = size * size;
    const from = attackers.flatMap((id) => unitCell(target.map, id, at) ?? []);
    const edge: Edge = target.layout ? arrivalEdge(target.center, from) : 3;
    const arena = target.layout ? siegeArena(target.layout, size, target.points) : undefined;
    const placer = arena ? siegePlacer(arena, edge) : undefined;
    const units: CombatUnitSpec[] = [];
    const place = (id: number, side: number, party: number, cell: { x: number; y: number } | undefined) =>
      cell
        ? options.bodies.build(
            id,
            { id, side, party, ...cell, moveIntervalMs: MOVE_INTERVAL_MS, buildingMulPm: BUILDING_MUL_PM },
            at,
          )
        : undefined;
    for (const [index, id] of attackers.entries()) {
      const cell = placer
        ? placer.attacker(index)
        : { x: 2 + Math.floor(index / 24), y: spreadY(index, center) };
      const spec = place(id, 1, 1 + Math.floor(index / PARTY_SIZE), cell);
      if (!spec) return undefined;
      units.push(spec);
    }
    for (const [index, id] of defenders.entries()) {
      const cell = placer
        ? placer.defender(index)
        : { x: center - 3 - Math.floor(index / 24), y: spreadY(index, center) };
      const spec = place(id, 2, 101 + Math.floor(index / PARTY_SIZE), cell);
      if (!spec) return undefined;
      units.push(spec);
    }
    const parties: BattlePartySpec[] = [...new Set(units.map((unit) => unit.party))].map((id) => ({
      id,
      side: units.find((unit) => unit.party === id)?.side ?? 1,
      retreatHpPct: 0,
    }));
    const limitMs = options.combatRules?.().limitMs.siege;
    return {
      id: 0,
      kind: "siege",
      seed: options.seed() >>> 0,
      map: arena?.map ?? {
        size,
        passable: new Uint8Array(cells).fill(1),
        cover: new Uint8Array(cells),
        height: new Int32Array(cells),
        buildings: [{ id: NEXUS_ID, cells: openNexus(size), durability: target.points, nexus: true }],
      },
      sides: [
        { id: 1, faction: me, defender: false, edge },
        { id: 2, faction: target.defenderOwner, defender: true, edge: oppositeEdge(edge) },
      ],
      parties,
      units,
      ...(limitMs === undefined ? {} : { limitMs }),
      // 대상(넥서스) + 전투맵의 성벽·둘레 시설(질문 1114 가 — 부서진 만큼 세계에도 깎인다)
      targets: [
        { building: NEXUS_ID, ...target.ref },
        ...(arena
          ? siegeFacilityTargets(arena.sources, (id) => options.service.facilities.has(id), NEXUS_ID)
          : []),
      ],
    };
  };

  return {
    async attack(userId, target, unitIds) {
      const at = now();
      if (!options.ready()) return fail("busy");
      if (unitIds.length === 0) return fail("unknown_unit");
      const me = options.settlement.ownerOfUser(userId, at).id;
      const myFaction = await factionOfUser(userId);
      const found = await resolve(me, myFaction, target, at);
      if (typeof found === "string") return fail(found);
      if (found.points <= 0) return fail("target_ruined");
      // 시가지(안전지대, D-146) 안의 건물은 공성 시간에만 공격받는다(D-174·D-184). 공성 선포·시간은 전쟁·공성 줄기 — 지금은 늘 막는다
      const urban = await options
        .territory()
        ?.urbanCity(
          found.map.planetId,
          found.ref.kind === "beacon"
            ? { cellKey: found.map.mapKey }
            : { mapKey: found.map.mapKey, x: found.center.x, y: found.center.y },
        );
      if (urban !== undefined && urban !== null) return fail("safe_zone");
      const problem = checkAttackers(me, found.map, unitIds, at);
      if (problem) return fail(problem);
      const defenders = pickDefenders(found, new Set(unitIds), at, (id) => options.unitAway?.(id) ?? false);
      const init = initOf(me, found, unitIds, defenders, at);
      if (!init) return fail("busy");
      const war = myFaction !== null && found.faction !== null && (await atWar(myFaction, found.faction));
      const battleId = await options.startBattle(init, war);
      const endsAt = await options.endsAt(battleId);
      return endsAt === undefined ? { ok: true } : { ok: true, doneAtMs: endsAt };
    },
  };
}

/** 전투 결과의 건물 피해를 받는 곳(건물 서비스 = 시설, 영토 서비스 = 비콘) */
export function buildingDamageSinkOf(
  service: FacilityService,
  territory: () => TerritoryService | undefined,
): BuildingDamageSink {
  return {
    damageFacility: (buildingId, lost, destroyed, atMs) => service.damage(buildingId, lost, destroyed, atMs),
    damageBeacon: (beaconId, lost, destroyed, atMs) =>
      territory()?.damageBeacon(beaconId, lost, destroyed, atMs) ?? false,
  };
}
