// 시세 색(D-442) 시험 — 언어 기본(한국어 = 한국식, 영어 = 서양식)과 설정으로 고른 값
import { describe, expect, it } from "vitest";
import {
  MARKET_COLOR_CHOICES,
  isMarketColorChoice,
  languageMarketColors,
  resolveMarketColors,
} from "./marketColors.ts";

describe("시세 색", () => {
  it("고르지 않았거나 언어 기본이면 언어를 따른다: 한국어 = 한국식, 영어 = 서양식", () => {
    expect(resolveMarketColors(undefined, "ko")).toBe("korean");
    expect(resolveMarketColors("language", "ko")).toBe("korean");
    expect(resolveMarketColors(undefined, "en")).toBe("western");
    expect(resolveMarketColors("language", "en")).toBe("western");
    expect(languageMarketColors("ko-KR")).toBe("korean");
    expect(languageMarketColors("kok")).toBe("western");
  });

  it("한국식·서양식을 고르면 언어와 상관없이 그것", () => {
    expect(resolveMarketColors("western", "ko")).toBe("western");
    expect(resolveMarketColors("korean", "en")).toBe("korean");
  });

  it("고를 수 있는 값은 셋(설정 화면 순서)이고 모르는 값은 받지 않는다", () => {
    expect(MARKET_COLOR_CHOICES).toEqual(["language", "korean", "western"]);
    expect(isMarketColorChoice("korean")).toBe(true);
    expect(isMarketColorChoice("rainbow")).toBe(false);
    expect(isMarketColorChoice(null)).toBe(false);
  });
});
