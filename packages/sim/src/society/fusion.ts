// 사이보그 유닛 융합(기획 D-470, 49 N46)과 유전자 조각(D-478·D-481, 49 N47) — docs/adr/2026-11-07-cyborg-fusion-genes.md
// 옛 규칙(D-507, AntiGravt01 main 0ea5299 읽기만):
// - 융합 = terra-server/repositories/CharacterRepository.js:512~ craftCyborg: 휴먼 + 안드로이드(둘 다 사라짐) + 금화 5,000·티타늄 50·
//   마이크로칩 20. STR·DEX·AGI = ⌊안드로이드 × 0.7 + 휴먼 × 0.3⌋, VIT·INT·WIS = ⌊휴먼 × 0.7 + 안드로이드 × 0.3⌋, 보너스 배율
//   1 + (5~15)/100을 칸마다 곱하고 반올림(Math.round). 새 사이보그는 레벨 1. 만드는 곳 = 고급 연구소·사이보그 공장
//   (terra-server/routes/building/building_production_routes.js:512~).
// - 유전자 = terra-server/game/LifeEngine.js:163~222 _processDeath(유닛이 죽으면 그 종의 조각 GENE_FRAG_{종} 1개가 소유자에게),
//   terra-server/routes/character/character_routes.js:930~1068 reincarnate(조각 max(1, ⌈레벨 ÷ 10⌉)개를 쓰고 조각 1개마다 무작위
//   스탯 +1, 레벨 1·수명 다시·환생 횟수 +1).
// 판정은 정수와 시드 굴림만 쓴다(AGENTS 4장). 배율은 ‰. 1차 스탯 배열 차례는 STR·DEX·AGI·VIT·INT·WIS(사이보그·구인 휴먼과 같다).
import type { Rng } from "@terra/shared";

/** 1차 스탯 수(배열 차례 STR·DEX·AGI·VIT·INT·WIS) */
export const FUSION_STAT_COUNT = 6;
/** 몸 쪽 스탯 자리(STR·DEX·AGI): 안드로이드(부품) 몫이 큰 칸 */
export const FUSION_PHYSICAL_STATS: readonly number[] = [0, 1, 2];

/** 융합·유전자 계수(팩 tuning 경로 "fusion.*", 49 N46·N47) */
export interface FusionCoefficients {
  /** 융합 화폐(옛 금화 5,000, 도시 화폐 최소 단위) */
  readonly currency: number;
  /** 융합 재료 수량(옛 티타늄 50·마이크로칩 20, 기본 단위 개) */
  readonly titaniumQty: number;
  readonly microchipQty: number;
  /** 몸 쪽 칸(STR·DEX·AGI)의 안드로이드(부품) 몫(‰, 옛 0.7). 휴먼 몫 = 1000 − 이 값 */
  readonly physicalDonorPm: number;
  /** 마음 쪽 칸(VIT·INT·WIS)의 휴먼 몫(‰, 옛 0.7). 안드로이드(부품) 몫 = 1000 − 이 값 */
  readonly mentalHumanPm: number;
  /** 융합 보너스 배율 범위(‰, 옛 1.05~1.15, 양 끝 포함 균등) */
  readonly bonusMinPm: number;
  readonly bonusMaxPm: number;
  /**
   * [임시] 안드로이드 대신 기계 부품으로 융합할 때 부품 쪽 1차 스탯(칸마다 같은 값). 서버에 안드로이드 유닛이 아직 없어 융합은 휴먼 + 부품이다
   * (D-470 기술 전달 "휴먼 + 부품"). 옛 안드로이드 기본 스탯이 출발값(옛 코드 기본 10)
   */
  readonly partsStat: number;
  /** [임시] 사이보그 유닛 유지비 배율(‰, 보통 유닛 = 1000). D-470 "유지비가 비싸다", 출발값 없음 */
  readonly upkeepPm: number;
  /** 환생에 쓰는 조각 수 = max(geneMin, ⌈레벨 ÷ geneLevelDivisor⌉)(옛 10·1) */
  readonly geneLevelDivisor: number;
  readonly geneMin: number;
  /** 조각 1개가 무작위 칸 하나에 더하는 1차 스탯(옛 +1) */
  readonly genePoints: number;
  /** 유닛이 죽을 때 그 종의 조각을 몇 개 주는가(옛 1) */
  readonly geneDeathDrop: number;
}

/** 옛 값(위 머리 주석의 옛 코드). [임시] 칸은 출발값이 없어 기술이 정한 값 */
export const OLD_FUSION_COEFFICIENTS: FusionCoefficients = {
  currency: 5000,
  titaniumQty: 50,
  microchipQty: 20,
  physicalDonorPm: 700,
  mentalHumanPm: 700,
  bonusMinPm: 1050,
  bonusMaxPm: 1150,
  partsStat: 10,
  upkeepPm: 3000,
  geneLevelDivisor: 10,
  geneMin: 1,
  genePoints: 1,
  geneDeathDrop: 1,
};

/** 배열을 1차 스탯 6칸으로 맞춘다(모자라면 0, 정수가 아니면 0, 음수면 0) */
export function sixStats(stats: readonly number[]): number[] {
  return Array.from({ length: FUSION_STAT_COUNT }, (_, index) => {
    const value = stats[index];
    return value !== undefined && Number.isInteger(value) && value > 0 ? value : 0;
  });
}

/** 부품 쪽 1차 스탯(안드로이드가 없을 때, 칸마다 partsStat) */
export function partsDonorStats(c: FusionCoefficients): number[] {
  return Array.from({ length: FUSION_STAT_COUNT }, () => Math.max(0, c.partsStat));
}

/** 보너스 배율 굴림(‰, [최소, 최대] 균등 — 옛 1% 걸음을 ‰ 걸음으로 넓힘). 최대 < 최소면 최소 */
export function fusionBonusPm(rng: Rng, c: FusionCoefficients): number {
  const span = c.bonusMaxPm - c.bonusMinPm;
  return span > 0 ? c.bonusMinPm + rng.nextInt(span + 1) : c.bonusMinPm;
}

/**
 * 융합 스탯(옛 craftCyborg): 칸마다 ⌊(큰 쪽 × 몫 + 작은 쪽 × (1000 − 몫)) ÷ 1000⌋ → × 보너스 ‰ 반올림(⌊(값 × ‰ + 500) ÷ 1000⌋).
 * 몸 쪽(STR·DEX·AGI)은 부품(안드로이드) 몫이 physicalDonorPm, 마음 쪽(VIT·INT·WIS)은 휴먼 몫이 mentalHumanPm
 */
export function fuseStats(
  human: readonly number[],
  donor: readonly number[],
  bonusPm: number,
  c: FusionCoefficients,
): number[] {
  const h = sixStats(human);
  const d = sixStats(donor);
  return h.map((humanValue, index) => {
    const donorValue = d[index] ?? 0;
    const physical = FUSION_PHYSICAL_STATS.includes(index);
    const donorPm = physical ? c.physicalDonorPm : 1000 - c.mentalHumanPm;
    const mixed = Math.floor((donorValue * donorPm + humanValue * (1000 - donorPm)) / 1000);
    return Math.floor((mixed * bonusPm + 500) / 1000);
  });
}

/** 융합 결과 범위(화면 미리 보기): 칸마다 보너스 최소·최대일 때 */
export function fuseStatRange(
  human: readonly number[],
  donor: readonly number[],
  c: FusionCoefficients,
): { readonly min: number[]; readonly max: number[] } {
  const high = Math.max(c.bonusMinPm, c.bonusMaxPm);
  return { min: fuseStats(human, donor, c.bonusMinPm, c), max: fuseStats(human, donor, high, c) };
}

/** 환생에 쓰는 유전자 조각 수(옛 reincarnate): max(최소, ⌈레벨 ÷ 나눗수⌉). 나눗수가 1보다 작으면 1로 본다 */
export function geneRebirthCost(level: number, c: FusionCoefficients): number {
  const divisor = Math.max(1, c.geneLevelDivisor);
  const safeLevel = Number.isInteger(level) && level > 0 ? level : 1;
  return Math.max(c.geneMin, Math.ceil(safeLevel / divisor));
}

/** 조각을 쓴 환생 보너스(옛 reincarnate): 조각 1개마다 무작위 칸 하나에 +genePoints. 더한 양(칸마다)과 새 스탯 */
export function geneRebirthBonus(
  stats: readonly number[],
  shards: number,
  rng: Rng,
  c: FusionCoefficients,
): { readonly stats: number[]; readonly bonus: number[] } {
  const bonus = Array.from({ length: FUSION_STAT_COUNT }, () => 0);
  for (let i = 0; i < shards; i++) {
    const index = rng.nextInt(FUSION_STAT_COUNT);
    bonus[index] = (bonus[index] ?? 0) + c.genePoints;
  }
  const base = sixStats(stats);
  return { stats: base.map((value, index) => value + (bonus[index] ?? 0)), bonus };
}

/** 유전자 조각 정의(팩 아이템의 gene 칸에서 읽은 것) */
export interface GeneItem {
  /** 아이템 ID(원장 자산 item:<ID>) */
  readonly item: string;
  readonly kind: "stat" | "skill";
  /** 그 종(팩 unit_kinds ID) */
  readonly species: string;
  /** 얻는 길(데이터: death = 사망, wave = 막아 낸 정원사 웨이브 보상 D-499) */
  readonly drops: readonly string[];
}

/** 그 종 유닛이 죽을 때 소유자가 받는 조각(아이템 ID 차례): 얻는 길에 death가 있는 켜진 조각 */
export function deathGeneDrops(genes: readonly GeneItem[], species: string): string[] {
  return genes
    .filter((gene) => gene.species === species && gene.drops.includes("death"))
    .map((gene) => gene.item)
    .toSorted();
}

/**
 * 정원사 도시 웨이브를 막아 낸 도시 주인이 받는 조각(아이템 ID 차례): 얻는 길에 wave가 있는 켜진 조각(D-499, 종은 데이터가 정한다 —
 * 지금 팩은 크리쳐 스탯 조각). 조각마다 수는 설정 칸 d499_reward_genes(@terra/sim waveReward)
 */
export function waveGeneDrops(genes: readonly GeneItem[]): string[] {
  return genes
    .filter((gene) => gene.drops.includes("wave"))
    .map((gene) => gene.item)
    .toSorted();
}

/** 그 종의 환생용 스탯 유전자(아이템 ID 차례로 첫째). 없으면 undefined */
export function rebirthGeneOf(genes: readonly GeneItem[], species: string): string | undefined {
  return genes
    .filter((gene) => gene.species === species && gene.kind === "stat")
    .map((gene) => gene.item)
    .toSorted()[0];
}

/** 유지비 무게(‰): 보통 유닛 1000, 사이보그 유닛 upkeepPm. 무게 합 × 유닛당 유지비 ÷ 1000이 그 주체의 유지비 */
export function upkeepWeightPm(normalUnits: number, cyborgUnits: number, c: FusionCoefficients): number {
  return normalUnits * 1000 + cyborgUnits * Math.max(0, c.upkeepPm);
}
