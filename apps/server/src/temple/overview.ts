// 신전·연구소 조회(tRPC temple.overview) — 규칙 값, 내 사이보그 신앙도·다음 기도 시각, 신전·생명과학 연구소 목록, 내 휴먼(신앙도·비활성·
// 선 도시), 수호신(D-517·D-311, 기획 답 456 가: 버프·유닛이 있나). 연구소 목록은 융합 조회(인큐베이터, 459 가)도 같은 함수로 낸다.
// 모양은 @terra/shared/temple. docs/adr/2026-11-07-temple-religion.md. 휴먼·신앙·수호신은 DB 행이 원본이라 쓰기 대기열이 따라잡은 뒤 읽는다.
import type {
  TempleGuardianView,
  TempleHumanView,
  TempleOverviewResponse,
  TempleView,
} from "@terra/shared/temple";
import { CELL_UNITS, type SocietyCoefficients, inactiveWindow, isInactiveAt, positionAt } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import { buildingCell, buildingPlace } from "../facilities/places.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { HUMAN_COLUMNS, humanOf } from "../fusion/humans.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import { UNIT_KIND_GUARDIAN, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { BIOTECH_STAGE, RELIGION_STAGE } from "./places.ts";
import { readFaith, readGuardianCounts, readGuardians, readLastPrayer } from "./rows.ts";

export interface TempleOverviewSource {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  readonly facilities?: WorldFacilities | undefined;
  readonly cyborgs?: CyborgService | undefined;
  readonly hasCyborg: (userId: string) => boolean;
  readonly rules: () => SocietyCoefficients;
  readonly ready: () => boolean;
  /** 유닛이 지금 선 칸의 도시 */
  readonly cityOfUnit: (unitId: number, atMs: number) => number | null;
}

export async function buildTempleOverview(
  o: TempleOverviewSource,
  viewer: { readonly id: string; readonly devGrant: boolean },
  nowMs: number,
): Promise<TempleOverviewResponse> {
  const c = o.rules().temple;
  const ownerId = o.settlement.findOwnerOfUser(viewer.id);
  const record = o.cyborgs?.record(viewer.id);
  const base = {
    hasCyborg: o.hasCyborg(viewer.id),
    balance: String(ownerId === undefined ? 0n : o.ledger.balanceOf(ownerId, ASSET_CREDIT)),
    cyborgFaith: record ? { faith: record.faith, faithPoints: record.faithPoints } : null,
    rules: {
      inactiveCapMs: Math.max(0, c.inactiveCapMs),
      convertCurrency: String(Math.max(0, o.rules().fusion.geneConvertCurrency)),
      rebirthFaith: c.rebirthFaith,
      rebirthCurrency: String(Math.max(0, c.rebirthCurrency)),
      deifyFaith: c.deifyFaith,
      deifyCurrency: String(Math.max(0, c.deifyCurrency)),
      guardianCap: c.guardianCap,
      prayFaith: c.prayFaith,
      prayCooldownMs: Math.max(0, c.prayCooldownMs),
      offeringPerFaith: String(Math.max(1, c.offeringPerFaith)),
      guardianDefensePm: Math.max(0, c.guardianDefensePm),
      guardianSatisfactionMilli: Math.max(0, c.guardianSatisfactionMilli),
      guardianProductionPm: Math.max(0, c.guardianProductionPm),
      rebirthStatChanceBp: Math.max(0, Math.min(10_000, c.rebirthStatChanceBp)),
      rebirthKChanceBp: Math.max(0, Math.min(10_000, c.rebirthKChanceBp)),
      rebirthStatAmount: Math.max(0, c.rebirthStatAmount),
      rebirthKAmountPm: Math.max(0, c.rebirthKAmountPm),
    },
    devGrant: viewer.devGrant,
    generatedAt: nowMs,
  };
  if (!o.ready() || ownerId === undefined)
    return {
      ...base,
      status: o.ready() ? "ready" : "not_ready",
      prayReadyAtMs: 0,
      temples: [],
      labs: [],
      humans: [],
      guardians: [],
    };
  await o.writer.durable();
  const [humanRows, guardianRows, counts, lastPrayer] = await Promise.all([
    o.pool.query(
      `select ${HUMAN_COLUMNS} from world_humans h join world_units u on u.id = h.unit_id
        where u.owner_id = $1 and u.kind = $2 order by h.unit_id`,
      [ownerId, UNIT_KIND_HUMAN],
    ),
    readGuardians(o.pool),
    readGuardianCounts(o.pool),
    readLastPrayer(o.pool, ownerId),
  ]);
  const { temples, labs } = serviceFacilityViews(o.maps, o.facilities, ownerId, counts);
  const parsed = humanRows.rows.map((row) => humanOf(row));
  const faith = await readFaith(
    o.pool,
    parsed.map((human) => human.unitId),
  );
  const humans: TempleHumanView[] = parsed.map((human) => {
    const window = inactiveWindow(human.bornAtMs, human.lifespanMs, c);
    let cell: TempleHumanView["cell"] = null;
    let captive = false;
    for (const map of o.maps.values()) {
      const info = map.unitInfo(human.unitId);
      if (!info) continue;
      const point = positionAt(info.motion, nowMs);
      cell = { mapKey: map.mapKey, x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) };
      captive = info.condition.heldBy !== null;
      break;
    }
    const own = faith.get(human.unitId);
    return {
      unitId: human.unitId,
      level: human.level,
      rebirths: human.rebirths,
      faith: own?.faith ?? 0,
      faithPoints: own?.faithPoints ?? 0,
      lifespanEndsAtMs: window.sinceMs,
      departsAtMs: window.departsAtMs,
      inactive: isInactiveAt(window, nowMs),
      cityId: o.cityOfUnit(human.unitId, nowMs),
      cell,
      captive,
    };
  });
  const guardians: TempleGuardianView[] = guardianRows.map((row) => ({
    unitId: row.unitId,
    cityId: row.cityId,
    level: row.level,
    rebirths: row.rebirths,
    deifiedAtMs: row.deifiedAtMs,
    mine: row.ownerId === ownerId,
    buff: row.buff,
    present: [...o.maps.values()].some((map) => map.unitInfo(row.unitId)?.kind === UNIT_KIND_GUARDIAN),
  }));
  const ready = lastPrayer === null ? 0 : lastPrayer + Math.max(0, c.prayCooldownMs);
  return {
    ...base,
    status: "ready",
    prayReadyAtMs: ready > nowMs ? ready : 0,
    temples,
    labs,
    humans,
    guardians,
  };
}

/**
 * 신전(신앙 단계)·생명과학 연구소(생명공학 단계) 목록(건물 ID 차례): 이름·도시·레벨·상태·일함·내 것·그 도시 수호신 수. 누구의 시설이든
 * 쓴다(D-311). 건물 자료가 없으면 빈 목록
 */
export function serviceFacilityViews(
  maps: ReadonlyMap<number, SecondMap>,
  world: WorldFacilities | undefined,
  ownerId: number | undefined,
  counts: ReadonlyMap<number, number>,
): { temples: TempleView[]; labs: TempleView[] } {
  const temples: TempleView[] = [];
  const labs: TempleView[] = [];
  if (!world) return { temples, labs };
  for (const facility of [...world.service.facilities.values()].toSorted(
    (a, b) => a.buildingId - b.buildingId,
  )) {
    const def = world.catalog().facility(facility.facilityId);
    const list = def?.stage === RELIGION_STAGE ? temples : def?.stage === BIOTECH_STAGE ? labs : undefined;
    if (!def || !list) continue;
    const cell = buildingCell(maps, facility.buildingId);
    const place = buildingPlace(world.service.places, facility.buildingId);
    if (!cell || !place) continue;
    list.push({
      buildingId: facility.buildingId,
      facilityId: facility.facilityId,
      name: def.name,
      cityId: place.cityId,
      mapKey: cell.mapKey,
      level: facility.level,
      conditionPpm: facility.conditionPpm,
      works: world.service.works(facility.buildingId),
      mine: ownerId !== undefined && cell.ownerId === ownerId,
      guardians: place.cityId === null ? 0 : (counts.get(place.cityId) ?? 0),
    });
  }
  return { temples, labs };
}
