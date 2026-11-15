// 좌표 이동 규칙을 월드에 잇기 — 기획 D-564 2차 답 1641·1643, docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)".
// 1. 지형 빠르기(1643): 이동 서비스에 2차맵 걸음 배율(coordPace.ts — 지형 서비스의 행성 값)을 붙인다. 2차맵마다 한 번 셈해 둔다(행성 값은 바뀌지 않는다).
// 2. 좌표 조우(1641, D-475): ENCOUNTER_SCAN_MS마다 좌표 유닛을 2차맵 키로 묶어 전쟁 중인 두 나라가 함께 선 띄우지 않은 2차맵을 찾는다(encounter.ts).
//    전쟁이 하나도 없으면 묶지도 않는다(부하). 찾으면:
//    ① 그 2차맵을 좌표로 지나던 두 편 유닛의 길을 멈춰 그 자리의 좌표 유닛으로 세우고(stop "encounter"),
//    ② 그 2차맵을 띄운다(전투 = 띄우는 까닭, ADR 2026-11-15 2절 3 — 장부의 좌표 유닛이 그 자리에 선다),
//    ③ 두 편으로 보통 세계 전투를 연다(건물 공격·정원사 웨이브와 같은 길 — 몸·생명 수치·물약·탄, 전쟁 전투라 진 유닛은 포로·안전 도시, 부상 D-521).
//       [임시] 전투맵은 열린 64칸(건물 공격 일반 크기와 같다), 편 1 = 나라 ID가 작은 쪽(서쪽 변), 편 2 = 맞은편. 편의 faction = 그 편 첫 유닛의 소유 주체.
//    ④ 전투가 끝나 결과를 적용할 때까지(+ 1분) 그 2차맵을 내리지 않고, 그 2차맵은 ENCOUNTER_COOLDOWN_MS 동안 다시 조우를 찾지 않는다.
//    한 번에 ENCOUNTER_MAX_PER_SCAN개까지(나머지는 다음 틱).
// 띄운 2차맵 위에서 적끼리 만나는 자동 조우는 아직 없다(질문 1901) — 좌표 유닛만이다.
import { randomInt } from "node:crypto";
import { BATTLE_BASE_MOVE_MS, type BattleInit, type BattlePartySpec, type CombatUnitSpec } from "@terra/sim";
import { nationOfOwner } from "../world/nationVision.ts";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import type { SecondMap } from "../world/secondMap.ts";
import type { WorldPersistence } from "../world/world.ts";
import { coordPacePm } from "./coordPace.ts";
import { type CoordinateEncounter, findEncounters } from "./encounter.ts";

/** [임시] 조우를 찾는 간격(ms) */
export const ENCOUNTER_SCAN_MS = 10_000;
/** [임시] 조우가 난 2차맵에서 다시 찾지 않는 시간(ms) — 무승부(시간 초과)로 두 편이 그대로 남아도 곧바로 또 싸우지 않게 */
export const ENCOUNTER_COOLDOWN_MS = 30 * 60_000;
/** [임시] 한 번에 여는 조우 수 */
export const ENCOUNTER_MAX_PER_SCAN = 4;
/** [임시] 조우 전투맵 한 변(건물 공격 일반 크기 64와 같다) */
export const ENCOUNTER_MAP_SIZE = 64;
/** 전투 결과를 적용한 뒤에도 그 2차맵을 붙잡는 여유(ms) */
const HOLD_SLACK_MS = 60_000;
/** [임시] 시뮬·웨이브·건물 공격과 같은 파티 크기·사람형 건물 피해 배율 */
const PARTY_SIZE = 6;
const BUILDING_MUL_PM = 2000;
/** 한 줄에 세우는 유닛 수(넘으면 뒤 줄) */
const LINE = 24;
/** 2차맵 걸음 배율 캐시 상한(넘으면 비운다 — 행성 값에서 다시 셈한다) */
const PACE_CACHE_MAX = 100_000;

export interface CoordinateRules {
  /** 조우 한 번 찾기(시험·타이머). 연 전투 수 */
  scan(): Promise<number>;
  stop(): void;
}

/** 조우 두 편의 전투 시작 자료(열린 맵). place가 전투 사양을 주지 않는 유닛은 뺀다. 한 편이 비면 null */
export function encounterBattleInit(
  encounter: CoordinateEncounter,
  ownerOf: (unitId: number) => number,
  place: (
    unitId: number,
    spot: { side: number; party: number; x: number; y: number },
  ) => CombatUnitSpec | undefined,
  seed: number,
): BattleInit | null {
  const size = ENCOUNTER_MAP_SIZE;
  const center = size / 2;
  const units: CombatUnitSpec[] = [];
  const factions: number[] = [];
  for (const [index, side] of encounter.sides.entries()) {
    const sideId = index + 1;
    const toward = index === 0 ? -1 : 1;
    let placed = 0;
    for (const unit of side.units) {
      const x = center + toward * (5 + Math.floor(placed / LINE));
      const y = center - LINE / 2 + (placed % LINE);
      const spec = place(unit.unitId, {
        side: sideId,
        party: sideId * 100 + 1 + Math.floor(placed / PARTY_SIZE),
        x: Math.max(0, Math.min(size - 1, x)),
        y,
      });
      if (!spec) continue;
      if (placed === 0) factions.push(ownerOf(unit.unitId));
      units.push(spec);
      placed += 1;
    }
    if (placed === 0) return null;
  }
  const parties: BattlePartySpec[] = [...new Set(units.map((unit) => unit.party))].map((id) => ({
    id,
    side: units.find((unit) => unit.party === id)?.side ?? 1,
    retreatHpPct: 0,
  }));
  const cells = size * size;
  return {
    id: 0,
    kind: "normal",
    seed: seed >>> 0,
    map: {
      size,
      passable: new Uint8Array(cells).fill(1),
      cover: new Uint8Array(cells),
      height: new Int32Array(cells),
      buildings: [],
    },
    sides: [
      { id: 1, faction: factions[0] ?? 0, defender: false, edge: 3 },
      { id: 2, faction: factions[1] ?? 0, defender: true, edge: 1 },
    ],
    parties,
    units,
  };
}

/** 좌표 규칙이 읽는 월드 몫(world.ts World의 일부 — 시험은 이 모양만 만든다) */
export interface CoordinateWorld {
  readonly persistence:
    | Pick<WorldPersistence, "travel" | "spawn" | "bodies" | "startBattle" | "battles" | "owners" | "cyborgs">
    | undefined;
  readonly npc:
    | { readonly world: { readonly factions: ReadonlyMap<number, { readonly wars: ReadonlySet<number> }> } }
    | undefined;
  readonly maps: ReadonlyMap<number, Pick<SecondMap, "unitInfo">>;
  readonly terrain: { cellValues?(mapKey: number): PlanetCellValues | undefined } | undefined;
  status(): { readonly state: string };
}

/** 지형 빠르기를 붙이고 조우 타이머를 켠다(세계가 준비된 뒤, DB가 있는 월드만) */
export function startCoordinateRules(
  world: CoordinateWorld,
  options: {
    readonly now: () => number;
    readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
    /** false면 타이머를 켜지 않는다(시험이 scan을 직접 부른다) */
    readonly timer?: boolean | undefined;
  },
): CoordinateRules | undefined {
  const persistence = world.persistence;
  if (!persistence) return undefined;
  const { travel } = persistence;
  const { now, log } = options;
  // 1. 지형 빠르기(행성 값이 없으면 1000)
  const paces = new Map<number, number>();
  travel.attachPace((mapKey) => {
    const known = paces.get(mapKey);
    if (known !== undefined) return known;
    if (paces.size >= PACE_CACHE_MAX) paces.clear();
    const pace = coordPacePm(world.terrain?.cellValues?.(mapKey));
    paces.set(mapKey, pace);
    return pace;
  });
  // 2. 좌표 조우
  const cooldown = new Map<number, number>();
  let busy = false;
  let stopped = false;

  const atWar = (a: number, b: number): boolean => world.npc?.world.factions.get(a)?.wars.has(b) === true;
  const anyWar = (): boolean => {
    for (const faction of world.npc?.world.factions.values() ?? []) if (faction.wars.size > 0) return true;
    return false;
  };
  const cooling = (mapKey: number, at: number): boolean => {
    const until = cooldown.get(mapKey);
    if (until === undefined) return false;
    if (at < until) return true;
    cooldown.delete(mapKey);
    return false;
  };

  const open = async (encounter: CoordinateEncounter, at: number): Promise<boolean> => {
    const { mapKey } = encounter;
    cooldown.set(mapKey, at + ENCOUNTER_COOLDOWN_MS);
    const ids = new Set(encounter.sides.flatMap((side) => side.units.map((unit) => unit.unitId)));
    travel.haltOn(mapKey, ids);
    // 띄우는 동안 내리지 않게(띄운 뒤 한가함 셈이 곧바로 내리지 않도록)
    travel.holdMap(mapKey, at + ENCOUNTER_COOLDOWN_MS);
    const opened = await persistence.spawn.open(mapKey);
    const map = world.maps.get(mapKey);
    if (opened !== "ok" || !map) {
      log.info({ mapKey, opened }, "travel: coordinate encounter map could not be opened");
      return false;
    }
    const ownerOf = (unitId: number): number => map.unitInfo(unitId)?.ownerId ?? 0;
    const init = encounterBattleInit(
      encounter,
      ownerOf,
      (unitId, spot) =>
        map.unitInfo(unitId)
          ? persistence.bodies.build(
              unitId,
              { id: unitId, ...spot, moveIntervalMs: BATTLE_BASE_MOVE_MS, buildingMulPm: BUILDING_MUL_PM },
              now(),
            )
          : undefined,
      randomInt(0x1_0000_0000),
    );
    if (!init) {
      log.info({ mapKey }, "travel: coordinate encounter had no fighters");
      return false;
    }
    const battleId = await persistence.startBattle(init, true);
    const endsAt = (await persistence.battles.get(battleId))?.endsAtMs;
    if (endsAt !== undefined) travel.holdMap(mapKey, endsAt + HOLD_SLACK_MS);
    log.info(
      {
        mapKey,
        battleId,
        nations: encounter.sides.map((side) => side.nation),
        units: init.units.length,
      },
      "travel: coordinate encounter battle",
    );
    return true;
  };

  const scan = async (): Promise<number> => {
    if (busy || stopped || world.status().state !== "ready" || !anyWar()) return 0;
    busy = true;
    try {
      const at = now();
      const units = travel.coordinateUnits(null);
      if (units.length < 2) return 0;
      const found = findEncounters(
        units,
        (ownerId) => nationOfOwner(world, ownerId),
        atWar,
        (mapKey) => world.maps.has(mapKey) || cooling(mapKey, at),
      );
      let opened = 0;
      for (const encounter of found.slice(0, ENCOUNTER_MAX_PER_SCAN)) {
        if (stopped) break;
        try {
          if (await open(encounter, at)) opened += 1;
        } catch (error) {
          log.error({ err: error, mapKey: encounter.mapKey }, "travel: coordinate encounter failed");
        }
      }
      return opened;
    } finally {
      busy = false;
    }
  };

  const timer =
    options.timer === false
      ? undefined
      : setInterval(() => {
          void scan();
        }, ENCOUNTER_SCAN_MS);
  timer?.unref();
  return {
    scan,
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      travel.attachPace(undefined);
    },
  };
}
