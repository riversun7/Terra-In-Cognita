// 세력 정체성 정하기 모델 시험 — 처음 값(씨앗), 이름·약어 후보, 치는 동안의 문제, 서버 요청 모양, 바뀜, 거절 까닭 → 칸.
import {
  FACTION_IDENTITY_COLORS,
  FACTION_IDENTITY_REASONS,
  type FactionIdentityMine,
  parseFactionName,
  parseFactionShort,
} from "@terra/shared/factionIdentity";
import { describe, expect, it } from "vitest";
import {
  draftOf,
  draftProblems,
  fieldOfReason,
  inputOf,
  isChanged,
  liveProblems,
  nameSuggestions,
  pngDataUrl,
  rerollEmblem,
  shortSuggestions,
} from "./identityModel.ts";

const EMPTY: FactionIdentityMine = {
  identity: null,
  uploadBlock: null,
  notice: null,
  renameAt: null,
  seed: 123_456,
  nameStyle: null,
};
const SAVED: FactionIdentityMine = {
  ...EMPTY,
  identity: {
    name: "하늘세력",
    shortName: "HAN",
    color: "#2980b9",
    emblem: { shape: "circle", division: "fess", charge: "moon", scheme: 2 },
    uploaded: "a".repeat(64),
    createdAt: 1,
    updatedAt: 2,
  },
};

describe("draftOf", () => {
  it("처음이면 이름·약어는 비고 색·마크는 씨앗으로 정해진다(같은 씨앗 = 같은 값)", () => {
    const draft = draftOf(EMPTY);
    expect(draft).toMatchObject({ name: "", shortName: "", upload: { kind: "none" } });
    expect(FACTION_IDENTITY_COLORS).toContain(draft.color);
    expect(draftOf(EMPTY)).toEqual(draft);
    expect(draftOf({ ...EMPTY, seed: 123_457 }).color).not.toBe(draft.color);
  });

  it("정한 값이 있으면 그 값, 올린 그림은 keep", () => {
    expect(draftOf(SAVED)).toEqual({
      name: "하늘세력",
      shortName: "HAN",
      color: "#2980b9",
      emblem: { shape: "circle", division: "fess", charge: "moon", scheme: 2 },
      upload: { kind: "keep", hash: "a".repeat(64) },
    });
  });

  it("[다시 만들기]는 차례마다 달라지고 같은 차례면 같다", () => {
    expect(rerollEmblem(7, 1)).toEqual(rerollEmblem(7, 1));
    const seen = new Set(Array.from({ length: 8 }, (_, round) => JSON.stringify(rerollEmblem(7, round))));
    expect(seen.size).toBeGreaterThan(4);
  });
});

describe("후보", () => {
  it("이름 후보는 세력 이름 규칙에 맞고, 화면 언어를 따르고, 차례마다 바뀐다", () => {
    for (const locale of ["ko", "en"]) {
      const first = nameSuggestions(99, 0, locale);
      expect(first.length).toBeGreaterThanOrEqual(3);
      for (const name of first) expect(parseFactionName(name.text).ok, name.text).toBe(true);
      expect(nameSuggestions(99, 0, locale)).toEqual(first);
      expect(nameSuggestions(99, 1, locale)).not.toEqual(first);
    }
    expect(nameSuggestions(99, 0, "ko").every((name) => /^[가-힣]+$/u.test(name.text))).toBe(true);
    expect(nameSuggestions(99, 0, "en").every((name) => /^[A-Za-z]+$/.test(name.text))).toBe(true);
  });

  it("약어 후보: 로마자 이름은 3글자 대문자, 한글 이름은 앞 두·세 글자", () => {
    const latin = shortSuggestions("Meridale");
    expect(latin[0]).toMatch(/^[A-Z]{3}$/);
    expect(shortSuggestions("하늘세력")).toEqual(["하늘", "하늘세"]);
    // 한글 이름 + 로마자 짝(이름 만들기에서 고른 후보)
    expect(shortSuggestions("메리데일", "Meridale")).toEqual(expect.arrayContaining(["메리", latin[0]]));
    for (const short of [...latin, ...shortSuggestions("하늘세력")])
      expect(parseFactionShort(short).ok).toBe(true);
    expect(shortSuggestions("")).toEqual([]);
  });
});

describe("문제·요청", () => {
  const draft = draftOf(SAVED);

  it("치는 동안에는 빈 칸·짧은 것을 알리지 않고, 글자 문제는 바로 알린다", () => {
    expect(liveProblems({ ...draft, name: "", shortName: "" })).toEqual({ name: null, shortName: null });
    expect(liveProblems({ ...draft, name: "하", shortName: "H" })).toEqual({ name: null, shortName: null });
    expect(draftProblems({ ...draft, name: "하", shortName: "H" })).toEqual({
      name: "too_short",
      shortName: "invalid",
    });
    expect(liveProblems({ ...draft, name: "sky clan", shortName: "A-B" })).toEqual({
      name: "invalid_chars",
      shortName: "invalid",
    });
    expect(liveProblems({ ...draft, name: "서울", shortName: "GM" })).toEqual({
      name: "real_place",
      shortName: "reserved",
    });
  });

  it("요청 모양: 앞뒤 빈칸을 떼고, 그림은 keep·none·new", () => {
    expect(inputOf({ ...draft, name: " 하늘세력 ", shortName: " HAN " })).toEqual({
      name: "하늘세력",
      shortName: "HAN",
      color: "#2980b9",
      emblem: draft.emblem,
      upload: { mode: "keep" },
    });
    expect(inputOf({ ...draft, upload: { kind: "none" } }).upload).toEqual({ mode: "none" });
    expect(inputOf({ ...draft, upload: { kind: "new", pngBase64: "AAAA" } }).upload).toEqual({
      mode: "new",
      pngBase64: "AAAA",
    });
    expect(pngDataUrl("AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("바뀜: 처음이면 늘 참, 고치기는 값이 달라야 참", () => {
    expect(isChanged(draftOf(EMPTY), EMPTY)).toBe(true);
    expect(isChanged(draft, SAVED)).toBe(false);
    expect(isChanged({ ...draft, color: "#c0392b" }, SAVED)).toBe(true);
    expect(isChanged({ ...draft, emblem: { ...draft.emblem, scheme: 0 } }, SAVED)).toBe(true);
    expect(isChanged({ ...draft, upload: { kind: "none" } }, SAVED)).toBe(true);
    expect(isChanged({ ...draft, upload: { kind: "new", pngBase64: "AAAA" } }, SAVED)).toBe(true);
  });

  it("거절 까닭마다 알릴 칸이 있다", () => {
    for (const reason of FACTION_IDENTITY_REASONS) expect(fieldOfReason(reason)).toBeTypeOf("string");
    expect(fieldOfReason("name_taken")).toBe("name");
    expect(fieldOfReason("short_taken")).toBe("shortName");
    expect(fieldOfReason("emblem_bad_chunk")).toBe("upload");
    expect(fieldOfReason("rename_wait")).toBe("form");
  });
});
