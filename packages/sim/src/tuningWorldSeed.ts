// 세계 씨앗 설정 칸 값 ↔ 계수표 — 기획 D-6041·46 §9.2·90 §2.1, docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"·"WP5 나라 성격".
// 팩 항목 ID ↔ 세력·사회 계수표 worldSeed 칸(경로). 출발값은 society/worldSeed.ts START_WORLD_SEED(모두 [임시]).
// 49에 칸이 없어 시작 도시 수는 결정 번호(d6041_*)를, 기본 시설 수·둘레 땅 문턱은 npc_seed_*를 앞머리로 쓴다(npc_attack_ratio와 같은 꼴).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `worldSeed.${path}`,
  structural: false,
  ko,
  en,
});

export const WORLD_SEED_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "d6041_start_cities_min",
    "startCitiesMin",
    "고정 NPC 국가 시작 도시 수 아래 끝(프리셋 성격 칸이 없으면 이 수)",
    "Fixed NPC nation start cities (low, used when the preset has none)",
  ),
  k(
    "d6041_start_cities_max",
    "startCitiesMax",
    "고정 NPC 국가 시작 도시 수 위 끝(프리셋 성격 칸·국력 등급 값의 상한)",
    "Fixed NPC nation start cities (high, cap for the preset and power tier value)",
  ),
  k("npc_seed_farms", "farms", "NPC 시작 도시 기본 농장 수", "NPC start city farms"),
  k("npc_seed_lumber_camps", "lumberCamps", "NPC 시작 도시 기본 벌목장 수", "NPC start city lumber camps"),
  k("npc_seed_mines", "mines", "NPC 시작 도시 기본 광산 수", "NPC start city mines"),
  k("npc_seed_storehouses", "storehouses", "NPC 시작 도시 기본 창고 수", "NPC start city storehouses"),
  k("npc_seed_housing", "startHousing", "NPC 새 시작 도시 주거 수", "NPC new start city housing"),
  k(
    "npc_seed_population_pm",
    "populationPm",
    "NPC 시작 도시 처음 인구(주거 × 천분율)",
    "NPC start city first population (housing × per mille)",
  ),
  k(
    "npc_seed_lumber_forest_pct",
    "lumberMinForestPct",
    "NPC 시작 도시 벌목장: 둘레 숲 % 문턱",
    "NPC start city lumber camp: surrounding forest % from",
  ),
  k("npc_seed_mine_height_m", "mineMinHeightM", "광석 몫 1000 고도(m)", "Full ore share height (m)"),
  k(
    "npc_seed_farm_temp_c",
    "farmMinTempC",
    "NPC 시작 도시 농장: 기온 문턱(°C)",
    "NPC start city farm: temperature from (°C)",
  ),
  k(
    "npc_seed_farm_rain_mm",
    "farmMinRainMm",
    "NPC 시작 도시 농장: 강수 문턱(mm)",
    "NPC start city farm: precipitation from (mm)",
  ),
  // 1차 생산 여섯 가지(docs/adr/2026-11-11-production-six.md): 약초원·목장·낚시터 수(출발값 0)
  k("npc_seed_herb_fields", "herbFields", "NPC 시작 도시 기본 약초원 수", "NPC start city herb fields"),
  k("npc_seed_ranches", "ranches", "NPC 시작 도시 기본 목장 수", "NPC start city ranches"),
  k("npc_seed_fishing_spots", "fishingSpots", "NPC 시작 도시 기본 낚시터 수", "NPC start city fishing spots"),
  // 국가 자리(docs/adr/2026-11-07-world-layout.md): 49에 칸이 없어 world_layout_*를 앞머리로 쓴다
  k(
    "world_layout_region_cells",
    "layoutRegionCells",
    "고정 국가 자리: 처음 찾는 반경(1차맵 칸)",
    "Fixed nation homes: first search radius (planet cells)",
  ),
  k(
    "world_layout_nation_gap_cells",
    "layoutNationGapCells",
    "고정 국가 자리: 국가 수도 사이 가장 짧은 거리(1차맵 칸)",
    "Fixed nation homes: shortest distance between capitals (planet cells)",
  ),
  k(
    "world_layout_city_step_cells",
    "layoutCityStepCells",
    "고정 국가 자리: 같은 국가 시작 도시 사이(1차맵 칸)",
    "Fixed nation homes: spacing of one nation's start cities (planet cells)",
  ),
  k(
    "world_layout_land_max_height_m",
    "layoutLandMaxHeightM",
    "고정 국가 자리: 시작 도시 땅 칸 고도 위 끝(m)",
    "Fixed nation homes: start city land height up to (m)",
  ),
  k(
    "world_layout_land_min_temp_c",
    "layoutLandMinTempC",
    "고정 국가 자리: 시작 도시 땅 기온 아래 끝(°C)",
    "Fixed nation homes: start city land temperature from (°C)",
  ),
  k(
    "world_layout_land_max_temp_c",
    "layoutLandMaxTempC",
    "고정 국가 자리: 시작 도시 땅 기온 위 끝(°C)",
    "Fixed nation homes: start city land temperature up to (°C)",
  ),
  k(
    "world_layout_land_min_rain_mm",
    "layoutLandMinRainMm",
    "고정 국가 자리: 시작 도시 땅 강수 아래 끝(mm)",
    "Fixed nation homes: start city land precipitation from (mm)",
  ),
  // 도시 배후지(docs/adr/2026-11-11-city-catchment.md): 49에 칸이 없어 city_catchment_*를 앞머리로 쓴다
  k(
    "city_catchment_radius_cells",
    "catchmentRadiusCells",
    "도시 배후지 반경(1차맵 칸, 0 = 옛 배치)",
    "City catchment radius (planet cells, 0 = old layout)",
  ),
  k(
    "city_catchment_same_gap_pm",
    "catchmentSameGapPm",
    "같은 국가 도시 사이 = 배후지 지름 × 천분율",
    "Same-nation city gap = catchment diameter × per mille",
  ),
  k(
    "city_catchment_foreign_gap_pm",
    "catchmentForeignGapPm",
    "다른 국가 도시 사이 = 배후지 지름 × 천분율",
    "Foreign city gap = catchment diameter × per mille",
  ),
  k(
    "city_catchment_search_cells",
    "catchmentSearchCells",
    "지방 도시 자리 찾는 반경(수도에서 1차맵 칸)",
    "Province city search radius (planet cells from the capital)",
  ),
  k(
    "city_catchment_compact_pm",
    "catchmentCompactPm",
    "지방 도시 자리: 배후지 지름마다 빼는 덮임(‰)",
    "Province city site: coverage taken off per catchment diameter (‰)",
  ),
  k(
    "city_catchment_mountain_site_pm",
    "catchmentMountainSitePm",
    "지방 도시 자리: 광산 국가의 산지 점수(‰)",
    "Province city site: mountain bonus for mining nations (‰)",
  ),
  // 도시 건물 배치(docs/adr/2026-11-11-city-building-layout.md): 49에 칸이 없어 city_layout_*·npc_seed_lodgings
  k("npc_seed_lodgings", "lodgings", "NPC 시작 도시 기본 숙소 수", "NPC start city lodgings"),
  // 마을 건물(질문 1052 다): 49에 칸이 없어 npc_village_lodgings
  k("npc_village_lodgings", "villageLodgings", "마을 숙소 수", "Village lodgings"),
  k(
    "city_layout_mode",
    "cityLayoutMode",
    "도시 건물 배치(1 = 전략 배치, 0 = 옛 배치)",
    "City building layout (1 = strategic, 0 = old rings)",
  ),
  k(
    "city_layout_plaza_cells",
    "cityLayoutPlazaCells",
    "행정 건물 둘레 광장(칸)",
    "Plaza around the government hall (cells)",
  ),
  k(
    "city_layout_inner_cells",
    "cityLayoutInnerCells",
    "가공·기타 건물 안쪽 고리 반경(칸)",
    "Inner ring radius for other buildings (cells)",
  ),
  k(
    "city_layout_gather_min_cells",
    "cityLayoutGatherMinCells",
    "채집소 띠 안쪽 끝(행정 건물에서 칸)",
    "Gathering station belt, inner edge (cells from the hall)",
  ),
  k(
    "city_layout_gather_max_cells",
    "cityLayoutGatherMaxCells",
    "채집소 띠 바깥 끝(행정 건물에서 칸)",
    "Gathering station belt, outer edge (cells from the hall)",
  ),
  k(
    "city_layout_gather_reach_cells",
    "cityLayoutGatherReachCells",
    "채집소 자리 점수: 원자재를 세는 반경(칸)",
    "Station site score: raw-material count radius (cells)",
  ),
  k(
    "city_layout_store_route_pm",
    "cityLayoutStoreRoutePm",
    "창고 자리: 행정 건물 → 채집소 길의 천분율",
    "Warehouse site: per mille along hall → stations",
  ),
  k(
    "city_layout_lodge_route_pm",
    "cityLayoutLodgeRoutePm",
    "숙소 자리: 행정 건물 → 채집소 길의 천분율",
    "Lodging site: per mille along hall → stations",
  ),
  k(
    "city_layout_jitter_cells",
    "cityLayoutJitterCells",
    "배치 흔들기(칸, 도시마다 다른 모양)",
    "Layout jitter (cells, each city looks different)",
  ),
  // 성벽 고리(질문 1048 가, docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)"): 49에 칸이 없어 city_wall_*
  k(
    "city_wall_mode",
    "cityWallMode",
    "성벽 고리(1 = 세움, 0 = 없음)",
    "City wall ring (1 = build, 0 = none)",
  ),
  k(
    "city_wall_ring_cells",
    "cityWallRingCells",
    "성벽 고리: 행정 건물에서 거리(칸)",
    "City wall ring: distance from the hall (cells)",
  ),
  k("city_wall_gates", "cityWallGates", "성벽 틈(성문) 수", "City wall gaps (gates)"),
  k("city_wall_gate_cells", "cityWallGateCells", "성벽 틈 폭(칸)", "City wall gap width (cells)"),
  // 도시 크기에 따라 넓어지는 배후지·채집 다툼(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)")
  k(
    "city_catchment_cells_per_100",
    "catchmentCellsPerHundred",
    "배후지: 사람 100명이 쓰는 1차맵 칸(요구 배율 1000‰)",
    "Catchment: planet cells per 100 people (need 1000‰)",
  ),
  k(
    "city_catchment_grade_need_base_pm",
    "catchmentGradeNeedBasePm",
    "배후지: 도시 등급 1(마을)의 요구 배율(‰)",
    "Catchment: need for city grade 1 (village, ‰)",
  ),
  k(
    "city_catchment_grade_need_step_pm",
    "catchmentGradeNeedStepPm",
    "배후지: 도시 등급이 하나 오를 때 더하는 요구 배율(‰)",
    "Catchment: extra need per city grade (‰)",
  ),
  k(
    "city_catchment_tech_need_pm",
    "catchmentTechNeedPm",
    "배후지: 기술 단계 하나마다 더하는 요구 배율(‰)",
    "Catchment: extra need per tech level (‰)",
  ),
  k(
    "city_catchment_min_radius_pm",
    "catchmentMinRadiusMilli",
    "배후지 반경 아래 끝(1차맵 칸 × 1000)",
    "Catchment radius minimum (planet cells × 1000)",
  ),
  k(
    "city_catchment_max_radius_pm",
    "catchmentMaxRadiusMilli",
    "배후지 반경 위 끝(1차맵 칸 × 1000)",
    "Catchment radius maximum (planet cells × 1000)",
  ),
  k(
    "city_catchment_capital_pm",
    "catchmentCapitalPm",
    "배후지 배치: 수도는 인구 × 천분율(등급 +1)로 잡는다",
    "Catchment layout: capital planned at population × per mille (grade +1)",
  ),
  k(
    "city_catchment_plan_grade",
    "catchmentPlanGrade",
    "배후지 배치: 시작 도시가 처음 기간에 이를 도시 등급",
    "Catchment layout: city grade start cities reach in the first period",
  ),
  k(
    "city_catchment_stock_per_cell",
    "catchmentStockPerCell",
    "배후지 칸 하나의 원자재 재고 상한",
    "Catchment: raw material stock per cell",
  ),
  k(
    "city_catchment_regrow_pm",
    "catchmentRegrowPm",
    "배후지: 하루 다시 자람(로지스틱 ‰)",
    "Catchment: daily regrowth (logistic ‰)",
  ),
  k(
    "city_catchment_regrow_floor",
    "catchmentRegrowFloor",
    "배후지: 재고 0에서도 하루 다시 자라는 양",
    "Catchment: daily regrowth even at zero stock",
  ),
  k(
    "city_catchment_draw_pm",
    "catchmentDrawPm",
    "배후지: 도시가 칸마다 캐려는 양(버티는 양의 ‰)",
    "Catchment: draw per cell (‰ of what a cell sustains)",
  ),
  k(
    "city_catchment_growth_min_pm",
    "catchmentGrowthMinPm",
    "배후지: 인구를 늘리는 데 필요한 받은 몫(‰)",
    "Catchment: supply needed to grow population (‰)",
  ),
  k(
    "city_catchment_yield_floor_pm",
    "catchmentYieldFloorPm",
    "배후지: 채집 시설 빠르기 바닥(‰)",
    "Catchment: gather facility speed floor (‰)",
  ),
  // 광석 고도 몫(기획 D-533, 질문 1020·1064): 49에 칸이 없어 ore_*를 앞머리로 쓴다. 산지 고도는 npc_seed_mine_height_m
  k("ore_share_low_pm", "oreShareLowPm", "광석 몫: 해수면(0m 이하) 땅(‰)", "Ore share: sea-level land (‰)"),
  k("ore_share_hill_m", "oreShareHillM", "광석 몫: 언덕 고도(m)", "Ore share: hill height (m)"),
  k("ore_share_hill_pm", "oreShareHillPm", "광석 몫: 언덕 고도에서(‰)", "Ore share: at hill height (‰)"),
  k(
    "ore_low_tier_max",
    "oreLowTierMax",
    "산지 밖 광석의 가장 높은 티어",
    "Highest ore tier outside mountains",
  ),
  // 높은 티어 광석 분포(기획 D-535, 질문 1121): 산지 고도를 낮추고 산지 밖에도 드물게
  k("ore_high_min_m", "oreHighMinM", "높은 티어 광석: 산지 고도(m)", "High-tier ore: mountain height (m)"),
  k(
    "ore_flat_high_pm",
    "oreFlatHighPm",
    "높은 티어 광석: 산지 밖 몫(‰)",
    "High-tier ore: share outside mountains (‰)",
  ),
  // 옆 2차맵을 그때 띄우기(기획 답 730 다, docs/adr/2026-11-07-play-flow.md "WP15"): 49에 칸이 없어 map_spawn_*를 앞머리로 쓴다
  k(
    "map_spawn_max_loaded",
    "mapSpawnMaxLoaded",
    "그때 띄우는 2차맵 상한(씨앗 2차맵 빼고)",
    "On-demand second maps limit (seed maps not counted)",
  ),
  k(
    "map_spawn_idle_ms",
    "mapSpawnIdleMs",
    "그때 띄운 2차맵: 비어 있으면 내리기까지(ms)",
    "On-demand second map: time empty before closing (ms)",
  ),
  // 옆 2차맵 미리 띄우기(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)"): 49에 칸이 없어 map_preopen_*를 앞머리로 쓴다
  k(
    "map_preopen_cells",
    "mapPreopenCells",
    "옆 2차맵 미리 띄우기: 변에서 이만큼(배치 칸) 안의 플레이어 유닛",
    "Pre-open neighbour map: player unit within this many cells of the edge",
  ),
  k(
    "map_preopen_idle_ms",
    "mapPreopenIdleMs",
    "미리 띄운 2차맵: 아무도 들어서지 않고 비어 있으면 내리기까지(ms)",
    "Pre-opened second map: time empty (never entered) before closing (ms)",
  ),
  // NPC 휴먼 낮밤 일(기획 답 770 나, docs/adr/2026-11-07-play-flow.md "WP-NPC4"): 49에 칸이 없어 npc_work_*를 앞머리로 쓴다
  k(
    "npc_work_start_pm",
    "workStartPm",
    "NPC 휴먼 일터에 가는 지역 시각(그 지역 하루 ‰, 250 = 06:00)",
    "NPC humans go to work at local time (‰ of the local day, 250 = 06:00)",
  ),
  k(
    "npc_work_end_pm",
    "workEndPm",
    "NPC 휴먼 집으로 가는 지역 시각(그 지역 하루 ‰, 750 = 18:00)",
    "NPC humans go home at local time (‰ of the local day, 750 = 18:00)",
  ),
  // NPC 수도 옮기기(기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)"): 49에 칸이 없어 npc_capital_*를 앞머리로 쓴다
  k(
    "npc_capital_switch_dev",
    "capitalSwitchDev",
    "NPC 수도 옮기기: 다른 도시 발전도가 수도보다 이만큼 높으면(점)",
    "NPC capital move: when another city's development leads the capital by (points)",
  ),
];
