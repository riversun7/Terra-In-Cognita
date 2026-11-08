// 감사 기록 문구 시험 — 동작 이름 → 사람이 읽는 말, 분류, 내용 한 줄(역할·지급·정지·스위치·사유), 대상, 모르는 동작
import type { OpsAuditRow } from "@terra/shared/ops";
import { describe, expect, it } from "vitest";
import { actionLabel, actorText, auditCategoryOf, auditSummary, targetText } from "./auditText.ts";

const row = (part: Partial<OpsAuditRow>): OpsAuditRow => ({
  id: 1,
  at: "2026-11-08T09:00:00.000Z",
  actorKind: "admin",
  actorId: null,
  actorLoginId: "riversun",
  action: "account.set_roles",
  targetId: null,
  targetLoginId: null,
  ip: null,
  ...part,
});

describe("감사 기록 문구", () => {
  it("동작 이름과 분류", () => {
    expect(actionLabel("second_map.observe")).toBe("2차맵 전체 보기");
    expect(actionLabel("made.up")).toBe("made.up");
    expect(auditCategoryOf("ops.unit.heal")).toBe("ops");
    expect(auditCategoryOf("cli.set_roles")).toBe("account");
    expect(auditCategoryOf("planet_library.save")).toBe("planet");
    expect(auditCategoryOf("made.up")).toBeNull();
  });

  it("역할 바꿈: 이전 → 이후(역할 이름)", () => {
    expect(auditSummary(row({ before: { roles: ["player", "admin"] }, after: { roles: ["player"] } }))).toBe(
      "플레이어, 관리자 → 플레이어",
    );
  });

  it("계정 만듦: 받은 역할", () => {
    expect(
      auditSummary(
        row({ action: "cli.create_user", after: { loginId: "e2e_dev", roles: ["player", "dev"] } }),
      ),
    ).toBe("역할: 플레이어, 개발자");
  });

  it("지급·스위치·사유", () => {
    expect(
      auditSummary(
        row({
          action: "ops.grant",
          after: { asset: "credit", amount: "500", balance: "600" },
          meta: { reason: "보상" },
        }),
      ),
    ).toBe("credit 500 (잔고 600) · 사유: 보상");
    expect(
      auditSummary(row({ action: "ops.switch", before: { view_audit: false }, after: { view_audit: true } })),
    ).toBe("조회 감사 기록: 꺼짐 → 켜짐");
    expect(auditSummary(row({ action: "ops.ban", after: { banned: true, expires: null } }))).toBe(
      "기한 없음",
    );
  });

  it("대상·한 사람: 아이디 → 유닛 → ID 앞 8자, 시스템", () => {
    expect(targetText(row({ targetLoginId: "e2e_player" }))).toBe("e2e_player");
    expect(targetText(row({ meta: { unitId: 42 } }))).toBe("유닛 #42");
    expect(targetText(row({ targetId: "dfb64c3f-358b-44f7-aa00-c769c0cd7a4a" }))).toBe("dfb64c3f");
    expect(actorText(row({ actorLoginId: null, actorKind: "system" }))).toBe("시스템");
  });

  it("모르는 동작은 칸=값 몇 개, 모양이 틀린 JSON에도 던지지 않는다", () => {
    expect(auditSummary(row({ action: "made.up", after: { a: 1, b: "x", c: [1, 2] } }))).toBe(
      "a=1 · b=x · c=[2]",
    );
    expect(auditSummary(row({ action: "ops.set_grants", before: "oops", after: { granted: 3 } }))).toBe(
      "더 준 권한: — → —",
    );
  });
});
