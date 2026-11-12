// 2차맵 시험용 소품 규칙 — 골든 해시가 콘텐츠 팩 수정에 흔들리지 않게 팩 값을 옮겨 적었다(2026-10-31 content/core map_props, 이름·설명 뺌.
// 2026-11-11 장식 소품 11종, 2026-11-12 지형별 오브젝트(D-536) 장식·물 위 소품을 끝에 더함)
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
  {
    id: "snowdrift",
    placement: "scatter",
    art: "snowdrift",
    cover: 0,
    biomes: [
      {
        biome: "ice_sheet",
        weight: 60,
      },
      {
        biome: "tundra",
        weight: 20,
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
      threshold: 450,
    },
    maxShare: 60,
  },
  {
    id: "crevasse",
    placement: "scatter",
    art: "crevasse",
    cover: 2,
    biomes: [
      {
        biome: "ice_sheet",
        weight: 8,
      },
    ],
    clump: {
      cells: 32,
      threshold: 700,
    },
    maxShare: 12,
  },
  {
    id: "ice_fossil",
    placement: "scatter",
    art: "ice_fossil",
    cover: 0,
    biomes: [
      {
        biome: "ice_sheet",
        weight: 2,
      },
    ],
    maxShare: 3,
  },
  {
    id: "frost_pool",
    placement: "scatter",
    art: "frost_pool",
    cover: 0,
    biomes: [
      {
        biome: "tundra",
        weight: 10,
      },
    ],
    clump: {
      cells: 8,
      threshold: 500,
    },
    maxShare: 20,
  },
  {
    id: "berry_bush",
    placement: "scatter",
    art: "berry_bush",
    cover: 0,
    biomes: [
      {
        biome: "taiga",
        weight: 25,
      },
      {
        biome: "temperate_forest",
        weight: 8,
      },
      {
        biome: "tundra",
        weight: 6,
      },
    ],
    clump: {
      cells: 8,
      threshold: 450,
    },
    maxShare: 40,
  },
  {
    id: "sand_dune",
    placement: "scatter",
    art: "sand_dune",
    cover: 0,
    biomes: [
      {
        biome: "desert",
        weight: 50,
      },
    ],
    clump: {
      cells: 32,
      threshold: 500,
    },
    maxShare: 40,
  },
  {
    id: "salt_flat",
    placement: "scatter",
    art: "salt_flat",
    cover: 0,
    biomes: [
      {
        biome: "desert",
        weight: 15,
      },
    ],
    curves: {
      humidity: {
        min: 0,
        idealMin: 0,
        idealMax: 40,
        max: 90,
      },
    },
    clump: {
      cells: 32,
      threshold: 550,
    },
    maxShare: 40,
  },
  {
    id: "oil_seep",
    placement: "scatter",
    art: "oil_seep",
    cover: 0,
    biomes: [
      {
        biome: "desert",
        weight: 2,
      },
    ],
    maxShare: 4,
  },
  {
    id: "waterhole",
    placement: "scatter",
    art: "waterhole",
    cover: 0,
    biomes: [
      {
        biome: "savanna",
        weight: 4,
      },
      {
        biome: "desert",
        weight: 1,
      },
    ],
    maxShare: 6,
  },
  {
    id: "vines",
    placement: "scatter",
    art: "vines",
    cover: 0,
    biomes: [
      {
        biome: "tropical_rainforest",
        weight: 60,
      },
      {
        biome: "wetland",
        weight: 10,
      },
    ],
    clump: {
      cells: 8,
      threshold: 400,
    },
    maxShare: 80,
  },
  {
    id: "fruit_tree",
    placement: "scatter",
    art: "fruit_tree",
    cover: 0,
    biomes: [
      {
        biome: "tropical_rainforest",
        weight: 12,
      },
      {
        biome: "savanna",
        weight: 3,
      },
    ],
    maxShare: 20,
  },
  {
    id: "mud_pool",
    placement: "scatter",
    art: "mud_pool",
    cover: 0,
    biomes: [
      {
        biome: "wetland",
        weight: 25,
      },
      {
        biome: "tropical_rainforest",
        weight: 8,
      },
    ],
    curves: {
      humidity: {
        min: 120,
        idealMin: 180,
        idealMax: 255,
        max: 255,
      },
    },
    clump: {
      cells: 8,
      threshold: 500,
    },
    maxShare: 40,
  },
  {
    id: "peat_mound",
    placement: "scatter",
    art: "peat_mound",
    cover: 0,
    biomes: [
      {
        biome: "wetland",
        weight: 20,
      },
      {
        biome: "tundra",
        weight: 4,
      },
    ],
    clump: {
      cells: 16,
      threshold: 500,
    },
    maxShare: 30,
  },
  {
    id: "rock_spire",
    placement: "scatter",
    art: "rock_spire",
    cover: 2,
    biomes: [
      {
        biome: "alpine",
        weight: 20,
      },
    ],
    curves: {
      slopePct: {
        min: 30,
        idealMin: 80,
        idealMax: 1000,
        max: 1000,
      },
    },
    clump: {
      cells: 16,
      threshold: 500,
    },
    maxShare: 30,
  },
  {
    id: "cave_entrance",
    placement: "scatter",
    art: "cave_entrance",
    cover: 0,
    biomes: [
      {
        biome: "alpine",
        weight: 2,
      },
    ],
    curves: {
      slopePct: {
        min: 20,
        idealMin: 60,
        idealMax: 1000,
        max: 1000,
      },
    },
    maxShare: 3,
  },
  {
    id: "beach_dune",
    placement: "scatter",
    art: "beach_dune",
    cover: 0,
    biomes: [
      {
        biome: "ocean_coastal",
        weight: 80,
      },
      {
        biome: "desert",
        weight: 30,
      },
      {
        biome: "savanna",
        weight: 30,
      },
      {
        biome: "grassland",
        weight: 30,
      },
      {
        biome: "temperate_forest",
        weight: 30,
      },
      {
        biome: "taiga",
        weight: 30,
      },
      {
        biome: "tundra",
        weight: 30,
      },
      {
        biome: "tropical_rainforest",
        weight: 30,
      },
      {
        biome: "wetland",
        weight: 30,
      },
    ],
    curves: {
      waterDistance: {
        min: 1,
        idealMin: 1,
        idealMax: 3,
        max: 5,
      },
    },
    clump: {
      cells: 8,
      threshold: 400,
    },
    maxShare: 60,
  },
  {
    id: "shell_bed",
    placement: "scatter",
    art: "shell_bed",
    cover: 0,
    biomes: [
      {
        biome: "ocean_coastal",
        weight: 40,
      },
      {
        biome: "lake",
        weight: 10,
      },
      {
        biome: "desert",
        weight: 12,
      },
      {
        biome: "savanna",
        weight: 12,
      },
      {
        biome: "grassland",
        weight: 12,
      },
      {
        biome: "temperate_forest",
        weight: 12,
      },
      {
        biome: "taiga",
        weight: 12,
      },
      {
        biome: "tundra",
        weight: 12,
      },
      {
        biome: "tropical_rainforest",
        weight: 12,
      },
      {
        biome: "wetland",
        weight: 12,
      },
    ],
    curves: {
      waterDistance: {
        min: 0,
        idealMin: 1,
        idealMax: 1,
        max: 3,
      },
    },
    maxShare: 30,
  },
  {
    id: "salt_pan",
    placement: "scatter",
    art: "salt_flat",
    cover: 0,
    biomes: [
      {
        biome: "ocean_coastal",
        weight: 40,
      },
      {
        biome: "desert",
        weight: 6,
      },
      {
        biome: "savanna",
        weight: 6,
      },
      {
        biome: "grassland",
        weight: 6,
      },
      {
        biome: "temperate_forest",
        weight: 6,
      },
      {
        biome: "taiga",
        weight: 6,
      },
      {
        biome: "tundra",
        weight: 6,
      },
      {
        biome: "tropical_rainforest",
        weight: 6,
      },
      {
        biome: "wetland",
        weight: 6,
      },
    ],
    curves: {
      waterDistance: {
        min: 1,
        idealMin: 1,
        idealMax: 3,
        max: 6,
      },
      humidity: {
        min: 0,
        idealMin: 0,
        idealMax: 140,
        max: 200,
      },
    },
    clump: {
      cells: 16,
      threshold: 500,
    },
    maxShare: 20,
  },
  {
    id: "mud_flat",
    placement: "scatter",
    art: "mud_flat",
    cover: 0,
    biomes: [
      {
        biome: "lake",
        weight: 40,
      },
      {
        biome: "wetland",
        weight: 15,
      },
      {
        biome: "ocean_coastal",
        weight: 10,
      },
    ],
    curves: {
      waterDistance: {
        min: 0,
        idealMin: 1,
        idealMax: 2,
        max: 4,
      },
    },
    clump: {
      cells: 8,
      threshold: 450,
    },
    maxShare: 40,
  },
  {
    id: "ford_ripple",
    placement: "scatter",
    art: "ford_ripple",
    cover: 0,
    biomes: [
      {
        biome: "ocean_coastal",
        weight: 30,
      },
      {
        biome: "lake",
        weight: 20,
      },
    ],
    maxShare: 30,
    water: true,
  },
  {
    id: "kelp",
    placement: "scatter",
    art: "kelp",
    cover: 0,
    biomes: [
      {
        biome: "ocean_shelf",
        weight: 40,
      },
      {
        biome: "ocean_coastal",
        weight: 20,
      },
    ],
    curves: {
      temperatureC: {
        min: -5,
        idealMin: 2,
        idealMax: 18,
        max: 24,
      },
    },
    clump: {
      cells: 16,
      threshold: 450,
    },
    maxShare: 40,
    water: true,
  },
  {
    id: "coral",
    placement: "scatter",
    art: "coral",
    cover: 0,
    biomes: [
      {
        biome: "ocean_shelf",
        weight: 30,
      },
      {
        biome: "ocean_coastal",
        weight: 10,
      },
    ],
    curves: {
      temperatureC: {
        min: 18,
        idealMin: 24,
        idealMax: 32,
        max: 36,
      },
    },
    clump: {
      cells: 16,
      threshold: 500,
    },
    maxShare: 40,
    water: true,
  },
  {
    id: "seabed_vein",
    placement: "scatter",
    art: "seabed_vein",
    cover: 0,
    biomes: [
      {
        biome: "ocean_shelf",
        weight: 3,
      },
    ],
    maxShare: 5,
    water: true,
  },
  {
    id: "iceberg",
    placement: "scatter",
    art: "iceberg",
    cover: 0,
    biomes: [
      {
        biome: "ocean_deep",
        weight: 15,
      },
      {
        biome: "ocean_shelf",
        weight: 8,
      },
    ],
    curves: {
      temperatureC: {
        min: -100,
        idealMin: -100,
        idealMax: -5,
        max: 2,
      },
    },
    clump: {
      cells: 32,
      threshold: 550,
    },
    maxShare: 15,
    water: true,
  },
  {
    id: "sea_current",
    placement: "scatter",
    art: "sea_current",
    cover: 0,
    biomes: [
      {
        biome: "ocean_deep",
        weight: 10,
      },
      {
        biome: "ocean_shelf",
        weight: 4,
      },
    ],
    clump: {
      cells: 32,
      threshold: 600,
    },
    maxShare: 20,
    water: true,
  },
  {
    id: "seabed_oil",
    placement: "scatter",
    art: "seabed_oil",
    cover: 0,
    biomes: [
      {
        biome: "ocean_deep",
        weight: 2,
      },
      {
        biome: "ocean_shelf",
        weight: 1,
      },
    ],
    maxShare: 3,
    water: true,
  },
  {
    id: "lily_pads",
    placement: "scatter",
    art: "lily_pads",
    cover: 0,
    biomes: [
      {
        biome: "lake",
        weight: 40,
      },
      {
        biome: "wetland",
        weight: 10,
      },
    ],
    curves: {
      temperatureC: {
        min: -4,
        idealMin: 6,
        idealMax: 32,
        max: 38,
      },
    },
    clump: {
      cells: 8,
      threshold: 450,
    },
    maxShare: 40,
    water: true,
  },
  {
    id: "islet",
    placement: "scatter",
    art: "islet",
    cover: 0,
    biomes: [
      {
        biome: "lake",
        weight: 5,
      },
      {
        biome: "ocean_coastal",
        weight: 1,
      },
    ],
    maxShare: 5,
    water: true,
  },
];
