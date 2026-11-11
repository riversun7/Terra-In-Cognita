import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_PLANET_ID } from "../db/planetColumns.ts";
import {
  isPlayablePlanet,
  planetScopeList,
  playablePlanets,
  primaryPlanetId,
  resolvePlayablePlanet,
} from "./playablePlanets.ts";
import { TEST_PLANET_ID } from "./testMaps.ts";

describe("플레이 행성 목록", () => {
  it("대표 행성이 하나이고 맨 앞이다", () => {
    const planets = playablePlanets();
    expect(planets.filter((planet) => planet.primary)).toHaveLength(1);
    expect(planets[0]?.primary).toBe(true);
    expect(planets[0]?.id).toBe(primaryPlanetId());
    expect(new Set(planets.map((planet) => planet.id)).size).toBe(planets.length);
  });

  it("대표 행성 = 세계 표 planet_id 기본값 = 2차맵을 띄우는 행성", () => {
    // 열 기본값과 어긋나면 planetId 없이 넣은 옛 줄이 다른 행성으로 읽힌다
    expect(primaryPlanetId()).toBe(DEFAULT_WORLD_PLANET_ID);
    expect(TEST_PLANET_ID).toBe(primaryPlanetId());
  });

  it("입력이 없으면 대표 행성, 플레이 행성이 아니면 받지 않는다", () => {
    expect(resolvePlayablePlanet(undefined)).toBe(primaryPlanetId());
    expect(resolvePlayablePlanet(primaryPlanetId())).toBe(primaryPlanetId());
    expect(resolvePlayablePlanet("s2_editor_planet")).toBeUndefined();
    expect(isPlayablePlanet("s2_editor_planet")).toBe(false);
  });
});

describe("범위 목록", () => {
  const sources = [
    { id: "s2_editor_planet", name: { ko: "편집 행성", en: "Editor planet" }, faceLevel: 9 },
    { id: primaryPlanetId(), name: { ko: "시험 행성", en: "Test planet" }, faceLevel: 9 },
  ];

  it("플레이 행성이 먼저이고 편집 전용은 뒤에 온다", () => {
    const list = planetScopeList(sources, { includeEditorOnly: true, nowMs: 5 });
    expect(list.primaryPlanetId).toBe(primaryPlanetId());
    expect(list.generatedAt).toBe(5);
    expect(list.planets.map((planet) => [planet.id, planet.status, planet.primary])).toEqual([
      [primaryPlanetId(), "playable", true],
      ["s2_editor_planet", "editor", false],
    ]);
    expect(list.planets[0]?.name).toEqual({ ko: "시험 행성", en: "Test planet" });
  });

  it("편집 전용을 빼면 플레이 행성만, 팩에 없으면 ID가 이름이다", () => {
    const list = planetScopeList([], { includeEditorOnly: false, nowMs: 0 });
    expect(list.planets).toEqual([
      {
        id: primaryPlanetId(),
        name: { ko: primaryPlanetId(), en: primaryPlanetId() },
        status: "playable",
        primary: true,
        faceLevel: null,
      },
    ]);
    expect(planetScopeList(sources, { includeEditorOnly: false, nowMs: 0 }).planets).toHaveLength(1);
  });
});
