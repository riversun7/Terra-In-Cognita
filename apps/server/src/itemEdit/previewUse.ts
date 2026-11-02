// 아이템 미리 보기의 소모품 부분(설계안 3.7, 아이템 편집기 WP-6) — preview.ts가 부른다.
// 효과 줄마다 효과 사전 값(종류·대상 수치·값 방식·실효 지속·중첩·배타 묶음)과 기준 유닛으로 셈한 효과량 범위를 보낸다.
// 효과량(D-496 286, D-501 "적정 스탯"): 기준 값 × min(상한, 기준 유닛의 그 1차 스탯 ÷ 적정 스탯) × (1 ± 오차).
// 상한 = 무기 효율과 같은 설정 칸 N10(계수표 appropriateCapPm 실효 값), 오차 = 줄 값 또는 설정 칸 d496_use_variance(출발 500‰).
// 셈은 판정 쪽 @terra/sim useAmountRange 하나(BigInt 정수·내림). 실제로 먹고 쓰는 실행은 보유 물건(인스턴스) 뒤 소비 줄기다.
import type { EffectEntry, ItemEntry } from "@terra/content";
import type { ItemEditorPreviewResponse, ItemPreviewUnit, UseAmount } from "@terra/shared/itemEditor";
import { useAmountRange } from "@terra/sim";

type UseLine = NonNullable<ItemEntry["use"]>["effects"][number];

/** 효과량 셈에 드는 설정 칸 실효 값 */
export interface UseAmountSettings {
  /** 적정 비율 상한(‰, 설정 칸 N10) */
  readonly capPm: number;
  /** 줄에 오차가 없을 때의 ±오차(‰, 설정 칸 d496_use_variance) */
  readonly variancePm: number;
}

/** 효과 줄 하나의 효과량(기준 유닛 스탯 ÷ 적정 스탯, 상한, ±오차) */
export function useAmountOf(line: UseLine, unit: ItemPreviewUnit, settings: UseAmountSettings): UseAmount {
  const stat = line.scale?.stat ?? null;
  const statValue = stat === null ? 0 : unit.primaries[stat];
  const appropriate = line.scale?.appropriate ?? null;
  const variancePm = line.variancePm ?? settings.variancePm;
  const range = useAmountRange(
    line.value,
    appropriate === null ? null : { statValue, appropriate },
    settings.capPm,
    variancePm,
  );
  return {
    stat,
    statValue,
    appropriate,
    ratioPm: range.ratioPm,
    capPm: settings.capPm,
    scaled: range.scaled,
    variancePm,
    min: range.min,
    max: range.max,
  };
}

/** 소모품 미리 보기(효과 줄마다) */
export function previewUse(
  use: NonNullable<ItemEntry["use"]>,
  effects: readonly EffectEntry[],
  unit: ItemPreviewUnit,
  settings: UseAmountSettings,
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
        amount: useAmountOf(part, unit, settings),
        exclusive: effect?.exclusive ?? null,
      };
    }),
  };
}
