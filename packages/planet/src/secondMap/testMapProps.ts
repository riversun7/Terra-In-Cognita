// 2차맵 시험용 소품 규칙 — 골든 해시가 콘텐츠 팩 수정에 흔들리지 않게 팩 값을 옮겨 적었다(2026-10-31 content/core map_props, 이름·설명 뺌.
// 2026-11-11 장식 소품 11종을 끝에 더함)
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
  {
    id: "cactus",
    placement: "scatter",
    art: "cactus",
    cover: 0,
    biomes: [
      {
        biome: "desert",
        weight: 45,
      },
      {
        biome: "savanna",
        weight: 8,
      },
    ],
    curves: {
      temperatureC: {
        min: 8,
        idealMin: 20,
        idealMax: 45,
        max: 52,
      },
      humidity: {
        min: 0,
        idealMin: 0,
        idealMax: 60,
        max: 120,
      },
    },
    clump: {
      cells: 16,
      threshold: 350,
    },
    maxShare: 60,
  },
  {
    id: "dry_shrub",
    placement: "scatter",
    art: "dry_shrub",
    cover: 0,
    biomes: [
      {
        biome: "desert",
        weight: 70,
      },
      {
        biome: "savanna",
        weight: 60,
      },
      {
        biome: "grassland",
        weight: 25,
      },
      {
        biome: "tundra",
        weight: 30,
      },
      {
        biome: "alpine",
        weight: 15,
      },
    ],
    curves: {
      humidity: {
        min: 0,
        idealMin: 0,
        idealMax: 90,
        max: 160,
      },
    },
    maxShare: 100,
  },
  {
    id: "tall_grass",
    placement: "scatter",
    art: "tall_grass",
    cover: 0,
    biomes: [
      {
        biome: "grassland",
        weight: 180,
      },
      {
        biome: "savanna",
        weight: 160,
      },
      {
        biome: "wetland",
        weight: 90,
      },
      {
        biome: "temperate_forest",
        weight: 60,
      },
      {
        biome: "tundra",
        weight: 50,
      },
      {
        biome: "taiga",
        weight: 40,
      },
      {
        biome: "tropical_rainforest",
        weight: 40,
      },
    ],
    curves: {
      temperatureC: {
        min: -8,
        idealMin: 4,
        idealMax: 32,
        max: 42,
      },
      humidity: {
        min: 20,
        idealMin: 60,
        idealMax: 255,
        max: 255,
      },
    },
    clump: {
      cells: 8,
      threshold: 450,
    },
    maxShare: 250,
  },
  {
    id: "flowers",
    placement: "scatter",
    art: "flowers",
    cover: 0,
    biomes: [
      {
        biome: "grassland",
        weight: 60,
      },
      {
        biome: "alpine",
        weight: 40,
      },
      {
        biome: "tundra",
        weight: 35,
      },
      {
        biome: "temperate_forest",
        weight: 30,
      },
      {
        biome: "wetland",
        weight: 25,
      },
      {
        biome: "savanna",
        weight: 20,
      },
    ],
    curves: {
      temperatureC: {
        min: -5,
        idealMin: 6,
        idealMax: 28,
        max: 38,
      },
      slopePct: {
        min: 0,
        idealMin: 0,
        idealMax: 40,
        max: 120,
      },
    },
    clump: {
      cells: 4,
      threshold: 600,
    },
    maxShare: 80,
  },
  {
    id: "stones",
    placement: "scatter",
    art: "stones",
    cover: 0,
    biomes: [
      {
        biome: "alpine",
        weight: 90,
      },
      {
        biome: "tundra",
        weight: 40,
      },
      {
        biome: "desert",
        weight: 25,
      },
      {
        biome: "ice_sheet",
        weight: 25,
      },
      {
        biome: "ocean_coastal",
        weight: 25,
      },
      {
        biome: "taiga",
        weight: 15,
      },
      {
        biome: "savanna",
        weight: 10,
      },
      {
        biome: "grassland",
        weight: 6,
      },
      {
        biome: "temperate_forest",
        weight: 6,
      },
    ],
    curves: {
      slopePct: {
        min: 0,
        idealMin: 0,
        idealMax: 600,
        max: 1000,
      },
    },
    clump: {
      cells: 8,
      threshold: 400,
    },
    maxShare: 150,
  },
  {
    id: "driftwood",
    placement: "scatter",
    art: "driftwood",
    cover: 0,
    biomes: [
      {
        biome: "ocean_coastal",
        weight: 200,
      },
      {
        biome: "lake",
        weight: 120,
      },
      {
        biome: "ocean_shelf",
        weight: 120,
      },
      {
        biome: "desert",
        weight: 100,
      },
      {
        biome: "savanna",
        weight: 100,
      },
      {
        biome: "grassland",
        weight: 100,
      },
      {
        biome: "temperate_forest",
        weight: 100,
      },
      {
        biome: "taiga",
        weight: 100,
      },
      {
        biome: "tundra",
        weight: 100,
      },
      {
        biome: "tropical_rainforest",
        weight: 100,
      },
      {
        biome: "wetland",
        weight: 60,
      },
      {
        biome: "alpine",
        weight: 40,
      },
    ],
    curves: {
      waterDistance: {
        min: 0,
        idealMin: 1,
        idealMax: 2,
        max: 5,
      },
    },
    maxShare: 30,
  },
  {
    id: "termite_mound",
    placement: "scatter",
    art: "termite_mound",
    cover: 0,
    biomes: [
      {
        biome: "savanna",
        weight: 12,
      },
      {
        biome: "desert",
        weight: 3,
      },
    ],
    curves: {
      temperatureC: {
        min: 16,
        idealMin: 22,
        idealMax: 40,
        max: 46,
      },
    },
    maxShare: 10,
  },
  {
    id: "dead_tree",
    placement: "scatter",
    art: "dead_tree",
    cover: 0,
    biomes: [
      {
        biome: "wetland",
        weight: 12,
      },
      {
        biome: "savanna",
        weight: 10,
      },
      {
        biome: "tundra",
        weight: 8,
      },
      {
        biome: "desert",
        weight: 4,
      },
      {
        biome: "taiga",
        weight: 6,
      },
    ],
    maxShare: 10,
  },
  {
    id: "fern",
    placement: "scatter",
    art: "fern",
    cover: 0,
    biomes: [
      {
        biome: "tropical_rainforest",
        weight: 120,
      },
      {
        biome: "temperate_forest",
        weight: 60,
      },
      {
        biome: "wetland",
        weight: 50,
      },
      {
        biome: "taiga",
        weight: 30,
      },
    ],
    curves: {
      humidity: {
        min: 60,
        idealMin: 120,
        idealMax: 255,
        max: 255,
      },
      temperatureC: {
        min: -2,
        idealMin: 8,
        idealMax: 38,
        max: 44,
      },
    },
    maxShare: 200,
  },
  {
    id: "ice_block",
    placement: "scatter",
    art: "ice_block",
    cover: 0,
    biomes: [
      {
        biome: "ice_sheet",
        weight: 40,
      },
      {
        biome: "tundra",
        weight: 4,
      },
      {
        biome: "alpine",
        weight: 4,
      },
    ],
    curves: {
      temperatureC: {
        min: -100,
        idealMin: -100,
        idealMax: -4,
        max: 2,
      },
    },
    clump: {
      cells: 16,
      threshold: 500,
    },
    maxShare: 60,
  },
  {
    id: "bones",
    placement: "scatter",
    art: "bones",
    cover: 0,
    biomes: [
      {
        biome: "desert",
        weight: 3,
      },
      {
        biome: "savanna",
        weight: 2,
      },
      {
        biome: "tundra",
        weight: 2,
      },
    ],
    maxShare: 2,
  },
];
