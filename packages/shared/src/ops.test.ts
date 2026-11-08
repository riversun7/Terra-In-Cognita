// 운영 권한 판정 시험 — 역할 기본 묶음(gm = 감시+가벼운 통제, gm_lead = + 강한 통제, dev·admin = 전체), 체크박스는 더하기만,
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
    expect(OPS_ROLE_DEFAULTS.gm_lead).toEqual([...tier("monitor"), ...tier("light"), ...tier("strong")]);
    expect(OPS_ROLE_DEFAULTS.dev).toEqual(OPS_PERMISSIONS);
    expect(OPS_ROLE_DEFAULTS.admin).toEqual(OPS_PERMISSIONS);
  });

  it("gm은 강한 통제·권한 관리를 못 하고 gm_lead는 권한 관리만 못 한다", () => {
    expect(effectiveOpsPermissions(["gm"], [])).not.toContain("ledger_grant");
    expect(effectiveOpsPermissions(["gm"], [])).toContain("account_ban");
    expect(effectiveOpsPermissions(["gm_lead"], [])).toContain("unit_teleport");
    expect(effectiveOpsPermissions(["gm_lead"], [])).not.toContain("manage_grants");
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
