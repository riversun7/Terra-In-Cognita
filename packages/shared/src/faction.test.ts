// 세력 화면 고정 목록·작은 규칙 시험 — 관계 점수 띠, 민심 단계, 체제별 의결·독립 길(기획 46 §1.3·§2.4·§3.2·§4.1)
import { describe, expect, it } from "vitest";
import {
  INDEPENDENCE_BY_REGIME,
  REBELLION_THRESHOLD_EXAMPLE,
  REGIMES,
  RELATION_BANDS,
  VOTING_RULES,
  relationBand,
  unrestLevel,
} from "./faction.ts";

describe("관계 점수 띠([임시] 6단계)", () => {
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

describe("민심 단계(46 §2.4)", () => {
  it("반란 문턱 이하는 반란, 태업 문턱 아래는 태업, 그 위는 안정", () => {
    expect(unrestLevel(40, REBELLION_THRESHOLD_EXAMPLE)).toBe("rebellion");
    expect(unrestLevel(41, REBELLION_THRESHOLD_EXAMPLE)).toBe("slowdown");
    expect(unrestLevel(59, REBELLION_THRESHOLD_EXAMPLE)).toBe("slowdown");
    expect(unrestLevel(60, REBELLION_THRESHOLD_EXAMPLE)).toBe("calm");
    expect(unrestLevel(0, 0)).toBe("rebellion");
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
});
