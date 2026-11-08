// 국적 바꾸기(귀화) 조건 받기·글 — 질문 745 나·D-526(받는 나라가 지원금 또는 입회비, 옛 나라 반환 없음, 옛 나라 우호도 하락),
// docs/adr/2026-11-08-citizenship.md. tRPC world.naturalization(읽기만, 서버 src/citizenship/service.ts). 신청은 naturalizeCommands.ts가
// WebSocket nationality_change로 보낸다.
// 엔진·React를 가져오지 않는다(시험 대상, naturalizeData.test.ts).
import type {
  NaturalizationBlock,
  NaturalizationResponse,
  NaturalizationTerms,
} from "@terra/shared/citizenship";
import { relationBand } from "@terra/shared/faction";
import { formatDuration } from "../economy/economyText.ts";
import { BAND_NAMES } from "../faction/factionText.ts";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";
import { formatAmount, formatSigned, remaining } from "../roster/rosterText.ts";
import type { NaturalizeOutcome } from "./naturalizeCommands.ts";
import { nationTitle } from "./governmentData.ts";

/** 조건 응답을 기다리는 상한(ms) */
const REQUEST_TIMEOUT_MS = 10_000;

/** 그 행정 건물에서 귀화하는 조건 */
export function loadNaturalization(
  buildingId: number,
  signal?: AbortSignal,
): Promise<NaturalizationResponse> {
  return api.world.naturalization.query(
    { buildingId },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

/** 신청을 막는 까닭 한 줄(쉬는 날이면 남은 시간) */
export function blockText(
  terms: NaturalizationTerms,
  nowMs: number,
  locale: Locale = getLocale(),
): string | null {
  const blocked: NaturalizationBlock | null = terms.blocked;
  switch (blocked) {
    case null:
      return null;
    case "same_nation":
      return m.naturalize_block_same({}, { locale });
    case "not_joinable":
      return m.naturalize_block_not_joinable({}, { locale });
    case "captive":
      return m.naturalize_block_captive({}, { locale });
    case "wrong_city":
      return m.naturalize_block_wrong_city({}, { locale });
    case "resting":
      return m.naturalize_block_resting(
        {
          time:
            terms.restUntilMs === null
              ? m.roster_soon({}, { locale })
              : (remaining(terms.restUntilMs, nowMs, locale) ?? m.roster_soon({}, { locale })),
        },
        { locale },
      );
    case "insufficient_funds":
      return m.naturalize_block_funds(
        { total: formatAmount(terms.fee, locale), balance: formatAmount(terms.balance, locale) },
        { locale },
      );
    default: {
      const unknown: never = blocked;
      return unknown;
    }
  }
}

/** 우호도 글: "−20(경고)" — 수(부호) + 호감 띠 이름(46 §4.1 눈금) */
export function standingText(score: number, locale: Locale = getLocale()): string {
  return m.naturalize_standing_one(
    { score: formatSigned(score, locale), band: BAND_NAMES[relationBand(score)]({}, { locale }) },
    { locale },
  );
}

/** 주고받는 값 방향: 낸다(입회비) · 받는다(지원금) · 없음 */
export type NaturalizeFlow = "pay" | "receive" | "none";

export function flowOf(terms: Pick<NaturalizationTerms, "fee" | "grant">): NaturalizeFlow {
  if (terms.fee !== "0") return "pay";
  return terms.grant === "0" ? "none" : "receive";
}

/** 값·우호도 줄(입회비 또는 지원금·주고받는 값·옛 나라와 받는 나라 우호도·쉬는 기간·나라 이름) */
export function costLines(terms: NaturalizationTerms, locale: Locale = getLocale()) {
  const flow = flowOf(terms);
  const fee = formatAmount(terms.fee, locale);
  const grant = formatAmount(terms.grant, locale);
  const balance = formatAmount(terms.balance, locale);
  const amount = flow === "receive" ? grant : fee;
  const standing = terms.standing;
  return {
    flow,
    amount,
    terms:
      flow === "pay"
        ? m.naturalize_terms_fee({ amount: fee }, { locale })
        : flow === "receive"
          ? m.naturalize_terms_grant({ amount: grant }, { locale })
          : m.naturalize_terms_none({}, { locale }),
    net:
      flow === "pay"
        ? m.naturalize_net_pay({ amount: fee, balance }, { locale })
        : flow === "receive"
          ? m.naturalize_net_receive({ amount: grant, balance }, { locale })
          : m.naturalize_net_none({ balance }, { locale }),
    standing: m.naturalize_standing(
      {
        now: formatSigned(standing.now, locale),
        nowBand: BAND_NAMES[relationBand(standing.now)]({}, { locale }),
        after: formatSigned(standing.after, locale),
        afterBand: BAND_NAMES[relationBand(standing.after)]({}, { locale }),
      },
      { locale },
    ),
    targetStanding: standingText(terms.targetStanding, locale),
    rest: formatDuration(terms.restMs),
    target: nationTitle(terms.target, locale),
    current: nationTitle(terms.current, locale),
  };
}

/** 확인 줄 글(받는 나라·낼 값 또는 받을 값) */
export function confirmText(lines: ReturnType<typeof costLines>, locale: Locale = getLocale()): string {
  if (lines.flow === "pay")
    return m.naturalize_confirm_pay({ nation: lines.target, amount: lines.amount }, { locale });
  if (lines.flow === "receive")
    return m.naturalize_confirm_receive({ nation: lines.target, amount: lines.amount }, { locale });
  return m.naturalize_confirm_free({ nation: lines.target }, { locale });
}

type FailCode = Extract<NaturalizeOutcome, { ok: false }>["code"];

/** 실패 결과 문구(서버 결과 코드 + 연결) */
export const NATURALIZE_RESULT_TEXT: Readonly<Record<FailCode, () => string>> = {
  sign_in_required: m.naturalize_err_sign_in,
  busy: m.naturalize_err_busy,
  rate_limited: m.naturalize_err_rate_limited,
  internal_error: m.naturalize_err_internal,
  no_cyborg: m.naturalize_err_no_cyborg,
  not_government: m.naturalize_err_not_government,
  same_nation: m.naturalize_block_same,
  not_joinable: m.naturalize_block_not_joinable,
  wrong_city: m.naturalize_block_wrong_city,
  captive: m.naturalize_block_captive,
  resting: m.naturalize_err_resting,
  terms_changed: m.naturalize_err_terms_changed,
  insufficient_funds: m.naturalize_err_funds,
  offline: m.naturalize_err_offline,
  timeout: m.naturalize_err_timeout,
};
