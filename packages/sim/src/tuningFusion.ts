// 사이보그 유닛 융합·유전자 조각 설정 칸 값 ↔ 계수표 — 기획 49 N46·N47, D-470·D-478·D-481·D-507,
// docs/adr/2026-11-07-cyborg-fusion-genes.md. 팩 항목 ID ↔ 세력·사회 계수표 fusion 칸(경로).
// 출발값 = 옛 CharacterRepository.craftCyborg(금화 5,000·티타늄 50·마이크로칩 20, 0.7·0.3, ×1.05~1.15)이고 값은
// society/fusion.ts OLD_FUSION_COEFFICIENTS다. 부품 스탯·유지비 배율·유전자 합성·인큐베이터(D-516)는 옛 값이 없어 [임시].
// 옛 환생 칸(n47_rebirth_divisor·n47_rebirth_min·n47_gene_points)과 사망 조각 수(n47_death_drop)는 D-516으로 지웠다(팩 id-changes).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path: `fusion.${path}`,
  structural: false,
  ko,
  en,
});

export const FUSION_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "n46_currency",
    "N46",
    "currency",
    "사이보그 융합 화폐(최소 단위)",
    "Cyborg fusion currency (minor units)",
  ),
  k("n46_titanium", "N46", "titaniumQty", "사이보그 융합 티타늄 괴 수", "Cyborg fusion titanium bars"),
  k("n46_microchip", "N46", "microchipQty", "사이보그 융합 마이크로칩 수", "Cyborg fusion microchips"),
  k(
    "n46_physical_donor",
    "N46",
    "physicalDonorPm",
    "융합 STR·DEX·AGI의 안드로이드(부품) 몫(‰)",
    "Fusion STR·DEX·AGI android (parts) share (‰)",
  ),
  k(
    "n46_mental_human",
    "N46",
    "mentalHumanPm",
    "융합 VIT·INT·WIS의 휴먼 몫(‰)",
    "Fusion VIT·INT·WIS human share (‰)",
  ),
  k("n46_bonus_min", "N46", "bonusMinPm", "융합 보너스 배율 최소(‰)", "Fusion bonus multiplier min (‰)"),
  k("n46_bonus_max", "N46", "bonusMaxPm", "융합 보너스 배율 최대(‰)", "Fusion bonus multiplier max (‰)"),
  k("n46_parts_stat", "N46", "partsStat", "융합 부품 쪽 1차 스탯", "Fusion parts-side primary stat"),
  k("n46_upkeep", "N46", "upkeepPm", "사이보그 유닛 유지비 배율(‰)", "Cyborg unit upkeep multiplier (‰)"),
  k(
    "n47_synth_up",
    "N47",
    "geneUpPm",
    "유전자 합성: 총합이 오를 확률(‰)",
    "Gene synthesis: total up chance (‰)",
  ),
  k(
    "n47_synth_down",
    "N47",
    "geneDownPm",
    "유전자 합성: 총합이 내릴 확률(‰)",
    "Gene synthesis: total down chance (‰)",
  ),
  k(
    "n47_synth_keep",
    "N47",
    "geneKeepPm",
    "유전자 합성: 총합이 그대로일 확률(‰)",
    "Gene synthesis: total unchanged chance (‰)",
  ),
  k(
    "n47_synth_step",
    "N47",
    "geneStepPm",
    "유전자 합성: 오르내리는 양(바탕 총합의 ‰)",
    "Gene synthesis: step (‰ of base total)",
  ),
  k("n47_total_max", "N47", "geneTotalMax", "스탯 유전자 총합 상한", "Stat gene total cap"),
  k(
    "n47_element_variance",
    "N47",
    "geneElementVariance",
    "유전자 합성: 속성값 오차(± 점)",
    "Gene synthesis: element variance (± points)",
  ),
  k(
    "n47_incubate_base",
    "N47",
    "incubateBaseStat",
    "인큐베이터 휴먼의 바탕 1차 스탯",
    "Incubator human base primary stat",
  ),
];
