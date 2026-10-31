// 화면 공용 문구 — 금액·남은 시간·지난 시간·날짜를 지금 언어의 글로(세력·우편 화면). 시간 기준은 응답을 만든 서버 시각이다.
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { type Span, formatAmount, formatSpan, spanOf } from "./screenFormat.ts";

/** 금액(지금 언어의 자리 나눔) */
export const amountText = (amount: string): string => formatAmount(amount, getLocale());

/** 길이 글자: "20시간", "under a minute" */
function spanText(span: Span): string {
  return formatSpan(span, getLocale()) ?? m.screen_time_under_minute();
}

/** target까지(미래면 "20시간 뒤", 과거면 "3일 전"). 기준은 응답을 만든 서버 시각 */
export function relativeText(target: number, now: number): string {
  const diff = target - now;
  const span = spanOf(diff);
  if (diff < 0 && span.unit === "under_minute") return m.screen_time_just_now();
  const time = spanText(span);
  return diff >= 0 ? m.screen_time_in({ time }) : m.screen_time_ago({ time });
}

/** 남은 길이만("9일") — "{time} 남음"에 넣는다 */
export function leftText(target: number, now: number): string {
  return spanText(spanOf(Math.max(0, target - now)));
}

/** 절대 시각(툴팁·datetime 보조) */
export function dateText(at: number): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(at);
}
