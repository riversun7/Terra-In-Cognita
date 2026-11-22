// 칠 수 있는 대상 목록(화면 자료 facilities.overview targets, 질문 381) — 읽기만 한다. 판정은 공격 명령(attack.ts)이 다시 한다.
// - 내 유닛 가운데 공격에 쓸 수 있는 것(작업·계약·부상·포로가 아님)이 있는 2차맵마다: 남의 시설(내 것·내 세력 사람 것 빼고), 그 칸이 이 2차맵인
//   다른 세력 영토 비콘(1차맵 칸 = 2차맵 하나). 상태는 화면 자료와 같은 셈(노화를 지금까지 흐르게). 도시 시가지 안의 것은 부르는 쪽
//   (appSource.ts)이 영토 서비스 urbanCity로 뺀다.
// 바뀜(줄기 no-teleport-a — 사용자 결정 D-591, 질문 2659): 내 유닛을 대상마다 나눈다 — unitIds = 대상 기준 칸(비콘은 2차맵 가운데) 둘레 ATTACK_DEFENDER_RADIUS칸
// 안(칠 수 있음), farUnitIds = 같은 2차맵이지만 그 밖(멀어서 못 침 — 화면이 누르기 전에 흐리게·까닭과 함께 보인다). 판정은 공격 명령(attack.ts checkAttackers)이 다시 한다.
import type { FacilityTargetView } from "@terra/shared/facilities";
import {
  advanceCondition,
  conditionStateOf,
  durabilityPoints,
  maxDurabilityAt,
} from "@terra/shared/facilityRuntime";
import { CELL_UNITS, PLACEMENT_SIZE, type SocietyCoefficients, positionAt } from "@terra/sim";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { ATTACK_DEFENDER_RADIUS } from "./attack.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityService } from "./service.ts";

export interface TargetSource {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly service: FacilityService;
  readonly catalog: () => FacilityCatalog;
  readonly rules: () => SocietyCoefficients;
  readonly unitBusy: (unitId: number) => boolean;
}

/** 영토 비콘 하나(영토 서비스 조회의 모든 세력 비콘) */
export interface TargetBeacon {
  readonly id: number;
  readonly factionId: number;
  readonly planetId: string;
  readonly cellKey: number;
  readonly conditionPpm: number;
}

/** 소유 주체 → 세력(세력 국고 주체는 그 세력, 사용자 주체는 가입한 세력, 없으면 null) */
export async function ownerFactionsOf(
  pool: QueryPool,
  owners: ReadonlyMap<number, OwnerRow>,
  ownerIds: Iterable<number>,
): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  const users = new Map<string, number[]>();
  for (const id of new Set(ownerIds)) {
    const owner = owners.get(id);
    out.set(id, owner?.factionId ?? null);
    if (owner && owner.factionId === null && owner.userId !== null)
      users.set(owner.userId, [...(users.get(owner.userId) ?? []), id]);
  }
  if (users.size === 0) return out;
  const found = await pool.query(
    `select m.user_id::text as user_id, m.faction_id from faction_members m join factions f on f.id = m.faction_id
     where f.dissolved_at_ms is null and m.user_id::text = any($1::text[])`,
    [[...users.keys()]],
  );
  for (const row of found.rows)
    for (const id of users.get(String(row.user_id)) ?? []) out.set(id, Number(row.faction_id));
  return out;
}

/** 내 유닛이 있는 2차맵의 칠 수 있는 대상(시설 → 비콘, ID 차례) */
export function attackTargetsOf(
  source: TargetSource,
  input: {
    readonly ownerId: number;
    readonly myFaction: number | null;
    /** 그 2차맵들의 건물 주인 → 세력 */
    readonly ownerFactions: ReadonlyMap<number, number | null>;
    readonly beacons: readonly TargetBeacon[];
    readonly nowMs: number;
  },
): FacilityTargetView[] {
  const rules = source.rules();
  const rt = rules.facilityRuntime;
  const catalog = source.catalog();
  const { ownerId, myFaction, nowMs } = input;
  const friendly = (owner: number | null): boolean =>
    owner === ownerId ||
    (myFaction !== null && owner !== null && input.ownerFactions.get(owner) === myFaction);
  const facilities: FacilityTargetView[] = [];
  const beacons: FacilityTargetView[] = [];
  for (const map of source.maps.values()) {
    const units: { id: number; x: number; y: number }[] = [];
    map.forEachUnit((unit) => {
      if (unit.ownerId !== ownerId) return;
      const info = map.unitInfo(unit.id);
      if (!info || unavailable(info.condition, nowMs)) return;
      if (source.service.unitInJob(unit.id) || source.unitBusy(unit.id)) return;
      const point = positionAt(info.motion, nowMs);
      units.push({ id: unit.id, x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) });
    });
    if (units.length === 0) continue;
    units.sort((a, b) => a.id - b.id);
    /** 대상 기준 칸 둘레 ATTACK_DEFENDER_RADIUS칸 안(칠 수 있음)·밖(멀어서 못 침 — 줄기 no-teleport-a, 질문 2659) */
    const reach = (center: { readonly x: number; readonly y: number }) => {
      const near = (unit: { x: number; y: number }) =>
        Math.max(Math.abs(unit.x - center.x), Math.abs(unit.y - center.y)) <= ATTACK_DEFENDER_RADIUS;
      return {
        unitIds: units.filter(near).map((unit) => unit.id),
        farUnitIds: units.filter((unit) => !near(unit)).map((unit) => unit.id),
      };
    };
    const mapCenter = reach({ x: PLACEMENT_SIZE >> 1, y: PLACEMENT_SIZE >> 1 });
    map.forEachBuilding((building) => {
      if (friendly(building.ownerId)) return;
      const record = source.service.facilities.get(building.id);
      const def = record ? catalog.facility(record.facilityId) : undefined;
      if (!record || !def) return;
      const condition =
        record.level >= 1 && nowMs > record.conditionAtMs
          ? advanceCondition(record.conditionPpm, nowMs - record.conditionAtMs, false, rt)
          : record.conditionPpm;
      const max = maxDurabilityAt(def.durability, Math.max(1, record.level), rt);
      facilities.push({
        kind: "facility",
        id: building.id,
        facilityId: def.id,
        name: def.name,
        mapKey: map.mapKey,
        x: building.x,
        y: building.y,
        conditionPpm: condition,
        state: conditionStateOf(condition, rt),
        durability: durabilityPoints(condition, max),
        maxDurability: max,
        ...reach({ x: building.x, y: building.y }),
      });
    });
    for (const beacon of input.beacons) {
      if (beacon.cellKey !== map.mapKey || beacon.planetId !== map.planetId) continue;
      if (myFaction !== null && beacon.factionId === myFaction) continue;
      const max = rules.territory.beaconDurability;
      beacons.push({
        kind: "beacon",
        id: beacon.id,
        facilityId: null,
        name: null,
        mapKey: map.mapKey,
        x: null,
        y: null,
        conditionPpm: beacon.conditionPpm,
        state: conditionStateOf(beacon.conditionPpm, rt),
        durability: durabilityPoints(beacon.conditionPpm, max),
        maxDurability: max,
        ...mapCenter,
      });
    }
  }
  return [...facilities.toSorted((a, b) => a.id - b.id), ...beacons.toSorted((a, b) => a.id - b.id)];
}
