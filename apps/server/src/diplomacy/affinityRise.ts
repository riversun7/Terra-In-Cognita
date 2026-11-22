// 호감이 오르는 길(줄기 npc-diplo — 질문 2662 "호감·신뢰가 오르는 길", 기획 D-255 예 "조약을 맺으면 호감·신뢰가 오른다", 우호도 848 "시간에 따라 회복"과 같은 꼴).
// 기술 출발값 [임시] — 모양은 질문 2722. docs/adr/2026-11-21-diplomacy-treaties.md "바뀜 (npc-diplo)".
// - 하루(UTC 0시)마다: 지킨 불가침·동맹·보호 조약이 있는 쌍은 dip_treaty_kept_affinity만큼 오르고, 나머지 쌍은 dip_affinity_drift_per_day만큼 0 쪽으로 돌아온다(0을 넘지 않음).
//   하루 걸음은 외교 틱이 날이 바뀐 것을 볼 때 한 번. 켤 때 마지막 걸음 날 = 표 diplomacy_affinity의 가장 최근 updated_at_ms의 날(걸음·사건이 바꾼 줄은 그 시각을 쓴다).
//   끈 동안 밀린 날은 DAILY_CATCHUP_MAX날까지 따라잡고, 조약 몫은 그 조약을 맺은 뒤 날만 센다.
// - 강화(살아 있는 두 나라의 전쟁이 끝남 — 강화 조약·의결 강화·NPC 강화·백지 강화 모두): dip_peace_affinity. 외교 틱마다 전쟁 쌍을 보고 지난 틱과 견준다(켠 뒤 첫 틱은 기준만).
// - 참전 요청 수락(D-291 — 사람·NPC): 들어간 나라와 요청한 나라 dip_join_accept_affinity(service.ts).
// - 신뢰는 따로 오르지 않는다: 위반 기록이 dip_breach_expire_ms(90일) 뒤 잊히면 그만큼 돌아온다(fixes-d592 — breaches.ts breachLive).
// 정수 연산만 쓴다.

export const DAY_MS = 86_400_000;

/** 끈 동안 밀린 하루 걸음을 몇 날까지 따라잡나 */
export const DAILY_CATCHUP_MAX = 7;

/** UTC 날 번호 */
export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);

/** 0 쪽으로 amount만큼(0을 넘지 않음) */
export function driftToward0(score: number, amount: number): number {
  const step = Math.max(0, Math.trunc(amount));
  if (score > 0) return Math.max(0, score - step);
  if (score < 0) return Math.min(0, score + step);
  return 0;
}

/** 마지막 걸음 날 → 오늘 걸을 날 수(따라잡기 상한 안) */
export const daysToStep = (lastDay: number, today: number): number =>
  Math.max(0, Math.min(DAILY_CATCHUP_MAX, today - lastDay));

/** 걸을 날 가운데 조약을 지킨 날 수(조약을 맺은 날 다음부터 센다) */
export const keptDays = (steps: number, activatedAtMs: number, nowMs: number): number =>
  Math.max(0, Math.min(steps, dayOf(nowMs) - dayOf(activatedAtMs)));

/**
 * 쌍 하나의 하루 걸음들: 조약을 맺기 전 날(앞쪽)마다 0 쪽으로 drift, 지킨 날(뒤쪽 — 맺은 뒤)마다 + kept. 결과 호감(범위는 부르는 쪽이 자른다)
 */
export function stepAffinity(
  score: number,
  steps: number,
  kept: number,
  rules: { readonly affinityDriftPerDay: number; readonly treatyKeptAffinity: number },
): number {
  const keptN = Math.max(0, Math.min(steps, kept));
  const drifted = driftToward0(score, (steps - keptN) * Math.max(0, Math.trunc(rules.affinityDriftPerDay)));
  return drifted + keptN * Math.max(0, Math.trunc(rules.treatyKeptAffinity));
}

/** 전쟁 쌍 지켜보기: 지난 틱에 전쟁이었고 지금은 아닌 쌍(켠 뒤 첫 번은 기준만 — 빈 목록) */
export function createPeaceWatch(): {
  observe(pairs: Iterable<readonly [number, number]>): (readonly [number, number])[];
} {
  let before: Map<string, readonly [number, number]> | undefined;
  return {
    observe(pairs) {
      const now = new Map<string, readonly [number, number]>();
      for (const [a, b] of pairs) {
        if (a === b) continue;
        const pair: readonly [number, number] = a < b ? [a, b] : [b, a];
        now.set(`${pair[0]}:${pair[1]}`, pair);
      }
      const ended = before ? [...before].filter(([key]) => !now.has(key)).map(([, pair]) => pair) : [];
      before = now;
      return ended;
    },
  };
}
