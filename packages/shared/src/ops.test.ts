// 운영 권한 판정 시험 — 역할 기본 묶음(gm 운영자 = 감시+약한 통제, admin 관리자 = + 강한 통제 + 로그 스위치, dev = 전체), 체크박스는 더하기만,
// 콘솔 역할이 없으면 빈 목록(docs/adr/2026-11-08-operator-console.md)
import { describe, expect, it } from "vitest";
import {
  OPS_PERMISSIONS,
  OPS_PERMISSION_TIER,
  OPS_ROLE_DEFAULTS,
  effectiveOpsPermissions,
  isOpsPermission,
} from "./ops.ts";
import { ROLES } from "./roles.ts";

const tier = (t: string) => OPS_PERMISSIONS.filter((p) => OPS_PERMISSION_TIER[p] === t);

describe("운영 권한", () => {
  it("역할마다 기본 묶음이 있고 단계가 쌓인다", () => {
    expect(Object.keys(OPS_ROLE_DEFAULTS).toSorted()).toEqual([...ROLES].toSorted());
    expect(OPS_ROLE_DEFAULTS.player).toEqual([]);
    expect(OPS_ROLE_DEFAULTS.gm).toEqual([...tier("monitor"), ...tier("light")]);
    expect(OPS_ROLE_DEFAULTS.admin).toEqual([
      ...tier("monitor"),
      ...tier("light"),
      ...tier("strong"),
      "log_switch",
    ]);
    expect(OPS_ROLE_DEFAULTS.dev).toEqual(OPS_PERMISSIONS);
  });

  it("운영자는 강한 통제·로그 스위치·권한 부여를 못 하고, 관리자는 권한 부여만 못 한다", () => {
    expect(effectiveOpsPermissions(["gm"], [])).not.toContain("ledger_grant");
    expect(effectiveOpsPermissions(["gm"], [])).not.toContain("log_switch");
    expect(effectiveOpsPermissions(["gm"], [])).toContain("account_ban");
    expect(effectiveOpsPermissions(["admin"], [])).toContain("unit_teleport");
    expect(effectiveOpsPermissions(["admin"], [])).toContain("log_switch");
    expect(effectiveOpsPermissions(["admin"], [])).not.toContain("manage_grants");
    expect(effectiveOpsPermissions(["dev"], [])).toContain("manage_grants");
  });

  it("체크박스는 역할 기본 위에 더한다(차례는 목록 차례, 중복 없음)", () => {
    expect(effectiveOpsPermissions(["gm"], ["unit_heal", "view_players", "unit_heal"])).toEqual(
      OPS_PERMISSIONS.filter((p) => OPS_ROLE_DEFAULTS.gm.includes(p) || p === "unit_heal"),
    );
  });

  it("콘솔 역할이 없으면 체크박스가 있어도 빈 목록", () => {
    expect(effectiveOpsPermissions(["player"], ["view_players", "ledger_grant"])).toEqual([]);
    expect(effectiveOpsPermissions([], ["view_players"])).toEqual([]);
  });

  it("모르는 ID는 권한이 아니다", () => {
    expect(isOpsPermission("view_players")).toBe(true);
    expect(isOpsPermission("delete_world")).toBe(false);
    expect(effectiveOpsPermissions(["gm"], ["delete_world"])).not.toContain("delete_world");
  });
});
