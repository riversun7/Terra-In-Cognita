// 폐허 2를 NPC 사회 런타임에 잇는 몫 — docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 480~489, 472, 535)".
// 규칙은 시뮬과 같은 함수(@terra/sim SocietyRuins·gardener·economy)이고, 여기는 서버 자료(건물·신전·유저 나라·도시 자리)를 고리로 바꾼다:
// - 정부 건물 상태(480 다·487 다): 폐허 서비스가 건물 시설 줄로 알려 준다. 런타임을 켤 때 거울 세계 규칙에 붙인다.
// - 행정 레벨(489 다): 모든 도시의 행정 레벨 = 그 도시 안 행정 건물 레벨. 행정 건물이 있는 도시만 맞추고(없는 도시는 그대로 [임시]),
//   바뀐 도시는 도시 저장이 줄 비교로 쓴다.
// - 수호신(472 가): 신전 서비스가 그 도시에 싸울 수 있는 수호신이 있는지 알려 주면 수비 휴먼이 없어도 웨이브 전투를 연다.
// - 폐허가 된 도시 창고 물건(535, D-518): 유저 물건은 그 유저 사이보그 나라의 다른 도시 가운데 같은 2차맵에서 가장 가까운 도시(칸 거리
//   제곱, 같으면 작은 ID), 같은 2차맵에 없으면 가장 오래된(작은 ID) 도시의 그 유저 도시 창고로. 나라를 모르거나 다른 도시가 없으면 자리 없음
//   (원장 보유 — 주인이 물건 목록에서 그대로 본다, 확인 대기 질문 541). NPC 세력 물건은 시뮬과 같이 옛 규칙대로 소각(확인 대기 질문 540).
import type { GovernmentLookup, RuinedGoodsHome, SimWorld } from "@terra/sim";
import type { CityPlace } from "./persist.ts";

/** 행정 레벨 범위(49 N45, world_cities 검사 조건 1~5) */
const ADMIN_MIN = 1;
const ADMIN_MAX = 5;

export interface NpcRuinsInput {
  /** 정부 건물 상태(폐허 서비스 governmentStatus) */
  readonly government?: GovernmentLookup | undefined;
  /** 도시마다 행정 건물 레벨(폐허 서비스 governmentLevels) */
  readonly governmentLevels?: (() => ReadonlyMap<number, number>) | undefined;
  /** 그 도시에 싸울 수 있는 수호신이 있나(신전 서비스) */
  readonly hasGuardians?: ((cityId: number) => boolean) | undefined;
  /** 유저 소유 주체가 드는 나라(세력 소유 주체 ID, 사이보그 나라). 세력 주체·모르면 undefined */
  readonly nationOf?: ((ownerId: number) => number | undefined) | undefined;
}

/** 행정 건물이 있는 도시의 행정 레벨을 그 건물 레벨로 맞춘다(489 다). 바꾼 도시 수 */
export function syncAdminLevels(world: SimWorld, levels: ReadonlyMap<number, number> | undefined): number {
  if (!levels || levels.size === 0) return 0;
  let changed = 0;
  for (const [cityId, level] of levels) {
    const city = world.cities.get(cityId);
    if (!city) continue;
    const next = Math.min(ADMIN_MAX, Math.max(ADMIN_MIN, Math.floor(level)));
    if (city.adminLevel === next) continue;
    city.adminLevel = next;
    changed += 1;
  }
  return changed;
}

/** 폐허가 된 도시 창고 물건의 갈 곳(535): NPC 세력 물건은 소각, 유저 물건은 그 나라의 가장 가까운 다른 도시 창고(없으면 자리 없음) */
export function ruinedGoodsHomeOf(
  world: SimWorld,
  places: ReadonlyMap<number, CityPlace>,
  nationOf: ((ownerId: number) => number | undefined) | undefined,
): RuinedGoodsHome {
  return (ownerId, ruinedCityId) => {
    if (world.factions.has(ownerId)) return "burn";
    const nation = nationOf?.(ownerId);
    const faction = nation === undefined ? undefined : world.factions.get(nation);
    if (!faction?.alive) return null;
    const from = places.get(ruinedCityId);
    let best: { id: number; distance: number } | undefined;
    let oldest: number | undefined;
    for (const cityId of faction.cities) {
      if (cityId === ruinedCityId || !world.cities.has(cityId)) continue;
      if (oldest === undefined || cityId < oldest) oldest = cityId;
      const place = places.get(cityId);
      if (!from || !place || place.planetId !== from.planetId || place.mapKey !== from.mapKey) continue;
      const dx = place.cellX - from.cellX;
      const dy = place.cellY - from.cellY;
      const distance = dx * dx + dy * dy;
      if (!best || distance < best.distance || (distance === best.distance && cityId < best.id))
        best = { id: cityId, distance };
    }
    return best?.id ?? oldest ?? null;
  };
}
