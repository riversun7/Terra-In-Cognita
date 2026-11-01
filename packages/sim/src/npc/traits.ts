// NPC 성향 4축 — docs/adr/2026-11-01-npc-brain-r5.md 2절, 기획 D-327(성향은 행성마다 무작위, 축 = 공격·상업·신앙·정거장 태도)
// 축마다 정수(질문 192 가: 0~1000). 처음 국가는 (세계 시드, 세력) 난수로 고르게, 새로 생긴 유동 세력은 부모 값 ± 폭.
// 정거장 태도는 아직 판단에 쓰지 않는다(정착 지원금 차등 D-218의 자리).
import type { Rng } from "@terra/shared";
import type { NpcCoefficients } from "./coefficients.ts";

export interface Traits {
  readonly aggression: number;
  readonly commerce: number;
  readonly faith: number;
  readonly station: number;
}

/** 축 차례(저장 배열·굴림 차례가 이것을 따른다) */
export const TRAIT_AXES = ["aggression", "commerce", "faith", "station"] as const;

const clamp = (value: number, c: NpcCoefficients): number =>
  Math.min(c.traitMax, Math.max(c.traitMin, value));

/** 처음 국가의 성향(축마다 범위 안 고르게, 굴림 넷) */
export function rollTraits(rng: Rng, c: NpcCoefficients): Traits {
  const span = c.traitMax - c.traitMin + 1;
  return {
    aggression: c.traitMin + rng.nextInt(span),
    commerce: c.traitMin + rng.nextInt(span),
    faith: c.traitMin + rng.nextInt(span),
    station: c.traitMin + rng.nextInt(span),
  };
}

/** 유동 세력(반란·독립·마을)의 성향: 축마다 부모 값 ± 폭 안에서 고르게, 범위에서 자른다(굴림 넷) */
export function inheritTraits(parent: Traits, rng: Rng, c: NpcCoefficients): Traits {
  const drift = (value: number): number => clamp(value - c.traitDrift + rng.nextInt(c.traitDrift * 2 + 1), c);
  return {
    aggression: drift(parent.aggression),
    commerce: drift(parent.commerce),
    faith: drift(parent.faith),
    station: drift(parent.station),
  };
}

/** 저장 배열(축 차례) ↔ 성향. 틀린 배열이면 undefined */
export function traitsToArray(traits: Traits): number[] {
  return TRAIT_AXES.map((axis) => traits[axis]);
}

export function traitsFromArray(values: readonly number[] | null | undefined): Traits | undefined {
  if (!values || values.length !== TRAIT_AXES.length || !values.every((v) => Number.isInteger(v)))
    return undefined;
  const [aggression = 0, commerce = 0, faith = 0, station = 0] = values;
  return { aggression, commerce, faith, station };
}
