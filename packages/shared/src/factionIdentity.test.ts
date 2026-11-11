// 플레이어 세력 정체성 규칙 시험 — 이름(사이보그 이름 규칙 + 실존 지명), 약어, 색 표(지도 바탕 대비), 마크 사양.
import { describe, expect, it } from "vitest";
import {
  FACTION_EMBLEM_BASE64_MAX,
  FACTION_EMBLEM_UPLOAD,
  FACTION_IDENTITY_COLORS,
  MAP_LABEL_DARK,
  MAP_LABEL_LIGHT,
  isEmblemSpec,
  isIdentityColor,
  labelTextOn,
  parseFactionName,
  parseFactionShort,
  FACTION_SHORT_DEFAULT_RANGE,
  clampShortRange,
} from "./factionIdentity.ts";
import { contrastOf } from "./nationEmblem.ts";

describe("parseFactionName", () => {
  it("한글·영문·숫자 3~16칸을 받고 열쇠는 소문자다", () => {
    expect(parseFactionName("  하늘세력 ")).toEqual({ ok: true, display: "하늘세력", key: "하늘세력" });
    expect(parseFactionName("SkyClan7")).toEqual({ ok: true, display: "SkyClan7", key: "skyclan7" });
  });

  it("빈칸·기호·다른 나라 글자·숫자만·길이 밖은 안 된다", () => {
    expect(parseFactionName("")).toEqual({ ok: false, problem: "empty" });
    expect(parseFactionName("sky clan")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseFactionName("sky_clan")).toEqual({ ok: false, problem: "invalid_chars" });
    // 키릴 글자 а(모양이 비슷한 글자 섞기)
    expect(parseFactionName("skаy")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseFactionName("12345")).toEqual({ ok: false, problem: "needs_letter" });
    expect(parseFactionName("ab")).toEqual({ ok: false, problem: "too_short" });
    expect(parseFactionName("가나다라마바사아자")).toEqual({ ok: false, problem: "too_long" });
  });

  it("사칭·실존 국가·도시 이름을 막는다(D-328)", () => {
    expect(parseFactionName("운영팀")).toEqual({ ok: false, problem: "reserved" });
    expect(parseFactionName("AdminClan")).toEqual({ ok: false, problem: "reserved" });
    expect(parseFactionName("대한민국")).toEqual({ ok: false, problem: "real_place" });
    expect(parseFactionName("Seoul")).toEqual({ ok: false, problem: "real_place" });
    expect(parseFactionName("구름골").ok).toBe(true);
  });
});

describe("parseFactionShort", () => {
  it("새 약어는 설정 칸 폭(출발값 2~4자, D-328·질문 928 나)으로, 저장 폭은 2~5자", () => {
    expect(parseFactionShort("ABCDE", FACTION_SHORT_DEFAULT_RANGE)).toEqual({
      ok: false,
      problem: "too_long",
    });
    expect(parseFactionShort("ABCD", FACTION_SHORT_DEFAULT_RANGE).ok).toBe(true);
    expect(parseFactionShort("ABCDE").ok).toBe(true);
    // 설정 칸 값이 저장 폭 밖이면 저장 폭 안으로 좁힌다
    expect(clampShortRange({ min: 0, max: 9 })).toEqual({ min: 2, max: 5 });
    expect(clampShortRange({ min: 4, max: 3 })).toEqual({ min: 4, max: 4 });
    expect(parseFactionShort("AB", { min: 3, max: 4 })).toEqual({ ok: false, problem: "too_short" });
  });

  it("글자·숫자 2~5자, 열쇠는 소문자", () => {
    expect(parseFactionShort(" HAN ")).toEqual({ ok: true, display: "HAN", key: "han" });
    expect(parseFactionShort("하늘")).toEqual({ ok: true, display: "하늘", key: "하늘" });
    expect(parseFactionShort("A1")).toEqual({ ok: true, display: "A1", key: "a1" });
  });

  it("길이 밖·기호·숫자만·사칭은 안 된다", () => {
    expect(parseFactionShort("")).toEqual({ ok: false, problem: "empty" });
    expect(parseFactionShort("A")).toEqual({ ok: false, problem: "too_short" });
    expect(parseFactionShort("ABCDEF")).toEqual({ ok: false, problem: "too_long" });
    expect(parseFactionShort("A-B")).toEqual({ ok: false, problem: "invalid" });
    expect(parseFactionShort("123")).toEqual({ ok: false, problem: "needs_letter" });
    expect(parseFactionShort("GM")).toEqual({ ok: false, problem: "reserved" });
    expect(parseFactionShort("운영자")).toEqual({ ok: false, problem: "reserved" });
  });
});

describe("색 표·마크 사양", () => {
  it("색 20개는 서로 다르고 두 지도 바탕 모두와 대비 2 이상이다", () => {
    expect(new Set(FACTION_IDENTITY_COLORS).size).toBe(20);
    for (const color of FACTION_IDENTITY_COLORS) {
      expect(contrastOf(color, MAP_LABEL_LIGHT), color).toBeGreaterThanOrEqual(2);
      expect(contrastOf(color, MAP_LABEL_DARK), color).toBeGreaterThanOrEqual(2);
      // 표지 위 글은 대비 3 이상
      expect(contrastOf(color, labelTextOn(color)), color).toBeGreaterThanOrEqual(3);
    }
    expect(isIdentityColor("#c0392b")).toBe(true);
    expect(isIdentityColor("#ffffff")).toBe(false);
  });

  it("마크 사양은 목록 안의 값만 받는다", () => {
    expect(isEmblemSpec({ shape: "shield", division: "plain", charge: "star", scheme: 0 })).toBe(true);
    expect(isEmblemSpec({ shape: "flag", division: "plain", charge: "star", scheme: 0 })).toBe(false);
    expect(isEmblemSpec({ shape: "shield", division: "plain", charge: "star", scheme: 3 })).toBe(false);
    expect(isEmblemSpec({ shape: "shield", division: "plain", charge: "star", scheme: 0.5 })).toBe(false);
  });

  it("base64 상한은 바이트 상한을 담는다", () => {
    expect(FACTION_EMBLEM_BASE64_MAX).toBeGreaterThanOrEqual((FACTION_EMBLEM_UPLOAD.maxBytes * 4) / 3);
  });
});
