// 세계 씨앗 설정 칸 값 ↔ 계수표 — 기획 D-6041·46 §9.2·90 §2.1, docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗".
// 팩 항목 ID ↔ 세력·사회 계수표 worldSeed 칸(경로). 출발값은 society/worldSeed.ts START_WORLD_SEED(모두 [임시]).
// 49에 칸이 없어 시작 도시 수는 결정 번호(d6041_*)를, 기본 시설 수는 npc_seed_*를 앞머리로 쓴다(npc_attack_ratio와 같은 꼴).
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
    "고정 NPC 국가 시작 도시 수 아래 끝",
    "Fixed NPC nation start cities (low)",
  ),
  k(
    "d6041_start_cities_max",
    "startCitiesMax",
    "고정 NPC 국가 시작 도시 수 위 끝",
    "Fixed NPC nation start cities (high)",
  ),
  k("npc_seed_farms", "farms", "NPC 시작 도시 기본 농장 수", "NPC start city farms"),
  k("npc_seed_lumber_camps", "lumberCamps", "NPC 시작 도시 기본 벌목장 수", "NPC start city lumber camps"),
  k("npc_seed_mines", "mines", "NPC 시작 도시 기본 광산 수", "NPC start city mines"),
  k("npc_seed_storehouses", "storehouses", "NPC 시작 도시 기본 창고 수", "NPC start city storehouses"),
];
