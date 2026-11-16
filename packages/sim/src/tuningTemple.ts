// 신전·종교 설정 칸 값 ↔ 계수표 — 기획 D-517·D-311·D-441·D-444 165·D-451·49 S15, docs/adr/2026-11-07-temple-religion.md.
// 팩 항목 ID ↔ 세력·사회 계수표 temple 칸(경로). 출발값은 society/temple.ts OLD_TEMPLE_COEFFICIENTS(기도·헌금은 옛 religion_routes.js,
// 나머지는 [임시]). 49에 칸이 있는 것은 S15(수호신 도시당 상한)뿐이라 다른 칸은 코드 없이 결정 번호를 앞머리로 쓴다(d395_rebirth와 같은 꼴).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path: `temple.${path}`,
  structural: false,
  ko,
  en,
});

export const TEMPLE_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "d517_inactive_cap_ms",
    "",
    "inactiveCapMs",
    "비활성 기다림 상한(수명 끝 → 떠남, ms, 0 = 상한 없음)",
    "Inactive wait cap (end of life → leaves, ms, 0 = none)",
  ),
  k(
    "d311_rebirth_faith",
    "",
    "rebirthFaith",
    "휴먼 환생 신앙도 문턱(환생하면 0)",
    "Human rebirth faith threshold (reset to 0)",
  ),
  k(
    "d311_rebirth_currency",
    "",
    "rebirthCurrency",
    "휴먼 환생 화폐(최소 단위)",
    "Human rebirth currency cost (minor units)",
  ),
  k("d311_deify_faith", "", "deifyFaith", "신격화 신앙도 문턱", "Deification faith threshold"),
  k(
    "d311_deify_currency",
    "",
    "deifyCurrency",
    "신격화 화폐(최소 단위)",
    "Deification currency cost (minor units)",
  ),
  k("s15_guardian_cap", "S15", "guardianCap", "수호신 도시당 상한", "Guardian spirits per city"),
  k("d444_pray_faith", "", "prayFaith", "기도 한 번 신앙도", "Faith per prayer"),
  k("d444_pray_cooldown_ms", "", "prayCooldownMs", "기도 쿨다운(ms)", "Prayer cooldown (ms)"),
  k(
    "d444_offering_per_faith",
    "",
    "offeringPerFaith",
    "헌금: 신앙도 1당 화폐(최소 단위)",
    "Offering: currency per faith point (minor units)",
  ),
  k(
    "d311_guardian_defense_pm",
    "",
    "guardianDefensePm",
    "수호신 방어 버프: 그 도시 수비 유닛 방어율(‰, 수호신마다)",
    "Guardian defense buff: city defenders' defense rate (‰ per guardian)",
  ),
  k(
    "d311_guardian_satisfaction_milli",
    "",
    "guardianSatisfactionMilli",
    "수호신 만족도 버프: 그 도시 휴먼 만족도 하루 +(밀리점, 수호신마다)",
    "Guardian morale buff: city humans' satisfaction per day (milli-points per guardian)",
  ),
  k(
    "d311_guardian_production_pm",
    "",
    "guardianProductionPm",
    "수호신 생산 버프: 그 도시 시설 산출 +(‰, 수호신마다)",
    "Guardian production buff: city facility output (‰ per guardian)",
  ),
  // 휴먼 환생 어드밴티지(D-520 "어드벤티지를 준다. 초기스탯이나 k값 증가이나 확률로.") [임시]
  k(
    "d520_rebirth_stat_chance_bp",
    "",
    "rebirthStatChanceBp",
    "휴먼 환생: 초기 스탯 증가 확률(만분율)",
    "Human rebirth: initial stat boost chance (bp)",
  ),
  k(
    "d520_rebirth_k_chance_bp",
    "",
    "rebirthKChanceBp",
    "휴먼 환생: K 증가 확률(만분율)",
    "Human rebirth: K boost chance (bp)",
  ),
  k(
    "d520_rebirth_stat_amount",
    "",
    "rebirthStatAmount",
    "휴먼 환생: 초기 스탯 증가량(스탯 하나)",
    "Human rebirth: initial stat boost (one stat)",
  ),
  k(
    "d520_rebirth_k_amount_pm",
    "",
    "rebirthKAmountPm",
    "휴먼 환생: K 증가량(‰, 스탯 하나)",
    "Human rebirth: K boost (‰, one stat)",
  ),
  k(
    "d571_temple_blessing_pm",
    "",
    "blessingMovePm",
    "신전 축복: 기도하면 걸리는 이동 속도(‰, 0 = 없음)",
    "Temple blessing: move speed on prayer (‰, 0 = none)",
  ),
  k(
    "d571_temple_blessing_ms",
    "",
    "blessingMs",
    "신전 축복: 지속 시간(ms)",
    "Temple blessing: duration (ms)",
  ),
];
