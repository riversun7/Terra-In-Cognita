// 비활성 휴먼을 받는 시설(신전·생명과학 연구소)의 공용 셈 — docs/adr/2026-11-07-temple-religion.md(D-517·D-311).
// - 시설 판단: 시설 줄 + 실효 팩 시설의 단계(religion = 신전, biotech = 생명과학 연구소) → 다 지었고 30% 이상(건물 서비스 works).
// - 자리: 유닛이 지금 선 칸의 도시 = 시설이 선 도시(361 재료 자리와 같은 "같은 2차맵의 가장 가까운 도시" 규칙, @terra/shared/goodsPlaces).
// - 요금: 주인이 있는 시설 = 그 사업장 금고(D-548, 제 시설도 — D-555 1514가 454 소각을 대신한다), 주인 없음 = 소각 [임시].
import { CELL_UNITS, positionAt } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { buildingPlace, cityAt } from "../facilities/places.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { leagueDiscountedFee } from "../world/leagueTies.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, SYSTEM_SINK_CREDIT } from "../world/settlement.ts";

/** 신앙 시설 단계(팩 FACILITY_STAGES) — 기도·헌금·환생·신격화 */
export const RELIGION_STAGE = "religion";
/** 생명공학 시설 단계 — 비활성 휴먼 유전자 변환(D-517) */
export const BIOTECH_STAGE = "biotech";

export type ServiceFacility =
  | { readonly ok: true; readonly cityId: number | null; readonly ownerId: number | null }
  | { readonly ok: false; readonly reason: "missing" | "closed" };

/** 그 건물이 그 단계 시설이고 일하는가(다 지었고 30% 이상). 도시·주인 */
export function serviceFacility(
  world: WorldFacilities | undefined,
  buildingId: number,
  stage: string,
): ServiceFacility {
  const record = world?.service.facilities.get(buildingId);
  if (!world || !record || world.catalog().facility(record.facilityId)?.stage !== stage)
    return { ok: false, reason: "missing" };
  const place = buildingPlace(world.service.places, buildingId);
  if (!place) return { ok: false, reason: "missing" };
  if (!world.service.works(buildingId)) return { ok: false, reason: "closed" };
  return { ok: true, cityId: place.cityId, ownerId: place.ownerId };
}

/** 유닛이 지금 선 칸의 도시(같은 2차맵의 가장 가까운 도시). 유닛·건물 자료가 없으면 null */
export function unitCity(
  maps: ReadonlyMap<number, SecondMap>,
  world: WorldFacilities | undefined,
  unitId: number,
  atMs: number,
): number | null {
  if (!world) return null;
  for (const map of maps.values()) {
    const info = map.unitInfo(unitId);
    if (!info) continue;
    const point = positionAt(info.motion, atMs);
    return cityAt(
      world.service.places,
      map.mapKey,
      Math.floor(point.x / CELL_UNITS),
      Math.floor(point.y / CELL_UNITS),
    );
  }
  return null;
}

/**
 * 시설 요금(D-548·D-555): 주인이 있는 시설이면 그 사업장 금고로(남의 시설도, 제 시설도 — 1514 "내 시설도 요금이 들고 그 사업장 금고로", 질문 454
 * 소각을 대신한다), 들어올 때 소득세(1503). 주인 없는 시설·사업장 장부가 없는 세계(시험)는 소각 [임시]
 */
export function payServiceFee(
  world: Pick<WorldFacilities, "business"> | undefined,
  ledger: Ledger,
  payer: number,
  facility: { readonly ownerId: number | null; readonly buildingId: number },
  quoted: bigint,
  atMs: number,
  kind: string,
): void {
  // 연맹 조항 카드 fee_discount(league-2, D-590 2501 다): 남의 시설 주인 가문과 함께 든 연맹에 그 카드가 붙었으면 깎는다(내 시설·소각은 그대로)
  const amount = leagueDiscountedFee(world?.business, payer, facility.ownerId, quoted);
  if (amount <= 0n) return;
  const from = ledger.ownerAccount(payer, ASSET_CREDIT);
  if (
    facility.ownerId !== null &&
    world?.business.receive({
      from,
      buildingId: facility.buildingId,
      asset: ASSET_CREDIT,
      amount,
      kind,
      atMs,
    })
  )
    return;
  ledger.post({
    kind,
    atMs,
    entries: [
      { account: from, amount: -amount },
      { account: ledger.systemAccount(SYSTEM_SINK_CREDIT, ASSET_CREDIT), amount },
    ],
  });
}
