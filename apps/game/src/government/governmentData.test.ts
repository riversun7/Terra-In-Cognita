// 정부(행정 건물) 판 글 시험 — docs/adr/2026-11-07-play-flow.md "WP-NPC"·"WP-NPC3". 이름이 없을 때의 대신 글, 세율·인구·도시 하루 값 숫자 꼴.
import { describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import {
  cityTitle,
  leaderTitle,
  nameIn,
  nationTitle,
  necessitiesText,
  pointsText,
  populationText,
  taxText,
} from "./governmentData.ts";

describe("정부 판 글", () => {
  it("이름(두 언어) → 지금 언어, 없으면 대신 글", () => {
    expect(nameIn({ ko: "가", en: "A" }, "x", "en")).toBe("A");
    expect(nameIn({ ko: "가", en: "A" }, "x", "ko")).toBe("가");
    expect(nameIn(null, "x", "ko")).toBe("x");
    expect(cityTitle({ id: 7, name: "Verdane" })).toBe("Verdane");
    expect(cityTitle({ id: 7, name: null })).toBe(m.government_city_number({ id: 7 }));
    expect(nationTitle({ id: 2, code: "placeholder_nation_01", name: null }, "ko")).toBe(
      "placeholder_nation_01",
    );
    expect(nationTitle({ id: 2, code: null, name: null }, "ko")).toBe(m.government_nation_number({ id: 2 }));
    expect(leaderTitle(null)).toBe(m.government_leader_none());
    expect(leaderTitle({ name: null })).toBe(m.government_leader_unnamed());
    expect(leaderTitle({ name: { ko: "임시 지도자 1", en: "Placeholder leader 1" } }, "en")).toBe(
      "Placeholder leader 1",
    );
  });

  it("거래세 만분율 → 백분율(소수 둘째 자리까지), 모르면 모름. 인구는 자리 구분", () => {
    expect(taxText(200, "en")).toBe("2%");
    expect(taxText(125, "en")).toBe("1.25%");
    expect(taxText(null)).toBe(m.government_tax_unknown());
    expect(populationText({ humans: 1234, housing: 2000 }, "en")).toContain("1,234");
  });

  it("도시 하루 값(743 나): 만족도·발전도는 0~100, 생필품 충족 ‰ → 백분율, 없으면 —", () => {
    expect(pointsText(62, "en")).toBe(m.government_points({ value: "62" }));
    expect(pointsText(null)).toBe(m.government_value_unknown());
    expect(necessitiesText(875, "en")).toBe("87.5%");
    expect(necessitiesText(1000, "en")).toBe("100%");
    expect(necessitiesText(null)).toBe(m.government_value_unknown());
  });
});
