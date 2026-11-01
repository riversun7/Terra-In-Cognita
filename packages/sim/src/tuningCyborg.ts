// 사이보그 설정 칸 값 ↔ 계수표 — tuning.ts에서 나눈 사이보그·장비 수리 칸(파일 크기, AGENTS.md 4장).
// docs/adr/2026-10-31-faction-society-core.md "설정 칸 대응"·"바뀜 (2026-11-01, D-450~D-453)", 기획 49 §6.5 N6·N7·N9·N34·N36~N39·F11·F12.
// 팩 항목 ID ↔ 세력·사회 계수표 칸(경로). 출발값이 없는 칸은 설정값 출발값(D-5032)이고 값은 계수표 TEST_SOCIETY_COEFFICIENTS다.
import type { TuningKey } from "./tuning.ts";

const k = (
  id: string,
  code: string,
  path: string,
  ko: string,
  en: string,
  structural = false,
): TuningKey => ({
  id,
  code,
  target: "society",
  path,
  structural,
  ko,
  en,
});

export const CYBORG_TUNING_KEYS: readonly TuningKey[] = [
  // 사이보그 성장·환생 (N5·N6·N7·N9·N34, D-417·D-440·D-441·D-451)
  k("n5_growth_rate", "N5", "cyborg.growthPm", "레벨당 성장률(‰)", "Growth rate per level (‰)"),
  k("n6_k_min", "N6", "cyborg.kMinPm", "K 범위 최소(‰)", "K range min (‰)"),
  k("n6_k_max", "N6", "cyborg.kMaxPm", "K 범위 최대(‰)", "K range max (‰)"),
  k("n7_max_level", "N7", "cyborg.maxLevel", "만렙(기본)", "Max level (base)", true),
  k("n9_initial_sum", "N9", "cyborg.initialSum", "사이보그 초기 스탯 합", "Cyborg initial stat sum"),
  k("n9_initial_min", "N9", "cyborg.initialMin", "초기 스탯 칸 최소", "Initial stat min per stat"),
  k("n9_initial_max", "N9", "cyborg.initialMax", "초기 스탯 칸 최대", "Initial stat max per stat"),
  k("n9_initial_rerolls", "N9", "cyborg.initialRerolls", "다시 굴리기 횟수", "Initial rerolls"),
  k("n9_initial_favor", "N9", "cyborg.initialFavorMilli", "성향 평균 올림", "Temperament boost"),
  k("n9_initial_spread", "N9", "cyborg.initialSpreadMilli", "스탯 표준편차", "Initial stat spread"),
  k(
    "n34_rebirth_faith",
    "N34",
    "cyborg.rebirthFaith",
    "사이보그 환생 신앙도 문턱(환생하면 0)",
    "Cyborg rebirth faith threshold (reset to 0)",
  ),
  k(
    "n34_rebirth_currency",
    "N34",
    "cyborg.rebirthCurrency",
    "사이보그 환생 화폐(최소 단위)",
    "Cyborg rebirth currency cost (minor units)",
  ),
  // 첫 접속 시작 도시 붐빔 띠(D-6041·D-445 175 설정값, docs/adr/2026-11-01-first-login-cyborg.md)
  k(
    "d6041_crowd_normal",
    "",
    "cyborg.startCrowdNormal",
    "시작 도시 붐빔 보통 문턱(사이보그 수)",
    "Start city crowding: normal from (cyborgs)",
  ),
  k(
    "d6041_crowd_busy",
    "",
    "cyborg.startCrowdBusy",
    "시작 도시 붐빔 문턱(사이보그 수)",
    "Start city crowding: busy from (cyborgs)",
  ),
  // 생성·환생 속성값(N36 구조 값 2칸·10점, N37 빛·어둠 출발값 없음 → 설정값 출발값, D-450·D-452)
  k(
    "n36_element_cells",
    "N36",
    "cyborg.elementCells",
    "생성 속성 칸 수(4원소)",
    "Creation element cells (basic four)",
    true,
  ),
  k("n36_element_points", "N36", "cyborg.elementPoints", "생성 속성 점수", "Creation element points", true),
  k(
    "n37_light_dark",
    "N37",
    "cyborg.lightDarkPoints",
    "종교 환생 빛·어둠 값",
    "Religious rebirth light/dark points",
  ),
  // 사이보그 인공장기 내구도·생활비(N38 출발값 없음 → 설정값 출발값, D-453)
  k(
    "n38_organ_wear",
    "N38",
    "cyborg.organWearPerPeriod",
    "인공장기 닳는 양(정시마다)",
    "Organ wear per hour",
  ),
  k(
    "n38_organ_repair_cost",
    "N38",
    "cyborg.organRepairCost",
    "인공장기 수리 비용(내구도 1점, 최소 단위)",
    "Organ repair cost per point (minor units)",
  ),
  k(
    "n38_living_unpaid",
    "N38",
    "cyborg.livingUnpaidPm",
    "생활비 못 냈을 때 효율(‰)",
    "Efficiency when living costs are unpaid (‰)",
  ),
  // 정착 지원금(N39 출발값 없음 → 설정값 출발값, D-455 190)
  k(
    "n39_grant_base",
    "N39",
    "cyborg.grantBase",
    "정착 지원금 기본액(최소 단위)",
    "Settlement grant base (minor units)",
  ),
  k(
    "n39_grant_max",
    "N39",
    "cyborg.grantMaxPm",
    "정착 지원금 세력 배율 최대(‰)",
    "Settlement grant faction multiplier max (‰)",
  ),
  k(
    "n39_grant_min",
    "N39",
    "cyborg.grantMinPm",
    "정착 지원금 세력 배율 최소(‰)",
    "Settlement grant faction multiplier min (‰)",
  ),
  k(
    "n39_grant_step",
    "N39",
    "cyborg.grantStepPm",
    "정착 지원금 배율 걸음(시작 사이보그 1명당 ‰)",
    "Settlement grant multiplier step per cyborg (‰)",
  ),
  // 장비·인공장기 수리(F11 시설 Lv별 최대 내구도 감소 %, 하한 %, F12 파괴 문턱, D-5031)
  k(
    "f11_repair_lv1",
    "F11",
    "durability.repairLossPct.0",
    "수리 최대 내구도 감소 Lv1(%)",
    "Repair max durability loss Lv1 (%)",
  ),
  k(
    "f11_repair_lv2",
    "F11",
    "durability.repairLossPct.1",
    "수리 최대 내구도 감소 Lv2(%)",
    "Repair max durability loss Lv2 (%)",
  ),
  k(
    "f11_repair_lv3",
    "F11",
    "durability.repairLossPct.2",
    "수리 최대 내구도 감소 Lv3(%)",
    "Repair max durability loss Lv3 (%)",
  ),
  k(
    "f11_repair_lv4",
    "F11",
    "durability.repairLossPct.3",
    "수리 최대 내구도 감소 Lv4(%)",
    "Repair max durability loss Lv4 (%)",
  ),
  k(
    "f11_repair_lv5",
    "F11",
    "durability.repairLossPct.4",
    "수리 최대 내구도 감소 Lv5(%)",
    "Repair max durability loss Lv5 (%)",
  ),
  k(
    "f11_repair_floor",
    "F11",
    "durability.repairLossFloorPct",
    "수리 최대 내구도 감소 하한(%)",
    "Repair max durability loss floor (%)",
  ),
  k(
    "f12_destroy_at",
    "F12",
    "durability.destroyAtMax",
    "파괴 문턱(최대 내구도 이하)",
    "Destroyed at or below max durability",
  ),
];
