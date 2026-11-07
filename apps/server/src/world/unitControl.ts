// 2차맵 유닛 조종 권한 — docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 원문 "유저는 맵 진입시 본인의 유닛만 움직일 수 있어야함.
// 사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야 자유이동이 가능").
// 명령 판정(게이트웨이 move_unit·stop_unit)과 화면의 내 유닛 목록(조회 world.mapUnits)이 같은 함수를 쓴다 — 목록이 "명령할 수 있음"으로 보인
// 유닛을 서버가 거절하지 않게.
// - 운영자 = 권한 표 secondMap move-unit(dev·admin). 모든 유닛에 명령한다(수호신 포함, 서버 봇은 멈추기만 막힘).
// - 플레이어 = 내 소유 주체의 유닛만. 남의 유닛·없는 유닛은 같은 답(not_owner — 시야 밖 유닛이 있는지 새지 않게),
//   내 수호신은 unit_stays(그 도시에 머문다, 기획 답 456 가).
// - 포로·중태(D-145 활동 불가)는 내 유닛이어도 명령을 받지 않는다(2차맵 moveUnit이 invalid_request — 전용 코드는 전투 화면 때, 질문 634).
import type { Role } from "@terra/shared";
import { rolesAllow } from "../auth/permissions.ts";
import { INJURY_CRITICAL, type UnitCondition, injuryAt } from "./unitCondition.ts";
import { UNIT_KIND_GUARDIAN } from "./unitKinds.ts";

/** 운영자: 모든 유닛에 명령할 수 있다(권한 표 secondMap move-unit — dev·admin) */
export function canCommandAnyUnit(roles: readonly Role[]): boolean {
  return rolesAllow(roles, { secondMap: ["move-unit"] });
}

/** 명령을 거절하는 까닭(결과 코드와 같은 이름) */
export type UnitControlDenial = "not_owner" | "unit_stays";

/**
 * 이 유닛에 이동·멈추기 명령을 해도 되는가. null이면 된다(포로·중태는 2차맵이 따로 본다).
 * unit = 2차맵의 그 유닛(없으면 undefined), ownerId = 명령한 사용자의 소유 주체(없으면 내 유닛 없음)
 */
export function unitControlDenial(
  unit: { readonly ownerId: number; readonly kind: number } | undefined,
  ownerId: number | undefined,
  operator: boolean,
): UnitControlDenial | null {
  if (operator) return null;
  if (unit === undefined || ownerId === undefined || unit.ownerId !== ownerId) return "not_owner";
  if (unit.kind === UNIT_KIND_GUARDIAN) return "unit_stays";
  return null;
}

/** 내 유닛 목록에 보이는 "지금 명령할 수 없는 까닭". 서버는 명령 때 다시 본다 */
export type UnitHold = "guardian" | "captive" | "critical";

export function unitHold(
  unit: { readonly kind: number; readonly condition: UnitCondition },
  nowMs: number,
): UnitHold | null {
  if (unit.kind === UNIT_KIND_GUARDIAN) return "guardian";
  if (unit.condition.heldBy !== null) return "captive";
  if (injuryAt(unit.condition, nowMs) >= INJURY_CRITICAL) return "critical";
  return null;
}
