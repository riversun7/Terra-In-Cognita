// 세력 화면 고정 목록·작은 규칙 시험 — 관계 점수 띠, 민심 단계, 체제별 의결·독립 길(기획 46 §1.3·§2.4·§3.2·§4.1)
import { describe, expect, it } from "vitest";
import {
  DIVIDEND_BY_REGIME,
  INDEPENDENCE_BY_REGIME,
  REBELLION_THRESHOLD_EXAMPLE,
  REGIMES,
  RELATION_BANDS,
  UNREST_LEVELS,
  VOTING_RULES,
  rebellionWarningAt,
  relationBand,
  unrestLevel,
} from "./faction.ts";

describe("관계 점수 띠(6단계, D-443)", () => {
  it("−100~100을 여섯 띠로 나누고 경계값은 위 띠에 든다", () => {
    expect(relationBand(-100)).toBe("hostile");
    expect(relationBand(-60)).toBe("hostile");
    expect(relationBand(-59)).toBe("wary");
    expect(relationBand(-20)).toBe("wary");
    expect(relationBand(-19)).toBe("neutral");
    expect(relationBand(19)).toBe("neutral");
    expect(relationBand(20)).toBe("cordial");
    expect(relationBand(50)).toBe("friendly");
    expect(relationBand(80)).toBe("trusted");
    expect(relationBand(100)).toBe("trusted");
  });

  it("범위 밖·소수는 잘라서 본다", () => {
    expect(relationBand(-500)).toBe("hostile");
    expect(relationBand(999)).toBe("trusted");
    expect(relationBand(19.9)).toBe("neutral");
  });

  it("모든 띠가 어느 점수에선가 나온다", () => {
    const seen = new Set(Array.from({ length: 201 }, (_, index) => relationBand(index - 100)));
    expect([...seen].toSorted()).toEqual([...RELATION_BANDS].toSorted());
  });
});

describe("민심 단계(46 §2.4, D-443 네 가지)", () => {
  const bands = { rebellionThreshold: REBELLION_THRESHOLD_EXAMPLE, warningBand: 10, slowdownBelow: 60 };

  it("반란 문턱 이하는 반란 중, 문턱 바로 위 구간은 반란 예고, 태업 문턱 아래는 태업 조짐, 그 위는 안정", () => {
    expect(unrestLevel(40, bands)).toBe("rebellion");
    expect(unrestLevel(41, bands)).toBe("warning");
    expect(unrestLevel(50, bands)).toBe("warning");
    expect(unrestLevel(51, bands)).toBe("slowdown");
    expect(unrestLevel(59, bands)).toBe("slowdown");
    expect(unrestLevel(60, bands)).toBe("calm");
    expect(unrestLevel(0, { ...bands, rebellionThreshold: 0 })).toBe("rebellion");
  });

  it("예고 구간이 태업 문턱을 넘으면 태업 조짐 없이 예고에서 안정으로, 너비 0이면 예고 없음", () => {
    expect(unrestLevel(65, { ...bands, warningBand: 30 })).toBe("warning");
    expect(unrestLevel(71, { ...bands, warningBand: 30 })).toBe("calm");
    expect(unrestLevel(41, { ...bands, warningBand: 0 })).toBe("slowdown");
    expect(rebellionWarningAt({ ...bands, warningBand: -5 })).toBe(40);
  });

  it("네 단계가 모두 어느 만족도에선가 나온다", () => {
    const seen = new Set(Array.from({ length: 101 }, (_, value) => unrestLevel(value, bands)));
    expect([...seen].toSorted()).toEqual([...UNREST_LEVELS].toSorted());
  });
});

describe("체제(46 §1.3·§3.2)", () => {
  it("체제마다 의결 방식과 독립 길이 하나씩 있다", () => {
    for (const regime of REGIMES) {
      expect(VOTING_RULES[regime]).toBeTypeOf("string");
      expect(INDEPENDENCE_BY_REGIME[regime]).toBeTypeOf("string");
    }
    expect(VOTING_RULES.dictatorship).toBe("leader");
    expect(INDEPENDENCE_BY_REGIME.dictatorship).toBe("rebellion_only");
    expect(INDEPENDENCE_BY_REGIME.capitalism).toBe("share_vote");
    expect(INDEPENDENCE_BY_REGIME.democracy).toBe("family_vote");
  });

  it("배당이 가는 곳: 자본주의 = 지분대로, 민주주의 = 국고, 독재 = 지배 가문(D-304·D-338)", () => {
    expect(DIVIDEND_BY_REGIME).toEqual({
      capitalism: "shareholders",
      democracy: "treasury",
      dictatorship: "ruling_family",
    });
  });
});
