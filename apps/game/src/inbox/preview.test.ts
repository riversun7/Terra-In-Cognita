// 시안 자료 보기(기기 표시) 시험 — 켠 계정에서만, dev·admin 역할일 때만 켜진다
import type { AccountView } from "@terra/shared";
import { describe, expect, it } from "vitest";
import type { SessionState } from "../auth/sessionState.ts";
import { parsePreviewMark, previewActive, serializePreviewMark } from "./preview.ts";

const signedIn = (id: string, roles: AccountView["roles"]): SessionState => ({
  kind: "signed_in",
  user: { id, loginId: id, roles },
  expiresAt: "2026-11-01T00:00:00.000Z",
});

describe("시안 자료 보기 표시", () => {
  it("저장 모양: 켠 계정 id만 남긴다(끄면 지운다)", () => {
    expect(parsePreviewMark(serializePreviewMark("user_1"))).toBe("user_1");
    for (const raw of [
      null,
      "",
      "{",
      "[]",
      '{"v":2,"user":"u"}',
      '{"v":1}',
      '{"v":1,"user":""}',
      '{"v":1,"user":7}',
    ]) {
      expect(parsePreviewMark(raw), String(raw)).toBeNull();
    }
  });

  it("켠 계정이 지금 로그인했고 dev·admin이면 켜진다", () => {
    expect(previewActive("user_1", signedIn("user_1", ["player", "admin"]))).toBe(true);
    expect(previewActive("user_1", signedIn("user_1", ["player", "dev"]))).toBe(true);
  });

  it("다른 계정·플레이어·로그인 안 함이면 꺼진다(플레이어가 403을 받지 않게)", () => {
    expect(previewActive("user_1", signedIn("user_2", ["player", "admin"]))).toBe(false);
    expect(previewActive("user_1", signedIn("user_1", ["player"]))).toBe(false);
    expect(previewActive("user_1", signedIn("user_1", ["gm"]))).toBe(false);
    expect(previewActive(null, signedIn("user_1", ["admin"]))).toBe(false);
    expect(previewActive("user_1", { kind: "signed_out" })).toBe(false);
    expect(previewActive("user_1", { kind: "loading" })).toBe(false);
  });
});
