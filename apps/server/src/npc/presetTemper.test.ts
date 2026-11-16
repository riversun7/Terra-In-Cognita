// 국가 편집기 성향 칸(D-573 1991): 채운 축만 그 값, 빈 축은 굴린 값
import { TEST_NPC_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { withPresetTemper } from "./presetTemper.ts";

const rolled = { aggression: 100, commerce: 200, faith: 300, station: 400 };

describe("국가 편집기 성향 칸(D-573 1991)", () => {
  it("칸이 없으면 굴린 값 그대로, 채운 축만 바꾸고 범위에서 자른다", () => {
    expect(withPresetTemper(rolled, undefined, TEST_NPC_COEFFICIENTS)).toBe(rolled);
    expect(
      withPresetTemper(rolled, { commerce: 900, faith: 5000, leader: 300 }, TEST_NPC_COEFFICIENTS),
    ).toEqual({
      aggression: 100,
      commerce: 900,
      faith: TEST_NPC_COEFFICIENTS.traitMax,
      station: 400,
    });
  });
});
