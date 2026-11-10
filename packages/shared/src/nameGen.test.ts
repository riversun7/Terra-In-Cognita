import { describe, expect, it } from "vitest";
import {
  NAME_KINDS,
  NAME_LENGTH,
  NAME_STYLE_IDS,
  generateNames,
  isNameStyleId,
  tickerCandidates,
} from "./nameGen.ts";

describe("generateNames", () => {
  it("같은 말씨·종류·시드면 같은 후보를 같은 차례로 낸다", () => {
    for (const style of NAME_STYLE_IDS)
      for (const kind of NAME_KINDS)
        expect(generateNames(style, kind, 42)).toEqual(generateNames(style, kind, 42));
  });

  it("시드가 다르면 후보가 달라진다", () => {
    expect(generateNames("isle", "nation", 1)).not.toEqual(generateNames("isle", "nation", 2));
  });

  it("말씨·종류마다 후보 다섯을 겹치지 않게 낸다", () => {
    for (const style of NAME_STYLE_IDS)
      for (const kind of NAME_KINDS) {
        const names = generateNames(style, kind, 7);
        expect(names, `${style}/${kind}`).toHaveLength(5);
        expect(new Set(names.map((name) => name.en)).size).toBe(5);
      }
  });

  it("국가·화폐 이름은 한글 2~8자·영문 3~16자 안이고 영문 첫 글자는 대문자다", () => {
    for (const style of NAME_STYLE_IDS)
      for (const kind of ["nation", "currency"] as const)
        for (const name of generateNames(style, kind, 99, 8)) {
          expect(name.ko.length).toBeGreaterThanOrEqual(NAME_LENGTH.koMin);
          expect(name.ko.length).toBeLessThanOrEqual(NAME_LENGTH.koMax);
          expect(name.en.length).toBeGreaterThanOrEqual(NAME_LENGTH.enMin);
          expect(name.en.length).toBeLessThanOrEqual(NAME_LENGTH.enMax);
          expect(name.en).toMatch(/^[A-Z][a-z]+$/);
          expect(name.ko).toMatch(/^[가-힣]+$/);
        }
  });

  it("지도자 이름은 이름·성 두 마디다(한글도)", () => {
    for (const style of NAME_STYLE_IDS)
      for (const name of generateNames(style, "leader", 5)) {
        expect(name.en).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        expect(name.ko).toMatch(/^[가-힣]+ [가-힣]+$/);
      }
  });

  it("도시·사람 이름 조각은 번역하지 않는다(ko = en, 로마자)", () => {
    for (const kind of ["city", "given", "family"] as const)
      for (const name of generateNames("fjord", kind, 3)) {
        expect(name.ko).toBe(name.en);
        expect(name.en).toMatch(/^[A-Z][a-z]+$/);
      }
  });

  it("욕설처럼 들리는 한글 조합과 막은 영어 이름은 내지 않는다", () => {
    for (const style of NAME_STYLE_IDS)
      for (let seed = 0; seed < 40; seed++)
        for (const name of generateNames(style, "nation", seed, 8)) {
          expect(name.ko).not.toMatch(/시발|씨발|병신/);
          expect(name.en.toLowerCase()).not.toBe("lanzhou");
        }
  });

  it("개수는 1~32 안으로 자른다", () => {
    expect(generateNames("reef", "city", 1, 0)).toHaveLength(1);
    expect(generateNames("reef", "city", 1, 12)).toHaveLength(12);
  });

  it("말씨 ID를 가린다", () => {
    expect(isNameStyleId("haneul")).toBe(true);
    expect(isNameStyleId("unknown")).toBe(false);
  });
});

describe("tickerCandidates", () => {
  it("영어 이름에서 겹치지 않는 3글자 약어를 낸다", () => {
    expect(tickerCandidates("Alder", new Set())[0]).toBe("ALD");
    const taken = new Set(["ALD"]);
    const next = tickerCandidates("Alder", taken);
    expect(next).not.toContain("ALD");
    for (const ticker of next) expect(ticker).toMatch(/^[A-Z]{3}$/);
    expect(next.length).toBeGreaterThan(0);
  });

  it("글자가 없으면 빈 목록", () => {
    expect(tickerCandidates("달닢", new Set())).toEqual([]);
  });
});
