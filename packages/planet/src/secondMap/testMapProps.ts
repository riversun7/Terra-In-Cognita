// 2차맵 시험용 소품 규칙 — 골든 해시가 콘텐츠 팩 수정에 흔들리지 않게 팩 값을 옮겨 적었다(2026-10-31 content/core map_props, 이름 뺌).
// 팩과 같은지는 props.test.ts가 본다(다르면 여기를 팩에 맞추고 골든 해시를 고친다).
import type { MapPropInput } from "./props.ts";

export const TEST_MAP_PROPS: readonly MapPropInput[] = [
  {
    id: "forest_broadleaf",
    placement: "forest",
    art: "tree_broadleaf",
    biomes: [
      {
        biome: "temperate_forest",
        weight: 700,
      },
      {
        biome: "tropical_rainforest",
        weight: 600,
      },
      {
        biome: "savanna",
        weight: 500,
      },
      {
        biome: "wetland",
        weight: 400,
      },
      {
        biome: "grassland",
        weight: 400,
      },
    ],
    curves: {
      temperatureC: {
        min: -2,
        idealMin: 8,
        idealMax: 30,
        max: 40,
      },
    },
  },
  {
    id: "forest_conifer",
    placement: "forest",
    art: "tree_conifer",
    biomes: [
      {
        biome: "taiga",
        weight: 900,
      },
      {
        biome: "alpine",
        weight: 800,
      },
      {
        biome: "tundra",
        weight: 700,
      },
      {
        biome: "temperate_forest",
        weight: 300,
      },
    ],
    curves: {
      temperatureC: {
        min: -30,
        idealMin: -15,
        idealMax: 6,
        max: 18,
      },
    },
  },
  {
    id: "forest_palm",
    placement: "forest",
    art: "tree_palm",
    biomes: [
      {
        biome: "tropical_rainforest",
        weight: 400,
      },
      {
        biome: "desert",
        weight: 300,
      },
      {
        biome: "savanna",
        weight: 200,
      },
    ],
    curves: {
      temperatureC: {
        min: 18,
        idealMin: 24,
        idealMax: 40,
        max: 45,
      },
    },
  },
  {
    id: "boulder",
    placement: "scatter",
    art: "boulder",
    cover: 2,
    biomes: [
      {
        biome: "alpine",
        weight: 40,
      },
      {
        biome: "tundra",
        weight: 20,
      },
      {
        biome: "desert",
        weight: 12,
      },
      {
        biome: "taiga",
        weight: 8,
      },
      {
        biome: "ice_sheet",
        weight: 6,
      },
      {
        biome: "savanna",
        weight: 6,
      },
      {
        biome: "grassland",
        weight: 5,
      },
      {
        biome: "temperate_forest",
        weight: 5,
      },
    ],
    curves: {
      slopePct: {
        min: 0,
        idealMin: 12,
        idealMax: 400,
        max: 1000,
      },
    },
    clump: {
      cells: 16,
      threshold: 550,
    },
    maxShare: 40,
  },
  {
    id: "fallen_log",
    placement: "scatter",
    art: "log",
    cover: 1,
    biomes: [
      {
        biome: "taiga",
        weight: 12,
      },
      {
        biome: "temperate_forest",
        weight: 12,
      },
      {
        biome: "tropical_rainforest",
        weight: 10,
      },
    ],
    maxShare: 15,
  },
  {
    id: "reeds",
    placement: "scatter",
    art: "reeds",
    cover: 1,
    biomes: [
      {
        biome: "wetland",
        weight: 300,
      },
      {
        biome: "tropical_rainforest",
        weight: 50,
      },
      {
        biome: "grassland",
        weight: 40,
      },
      {
        biome: "temperate_forest",
        weight: 40,
      },
      {
        biome: "savanna",
        weight: 30,
      },
      {
        biome: "taiga",
        weight: 30,
      },
      {
        biome: "tundra",
        weight: 15,
      },
    ],
    curves: {
      temperatureC: {
        min: -6,
        idealMin: 4,
        idealMax: 35,
        max: 42,
      },
      waterDistance: {
        min: 0,
        idealMin: 1,
        idealMax: 3,
        max: 8,
      },
    },
    clump: {
      cells: 4,
      threshold: 300,
    },
  },
  {
    id: "bush",
    placement: "scatter",
    art: "bush",
    cover: 1,
    biomes: [
      {
        biome: "savanna",
        weight: 50,
      },
      {
        biome: "tropical_rainforest",
        weight: 50,
      },
      {
        biome: "temperate_forest",
        weight: 30,
      },
      {
        biome: "wetland",
        weight: 30,
      },
      {
        biome: "grassland",
        weight: 25,
      },
      {
        biome: "taiga",
        weight: 25,
      },
      {
        biome: "tundra",
        weight: 20,
      },
      {
        biome: "desert",
        weight: 8,
      },
    ],
    curves: {
      humidity: {
        min: 10,
        idealMin: 70,
        idealMax: 255,
        max: 255,
      },
    },
    clump: {
      cells: 8,
      threshold: 450,
    },
  },
];
