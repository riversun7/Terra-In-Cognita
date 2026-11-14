// 버전 줄 시험 — 앱·서버 빌드 도장과 팩 판을 한 줄 조각으로(ADR docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-14, 빌드 도장)").
// 단위 시험에는 빌드 도장(define)이 없어서 APP_BUILD_STAMP는 둘 다 null("dev")이다.
import { describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import { APP_BUILD_STAMP, versionLine } from "./versionInfo.ts";

const APP = { time: "2026-11-15 08:12", commit: "abc1234" };

describe("versionLine", () => {
  it("단위 시험의 앱 도장은 dev(넣은 값 없음)", () => {
    expect(APP_BUILD_STAMP).toEqual({ time: null, commit: null });
  });

  it("서버 답을 받으면 앱 · 서버 · 팩", () => {
    const line = versionLine(APP, {
      kind: "ok",
      build: { time: "2026-11-15 08:20", commit: "def5678" },
      contentVersion: "core@92",
    });
    expect(line.parts).toEqual([
      m.settings_version_app({ stamp: "2026-11-15 08:12 (abc1234)" }),
      m.settings_version_server({ stamp: "2026-11-15 08:20 (def5678)" }),
      m.settings_version_pack({ pack: "core@92" }),
    ]);
    expect(line.mismatch).toBe(true);
  });

  it("커밋이 같으면 안내 없음(빌드 시각이 몇 분 달라도)", () => {
    const line = versionLine(APP, {
      kind: "ok",
      build: { time: "2026-11-15 08:13", commit: "abc1234" },
      contentVersion: "core@92",
    });
    expect(line.mismatch).toBe(false);
  });

  it("묻는 중·실패면 서버 자리에 상태 글, 팩은 없다", () => {
    expect(versionLine(APP_BUILD_STAMP, { kind: "loading" })).toEqual({
      parts: [m.settings_version_app({ stamp: "dev" }), m.settings_version_server_loading()],
      mismatch: false,
    });
    expect(versionLine(APP, { kind: "error" }).parts[1]).toBe(m.settings_version_server_unknown());
  });

  it("개발 서버(dev)와 빌드한 서버는 견주지 않는다", () => {
    const line = versionLine(APP_BUILD_STAMP, {
      kind: "ok",
      build: { time: "2026-11-15 08:20", commit: "def5678" },
      contentVersion: "core@92",
    });
    expect(line.mismatch).toBe(false);
  });
});
