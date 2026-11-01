// 정착 지원금 — 기획 D-455 190(지원금을 지금 준다), D-163·D-218(유저가 적은 세력일수록 많이), D-445 174(공식이 생기면 금액을 보이고
// 강하 때 한 번), 49 N39. docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (D-455)".
// - NPC 세력: 기본액(N39) × 세력 배율. 배율 ‰ = 최대 − 걸음 × (그 세력에서 시작한 사이보그 수 − 가장 적게 시작한 세력의 수), 최소에서
//   멈춘다(가장 덜 붐빈 세력이 최대). 기본액은 처음 며칠 생활비를 덮는 크기(설정값).
// - 유저 세력: 지도자·의회가 정한 양(D-455 덧붙임). 지금은 고리만 있다(유저 세력에 가입하는 길이 없다, 정하는 화면도 없다).
// - 내는 곳·한 번만 주기(사이보그마다 기록, 세력을 바꿔도 다시 주지 않음)는 부르는 쪽(서버)이 한다. 정수만 쓴다.
import type { SocietyCoefficients } from "./coefficients.ts";

/** 지원금을 정하는 세력: NPC = 그 세력에서 시작한 사이보그 수, 유저 = 지도자가 정한 양(없으면 null) */
export type GrantFaction =
  | { readonly kind: "npc"; readonly started: number }
  | { readonly kind: "user"; readonly leaderAmount: bigint | null };

/** 세력 배율(‰, N39) */
export function grantMultiplierPm(started: number, fewestStarted: number, c: SocietyCoefficients): number {
  const extra = Math.max(0, started - fewestStarted);
  return Math.max(c.cyborg.grantMinPm, c.cyborg.grantMaxPm - c.cyborg.grantStepPm * extra);
}

/** 강하 때 한 번 받는 정착 지원금(그 세력 화폐 최소 단위) */
export function settlementGrant(
  faction: GrantFaction,
  fewestStarted: number,
  c: SocietyCoefficients,
): bigint {
  if (faction.kind === "user")
    return faction.leaderAmount !== null && faction.leaderAmount > 0n ? faction.leaderAmount : 0n;
  const pm = grantMultiplierPm(faction.started, fewestStarted, c);
  return (BigInt(Math.max(0, c.cyborg.grantBase)) * BigInt(pm)) / 1000n;
}
