// 세계 전투를 여는 한 길 — 정원사 웨이브(NPC 런타임 startBattle)·건물 공격(facilities/attack.ts)이 같은 함수로 전투 서비스에 넣는다.
// world.ts에서 떼었다(1,000줄 상한). 차례: 몸(입은 장비·버프, battleBodies.ts) → 도시 방어(비활성 빼기·수호신·방어 버프, 기획 답 452 다·456 가,
// temple/cityDefense.ts) → 남은 HP·아머·쉴드(D-512, src/vitals/) → 물약·탄(287, battleItems.ts). 수호신도 생명 수치·물약·탄을 같은 셈으로 받는다.
// 전투 결과의 세계(battleWorld: 유닛 2차맵·안전 도시·주인)도 여기서 만든다.
import { type BattleInit, CELL_UNITS, type TempleCoefficients, positionAt } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { buildingPlace } from "../facilities/places.ts";
import type { FacilityService } from "../facilities/service.ts";
import { createCityDefense } from "../temple/cityDefense.ts";
import type { TerritoryService } from "../territory/service.ts";
import type { BattleBodies } from "./battleBodies.ts";
import type { BattleWorld } from "./battleResults.ts";
import type { BattleService } from "./battles.ts";
import { type CityRow, nearestSafeCity } from "./cities.ts";
import type { OwnerRow, QueryPool } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import type { SecondMap } from "./secondMap.ts";

/** 시작 자료를 고치는 단계 하나(생명 수치·물약·탄) */
interface StartStep {
  battleStart(init: BattleInit, nowMs: number): BattleInit;
}

export interface WorldBattleStartParts {
  readonly battles: Pick<BattleService, "start">;
  readonly bodies: Pick<BattleBodies, "battleStart" | "build">;
  readonly vitals: StartStep;
  /** 전투 물건(보유 물건 서비스를 만든 뒤 채운다) */
  readonly items: () => StartStep;
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly rules: () => TempleCoefficients;
  /** 비활성 유닛인가(신전 서비스 — 융합 서비스가 만들어진 뒤) */
  readonly isInactive: (unitId: number) => boolean;
  /** 웨이브의 도시(NPC 런타임 정원사) */
  readonly waveCity: (waveId: number) => number | undefined;
  /** 건물 자리(건물 서비스가 만들어진 뒤) */
  readonly facilities: () => Pick<FacilityService, "places"> | undefined;
  readonly territory: () => TerritoryService | undefined;
  readonly now: () => number;
}

/** 세계 전투를 연다(전투 ID). war = 전쟁 전투(진 유닛은 포로) */
export function createWorldBattleStart(
  parts: WorldBattleStartParts,
): (init: BattleInit, war: boolean) => Promise<number> {
  const defense = createCityDefense({
    pool: parts.pool,
    writer: parts.writer,
    maps: parts.maps,
    bodies: parts.bodies,
    isInactive: parts.isInactive,
    waveCity: parts.waveCity,
    targetCity: (target) => {
      if (target.kind === "beacon")
        return parts.territory()?.beaconState(target.id, parts.now())?.row.cityId ?? null;
      const places = parts.facilities()?.places;
      return places ? (buildingPlace(places, target.id)?.cityId ?? null) : null;
    },
    rules: parts.rules,
  });
  return async (init, war) => {
    const bodied = parts.bodies.battleStart(init, parts.now());
    const defended = await defense.prepare(bodied, parts.now());
    const at = parts.now();
    return parts.battles.start(parts.items().battleStart(parts.vitals.battleStart(defended, at), at), {
      war,
    });
  };
}

/** 전투 결과를 적용할 세계: 유닛 2차맵, 진 유닛이 돌아갈 가장 가까운 안전 도시(그 주인 세력 기준), 주인이 있나 */
export function createBattleWorld(input: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cities: () => readonly CityRow[];
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly npcOwnerId: number;
  readonly ledger: Ledger;
  readonly now: () => number;
}): BattleWorld {
  return {
    mapOf: (unitId) => [...input.maps.values()].find((map) => map.unitInfo(unitId) !== undefined),
    safeCellFor: (unitId, ownerId, map) => {
      const at = map.unitInfo(unitId)?.motion;
      if (!at) return undefined;
      const point = positionAt(at, input.now());
      const city = nearestSafeCity(
        input.cities(),
        map.planetId,
        map.mapKey,
        { x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) },
        input.owners.get(ownerId)?.factionId ?? null,
      );
      return city ? { x: city.cellX, y: city.cellY } : undefined;
    },
    ownerExists: (ownerId) => input.owners.has(ownerId) || ownerId === input.npcOwnerId,
    ledger: input.ledger,
  };
}
