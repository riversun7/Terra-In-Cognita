// 유전자 하나의 값(보유 물건 item_holdings.gene, jsonb) — 기획 D-478·D-516, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)".
// - 스탯 유전자: 총합·분포(1차 스탯 6칸 ‰, 합 1000)·속성 12칸(0~10). 스킬 유전자: 스킬 ID 하나(스킬마다 종류, 376 기술 기본안).
// - 둘 다 종(팩 unit_kinds ID — 377 나: 유닛 종류마다), 남긴 유닛 ID·그 레벨(수명이 다한 유닛, 합성·개발 시험이면 null), 합성 세대
//   (수명에서 나온 것 0, 합성하면 두 부모 가운데 큰 값 + 1)를 둔다. "나온 종은 기록한다"(377).
// DB에서 읽을 때 모양을 다시 본다: 틀린 값은 null(그 칸은 유전자 명령에 쓰이지 않는다).
import { FUSION_STAT_COUNT, GENE_DIST_TOTAL, GENE_ELEMENT_COUNT } from "@terra/sim";

interface GeneOrigin {
  readonly species: string;
  /** 남긴 유닛(수명이 다한 유닛). 합성·개발 시험이면 null */
  readonly from: number | null;
  /** 남긴 유닛의 레벨 */
  readonly level: number | null;
}

export interface StatGenePayload extends GeneOrigin {
  readonly kind: "stat";
  readonly total: number;
  readonly dist: readonly number[];
  readonly elements: readonly number[];
  /** 합성 세대(수명에서 나온 것 0) */
  readonly generation: number;
}

export interface SkillGenePayload extends GeneOrigin {
  readonly kind: "skill";
  readonly skill: string;
}

export type GenePayload = StatGenePayload | SkillGenePayload;

const ID = /^[a-z][a-z0-9_]{1,47}$/;
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const intOrNull = (value: unknown): number | null =>
  isInt(value, 0, Number.MAX_SAFE_INTEGER) ? value : null;
const ints = (value: unknown, length: number, max: number): number[] | null =>
  Array.isArray(value) && value.length === length && value.every((entry) => isInt(entry, 0, max))
    ? value.map(Number)
    : null;

/** DB jsonb → 유전자 값(모양이 틀리면 null) */
export function genePayloadOf(value: unknown): GenePayload | null {
  if (typeof value !== "object" || value === null) return null;
  const get = (key: string): unknown => Reflect.get(value, key);
  const species = get("species");
  if (typeof species !== "string" || !ID.test(species)) return null;
  const origin = { species, from: intOrNull(get("from")), level: intOrNull(get("level")) };
  const kind = get("kind");
  if (kind === "skill") {
    const skill = get("skill");
    return typeof skill === "string" && ID.test(skill) ? { kind, skill, ...origin } : null;
  }
  if (kind !== "stat") return null;
  const total = get("total");
  const dist = ints(get("dist"), FUSION_STAT_COUNT, GENE_DIST_TOTAL);
  const elements = ints(get("elements"), GENE_ELEMENT_COUNT, 10);
  const generation = get("generation");
  if (!isInt(total, 0, 1_000_000) || !dist || !elements) return null;
  return {
    kind,
    total,
    dist,
    elements,
    generation: isInt(generation, 0, 1_000_000) ? generation : 0,
    ...origin,
  };
}
