// 1차맵 도시 안개 — 내가 아는 도시인가(순수 함수, 시험 대상). docs/adr/2026-11-07-play-flow.md "WP7 도시 안개·들어가기·카메라",
// 기획 정리 D-518 514 "시작 도시는 보이고 나머지는 내가 아는 도시"(D-476 "내가 아는(지도에 드러난) 가장 가까운 도시", D-103 시야 밖 이름이 새지 않음).
// 서버 권위: world.cities는 모르는 도시를 아예 보내지 않는다(기기가 거르지 않는다).
// [임시] "아는 도시" 규칙(확인 대기, 질문 570) — 아래 넷 중 하나면 안다:
//   1. 기본 NPC 국가의 시작 도시(안전 도시 D-341, 첫 접속 도시 단계가 고른다)
//   2. 내 국가(가입한 세력)의 도시
//   3. 그 도시 시청 칸이 든 시야 칸을 내가 본 적이 있다(2차맵 탐사 기록) 또는 지금 내 유닛·건물의 시야 안이다
//   4. 전체 보기 권한(dev·admin, 2차맵 전체 보기와 같은 권한)
// 우편·거래로 알게 된 도시(질문 514 나)는 그 길이 생기면 더한다.
import { CELL_UNITS, HALF_CELL_UNITS, hasBit, visionCellOf } from "@terra/sim";

/** 판정에 쓰는 도시 값 */
export interface KnownCityFacts {
  readonly start: boolean;
  readonly factionId: number;
  readonly mapKey: number;
  /** 시청 배치 칸 */
  readonly cellX: number;
  readonly cellY: number;
}

export interface KnownCityContext {
  /** 전체 보기 권한 */
  readonly observer: boolean;
  /** 내가 가입한 세력(없으면 null) */
  readonly myFactionId: number | null;
  /** 2차맵 키 → 내가 아는 시야 칸 비트(탐사 기록 ∪ 지금 시야). 없으면 그 2차맵은 모른다 */
  readonly sighted: ReadonlyMap<number, Uint8Array>;
}

/** 시청 배치 칸이 든 시야 칸 번호(시야 칸 = 배치 칸 8×8, @terra/sim visionCellOf와 같은 규칙) */
export function cityVisionCell(cellX: number, cellY: number): number {
  return visionCellOf({ x: cellX * CELL_UNITS + HALF_CELL_UNITS, y: cellY * CELL_UNITS + HALF_CELL_UNITS });
}

/** 규칙 1·2만으로 아는가(탐사 기록을 읽지 않아도 되는 도시) */
export function knownWithoutSight(city: KnownCityFacts, context: Omit<KnownCityContext, "sighted">): boolean {
  return (
    context.observer || city.start || (context.myFactionId !== null && city.factionId === context.myFactionId)
  );
}

export function isCityKnown(city: KnownCityFacts, context: KnownCityContext): boolean {
  if (knownWithoutSight(city, context)) return true;
  const bits = context.sighted.get(city.mapKey);
  return bits !== undefined && hasBit(bits, cityVisionCell(city.cellX, city.cellY));
}

/**
 * 영토 껍질 한 덩이를 보내도 되는가: 내 국가 껍질이거나, 그 덩이의 도시를 모두 안다(모르는 도시 자리가 껍질 꼭짓점으로 새지 않게).
 * 도시가 없는 덩이(비콘만)는 내 국가 것만
 */
export function hullKnown(
  group: {
    readonly factionId: number;
    readonly members: readonly { readonly kind: string; readonly id: number }[];
  },
  knownCity: (cityId: number) => boolean,
  myFactionId: number | null,
): boolean {
  if (myFactionId !== null && group.factionId === myFactionId) return true;
  const cities = group.members.filter((member) => member.kind === "city");
  return cities.length > 0 && cities.every((member) => knownCity(member.id));
}
