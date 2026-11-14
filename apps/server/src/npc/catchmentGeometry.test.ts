// NPC 도시 경제 배후지 칸 자리 — 낚시터 물 종류(기획 D-542 질문 1365 나): 칸 행성 값 → 물 종류·땅 여부, 도시 배후지 다수결 범위
import { cellKey, decodeCellKey } from "@terra/planet";
import type { CatchmentLand } from "@terra/shared/catchment";
import {
  TEST_SOCIETY_COEFFICIENTS,
  catchmentSettingsOf,
  createCatchmentState,
  fishTierRange,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { planetCatchmentGeometry } from "./catchmentGeometry.ts";

const LEVEL = 9;
const home = cellKey(0, LEVEL, 20, 20);
const dry = (water: number, biomeId: string): CatchmentLand => ({
  forest: 0,
  elevationM: 10,
  temperatureC: 15,
  precipitationMm: 600,
  water,
  biomeId,
});

describe("NPC 배후지 낚시터 물 종류", () => {
  it("칸 값 → 물 종류·땅 여부, 배후지 땅 칸 다수결(바다 칸이 많아도 해안 땅이면 연안)", () => {
    // 도시 칸·위·아래는 해안 땅, 오른쪽 두 칸 이상은 심해 바다
    const land = (key: number): CatchmentLand => {
      const { i } = decodeCellKey(key);
      return i > 20 ? dry(1 | (3 << 4), "ocean_deep") : dry(8, "grassland");
    };
    const rules = () => TEST_SOCIETY_COEFFICIENTS;
    const geometry = planetCatchmentGeometry(land, () => home, rules);
    expect(geometry.fishWaterOf?.(home)).toEqual({ water: "coast", shore: true });
    expect(geometry.fishWaterOf?.(cellKey(0, LEVEL, 22, 20))).toEqual({ water: "deep", shore: false });
    const state = createCatchmentState(geometry, () =>
      catchmentSettingsOf(TEST_SOCIETY_COEFFICIENTS.worldSeed, TEST_SOCIETY_COEFFICIENTS.territory),
    );
    const full = { ore: 1000, wood: 1000, herb: 1000, crop: 1000, livestock: 1000, fish: 1000 };
    state.cities.set(1, {
      radiusMilli: 2000,
      areaMilli: 13_000,
      cells: 13,
      sharedCells: 0,
      supplyPm: full,
      totalPm: 1000,
      demand: 1,
      landPm: full,
      highOrePm: 1000,
    });
    expect(fishTierRange(state, 1, "fishing_spot")).toEqual({ min: 0, max: 4 });
  });
});
