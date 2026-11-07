// 비활성 휴먼을 받는 시설(신전·생명과학 연구소)의 공용 셈 — docs/adr/2026-11-07-temple-religion.md(D-517·D-311).
// - 시설 판단: 시설 줄 + 실효 팩 시설의 단계(religion = 신전, biotech = 생명과학 연구소) → 다 지었고 30% 이상(건물 서비스 works).
// - 자리: 유닛이 지금 선 칸의 도시 = 시설이 선 도시(361 재료 자리와 같은 "같은 2차맵의 가장 가까운 도시" 규칙, @terra/shared/goodsPlaces).
// - 요금: 남의 시설 = 주인 수입, 내 시설·주인 없음 = 소각 [임시](D-311 "유저 시설 요금은 유저 수입" — 내 시설이면 나에게 내는 셈이라 소각, 질문 454).
import { CELL_UNITS, positionAt } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { buildingPlace, cityAt } from "../facilities/places.ts";
import type { WorldFacilities } from "../facilities/world.ts";
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

/** 시설 요금: 남의 시설 = 주인 수입, 내 시설·주인 없음 = 소각 [임시] */
export function payServiceFee(
  ledger: Ledger,
  payer: number,
  facilityOwner: number | null,
  amount: bigint,
  atMs: number,
  kind: string,
): void {
  if (amount <= 0n) return;
  const to =
    facilityOwner !== null && facilityOwner !== payer
      ? ledger.ownerAccount(facilityOwner, ASSET_CREDIT)
      : ledger.systemAccount(SYSTEM_SINK_CREDIT, ASSET_CREDIT);
  ledger.post({
    kind,
    atMs,
    entries: [
      { account: ledger.ownerAccount(payer, ASSET_CREDIT), amount: -amount },
      { account: to, amount },
    ],
  });
}
