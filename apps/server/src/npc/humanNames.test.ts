// NPC 휴먼 이름 시험 — 기획 답 773 나(이름 규칙 + 목록 콘텐츠), docs/adr/2026-11-07-play-flow.md "WP-NPC4".
import { describe, expect, it } from "vitest";
import { humanFamilyOf, humanNameOf } from "./humanNames.ts";

const lists = { given: ["Alda", "Bren", "Corin", "Dela"], family: ["Ashby", "Brook", "Reed"] };

describe("humanNameOf", () => {
  it("이름 성(목록에서 하나씩), 같은 유닛이면 늘 같은 이름", () => {
    for (const unitId of [1, 2, 77, 123_456]) {
      const name = humanNameOf(lists, unitId);
      expect(name).toBe(humanNameOf(lists, unitId));
      const [given, family] = String(name).split(" ");
      expect(lists.given).toContain(given);
      expect(lists.family).toContain(family);
    }
  });

  it("휴먼마다 흩어진다(목록 조합을 고르게 쓴다)", () => {
    const names = new Set(Array.from({ length: 200 }, (_, index) => humanNameOf(lists, index + 1)));
    // 4 × 3 = 12 조합을 거의 다 쓴다
    expect(names.size).toBeGreaterThanOrEqual(10);
  });

  it("성 목록이 비면 이름만, 이름 목록이 없거나 비면 undefined(화면 휴먼 #ID)", () => {
    expect(lists.given).toContain(humanNameOf({ given: lists.given, family: [] }, 5));
    expect(humanNameOf({ given: [], family: lists.family }, 5)).toBeUndefined();
    expect(humanNameOf(undefined, 5)).toBeUndefined();
  });
});

describe("humanFamilyOf", () => {
  it("이름과 같은 해시의 성(NPC 도시 가문 이름), 성 목록이 비면 이름, 이름 목록도 비면 undefined", () => {
    for (const unitId of [1, 2, 77]) {
      const family = humanFamilyOf(lists, unitId);
      expect(String(humanNameOf(lists, unitId)).endsWith(` ${String(family)}`)).toBe(true);
    }
    expect(humanFamilyOf({ given: lists.given, family: [] }, 5)).toBe(
      humanNameOf({ given: lists.given, family: [] }, 5),
    );
    expect(humanFamilyOf(undefined, 5)).toBeUndefined();
  });
});
