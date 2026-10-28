// 역할별 권한 표 시험 — 기본 거부, 역할 조합, 모르는 역할
import { ROLES } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type PermissionRequest, parseRoleString, roles, rolesAllow, sortRoles } from "./permissions.ts";

const ADMIN_ACTIONS: PermissionRequest[] = [
  { user: ["list"] },
  { user: ["get"] },
  { user: ["create"] },
  { user: ["set-role"] },
  { user: ["ban"] },
  { user: ["set-password"] },
  { session: ["list"] },
  { session: ["revoke"] },
  // S1 시험 2차맵 명령(WebSocket)
  { secondMap: ["move-unit"] },
  { secondMap: ["place-building"] },
  { secondMap: ["remove-building"] },
];

// 누구에게도 주지 않는 동작(대리 로그인·삭제·이메일 바꾸기·임의 수정)
const NOBODY: PermissionRequest[] = [
  { user: ["impersonate"] },
  { user: ["impersonate-admins"] },
  { user: ["delete"] },
  { user: ["set-email"] },
  { user: ["update"] },
  { session: ["delete"] },
];

describe("역할 표", () => {
  it("역할 표의 이름은 공용 역할 목록(ROLES)과 같다", () => {
    expect(Object.keys(roles).toSorted()).toEqual([...ROLES].toSorted());
  });

  it("player·gm·dev는 계정 관리 동작을 하나도 못 한다", () => {
    for (const role of ["player", "gm", "dev"] as const) {
      for (const request of [...ADMIN_ACTIONS, ...NOBODY]) {
        expect(rolesAllow([role], request), `${role} ${JSON.stringify(request)}`).toBe(false);
      }
    }
  });

  it("admin은 관리 동작을 하고, 대리 로그인·삭제·이메일 바꾸기는 못 한다", () => {
    for (const request of ADMIN_ACTIONS) expect(rolesAllow(["admin"], request)).toBe(true);
    for (const request of NOBODY) expect(rolesAllow(["admin"], request)).toBe(false);
  });

  it("역할을 함께 가지면 하나라도 허용할 때 허용한다", () => {
    expect(rolesAllow(["player", "admin"], { user: ["set-role"] })).toBe(true);
    expect(rolesAllow(["player", "gm", "dev"], { user: ["set-role"] })).toBe(false);
  });

  it("역할이 없거나 요청이 비어 있으면 거부한다", () => {
    expect(rolesAllow([], { user: ["list"] })).toBe(false);
    expect(rolesAllow(["admin"], {})).toBe(false);
    expect(rolesAllow(["admin"], { user: [] })).toBe(false);
  });

  it("여러 동작은 모두 허용돼야 한다", () => {
    expect(rolesAllow(["admin"], { user: ["list", "set-role"] })).toBe(true);
    expect(rolesAllow(["admin"], { user: ["list", "delete"] })).toBe(false);
  });
});

describe("역할 문자열", () => {
  it("DB 값(쉼표 구분)을 정해진 순서의 목록으로 바꾸고, 모르는 이름·중복은 버린다", () => {
    expect(parseRoleString("admin,player")).toEqual(["player", "admin"]);
    expect(parseRoleString("player,root,admin,admin")).toEqual(["player", "admin"]);
    expect(parseRoleString("player, admin")).toEqual(["player"]);
    expect(parseRoleString("")).toEqual([]);
    expect(parseRoleString(null)).toEqual([]);
  });

  it("모르는 역할만 있으면 권한이 없다", () => {
    expect(rolesAllow(parseRoleString("superuser"), { user: ["list"] })).toBe(false);
  });

  it("sortRoles는 중복을 없애고 ROLES 순서로 정렬한다", () => {
    expect(sortRoles(["admin", "player", "admin", "gm"])).toEqual(["player", "gm", "admin"]);
  });
});
