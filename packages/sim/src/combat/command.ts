// 지휘관 정원(파티 수) — 기획 D-179("군단 크기는 지휘관 정원"), 49 C7, 48 §정원 틀("기본 + 지휘 스탯(INT·WIS 가중) 단계 + 작위 보너스"),
// 사용자 결정 1464(2026-11-15 "군단은 3개에서 20개정도로하고 지휘관 능력이나 스킬에 따라 결정되게"). 수는 모두 설정 칸 [임시](c7_command_*).
// 정원 = 아래 끝 ~ 위 끝 안으로 자른 (기본 + ⌊Σ 1차 × 가중치‰ ÷ 1000 ÷ 한 파티당 점수⌋ + 덤). 덤은 스킬·작위 몫 자리다(지금 0 — 질문 1543).
// 정수만 쓴다. 계수표에 command가 없으면(옛 계수표) 0 = 지휘하지 않음.
import type { CombatCoefficients } from "./coefficients.ts";

/** 지휘관 정원 식의 수(설정 칸 C7) */
export interface CommandCapCoefficients {
  /** 기본(파티 수) */
  readonly base: number;
  /** INT·WIS 가중치(‰) — 1차 스탯 차례 STR·DEX·AGI·VIT·INT·WIS의 5·6번째 */
  readonly intPm: number;
  readonly wisPm: number;
  /** 지휘 점수 몇 점마다 파티 하나 */
  readonly pointsPerParty: number;
  /** 아래 끝·위 끝(파티 수) */
  readonly min: number;
  readonly max: number;
}

/** 지휘관 정원(파티 수). bonus = 스킬·작위 덤(파티 수, 없으면 0) */
export function commandCapOf(
  primaries: readonly number[],
  c: Pick<CombatCoefficients, "command">,
  bonus = 0,
): number {
  const k = c.command;
  if (!k) return 0;
  const score = Math.floor(((primaries[4] ?? 0) * k.intPm + (primaries[5] ?? 0) * k.wisPm) / 1000);
  const steps = k.pointsPerParty > 0 ? Math.floor(Math.max(0, score) / k.pointsPerParty) : 0;
  return Math.min(k.max, Math.max(k.min, k.base + steps + bonus));
}
