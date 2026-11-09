// 역할별 권한 표 — Better Auth 관리자 플러그인과 우리 tRPC 권한 검사가 같은 표를 쓴다.
// 기본 거부: 표에 없는 동작은 할 수 없다. 여러 역할이면 하나라도 허용하면 허용한다.
// 지금 정한 것(ADR 2026-10-28-auth-and-accounts): 역할 바꾸기·계정 관리는 admin만.
// gm(운영자)는 Better Auth 문장이 없다: 운영 권한은 따로 판정한다(src/ops/access.ts, docs/adr/2026-11-08-operator-console.md). dev는 계정 관리 권한 없이 개발 도구 권한(home·planetEditor·tuning)만 있다.
// 게임·콘텐츠 권한은 그 기능을 만들 때 문장(statement)을 늘린다.
import { ROLES, type Role, isRole } from "@terra/shared";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * 권한 문장 — Better Auth 관리자 플러그인 기본(user·session 동작) + 게임 기능.
 * secondMap: 시험 2차맵 명령(WebSocket, src/world/gateway.ts). 건물은 admin만 한다(ADR 2026-10-28-s1-second-map).
 *   자기 유닛 이동·멈추기는 권한 없이 소유로 된다(S3). move-unit = 운영자가 남의 유닛도 옮기고 세운다 — dev·admin
 *   (docs/adr/2026-11-07-unit-control.md, 사용자 지적 2026-11-07 "운영자는 다른 유닛 조종이나 시야 자유이동이 가능", src/world/unitControl.ts).
 *   observe = 관리자 전체 보기(시야로 거르지 않음, 감사 기록), dev-test = 개발 시험 명령(물건·재료 받기, 작업 바로 끝내기, 부상·비활성 시험 등).
 *   둘 다 dev·admin(S3 ADR 3절). dev-test는 예전 이름이 dev-spawn(시험 일꾼 받기)이었다 — 시험 일꾼을 없애며 바꿨다(사용자 지적 2026-11-09).
 * home: 홈 대시보드 시험(ADR 2026-10-29-app-shell 6절, 사용자 결정 2). dev·admin만.
 *   - preview: 처리할 일·복귀 요약의 시안 자료를 받는다(inbox.list·summary.get의 preview). 다른 역할은 403
 *   - template: 기본값(dt_hybrid)이 아닌 템플릿을 저장한다(settings.set). 다른 역할이 보낸 값은 거절하지 않고 dt_hybrid로 바꿔 저장한다
 * planetEditor: 개발자 영역의 행성 편집기(ADR 2026-10-29-planet-editor-stage1 1·9절). dev·admin만.
 *   - read: 행성 정의·내 초안·판 목록 조회 / write: 초안 저장·되돌리기·지우기
 * tuning: 개발자 설정 칸 패널(docs/adr/2026-11-01-dev-settings-panel.md 8절). dev·admin만.
 *   - read: 칸 목록·최근 바꿈·내보내기 / write: 덮어쓰기 저장·되돌리기(그 세계의 실효 값을 바꾼다, 감사 기록)
 * territory: 영토 층 개발 도구(/dev/territory, docs/adr/2026-11-03-territory-layer.md 5절). dev·admin만.
 *   - observe: 모든 세력의 영토·비콘 보기(territory.planet) / dev-place: 다른 세력(NPC 시험 세력) 대신 비콘 놓기·치우기(WebSocket)
 * worldLayout: 세계 배치 화면(/dev/world-layout, 기획 D-528 — 고정 NPC 국가 자리). dev·admin만.
 *   - read: 국가·도시·놓은 자리·자동 제안 보기 / place: 국가 자리 놓기·지우기(다음 서버 시작 때 세계에 든다, 감사 기록)
 */
export const statements = {
  ...defaultStatements,
  secondMap: ["move-unit", "place-building", "remove-building", "observe", "dev-test"],
  home: ["preview", "template"],
  planetEditor: ["read", "write"],
  tuning: ["read", "write"],
  territory: ["observe", "dev-place"],
  worldLayout: ["read", "place"],
} as const;

export const ac = createAccessControl(statements);

/**
 * 역할 → 허용 동작. 대리 로그인(impersonate)·계정 삭제(delete)·이메일 바꾸기(set-email)·임의 수정(update)은
 * 누구에게도 주지 않는다(HTTP 경로도 닫혀 있다, src/auth/bridge.ts).
 */
export const roles = {
  player: ac.newRole({ user: [], session: [] }),
  gm: ac.newRole({ user: [], session: [] }),
  // 개발자: 계정 관리 권한 없이 개발 도구(홈 시험, 행성 편집기)만 쓴다(ADR 2026-10-29-planet-editor-stage1 사용자 결정 D8)
  dev: ac.newRole({
    user: [],
    session: [],
    secondMap: ["move-unit", "observe", "dev-test"],
    home: ["preview", "template"],
    planetEditor: ["read", "write"],
    tuning: ["read", "write"],
    territory: ["observe", "dev-place"],
    worldLayout: ["read", "place"],
  }),
  admin: ac.newRole({
    user: ["create", "list", "get", "set-role", "ban", "set-password"],
    session: ["list", "revoke"],
    secondMap: ["move-unit", "place-building", "remove-building", "observe", "dev-test"],
    home: ["preview", "template"],
    planetEditor: ["read", "write"],
    tuning: ["read", "write"],
    territory: ["observe", "dev-place"],
    worldLayout: ["read", "place"],
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
