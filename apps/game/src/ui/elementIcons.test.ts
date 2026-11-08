// 속성 아이콘 컴포넌트 시험 — 12속성(ELEMENT_CODES) 모두 렌더링 확인
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ELEMENT_CODES } from "@terra/shared/roster";
import { describe, expect, it } from "vitest";
import { ElementsSummaryRow } from "../start/elementsStep.tsx";
import { ElementIcon } from "./elementIcons.tsx";

describe("ElementIcon", () => {
  it("12속성 모두 SVG 아이콘으로 렌더링된다", () => {
    for (const code of ELEMENT_CODES) {
      const html = renderToString(createElement(ElementIcon, { code }));
      expect(html).toContain("<svg");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('viewBox="0 0 24 24"');
    }
  });

  it("커스텀 클래스명이 올바르게 들어간다", () => {
    const html = renderToString(createElement(ElementIcon, { code: "fire", className: "custom-fire-icon" }));
    expect(html).toContain('class="custom-fire-icon"');
  });

  it("ElementsSummaryRow가 속성 칩 목록과 텍스트를 올바르게 렌더링한다", () => {
    const html = renderToString(
      createElement(ElementsSummaryRow, { draft: { water: 0, fire: 7, wind: 3, earth: 0 } }),
    );
    expect(html).toContain('class="start-summary-element-chip"');
    expect(html).toContain('data-element="fire"');
    expect(html).toContain('data-element="wind"');
    expect(html).toContain("불");
    expect(html).toContain("7");
    expect(html).toContain("바람");
    expect(html).toContain("3");
  });
});
