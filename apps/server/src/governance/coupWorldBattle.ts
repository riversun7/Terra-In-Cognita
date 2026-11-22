// 쿠데타 전투 = 세계 전투(줄기 no-teleport-a — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다", 질문 2652·2653).
// 옛 길(@terra/sim runCoupBattle — 거울 세계 유닛만, 빨리감기 한 번에 결과)을 대신한다:
// - 판정은 다른 세계 전투(건물 공격·정원사 웨이브)와 같다: 전투 서비스(world/battles.ts)에 넣고, 몸은 실제 몸(입은 장비·버프 — battleBodies.ts build, 사이보그
//   본체·고용 휴먼·NPC 휴먼 모두), 남은 생명 수치·물약·탄도 같은 단계(vitals·items battleStart), 끝 시각에 결과 적용(부상 D-099·D-521, 진 유닛은 안전한 곳으로
//   걸어감 — battleResults.ts, 2655)이 같은 묶음으로 남는다(2653 — 기술 기본값 [임시] 대신).
// - 전투맵 = 반란 전투 틀(D-256 "도시 안 전투맵에서 공성과 같은 틀, 시청이 넥서스")을 세계 공성 길로: 그 도시 2차맵의 실제 배치(facilities/siegeLayout.ts
//   citySiegeLayout — 넥서스 = 그 도시 행정 건물, 다른 건물 = 장애물, 지형). 행정 건물이 없으면 열린 맵 가운데 넥서스. 한 변·넥서스 내구도는 옛 쿠데타 틀과
//   같은 128·2,000(행정 건물 내구도가 있으면 그 값).
// - 바뀜 (fixes-1117i, 질문 2692 — 기획 D-570 "모든유닛이 피해받을수도 건물포함"): 전투맵의 넥서스(행정 건물)·성벽·둘레 시설이 깎인 만큼 세계 시설도 깎인다
//   (건물 공격·정원사 웨이브와 같은 길 — 시작 자료 targets, world/battleTargets.ts → 결과 적용 battleApply.ts). 웨이브와 달리 넥서스는 누가 이기든 깎인다
//   (쿠데타 결과는 도시를 폐허로 만들지 않아 두 번 깎이지 않는다). 0이 되면 폐허(기능 정지)이고 수리(플레이어·NPC 증축 수리)로 되돌린다.
// - 편: 1 = 혁명군(들어오는 변 = 혁명군 유닛 평균 자리 쪽), 2 = 정부군(수비 — 넥서스를 지킨다). 내전이라 편 faction은 0(포로·탈취·방어 명성 없음 — 2456 가).
// - 늦게 닿은 병력(2652 — D-176 "전투중인경우 … 다른 유저가 클릭하여 지원하여 참전가능"): 진행 중인 전투에 참전 입력(join)으로 넣는다. 자리는 그 편 변의
//   다음 시작 자리(공성 시작 자리 고르기 siegePlacer). 편마다 유닛 수 상한 = 설정 칸 gov_coup_battle_units(시작·참전 합) [임시].
import { randomInt } from "node:crypto";
import {
  type BattleInit,
  type BattleInput,
  type BattlePartySpec,
  CELL_UNITS,
  type CombatCoefficients,
  type CombatUnitSpec,
  type Edge,
  TEST_COMBAT_COEFFICIENTS,
  positionAt,
} from "@terra/sim";
import {
  type SiegeLayout,
  oppositeEdge,
  siegeArena,
  siegeNexusDurability,
  siegePlacer,
} from "@terra/sim/siegeArena";
import { citySiegeLayoutOf } from "../facilities/siegeLayout.ts";
import { type WorldBattleInit, siegeFacilityTargets } from "../world/battleTargets.ts";
import { arrivalEdge } from "../facilities/attack.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { isAfloat } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";
import type { GovernanceNation } from "./port.ts";

/** 쿠데타 전투 한 편 */
export type CoupBattleSide = "rebel" | "government";

/** 쿠데타 전투 상태(전투 서비스 행) */
export type CoupBattleState =
  | { readonly state: "running"; readonly endsAtMs: number; readonly units: ReadonlySet<number> }
  | { readonly state: "ended"; readonly rebelsWon: boolean; readonly units: ReadonlySet<number> };

export interface GovernancePortCoupBattle {
  /**
   * 쿠데타 전투를 연다(세계 전투). rebels·loyal = 그 도시 2차맵에 도착한 유닛(coup.ts가 고른다). 편마다 앞에서 unitsPerSide개. 전투 ID — 세계가 준비되지
   * 않았거나 혁명군 몸을 하나도 만들 수 없으면 undefined
   */
  openCoupBattle(
    nation: GovernanceNation,
    cityId: number | undefined,
    rebels: readonly number[],
    loyal: readonly number[],
    nowMs: number,
    unitsPerSide: number,
  ): Promise<number | undefined>;
  /** 전투 상태(전투 행이 없으면 undefined) */
  coupBattleState(battleId: number): Promise<CoupBattleState | undefined>;
  /** 도착한 유닛을 진행 중인 전투에 넣는다(참전 입력 — 2652). 넣은 유닛 ID */
  joinCoupBattle(
    battleId: number,
    cityId: number | undefined,
    side: CoupBattleSide,
    unitIds: readonly number[],
    nowMs: number,
    unitsPerSide: number,
  ): Promise<number[]>;
  /** 지금(nowMs)에서 atMs에 run을 부른다(서버 타이머 — 다시 켜면 버려지고 1분 의결 틱이 대신 본다) */
  wakeAt(atMs: number, nowMs: number, run: () => void): void;
}

/** 쿠데타 전투맵 한 변(49 C3 공성 128)·넥서스 내구도(행정 건물이 없을 때) — 옛 쿠데타 틀(@terra/sim coupBattle.ts)과 같은 출발값 [임시] */
export const COUP_BATTLE_MAP_SIZE = 128;
export const COUP_NEXUS_DURABILITY = 2000;
/** [임시] 시뮬·웨이브·건물 공격과 같은 파티 크기·한 칸 1초(C28)·사람형 건물 피해 배율(2,000‰) */
const PARTY_SIZE = 6;
const MOVE_INTERVAL_MS = 1000;
const BUILDING_MUL_PM = 2000;
const REBEL_SIDE = 1;
const GOVERNMENT_SIDE = 2;
/** 정부군 파티 ID 시작(혁명군 1~) */
const GOVERNMENT_PARTY_BASE = 101;
/** 열린 맵 넥서스 전투 건물 ID */
const NEXUS_ID = 1;
/** 시설 목표에서 뺄 전투 건물이 없음(전투 건물 ID는 1부터 — 넥서스도 목표에 든다, 질문 2692) */
const SKIP_NONE = 0;

type CoupBattleWorld = Pick<World, "status" | "persistence" | "maps" | "npc">;

/** i번째를 가운데에서 위아래로 번갈아(0, +1, −1, +2, …) — 건물 공격 열린 맵과 같다 */
const spread = (index: number, center: number): number =>
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

/** 그 편 index번째 시작 자리(공성 배치가 있으면 siegePlacer, 없으면 열린 맵 진형). 앞 index개 자리는 이미 준 것으로 센다 */
type Placer = (side: CoupBattleSide, index: number) => { x: number; y: number } | undefined;

/** 시작 자리 고르기(같은 배치·변이면 같은 차례 — 참전 자리는 앞 자리를 차례로 다시 받아 같은 칸을 피한 뒤 다음 자리) */
const placerOf = (
  layout: SiegeLayout | undefined,
  edge: Edge,
  size: number,
  nexusDurability: number,
): Placer => {
  const arena = layout ? siegeArena(layout, size, nexusDurability) : undefined;
  const center = size / 2;
  return (side, index) => {
    if (!arena)
      return side === "rebel"
        ? { x: 2 + Math.floor(index / 24), y: spread(index, center) }
        : { x: center - 3 - Math.floor(index / 24), y: spread(index, center) };
    const placer = siegePlacer(arena, edge);
    let cell: { x: number; y: number } | undefined;
    for (let i = 0; i <= index; i++) cell = side === "rebel" ? placer.attacker(i) : placer.defender(i);
    return cell;
  };
};

/** 전투에 넣을 수 있는 유닛인가: 그 2차맵에 서 있고, 쓸 수 있고(부상 빨강·포로·돌아가는 중이 아님), 물 위가 아님 */
const fit = (map: SecondMap, unitId: number, at: number): boolean => {
  const info = map.unitInfo(unitId);
  return info !== undefined && !unavailable(info.condition, at) && !isAfloat(info);
};

const tickMs = (): number => TEST_COMBAT_COEFFICIENTS.tickMs;

export function worldGovernancePortCoupBattle(
  world: () => CoupBattleWorld | undefined,
  combat?: () => { readonly rules: CombatCoefficients } | undefined,
): GovernancePortCoupBattle {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.persistence
      ? { persistence: w.persistence, maps: w.maps, npc: w.npc }
      : undefined;
  };
  type Live = NonNullable<ReturnType<typeof live>>;

  /** 그 도시 2차맵과 공성 배치(행정 건물이 없으면 layout 없음) */
  const arenaOf = (l: Live, cityId: number | undefined, at: number) => {
    const place = cityId === undefined ? undefined : l.npc?.places.get(cityId);
    const map = place ? l.maps.get(place.mapKey) : undefined;
    if (!place || !map || cityId === undefined) return undefined;
    const layout = citySiegeLayoutOf(l.maps, l.persistence.facilities, () => at)(cityId, place);
    return {
      map,
      layout,
      center: layout
        ? { x: layout.nexus.x + (layout.nexus.width >> 1), y: layout.nexus.y + (layout.nexus.height >> 1) }
        : { x: place.cellX, y: place.cellY },
    };
  };

  /** 유닛 몸(실제 몸 — battleBodies build). 만들 수 없으면 undefined */
  const bodyOf = (
    l: Live,
    id: number,
    side: number,
    party: number,
    cell: { x: number; y: number },
    at: number,
  ) =>
    l.persistence.bodies.build(
      id,
      { id, side, party, ...cell, moveIntervalMs: MOVE_INTERVAL_MS, buildingMulPm: BUILDING_MUL_PM },
      at,
    );

  return {
    async openCoupBattle(_nation, cityId, rebels, loyal, nowMs, unitsPerSide) {
      const l = live();
      const where = l ? arenaOf(l, cityId, nowMs) : undefined;
      if (!l || !where) return undefined;
      const cap = Math.max(1, Math.trunc(unitsPerSide));
      const loyalSet = new Set(loyal);
      // 한 유닛이 두 편에 있으면 혁명군 쪽에서 뺀다(옛 쿠데타 틀과 같다)
      const rebelIds = rebels.filter((id) => !loyalSet.has(id) && fit(where.map, id, nowMs)).slice(0, cap);
      const loyalIds = loyal.filter((id) => fit(where.map, id, nowMs)).slice(0, cap);
      const from = rebelIds.flatMap((id) => unitCell(where.map, id, nowMs) ?? []);
      const edge: Edge = where.layout ? arrivalEdge(where.center, from) : 3;
      const size = COUP_BATTLE_MAP_SIZE;
      const nexusDurability = where.layout
        ? siegeNexusDurability(where.layout, COUP_NEXUS_DURABILITY)
        : COUP_NEXUS_DURABILITY;
      const arena = where.layout ? siegeArena(where.layout, size, nexusDurability) : undefined;
      const placer = arena ? siegePlacer(arena, edge) : undefined;
      const center = size / 2;
      const units: CombatUnitSpec[] = [];
      for (const [index, id] of rebelIds.entries()) {
        const cell = placer
          ? placer.attacker(index)
          : { x: 2 + Math.floor(index / 24), y: spread(index, center) };
        const spec = cell
          ? bodyOf(l, id, REBEL_SIDE, 1 + Math.floor(index / PARTY_SIZE), cell, nowMs)
          : undefined;
        if (spec) units.push(spec);
      }
      if (units.length === 0) return undefined;
      for (const [index, id] of loyalIds.entries()) {
        const cell = placer
          ? placer.defender(index)
          : { x: center - 3 - Math.floor(index / 24), y: spread(index, center) };
        const spec = cell
          ? bodyOf(
              l,
              id,
              GOVERNMENT_SIDE,
              GOVERNMENT_PARTY_BASE + Math.floor(index / PARTY_SIZE),
              cell,
              nowMs,
            )
          : undefined;
        if (spec) units.push(spec);
      }
      const parties: BattlePartySpec[] = [...new Set(units.map((unit) => unit.party))].map((id) => ({
        id,
        side: units.find((unit) => unit.party === id)?.side ?? REBEL_SIDE,
        retreatHpPct: 0,
      }));
      const cells = size * size;
      const limitMs = combat?.()?.rules.limitMs.siege;
      // 넥서스(행정 건물)·성벽·둘레 시설 목표(질문 2692): 열린 맵(행정 건물 없음)은 세계 건물이 없어 목표도 없다
      const facilities = l.persistence.facilities.service.facilities;
      const targets = arena ? siegeFacilityTargets(arena.sources, (id) => facilities.has(id), SKIP_NONE) : [];
      const init: WorldBattleInit = {
        id: 0,
        kind: "siege",
        seed: randomInt(0x1_0000_0000) >>> 0,
        map: arena?.map ?? {
          size,
          passable: new Uint8Array(cells).fill(1),
          cover: new Uint8Array(cells),
          height: new Int32Array(cells),
          buildings: [{ id: NEXUS_ID, cells: openNexus(size), durability: nexusDurability, nexus: true }],
        },
        // 내전 — 편 faction 0(포로·탈취·방어 명성 없음, 2456 가)
        sides: [
          { id: REBEL_SIDE, faction: 0, defender: false, edge },
          { id: GOVERNMENT_SIDE, faction: 0, defender: true, edge: oppositeEdge(edge) },
        ],
        parties,
        units,
        ...(limitMs === undefined ? {} : { limitMs }),
        ...(targets.length > 0 ? { targets } : {}),
      };
      return l.persistence.startBattle(init, false);
    },

    async coupBattleState(battleId) {
      const l = live();
      if (!l) return undefined;
      const row = await l.persistence.battles.get(battleId);
      if (!row) return undefined;
      if (row.status === "running" || !row.outcome) {
        const running = (await l.persistence.battles.running()).find((entry) => entry.id === battleId);
        return {
          state: "running",
          endsAtMs: row.endsAtMs,
          units: new Set(running?.units.map((unit) => unit.id) ?? []),
        };
      }
      return {
        state: "ended",
        rebelsWon: row.outcome.result.winner === REBEL_SIDE,
        units: new Set(row.outcome.units.map((unit) => unit.unit)),
      };
    },

    async joinCoupBattle(battleId, cityId, side, unitIds, nowMs, unitsPerSide) {
      const l = live();
      const running = l
        ? (await l.persistence.battles.running()).find((entry) => entry.id === battleId)
        : undefined;
      const where = l ? arenaOf(l, cityId, nowMs) : undefined;
      if (!l || !running || !where || nowMs >= running.endsAtMs) return [];
      const sideId = side === "rebel" ? REBEL_SIDE : GOVERNMENT_SIDE;
      const sideSpec = running.sides.find((entry) => entry.id === sideId);
      if (!sideSpec) return [];
      const inBattle = new Set(running.units.map((unit) => unit.id));
      const onSide = running.units.filter((unit) => unit.side === sideId).length;
      const room = Math.max(0, Math.trunc(unitsPerSide) - onSide);
      const isInactive = (id: number) => l.persistence.fusion.temple.isInactive(id);
      const ids = unitIds
        .filter((id) => !inBattle.has(id) && fit(where.map, id, nowMs) && !isInactive(id))
        .slice(0, room);
      if (ids.length === 0) return [];
      const rebelEdge = running.sides.find((entry) => entry.id === REBEL_SIDE)?.edge ?? 3;
      const size = running.mapSize;
      const nexusDurability = where.layout
        ? siegeNexusDurability(where.layout, COUP_NEXUS_DURABILITY)
        : COUP_NEXUS_DURABILITY;
      const place = placerOf(where.layout, rebelEdge, size, nexusDurability);
      const party = Math.max(GOVERNMENT_PARTY_BASE + 100, ...running.parties.map((entry) => entry.id)) + 1;
      const specs: CombatUnitSpec[] = [];
      for (const [i, id] of ids.entries()) {
        const cell = place(side, onSide + i);
        const spec = cell ? bodyOf(l, id, sideId, party, cell, nowMs) : undefined;
        if (spec) specs.push(spec);
      }
      if (specs.length === 0) return [];
      // 남은 생명 수치·물약·탄(시작 유닛과 같은 단계 — battleStart.ts)
      const mini: BattleInit = {
        id: battleId,
        kind: "siege",
        seed: 0,
        map: {
          size: 1,
          passable: new Uint8Array(1),
          cover: new Uint8Array(1),
          height: new Int32Array(1),
          buildings: [],
        },
        sides: [sideSpec],
        parties: [{ id: party, side: sideId, retreatHpPct: 0 }],
        units: specs,
      };
      const ready = l.persistence.items.battleStart(
        l.persistence.vitals.service.battleStart(mini, nowMs),
        nowMs,
      );
      const tick = Math.floor((nowMs - running.startedAtMs) / tickMs()) + 1;
      const input: BattleInput = {
        tick,
        kind: "join",
        side: sideSpec,
        party: { id: party, side: sideId, retreatHpPct: 0 },
        units: ready.units,
      };
      await l.persistence.battles.addInput(battleId, input);
      return ready.units.map((unit) => unit.id);
    },

    wakeAt(atMs, nowMs, run) {
      const delay = Math.min(0x7fff_ffff, Math.max(0, atMs - nowMs));
      const timer = setTimeout(run, delay);
      timer.unref();
    },
  };
}
