// 운영 권한 판정(docs/adr/2026-11-08-operator-console.md) — 역할 기본(@terra/shared OPS_ROLE_DEFAULTS) + 계정에 준 체크박스(ops_grants).
// Better Auth 권한 표(src/auth/permissions.ts)와 따로 둔다: 계정마다 권한을 더하는 것은 그 표가 못 하기 때문이다.
// 기본 거부: 콘솔 역할(gm·gm_lead·dev·admin)이 없으면 체크박스가 있어도 아무것도 못 한다.
import type { Role } from "@terra/shared";
import {
  type OpsAccess,
  type OpsPermission,
  effectiveOpsPermissions,
  isOpsPermission,
} from "@terra/shared/ops";

/** pg 질의만 쓴다(시험은 가짜를 넣는다) */
export interface OpsQueryable {
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- 부르는 쪽이 줄 모양을 적는다(pg Pool.query와 같은 모양)
  query<R extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

/** 계정에 준 운영 권한(모르는 ID는 버린다). 줄이 없으면 빈 목록 */
export async function loadOpsGrants(db: OpsQueryable, userId: string): Promise<OpsPermission[]> {
  const { rows } = await db.query<{ permissions: string[] }>(
    "select permissions from ops_grants where user_id = $1",
    [userId],
  );
  return (rows[0]?.permissions ?? []).filter(isOpsPermission);
}

export async function opsAccessOf(
  db: OpsQueryable,
  userId: string,
  roles: readonly Role[],
): Promise<OpsAccess> {
  const granted = await loadOpsGrants(db, userId);
  return { permissions: effectiveOpsPermissions(roles, granted), granted };
}
