// 구인 카드 설정 칸 값 ↔ 계수표 — 기획 49 N45·D-469·D-507, docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)"
// 팩 항목 ID ↔ 세력·사회 계수표 recruit 칸(경로). 출발값 = 옛 terra-server/routes/building/hq_routes.js(카드 3~5장, 12시간 갱신,
// 비용 = 등급 × 50 + (토탈 − 최소) × 2, 토탈 Lv1 30~45 · Lv2 45~60 · Lv3 60~80, 속성 10점을 원소 2~3개에, 레벨 1)이고 값은
// society/recruitment.ts OLD_RECRUIT_COEFFICIENTS다. Lv4·Lv5는 옛 값이 없어 [임시](카드 4~6·5~7, 토탈 80~100·100~120).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "N45",
  target: "society",
  path: `recruit.${path}`,
  structural: false,
  ko,
  en,
});

export const RECRUIT_TUNING_KEYS: readonly TuningKey[] = [
  k("n45_refresh_every", "refreshMs", "구인 카드 갱신 주기(ms)", "Recruit card refresh period (ms)"),
  k(
    "n45_cost_per_level",
    "costPerLevel",
    "구인 비용: 등급당(최소 단위)",
    "Recruit cost per grade (minor units)",
  ),
  k(
    "n45_cost_per_stat",
    "costPerStat",
    "구인 비용: 최소를 넘는 토탈 스탯 1점당(최소 단위)",
    "Recruit cost per stat point above the minimum (minor units)",
  ),
  k("n45_element_points", "elementPoints", "구인 휴먼 속성 점수", "Recruit element points"),
  k("n45_elements_min", "elementsMin", "구인 휴먼 속성 원소 수 최소", "Recruit element count min"),
  k("n45_elements_max", "elementsMax", "구인 휴먼 속성 원소 수 최대", "Recruit element count max"),
  k("n45_start_level", "startLevel", "구인 휴먼 시작 레벨", "Recruit start level"),
  ...[1, 2, 3, 4, 5].flatMap((level) => [
    k(
      `n45_cards_min_l${level}`,
      `levels.${level - 1}.cardsMin`,
      `구인 카드 수 최소, 행정 건물 Lv${level}`,
      `Recruit cards min, administrative building level ${level}`,
    ),
    k(
      `n45_cards_max_l${level}`,
      `levels.${level - 1}.cardsMax`,
      `구인 카드 수 최대, 행정 건물 Lv${level}`,
      `Recruit cards max, administrative building level ${level}`,
    ),
    k(
      `n45_stats_min_l${level}`,
      `levels.${level - 1}.statsMin`,
      `구인 토탈 스탯 최소, 행정 건물 Lv${level}`,
      `Recruit total stats min, administrative building level ${level}`,
    ),
    k(
      `n45_stats_max_l${level}`,
      `levels.${level - 1}.statsMax`,
      `구인 토탈 스탯 최대, 행정 건물 Lv${level}`,
      `Recruit total stats max, administrative building level ${level}`,
    ),
  ]),
];
