// 역할별 권한 표 — Better Auth 관리자 플러그인과 우리 tRPC 권한 검사가 같은 표를 쓴다.
// 기본 거부: 표에 없는 동작은 할 수 없다. 여러 역할이면 하나라도 허용하면 허용한다.
// 지금 정한 것(ADR 2026-10-28-auth-and-accounts): 역할 바꾸기·계정 관리는 admin만.
// gm·dev는 이름만 있고 계정 관리 권한이 없다. 게임·콘텐츠 권한은 그 기능을 만들 때 문장(statement)을 늘린다.
import { ROLES, type Role, isRole } from "@terra/shared";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/** 권한 문장 — Better Auth 관리자 플러그인 기본(user·session 동작) */
export const statements = { ...defaultStatements } as const;

export const ac = createAccessControl(statements);

/**
 * 역할 → 허용 동작. 대리 로그인(impersonate)·계정 삭제(delete)·이메일 바꾸기(set-email)·임의 수정(update)은
 * 누구에게도 주지 않는다(HTTP 경로도 닫혀 있다, src/auth/bridge.ts).
 */
export const roles = {
  player: ac.newRole({ user: [], session: [] }),
  gm: ac.newRole({ user: [], session: [] }),
  dev: ac.newRole({ user: [], session: [] }),
  admin: ac.newRole({
    user: ["create", "list", "get", "set-role", "ban", "set-password"],
    session: ["list", "revoke"],
  }),
} satisfies Record<Role, unknown>;

type Statements = typeof statements;
/** 확인할 동작 목록 (예: { user: ["set-role"] }) */
export type PermissionRequest = { [K in keyof Statements]?: Statements[K][number][] };

/** 역할 중 하나라도 요청한 동작을 모두 허용하면 true. 역할이 없거나 모르는 역할뿐이면 false */
export function rolesAllow(userRoles: readonly Role[], request: PermissionRequest): boolean {
  if (Object.keys(request).length === 0) return false;
  return userRoles.some((role) => roles[role].authorize(request).success);
}

/** DB의 역할 문자열("player,admin")을 목록으로. 모르는 이름은 버린다(권한 없음으로 취급) */
export function parseRoleString(value: string | null | undefined): Role[] {
  if (!value) return [];
  return sortRoles(value.split(",").filter(isRole));
}

/** 중복을 없애고 정해진 순서(ROLES)로 정렬한다 — 저장·비교·감사 기록에 같은 모양을 쓰려고 */
export function sortRoles(list: readonly Role[]): Role[] {
  return ROLES.filter((role) => list.includes(role));
}
