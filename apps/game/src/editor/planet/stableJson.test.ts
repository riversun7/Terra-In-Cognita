// 키를 정렬한 JSON 시험
import { describe, expect, it } from "vitest";
import { stableJson } from "./stableJson.ts";

describe("키를 정렬한 JSON", () => {
  it("키 순서가 달라도 같은 문자열, 배열 순서는 지킨다", () => {
    const a = { b: 1, a: { d: [3, 1, 2], c: "x" } };
    const b = { a: { c: "x", d: [3, 1, 2] }, b: 1 };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson(a)).toBe('{"a":{"c":"x","d":[3,1,2]},"b":1}');
    expect(stableJson({ d: [1, 2] })).not.toBe(stableJson({ d: [2, 1] }));
  });

  it("값이 undefined인 키는 없는 키와 같다", () => {
    expect(stableJson({ min: undefined, max: 5 })).toBe(stableJson({ max: 5 }));
  });

  it("UTF-16 코드 단위 순서(대문자가 소문자보다 앞)", () => {
    expect(stableJson({ b: 1, B: 2, a: 3 })).toBe('{"B":2,"a":3,"b":1}');
  });

  it("JSON.parse가 만든 자기 키 __proto__도 남긴다(원형을 바꾸지 않는다)", () => {
    const parsed: unknown = JSON.parse('{"b":2,"__proto__":{"a":1}}');
    expect(stableJson(parsed)).toBe('{"__proto__":{"a":1},"b":2}');
    expect(stableJson(parsed)).not.toBe(stableJson({ b: 2 }));
  });

  it("원시 값·null", () => {
    expect(stableJson(null)).toBe("null");
    expect(stableJson(7)).toBe("7");
    expect(stableJson("가")).toBe('"가"');
    expect(stableJson(undefined)).toBe("null");
  });
});
