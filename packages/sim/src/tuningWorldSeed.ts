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
  k(
    "npc_seed_mine_height_m",
    "mineMinHeightM",
    "NPC 시작 도시 광산: 칸 고도 문턱(m)",
    "NPC start city mine: cell height from (m)",
  ),
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
