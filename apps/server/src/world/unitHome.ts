// 적색 부상으로 진 유닛의 귀환 — 사용자 결정 D-594("부상입고 주거지 귀환", 2026-11-22)와 그 보충(기획 696a053 "유닛도 동일. 적색부상 사망은 주거지 귀환
// 없으면 소속도시, 없으면 소속국가 정부건물로 귀환", 보충 2 13d2b37 "적색부상을 입고 전투에 패배했다는 의미이다. 수명 영구사망과 다르다. 적색부상이 아닌 다른
// 부상은 강제 귀환되지 않고 다시 싸울 수 있다", 보충 3 14c5b11 "나. 적색부상은 주거지로 순간이동 귀환된다고. 주거지가 없으면 소속도시, 소속도시도 없으면
// 소속국가"). 줄기 return-home. 앞 줄기 fixes-1117i의 사이보그 본체 실제 이동 귀환(옛 cyborgHome.ts)을 모든 유닛·순간이동으로 바꾼다.
// - **D-591 "어떠한 경우에도 순간이동은 없다"의 유일한 예외**(D-594 보충 3): 적색 부상으로 진 유닛만 돌아갈 곳으로 바로 옮긴다. 다른 모든 움직임은 실제 이동이다.
// - 누가: 전투에서 진(포로 아님) 유닛 가운데 끝난 때 부상이 빨강(3단계 — D-521, unitCondition.ts INJURY_CRITICAL)인 유닛만(battleResults.ts가 고른다).
//   빨강이 아니면 강제 귀환 없이 그 자리에 남아 다시 싸울 수 있다. 포로는 D-381(질문 108 기본안 "전쟁이면 지금처럼 포로")대로 잡은 쪽 안전 도시로 걷는다.
// - 돌아갈 곳(차례, 처음 있는 것 하나):
//   1) 사는 곳(D-585·D-588 — 표 unit_residences, residence/book.ts residenceOf: 고른 집(쓸 수 있을 때) → 숙소 배정) 건물 가운데 칸.
//   2) 소속 도시(homeCityOf — unitHomeWorld.ts): 플레이어 유닛 = 주인 사이보그의 "내 도시"(cyborgs.start_city_id — 가문원은 가문 소속 도시, 무소속은 귀화로
//      바뀌는 내 도시, ADR 2026-11-11-faction-identity.md "바뀜 (D-569)"), NPC 휴먼 = 거울 세계 휴먼의 사는 도시(SimUnit.city, 노숙이면 없음). 그 도시 시청 칸.
//   3) 소속 국가 정부 건물(capitalOf): 그 나라 수도의 행정 건물(시설 government_hall — 넥서스) 칸, 건물이 없으면 수도 시청 칸. 나라 = 플레이어는 주인 사이보그의
//      시민권 나라(cyborgs.faction_id), NPC는 주인 세력(NPC 국가 지도자도 여기 — 수도 행정 건물 곁이 늘 서는 곳).
//   4) 가까운 도시 중 적대 세력이 아닌 곳(보충 4 989a9f2 "소속국가도 없으면 근처 도시(적대세력 아닌곳)" — nearestCity): 적대 = 그 유닛 나라와 지금 전쟁 중인
//      세력(거울 세계 faction.wars — 도시 주인이나 그 위 나라, 기술 기본값. 호감도 "적대" 띠는 넣지 않았다 [임시 — 질문 2753]). 가까움 = 같은 2차맵 도시 먼저
//      (칸 거리), 그다음 다른 2차맵(2차맵 가운데 사이 행성 위 거리), 같으면 작은 도시 ID. 그 도시 시청 칸.
//   도시·건물은 띄운 2차맵에 있어야 한다(폐허 도시 아님). 띄우지 않은 2차맵이면 그 차례를 건너뛴다 [임시 — 질문 2752].
//   넷 다 없으면 그 자리에 남는다(다친 채) [임시 — 질문 2751].
// - 옮기기(teleportHome): 가던 길(이동 서비스·NPC 이동)을 버리고, 같은 2차맵이면 그 칸 둘레의 안전한 설 칸으로(secondMap.relocateToSafety), 다른 2차맵이면
//   그 2차맵에서 빼서(transferOut — 봇도 carry) 돌아갈 2차맵의 설 칸에 세운다(transferIn, 봇은 스스로 걷기를 다시 켠다). 설 칸이 없거나 못 세우면 그 자리에
//   남는다. 돌아가는 중 표시(returningUntilMs)는 쓰지 않는다 — 빨강 부상이 이미 명령·일·전투를 막는다(unavailable).
import { type SizeClass, anchorAt, footprintRect, positionAt } from "@terra/sim";
import { residenceBookOf } from "../residence/book.ts";
import type { TravelService } from "../travel/serviceTypes.ts";
import type { SecondMap } from "./secondMap.ts";

/** 돌아갈 곳의 차례(1 사는 곳, 2 소속 도시, 3 소속 국가 정부 건물, 4 적대 세력이 아닌 가까운 도시) */
export type HomeTier = "residence" | "home_city" | "government" | "nearby_city";

/** 돌아갈 자리(2차맵과 그 칸) */
export interface HomeTarget {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly tier: HomeTier;
}

/** 2차맵 위 칸 하나 */
export interface MapCell {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

export interface UnitHome {
  /** 그 유닛이 돌아갈 자리(위 차례, at = 지금 선 2차맵·칸 — 4번 가까운 도시를 잰다). 없으면 undefined(그 자리에 남는다) */
  homeOf(unitId: number, ownerId: number, at?: MapCell): HomeTarget | undefined;
  /** 그 유닛을 돌아갈 자리로 바로 옮긴다(D-594 보충 3 — D-591의 유일한 예외). 옮겼으면 true, 못 옮기면 false(그 자리에 남는다) */
  teleport(from: SecondMap, unitId: number, ownerId: number, to: HomeTarget, nowMs: number): boolean;
}

/** [임시] 돌아갈 칸 둘레에서 설 칸을 찾는 반지름(칸) */
const STAND_SEARCH_CELLS = 16;

/** 그 칸 둘레의 가장 가까운 설 칸(사각 고리로 넓힌다 — 정해진 차례). 없으면 undefined */
export function standNear(
  map: Pick<SecondMap, "isStandable">,
  at: { readonly x: number; readonly y: number },
  size: SizeClass,
): { x: number; y: number } | undefined {
  for (let radius = 0; radius <= STAND_SEARCH_CELLS; radius++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cell = { x: at.x + dx, y: at.y + dy };
        if (map.isStandable(cell.x, cell.y, size)) return cell;
      }
  return undefined;
}

/** 그 건물이 선 띄운 2차맵과 건물 가운데 칸(없으면 undefined) */
export function buildingCenter(
  maps: ReadonlyMap<number, SecondMap>,
  buildingId: number,
): MapCell | undefined {
  for (const map of maps.values()) {
    if (map.buildingOwner(buildingId) === undefined) continue;
    let found: MapCell | undefined;
    map.forEachBuilding((building) => {
      if (found || building.id !== buildingId) return;
      const rect = footprintRect(building.placement);
      found = { mapKey: map.mapKey, x: rect.x + (rect.width >> 1), y: rect.y + (rect.height >> 1) };
    });
    return found;
  }
  return undefined;
}

export interface UnitHomeDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 사는 곳 장부가 붙은 원장(residenceBookOf) */
  readonly ledger: object;
  /** 주인(소유 주체)의 사용자 ID. NPC 주체·모르면 null */
  readonly userOf: (ownerId: number) => string | null;
  /** 소속 도시 ID(위 머리 주석 2). 없으면 undefined */
  readonly homeCityOf: (unitId: number, ownerId: number) => number | undefined;
  /** 소속 국가 수도 도시 ID(위 머리 주석 3). 없으면 undefined */
  readonly capitalOf: (unitId: number, ownerId: number) => number | undefined;
  /** 도시 시청 칸(띄운 2차맵·폐허 아님. 아니면 undefined) */
  readonly cityCell: (cityId: number) => MapCell | undefined;
  /** 그 도시 행정 건물(government_hall) 칸(없으면 undefined) */
  readonly hallOf: (cityId: number) => MapCell | undefined;
  /** 적대 세력이 아닌 가까운 도시의 시청 칸(위 머리 주석 4, 띄운 2차맵만). 없으면 undefined */
  readonly nearestCity: (unitId: number, ownerId: number, at: MapCell) => MapCell | undefined;
  /** 이동 서비스(월드가 만든 뒤 — 가던 길을 버린다) */
  readonly travel: () => Pick<TravelService, "cancel" | "cancelNpc"> | undefined;
}

export function createUnitHome(deps: UnitHomeDeps): UnitHome {
  const loaded = (cell: MapCell | undefined): cell is MapCell =>
    cell !== undefined && deps.maps.has(cell.mapKey);
  return {
    homeOf(unitId, ownerId, at) {
      const place = residenceBookOf(deps.ledger)?.residenceOf(unitId);
      const house = place ? buildingCenter(deps.maps, place.buildingId) : undefined;
      if (loaded(house)) return { ...house, tier: "residence" };
      const cityId = deps.homeCityOf(unitId, ownerId);
      const city = cityId === undefined ? undefined : deps.cityCell(cityId);
      if (loaded(city)) return { ...city, tier: "home_city" };
      const capital = deps.capitalOf(unitId, ownerId);
      const hall = capital === undefined ? undefined : (deps.hallOf(capital) ?? deps.cityCell(capital));
      if (loaded(hall)) return { ...hall, tier: "government" };
      const near = at ? deps.nearestCity(unitId, ownerId, at) : undefined;
      return loaded(near) ? { ...near, tier: "nearby_city" } : undefined;
    },
    teleport(from, unitId, ownerId, to, nowMs) {
      const info = from.unitInfo(unitId);
      if (!info) return false;
      // 가던 길(플레이어 이동·NPC 이동)을 버린다 — 그 자리에 선 뒤 옮긴다
      const travel = deps.travel();
      const userId = deps.userOf(ownerId);
      if (travel) {
        if (userId !== null) travel.cancel(userId, unitId);
        else travel.cancelNpc(unitId);
      }
      if (to.mapKey === from.mapKey) return from.relocateToSafety(unitId, to);
      const target = deps.maps.get(to.mapKey);
      const cell = target ? standNear(target, to, info.size) : undefined;
      if (!target || !cell) return false;
      const row = from.transferOut(unitId, true);
      if (!row) return false;
      if (!target.transferIn(row, cell.x, cell.y, true)) {
        // 못 세우면 떠난 자리로 되돌린다
        const back = anchorAt(positionAt(info.motion, nowMs), info.size);
        from.transferIn(row, back.x, back.y, true);
        from.holdRoam(unitId, false);
        return false;
      }
      // 봇(carry로 들어옴)은 스스로 걷기를 다시 켠다(봇이 아니면 아무 일 없음)
      target.holdRoam(unitId, false);
      return true;
    },
  };
}
