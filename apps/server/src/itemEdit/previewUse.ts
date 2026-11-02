// 아이템 미리 보기의 소모품 부분(설계안 3.7, 아이템 편집기 WP-6) — preview.ts가 부른다.
// 효과 줄마다 효과 사전 값(종류·대상 수치·값 방식·실효 지속·중첩·배타 묶음)과 기준 유닛으로 셈한 효과량 범위를 보낸다.
// 효과량(D-496 286, 식 모양은 질문 292로 확인 중 [임시]): 스탯 비례 = 기준 값 × (1000 + 그 1차 스탯 × ‰/점) ÷ 1000, ±오차 = 줄 값
// 또는 설정 칸 d496_use_variance(출발 250‰). 모두 BigInt 정수 셈·내림. 실제로 먹고 쓰는 실행은 보유 물건(인스턴스) 뒤 소비 줄기다.
import type { EffectEntry, ItemEntry } from "@terra/content";
import type { ItemEditorPreviewResponse, ItemPreviewUnit, UseAmount } from "@terra/shared/itemEditor";

type UseLine = NonNullable<ItemEntry["use"]>["effects"][number];

/** 내림 나눗셈(BigInt, 음수도 아래로) */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/** 효과 줄 하나의 효과량(기준 유닛 스탯 비례·±오차). 값은 안전한 정수 범위를 넘지 않는다(스키마 범위) */
export function useAmountOf(line: UseLine, unit: ItemPreviewUnit, defaultVariancePm: number): UseAmount {
  const stat = line.scale?.stat ?? null;
  const pmPerPoint = line.scale?.pmPerPoint ?? 0;
  const statValue = stat === null ? 0 : unit.primaries[stat];
  const scaled = floorDiv(BigInt(line.value) * BigInt(1000 + statValue * pmPerPoint), 1000n);
  const variancePm = line.variancePm ?? defaultVariancePm;
  const low = floorDiv(scaled * BigInt(1000 - variancePm), 1000n);
  const high = floorDiv(scaled * BigInt(1000 + variancePm), 1000n);
  return {
    stat,
    statValue,
    pmPerPoint,
    scaled: Number(scaled),
    variancePm,
    min: Number(low < high ? low : high),
    max: Number(low < high ? high : low),
  };
}

/** 소모품 미리 보기(효과 줄마다) */
export function previewUse(
  use: NonNullable<ItemEntry["use"]>,
  effects: readonly EffectEntry[],
  unit: ItemPreviewUnit,
  defaultVariancePm: number,
): NonNullable<ItemEditorPreviewResponse["use"]> {
  return {
    lines: use.effects.map((part) => {
      const effect = effects.find((known) => known.id === part.effect.id);
      return {
        effect: part.effect.id,
        kind: effect?.kind ?? null,
        stat: effect?.stat ?? null,
        valueMode: effect?.valueMode ?? null,
        value: part.value,
        chancePm: part.chancePm,
        durationMs: part.durationMs ?? effect?.durationMs ?? null,
        stacking: effect?.stacking ?? null,
        amount: useAmountOf(part, unit, defaultVariancePm),
        exclusive: effect?.exclusive ?? null,
      };
    }),
  };
}
