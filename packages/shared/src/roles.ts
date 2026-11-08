// 계정 역할 이름 — 서버(권한 판정)와 기기(관리자 화면의 역할 선택)가 같은 목록을 쓴다.
// 여러 개를 함께 가질 수 있다. 무엇을 할 수 있는지는 서버만 정한다(apps/server/src/auth/permissions.ts).
// 결정: docs/PLAN.md 4.8, docs/adr/2026-10-28-auth-and-accounts.md

// gm = 운영자(약한 통제), admin = 관리자(강한 통제), dev = 개발자(전체). 운영 권한 묶음은 ops.ts(docs/adr/2026-11-08-operator-console.md).
// gm_lead(2026-11-08 하루 쓰고 뺌 — 관리자와 겹침, docs/adr/2026-11-08-operator-roles-log-switch.md)는 다시 쓰지 않는다. 저장된 값은 모르는 이름이라 권한 없음으로 읽는다
export const ROLES = ["player", "gm", "dev", "admin"] as const;

export type Role = (typeof ROLES)[number];

/** 새 계정의 기본 역할 */
export const DEFAULT_ROLE: Role = "player";

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
