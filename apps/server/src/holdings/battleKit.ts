// 전투에 가지고 들어가는 물건(287) — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, D-514·287 — 전투 중 물건 쓰기)".
// 보유 물건 서비스(service.ts)가 부르는 순수 함수: 물약 한 개의 회복 줄 → 판정 사양(sim BattlePotion)의 양, 전투 밖 주기 회복의 분당 양.
// 양은 쓰기(use)와 같은 효과량 식(@terra/sim useAmountRange — 굴림 가운데 값 × 신선도, D-501·D-512 320)이고 ‰ 회복은 최대 HP 기준이다.
// 전투 판정은 굴리지 않으므로 가운데 값을 넘긴다(자동 물약 고르기 pickAutoPotion과 같은 값).
import type { EffectEntry } from "@terra/content";
import { type BattlePotion, type Primaries, useAmountRange } from "@terra/sim";
import type { HeldDef } from "./serviceTypes.ts";
import type { HoldingRules } from "./rules.ts";

const MINUTE_MS = 60_000;

type UseLine = NonNullable<HeldDef["use"]>["effects"][number];

/** 한 줄의 효과량 가운데 값(쓰는 유닛 1차 스탯 비율·상한 N10·신선도) */
export function lineAmount(
  line: UseLine,
  primaries: Primaries,
  rules: HoldingRules,
  freshPm: number,
): number {
  const scale = line.scale
    ? { statValue: primaries[line.scale.stat], appropriate: line.scale.appropriate }
    : null;
  return useAmountRange(
    line.value,
    scale,
    rules.appropriateCapPm,
    line.variancePm ?? rules.useVariancePm,
    freshPm,
  ).scaled;
}

/** 물약 하나의 회복 줄: 한 번에 채우는 HP 합과 주기 회복 줄(효과 사전 heal, 주기 > 0). 회복 줄이 없으면 null */
export function potionOf(
  holding: { readonly id: number; readonly quantity: number },
  def: HeldDef,
  effectOf: (id: string) => EffectEntry | undefined,
  input: {
    readonly primaries: Primaries;
    readonly rules: HoldingRules;
    readonly freshPm: number;
    readonly maxHp: number;
  },
): BattlePotion | null {
  let instant = 0;
  const over: { effect: string; amount: number; tickMs: number; durationMs: number }[] = [];
  for (const line of def.use?.effects ?? []) {
    const effect = effectOf(line.effect);
    if (effect?.kind !== "heal") continue;
    const scaled = lineAmount(line, input.primaries, input.rules, input.freshPm);
    const amount = effect.valueMode === "permille" ? Math.floor((input.maxHp * scaled) / 1000) : scaled;
    if (amount <= 0) continue;
    if (effect.tickMs > 0) {
      const durationMs = line.durationMs ?? effect.durationMs;
      if (durationMs > 0) over.push({ effect: effect.id, amount, tickMs: effect.tickMs, durationMs });
    } else instant += amount;
  }
  if (instant <= 0 && over.length === 0) return null;
  return { id: holding.id, count: holding.quantity, instant, ...(over.length > 0 ? { over } : {}) };
}

/**
 * 전투 밖 주기 회복(D-514 346 "분 단위 틱"): 지속 동안의 합(틱 수 = ⌊지속 ÷ 주기⌋ × 양)을 분 경계마다 나눠 준다.
 * 분 수 = max(1, ⌈지속 ÷ 1분⌉), 분당 양 = ⌈합 ÷ 분 수⌉([임시] 해석 — 올림이라 합보다 분 수 − 1만큼까지 많을 수 있다)
 */
export function hotPerMinute(
  amount: number,
  tickMs: number,
  durationMs: number,
): { readonly perMinute: number; readonly minutes: number } {
  if (amount <= 0 || tickMs <= 0 || durationMs <= 0) return { perMinute: 0, minutes: 0 };
  const total = amount * Math.floor(durationMs / tickMs);
  const minutes = Math.max(1, Math.ceil(durationMs / MINUTE_MS));
  return { perMinute: Math.ceil(total / minutes), minutes };
}
