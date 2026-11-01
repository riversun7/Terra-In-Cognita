import { describe, expect, it } from "vitest";
import { nationCode, nationName } from "./nations.ts";

const presets = [
  { code: "placeholder_nation_01", name: { ko: "임시 국가 1", en: "Placeholder nation 1" } },
  { code: "placeholder_nation_02", name: { ko: "임시 국가 2", en: "Placeholder nation 2" } },
];

describe("시험 국가 코드·이름(질문 203 가, D-460)", () => {
  it("1번은 시험 NPC 세력, 2번부터 팩 프리셋 차례, 모자라면 npc_nation_NN", () => {
    expect([1, 2, 3, 4].map((n) => nationCode(n, presets))).toEqual([
      "s3_test_npc",
      "placeholder_nation_01",
      "placeholder_nation_02",
      "npc_nation_04",
    ]);
    expect(nationName("placeholder_nation_02", presets)).toEqual({
      ko: "임시 국가 2",
      en: "Placeholder nation 2",
    });
    expect(nationName("npc_nation_04", presets)).toEqual({ ko: "시험 NPC 국가 4", en: "Test NPC nation 4" });
    expect(nationName("s3_test_npc", presets)).toBeUndefined();
  });
});
