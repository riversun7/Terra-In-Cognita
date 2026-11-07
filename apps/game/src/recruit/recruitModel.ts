// 구인 카드 화면의 순수 셈 — 고용 단추 상태, 스탯 묶음(D-448 STR·VIT / INT·WIS / DEX·AGI), 속성 칸, 다음 갱신까지 남은 시간.
// 화면(경제 구인 칸 economy/RecruitPanel.tsx·개발자 구인 화면 RecruitLabScreen.tsx)이 쓰고 시험(recruitModel.test.ts)이 본다.
// 문구는 고르지 않고 키·값만 돌려준다.
import type { PrimaryStat } from "@terra/shared/roster";
import { RECRUIT_ELEMENTS, type RecruitCardView, type RecruitElement } from "@terra/shared/recruit";

/** 스탯 묶음(사이보그 화면과 같은 짝, D-448) */
export const RECRUIT_STAT_PAIRS: readonly (readonly [PrimaryStat, PrimaryStat])[] = [
  ["str", "vit"],
  ["int", "wis"],
  ["dex", "agi"],
];

/** 고용 단추 상태: 살 수 있음 / 이미 삼 / 사이보그 없음 / 돈 모자람 */
export type HireState = "ready" | "taken" | "no_cyborg" | "funds";

export function hireState(card: RecruitCardView, balance: string, hasCyborg: boolean): HireState {
  if (card.taken) return "taken";
  if (!hasCyborg) return "no_cyborg";
  return BigInt(balance) < BigInt(card.cost) ? "funds" : "ready";
}

/** 점수가 있는 속성(4원소 차례) */
export function activeElements(card: RecruitCardView): { element: RecruitElement; value: number }[] {
  return RECRUIT_ELEMENTS.filter((element) => card.elements[element] > 0).map((element) => ({
    element,
    value: card.elements[element],
  }));
}

/** 다음 갱신까지 남은 시간(시·분, 지났으면 0) */
export function refreshLeft(endsAtMs: number, nowMs: number): { hours: number; minutes: number } {
  const left = Math.max(0, endsAtMs - nowMs);
  const minutes = Math.ceil(left / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** 스탯 막대 폭(그 카드 가장 큰 스탯 = 100%) */
export function statShare(card: RecruitCardView, stat: PrimaryStat): number {
  const max = Math.max(1, ...Object.values(card.stats));
  return Math.round((card.stats[stat] * 100) / max);
}
