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
];
