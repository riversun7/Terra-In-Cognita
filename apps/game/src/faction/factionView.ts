// 세력 화면 자료 다듬기 — 순수 함수(시험 대상). 판정은 하지 않는다: 띠·민심·잠금은 서버가 보낸 값을 그대로 쓰고,
// 여기서는 수 글자(천분율 → %, 최소 단위 정수 → 자리 나눔), 남은·지난 시간 단위, 탭 수, 표 색 갈래만 정한다.
// 문장은 factionText.ts(메시지 키)가 만든다. 이 파일은 메시지를 가져오지 않는다(시험이 생성 파일 없이 돈다).
import type {
  FactionOverviewResponse,
  FactionSection,
  OfficialState,
  RelationBand,
  UnrestLevel,
  VoteRow,
} from "@terra/shared/faction";

/** 탭(모바일 한 칸씩, 넓은 화면도 같다). 점령 처리는 지분 탭 안이다(46 §3·§5.1이 지분으로 이어진다) */
export const FACTION_TABS = ["cities", "diplomacy", "wars", "votes", "shares"] as const;
export type FactionTab = (typeof FACTION_TABS)[number];

/** 표 색 갈래(screenParts.css .state-chip[data-tone]) */
export type Tone = "good" | "warn" | "bad" | "plain";

export const UNREST_TONES = {
  calm: "good",
  slowdown: "warn",
  rebellion: "bad",
} as const satisfies Record<UnrestLevel, Tone>;

export const BAND_TONES = {
  hostile: "bad",
  wary: "warn",
  neutral: "plain",
  cordial: "good",
  friendly: "good",
  trusted: "good",
} as const satisfies Record<RelationBand, Tone>;

export const STATE_TONES = {
  alliance: "good",
  neutral: "plain",
  war: "bad",
} as const satisfies Record<OfficialState, Tone>;

/** 칸 상태: 준비 중(곧 열림) / 실제 자료 / 시안 자료 */
export function sectionKind<T>(section: FactionSection<T>): "soon" | "real" | "preview" {
  if (section.status !== "ready") return "soon";
  return section.preview === true ? "preview" : "real";
}

/** 칸의 자료(준비 중이면 null) */
export function sectionData<T>(section: FactionSection<T>): T | null {
  return section.status === "ready" ? section.data : null;
}

/** 탭 이름 옆 수: 도시 수, 외교 상대 수, 전쟁 수, 열린 투표 수, 점령 처리 수. 준비 중이면 null(수를 그리지 않는다) */
export function tabCount(view: FactionOverviewResponse, tab: FactionTab): number | null {
  switch (tab) {
    case "cities":
      return sectionData(view.cities)?.length ?? null;
    case "diplomacy":
      return sectionData(view.diplomacy)?.length ?? null;
    case "wars":
      return sectionData(view.wars)?.length ?? null;
    case "votes": {
      const regime = sectionData(view.regime);
      return regime === null ? null : regime.votes.filter((vote) => vote.result === null).length;
    }
    case "shares": {
      const occupations = sectionData(view.occupations);
      return occupations === null ? null : occupations.length;
    }
    default: {
      const unhandled: never = tab;
      return unhandled;
    }
  }
}

/** 천분율 → 백분율 글자(80 → "8%", 1005 → "100.5%"). 소수 한 자리까지 */
export function formatPermille(pm: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(pm / 1000);
}

/** 지분 수 → 비율(천분율, SHARES_PER_CITY = 1000이라 주 수가 곧 ‰) */
export function sharePermille(shares: number, total: number): number {
  return total <= 0 ? 0 : Math.round((shares * 1000) / total);
}

/** 투표 막대: 찬성·반대·정족수(‰), 참여가 정족수를 채웠는지 */
export function voteBar(vote: VoteRow): {
  readonly yesPm: number;
  readonly noPm: number;
  readonly quorumPm: number;
  readonly quorumMet: boolean;
} {
  const yesPm = clampPm(vote.yesPm);
  const noPm = Math.min(clampPm(vote.noPm), 1000 - yesPm);
  const quorumPm = clampPm(vote.quorumPm);
  return { yesPm, noPm, quorumPm, quorumMet: yesPm + noPm >= quorumPm };
}

function clampPm(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

/** 막대 칸 너비(CSS 인라인 inline-size 값, % 글자) */
export const barWidth = (pm: number): string => `${clampPm(pm) / 10}%`;
