// 1차맵 누른 칸 문구 시험 — 바다·땅·물 비트를 문장으로(기본 언어 한국어)
import type { PickedCell } from "@terra/engine/planet";
import { describe, expect, it } from "vitest";
import { cellLines, seaName, waterNames } from "./planetText.ts";

const base: PickedCell = {
  face: 2,
  mapLevel: 9,
  primaryLevel: 5,
  i: 49,
  j: 286,
  cellKey: 0,
  latDeg: 0,
  lonDeg: 0,
  heightM: 120.4,
  biome: 3,
  water: 0,
  temperatureC: 12,
  humidity: 153,
  forest: 0,
  river: 0,
};

describe("1차맵 누른 칸 문구", () => {
  it("땅: 자리·바이옴·높이·기후", () => {
    expect(cellLines(base, (id) => (id === 3 ? "온대림" : null))).toEqual([
      "면 2 · 칸 (49, 286) · 단계 5/5",
      "온대림 · 높이 120m",
      "12°C · 습도 60%",
    ]);
  });

  it("바다: 바이옴 대신 수심 등급과 수심(m)", () => {
    const sea = { ...base, water: 1 | (3 << 4), heightM: -950, biome: 12 };
    expect(cellLines(sea, () => "심해(바이옴)")[1]).toBe("심해 · 수심 950m");
    expect(seaName(1 | (1 << 4))).toBe("연안");
    expect(seaName(1 | (2 << 4))).toBe("대륙붕");
    expect(seaName(1)).toBe("바다");
  });

  it("호수·강·해안 비트는 이름으로 덧붙이고, 모르는 바이옴은 번호로", () => {
    expect(waterNames(2 | 4 | 8)).toEqual(["호수", "강", "해안"]);
    expect(cellLines({ ...base, water: 4 | 8, biome: 99 }, () => null)[1]).toBe(
      "바이옴 99 · 높이 120m · 강 · 해안",
    );
  });
});
