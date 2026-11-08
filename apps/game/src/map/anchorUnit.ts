// 카메라가 붙는 유닛(기준 유닛) 고르기 — 순수 함수(시험 대상). docs/adr/2026-11-08-seamless-second-map.md WP-1(사용자 답 2026-11-08
// "항상 유닛이 선택된 상태여야하고 기본은 사이보그 본체위치 기본이다. 항상 선택된 유닛 기준 or 사이보그 기준 거리다. 자유시점부터 고쳐 없애야한다.").
// - 플레이어 카메라는 늘 내 유닛 하나를 따라간다(자유 시점 없음). 근처 목록의 거리도 이 유닛에서 잰다.
// - 차례: 고른 유닛이 다룰 수 있는 유닛(내 유닛, 운영자 모드면 아무 유닛)이면 그 유닛 → 마지막으로 고른 내 유닛(아직 이 맵에 있으면) →
//   이 맵의 내 사이보그 → 이 맵 내 유닛 목록의 첫 유닛(유닛 화면 차례) → 없음.
// - 남의 유닛을 고르면(정보만) 카메라는 그대로 앞의 기준 유닛에 둔다.
// - 운영자 자유 시점(운영자만, 사용자 답 Q2)이면 없음(따라가지 않고 끌어서 옮긴다).
import type { MapUnit } from "@terra/shared/mapUnits";

export interface AnchorInput {
  /** 운영자 모드(아무 유닛이나 기준이 될 수 있다) */
  readonly operator: boolean;
  /** 운영자 자유 시점(켜면 기준 유닛 없음) */
  readonly freeView: boolean;
  /** 지금 고른 유닛(엔진·화면) */
  readonly selected: number | null;
  /** 고른 유닛을 다룰 수 있나(내 유닛·운영자 모드) */
  readonly selectedFollowable: boolean;
  /** 마지막으로 목록·지도에서 고른 유닛(없으면 null) */
  readonly lastPicked: number | null;
  /** 이 2차맵의 내 유닛(받기 전 null) */
  readonly units: readonly Pick<MapUnit, "unitId">[] | null;
  /** 이 2차맵에 있는 내 사이보그 유닛(없으면 null) */
  readonly cyborgUnitId: number | null;
}

/** 카메라가 따라갈 유닛(없으면 null) */
export function chooseAnchor(input: AnchorInput): number | null {
  if (input.operator && input.freeView) return null;
  if (input.selected !== null && input.selectedFollowable) return input.selected;
  const units = input.units ?? [];
  const here = (id: number | null): id is number => id !== null && units.some((unit) => unit.unitId === id);
  // 운영자는 내 목록에 없는 유닛도 기준으로 둔다(남의 유닛을 골랐다가 다른 곳을 눌러 고르기가 풀린 경우)
  if (input.lastPicked !== null && (input.operator || here(input.lastPicked))) return input.lastPicked;
  if (input.cyborgUnitId !== null && (input.units === null || here(input.cyborgUnitId)))
    return input.cyborgUnitId;
  return units[0]?.unitId ?? null;
}

/** 이 2차맵에 들어갈 수 없나: 플레이어인데 이 맵에 내 유닛이 하나도 없다(받은 뒤에만, 사용자 답 Q3 "선택된 유닛이 기본 고정이라 못들어감") */
export function blockedWithoutUnits(input: {
  readonly operator: boolean;
  readonly units: readonly unknown[] | null;
}): boolean {
  return !input.operator && input.units !== null && input.units.length === 0;
}
