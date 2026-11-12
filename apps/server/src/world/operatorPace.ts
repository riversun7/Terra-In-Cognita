// 운영자 빠르기 — 사용자 지적(2026-11-09) "운영자모드에서 이동속도를 훨씬빠르게", (2026-11-12) "운영자모드에서 이동시 맵을클릭할때는 빠른속도가
// 적용되나 작업이나 다른 명령시엔 원래느린속도다".
// - 운영자 모드 = 같은 연결이 2차맵을 전체 보기(observe)로 구독 중 + 모든 유닛을 부릴 수 있는 역할(canCommandAnyUnit — 권한 표 move-unit, dev·admin).
// - 운영자 모드 연결이 유닛 명령(이동·멈추기·2차맵 사이 이동·채집·들어가기·직무 배치 등)을 보내면 그 유닛에 운영자 빠르기 표시를 단다
//   (그 유닛이 선 2차맵의 SecondMap.setPace). 그 뒤 그 유닛을 걷게 하는 길(SecondMap.moveUnit에 빠르기를 따로 주지 않은 것 — 채집 줄 왕복,
//   들어가기, 운반꾼 걸음 등)은 모두 표시를 읽어 OPERATOR_SPEED_FACTOR배로 걷는다. 운영자 모드가 아닌 연결의 명령이 오면 표시를 지운다.
//   명령이 거절되면 표시를 되돌린다(남의 거절된 명령이 표시를 바꾸지 않게).
// - 서버 권위: 표시는 서버만 단다(기기는 빠르기를 보내지 않는다). 유닛 속도와 종류 판정(unitKinds.ts wireKindOf)은 그대로 — 그 이동의 빠르기만.
// - 메모리에만 둔다(다시 켜면 보통). 2차맵을 넘으면 표시는 따라가지 않는다(2차맵 사이 이동은 길마다 자기 빠르기를 든다 — travel/service.ts).
import type { Role } from "@terra/shared";
import { canCommandAnyUnit } from "./unitControl.ts";

/** 운영자 모드 이동 빠르기(유닛 속도 × 이 값). 그 이동 하나에만 — 유닛 속도는 그대로. 사용자 지적 2026-11-09 "10배 더 빠르게"로 10 → 100(걷기 437 × 100 = 43,700, 프로토콜 상한 1,048,576 안) */
export const OPERATOR_SPEED_FACTOR = 100;

/** 운영자 빠르기 표시를 다는 2차맵(SecondMap의 일부) */
export interface PaceMap {
  unitInfo(unitId: number): unknown;
  /** 표시를 바꾼다(1이면 지운다). 앞 값(유닛이 없으면 undefined) */
  setPace(unitId: number, factor: number): number | undefined;
  paceOf(unitId: number): number;
}

/** 이 연결·사용자가 보내는 유닛 명령이 운영자 모드인가(전체 보기 구독 + 모든 유닛 명령 권한) */
export function isOperatorMode(observing: boolean, roles: readonly Role[]): boolean {
  return observing && canCommandAnyUnit(roles);
}

/**
 * 유닛 하나의 표시를 단다(operator면 OPERATOR_SPEED_FACTOR, 아니면 지움). 되돌리는 함수를 준다 — 그사이 다른 명령이 표시를 바꿨으면
 * 되돌리지 않는다. 유닛을 띄운 2차맵이 없으면 아무것도 하지 않는다
 */
export function markPace(maps: Iterable<PaceMap>, unitId: number, operator: boolean): () => void {
  const factor = operator ? OPERATOR_SPEED_FACTOR : 1;
  for (const map of maps) {
    if (map.unitInfo(unitId) === undefined) continue;
    const previous = map.setPace(unitId, factor);
    if (previous === undefined || previous === factor) return () => {};
    return () => {
      if (map.paceOf(unitId) === factor) map.setPace(unitId, previous);
    };
  }
  return () => {};
}

/** 유닛 명령 하나를 돌린다: 먼저 표시를 달고(명령이 시작하는 걸음이 읽는다), 결과가 실패면 되돌린다 */
export async function withPace<R extends { readonly ok: boolean }>(
  maps: Iterable<PaceMap>,
  unitId: number,
  operator: boolean,
  run: () => Promise<R>,
): Promise<R> {
  const undo = markPace(maps, unitId, operator);
  try {
    const result = await run();
    if (!result.ok) undo();
    return result;
  } catch (error) {
    undo();
    throw error;
  }
}
