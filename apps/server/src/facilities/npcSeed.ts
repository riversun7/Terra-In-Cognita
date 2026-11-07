// NPC 시작 도시 기본 시설(세계 씨앗) — docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗", 기획 90 §2.1(기본 NPC 국가·시작 도시 배치)·
// 46 §9.2(고정 국가 시작 도시), 건물 규칙은 docs/adr/2026-11-07-buildings-runtime.md.
// 켤 때 한 번(world.ts 부팅 복구, 2차맵에 건물·유닛을 다시 놓은 뒤·봇을 채우기 전): 띄운 2차맵의 시작 도시마다 기본 시설(행정 건물 하나 +
// 창고·농장·벌목장·광산 — 수는 설정 칸 worldSeed [임시])을 도시 가운데 둘레 빈 칸에 다 지은 상태(레벨 1·상태 가득)로 세운다. 주인 = 그 도시
// 세력의 소유 주체. 맵 건물 칸 + world_facilities 줄(같은 쓰기 묶음).
// 멱등: 도시마다 그 세력이 가진 같은 시설 줄(도시 ID 같음) 수를 세어 모자란 것만 더한다(있는 것은 그대로 — 관리자가 지운 시설은 다음 켤 때
// 다시 선다). 재료·작업·일꾼 없이 선다(세계를 차리는 일이라 원장을 거치지 않는다 — 확인 대기, docs/questions/2026-11-07-play-seed.md).
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { type CityCell, cityOfCell } from "@terra/shared/goodsPlaces";
import type { WorldSeedCoefficients } from "@terra/sim";
import type { CityRow } from "../world/cities.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityService } from "./service.ts";
import type { FacilityRecord } from "./state.ts";

/** 도시 가운데 빈 마당 반지름(칸): 이 네모 안에는 짓지 않는다(사이보그가 서고 휴먼이 모이는 곳) */
export const SEED_PLAZA_RADIUS = 5;
/** 자리를 찾는 반지름 상한(칸) */
export const SEED_SEARCH_RADIUS = 48;
/** 건물 둘레에 비워 두는 칸(길). 이웃 건물 사이가 이만큼 이상 빈다 */
export const SEED_MARGIN = 2;

/** 씨앗 시설 한 종류와 도시 하나의 수 */
export interface SeedItem {
  readonly facility: string;
  readonly count: number;
}

/**
 * 시작 도시 하나의 기본 시설 차례(앞 것이 가운데에 가깝다). 행정 건물(government_hall)은 도시 하나에 하나(D-510 행정 건물, 수 칸 없음),
 * 나머지 수는 설정 칸. 시설 ID는 팩 content/core/facilities.json
 */
export function seedPlan(seed: WorldSeedCoefficients): SeedItem[] {
  return [
    { facility: "government_hall", count: 1 },
    { facility: "storehouse", count: seed.storehouses },
    { facility: "farm", count: seed.farms },
    { facility: "lumber_camp", count: seed.lumberCamps },
    { facility: "mine", count: seed.mines },
  ];
}

/** 가운데 칸 둘레 고리 r(체비셰프 거리 r)의 칸들: 위 → 오른쪽 → 아래 → 왼쪽(r = 0이면 가운데 하나) */
export function* ringCells(cx: number, cy: number, r: number): Generator<{ x: number; y: number }> {
  if (r === 0) {
    yield { x: cx, y: cy };
    return;
  }
  for (let x = cx - r; x <= cx + r; x++) yield { x, y: cy - r };
  for (let y = cy - r + 1; y <= cy + r; y++) yield { x: cx + r, y };
  for (let x = cx + r - 1; x >= cx - r; x--) yield { x, y: cy + r };
  for (let y = cy + r - 1; y > cy - r; y--) yield { x: cx - r, y };
}

/** 두 닫힌 구간 [a0, a1]·[b0, b1]이 겹치나 */
const spans = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;
/** 한 축에서 건물(둘레 길 포함)이 마당 구간에 걸치나 */
const nearPlaza = (from: number, size: number, center: number) =>
  spans(
    from - SEED_MARGIN,
    from + size - 1 + SEED_MARGIN,
    center - SEED_PLAZA_RADIUS,
    center + SEED_PLAZA_RADIUS,
  );

export interface NpcSeedInput {
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 부팅 때 읽은 도시(시작 도시만 씨앗을 받는다) */
  readonly cities: readonly CityRow[];
  readonly planetId: string;
  /** 세력 행 ID → 그 세력의 소유 주체 ID(없으면 그 도시는 건너뛴다) */
  readonly ownerOfFaction: (factionId: number) => number | undefined;
  readonly service: Pick<FacilityService, "facilities" | "seedBuilt">;
  readonly catalog: FacilityCatalog;
  readonly seed: WorldSeedCoefficients;
  readonly nowMs: number;
}

export interface NpcSeedResult {
  /** 이번에 세운 시설 수 */
  readonly placed: number;
  /** 자리를 못 찾았거나 팩에 없어 못 세운 수 */
  readonly missing: number;
}

/** 띄운 2차맵의 시작 도시마다 모자란 기본 시설을 세운다(위 머리 주석) */
export function seedNpcFacilities(input: NpcSeedInput): NpcSeedResult {
  const { maps, catalog, service } = input;
  const plan = seedPlan(input.seed);
  const anchorsOf = (mapKey: number): CityCell[] =>
    input.cities
      .filter((city) => city.planetId === input.planetId && city.mapKey === mapKey)
      .map((city) => ({ id: city.id, mapKey, x: city.cellX, y: city.cellY }));
  let placed = 0;
  let missing = 0;
  const starts = input.cities
    .filter((city) => city.start && city.planetId === input.planetId && maps.has(city.mapKey))
    .toSorted((a, b) => a.id - b.id);
  for (const city of starts) {
    const map = maps.get(city.mapKey);
    const ownerId = input.ownerOfFaction(city.factionId);
    if (!map || ownerId === undefined) continue;
    const anchors = anchorsOf(city.mapKey);
    const have = new Map<string, number>();
    for (const record of service.facilities.values())
      if (record.cityId === city.id && map.buildingOwner(record.buildingId) === ownerId)
        have.set(record.facilityId, (have.get(record.facilityId) ?? 0) + 1);

    /** 그 크기 건물을 놓을 첫 자리(가까운 고리부터): 마당 밖, 둘레 길까지 놓을 수 있고, 건물 가운데가 이 도시 자리 */
    const spotFor = (width: number, height: number): { x: number; y: number } | undefined => {
      for (let r = SEED_PLAZA_RADIUS + 1; r <= SEED_SEARCH_RADIUS; r++) {
        for (const cell of ringCells(city.cellX, city.cellY, r)) {
          const x = cell.x - (width >> 1);
          const y = cell.y - (height >> 1);
          if (nearPlaza(x, width, city.cellX) && nearPlaza(y, height, city.cellY)) continue;
          if (cityOfCell(anchors, city.mapKey, cell.x, cell.y)?.id !== city.id) continue;
          const margin = {
            x: x - SEED_MARGIN,
            y: y - SEED_MARGIN,
            width: width + 2 * SEED_MARGIN,
            height: height + 2 * SEED_MARGIN,
            rotation: 0,
          } as const;
          if (map.canPlace(margin)) return { x, y };
        }
      }
      return undefined;
    };

    for (const item of plan) {
      const def = catalog.facility(item.facility);
      const need = Math.max(0, item.count - (have.get(item.facility) ?? 0));
      if (need === 0) continue;
      if (!def?.footprint) {
        missing += need;
        continue;
      }
      const { width, height } = def.footprint;
      for (let k = 0; k < need; k++) {
        const spot = spotFor(width, height);
        const result = spot ? map.placeBuilding({ ...spot, width, height, rotation: 0 }, ownerId) : undefined;
        if (!result?.ok || result.buildingId === undefined) {
          missing += need - k;
          break;
        }
        const record: FacilityRecord = {
          buildingId: result.buildingId,
          facilityId: def.id,
          level: 1,
          conditionPpm: CONDITION_FULL,
          conditionAtMs: input.nowMs,
          builtAtMs: input.nowMs,
          builtBy: null,
          cityId: city.id,
        };
        service.seedBuilt(record);
        placed += 1;
      }
    }
  }
  return { placed, missing };
}

/**
 * 부팅 복구 때 한 번(world.ts): 소유 주체 표로 세력 → 주체를 찾고 씨앗을 세운다. 설정 칸은 부를 때의 실효 값(rules).
 * 동기로 끝난다: 2차맵을 다시 놓은 뒤 경로 서비스를 켜기(paths.start) 전에 기다리면 다시 놓은 봇의 예약이 먼저 돌아 아직 모르는 2차맵에
 * 경로를 묻는다. 건물 칸·시설 줄은 쓰기 대기열의 같은 묶음으로 커밋된다
 */
export function seedNpcFacilitiesAtBoot(options: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cities: readonly CityRow[];
  readonly planetId: string;
  readonly owners: ReadonlyMap<number, { readonly id: number; readonly factionId: number | null }>;
  readonly facilities: { readonly service: NpcSeedInput["service"]; readonly catalog: () => FacilityCatalog };
  readonly rules: () => { readonly worldSeed: WorldSeedCoefficients };
  readonly log: { info(obj: object, message: string): void };
  readonly nowMs: number;
}): NpcSeedResult {
  const result = seedNpcFacilities({
    maps: options.maps,
    cities: options.cities,
    planetId: options.planetId,
    ownerOfFaction: (factionId) => {
      for (const owner of options.owners.values()) if (owner.factionId === factionId) return owner.id;
      return undefined;
    },
    service: options.facilities.service,
    catalog: options.facilities.catalog(),
    seed: options.rules().worldSeed,
    nowMs: options.nowMs,
  });
  if (result.placed > 0 || result.missing > 0)
    options.log.info(result, "world boot: seeded npc start city facilities");
  return result;
}
