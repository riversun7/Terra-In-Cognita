// NPC 판단 설정 칸 값 ↔ 계수표 — docs/adr/2026-11-01-npc-brain-r5.md, 질문 192~198(docs/questions/2026-11-01-r5.md)
// 팩 항목 ID ↔ 세력·사회 계수표 npc 칸(경로). 49에 출발값이 없는 칸(S3·S5·S19)과 칸이 없는 판단 계수는 기술 출발값(D-5032)이고
// 값은 계수표 TEST_NPC_COEFFICIENTS다. 판단 점수 계수 전부가 아니라 개발자 패널에서 자주 만질 것만 둔다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path: `npc.${path}`,
  structural: false,
  ko,
  en,
});

export const NPC_TUNING_KEYS: readonly TuningKey[] = [
  k("s19_trait_min", "S19", "traitMin", "NPC 성향 축 최소", "NPC trait axis min"),
  k("s19_trait_max", "S19", "traitMax", "NPC 성향 축 최대", "NPC trait axis max"),
  k("s19_trait_drift", "S19", "traitDrift", "유동 세력 성향 물려받기 폭", "Fluid faction trait drift"),
  k("d323_decide_every", "", "decideEveryMs", "NPC 판단 간격(ms)", "NPC decision interval (ms)"),
  k("s3_war_cost", "S3", "warCostBp", "무명분 선포 비용(국고 만분율)", "No-cause war cost (treasury bp)"),
  k("s5_white_peace", "S5", "whitePeaceMs", "백지 강화 기간(ms)", "White peace after no fighting (ms)"),
  k("d292_truce", "", "truceMs", "강화 조약 불가침 기간(ms)", "Peace treaty non-aggression (ms)"),
  k("d323_tax_step", "", "taxStepBp", "NPC 세율 한 번 바꾸는 폭(만분율)", "NPC tax step (bp)"),
  k("d323_tax_max", "", "taxMaxBp", "NPC 세율 규칙식 상한(만분율)", "NPC tax rule cap (bp)"),
  k(
    "d323_tax_floor",
    "",
    "taxSatisfactionFloor",
    "NPC가 세율을 올리지 않는 만족도 하한",
    "NPC tax raise satisfaction floor",
  ),
  k("npc_attack_ratio", "", "attackRatioPm", "NPC 공격 힘 비(‰)", "NPC attack strength ratio (‰)"),
  k(
    "npc_attack_satisfaction",
    "",
    "attackMinSatisfaction",
    "NPC가 새 전쟁을 벌이는 만족도 하한",
    "NPC new war satisfaction floor",
  ),
  k("d220_stall_days", "", "stallDays", "굶어 멈춤으로 세는 날 수", "Days counted as stalled"),
  k(
    "npc_recruit_target",
    "",
    "recruitTargetPm",
    "NPC 구인 목표(주거 ‰, D-469)",
    "NPC recruit target (‰ of housing, D-469)",
  ),
  k(
    "npc_recruit_reserve",
    "",
    "recruitReservePm",
    "NPC 구인 예비금(카드 값 ‰)",
    "NPC recruit reserve (‰ of card cost)",
  ),
  k(
    "d530_city_bid_pct",
    "",
    "cityBidPct",
    "NPC 도시 매입 호가(지난 값의 %)",
    "NPC city standing bid (% of last price)",
  ),
];
