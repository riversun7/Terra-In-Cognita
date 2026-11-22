// 진 사이보그 본체는 다쳐서 자기 사는 곳으로 돌아간다 — 사용자 결정 D-594("부상입고 주거지 귀환", 2026-11-22 — D-351의 즉시 귀환·"의식 백업 복원 2초" 연출을
// 대신한다), 방법은 실제 이동(D-591 "어떠한 경우에도 순간이동은 없다" — 기획 해석, 사용자 확인 대기). 줄기 fixes-1117i, 질문 2693 답.
// - 부상: 다른 유닛과 같은 전투 부상 굴림(battleResults.ts combatInjuryStage — 바뀜 없음).
// - 돌아갈 곳: 그 본체의 사는 곳(D-585·D-588 — 표 unit_residences, residence/book.ts residenceOf: 고른 집(쓸 수 있을 때) → 숙소 배정) 건물 둘레.
//   같은 2차맵이면 진 유닛 걸어 돌아가기와 같은 길(battleReturn.ts walkBack → secondMap.walkToSafety), 다른 2차맵이면 이동 서비스(플레이어 이동과 같은
//   길·시간 — 돌아가는 중 표시가 있는 유닛도 그 길은 간다: start returning, 구간 걷기 ignoreCondition)로 보낸다. 닿을 때까지 쓰지 못한다(returningUntilMs).
// - 사는 곳이 없으면(떠돌이) 옛 곳 — 그 2차맵에서 가장 가까운 안전 도시로 걷는다 [임시 — 질문 2744]. 다른 2차맵으로 보내지 못하면(길 없음·주인 유저 없음)도 그렇다.
// - 사이보그 유닛(종류 5)·휴먼은 바뀌지 않는다(D-351은 사이보그 본체 — 질문 108 "다른 유닛"은 가장 가까운 안전 도시 그대로).
import { type SizeClass, footprintRect } from "@terra/sim";
import { residenceBookOf } from "../residence/book.ts";
import type { TravelService } from "../travel/serviceTypes.ts";
import type { SecondMap } from "./secondMap.ts";

/** 사는 곳 자리(2차맵과 그 건물 가운데 칸) */
export interface HomeTarget {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

export interface CyborgHome {
  /** 그 사이보그 본체의 사는 곳 건물 가운데 칸(없으면 — 떠돌이·건물이 사라짐 — undefined) */
  homeOf(unitId: number): HomeTarget | undefined;
  /** 다른 2차맵의 사는 곳으로 실제로 보낸다(이동 서비스). 도착 예상 시각, 보내지 못하면 undefined */
  send(unitId: number, ownerId: number, size: SizeClass, to: HomeTarget): Promise<number | undefined>;
}

/** [임시] 사는 곳 건물 둘레에서 설 칸을 찾는 반지름(칸) */
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

export function createCyborgHome(deps: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 사는 곳 장부가 붙은 원장(residenceBookOf) */
  readonly ledger: object;
  readonly owners: ReadonlyMap<number, { readonly userId: string | null }>;
  /** 이동 서비스(월드가 만든 뒤) */
  readonly travel: () => Pick<TravelService, "start"> | undefined;
}): CyborgHome {
  return {
    homeOf(unitId) {
      const place = residenceBookOf(deps.ledger)?.residenceOf(unitId);
      if (!place) return undefined;
      for (const map of deps.maps.values()) {
        if (map.buildingOwner(place.buildingId) === undefined) continue;
        let found: HomeTarget | undefined;
        map.forEachBuilding((building) => {
          if (found || building.id !== place.buildingId) return;
          const rect = footprintRect(building.placement);
          found = {
            mapKey: map.mapKey,
            x: rect.x + (rect.width >> 1),
            y: rect.y + (rect.height >> 1),
          };
        });
        return found;
      }
      return undefined;
    },
    async send(unitId, ownerId, size, to) {
      const userId = deps.owners.get(ownerId)?.userId ?? null;
      const map = deps.maps.get(to.mapKey);
      const travel = deps.travel();
      const cell = map ? standNear(map, to, size) : undefined;
      if (userId === null || !travel || !cell) return undefined;
      const sent = await travel.start(
        userId,
        { unitId, mapKey: to.mapKey, x: cell.x, y: cell.y, kind: "move" },
        { returning: true },
      );
      return sent.ok ? (sent.arriveAt ?? undefined) : undefined;
    },
  };
}
