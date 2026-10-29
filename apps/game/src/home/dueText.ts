// 마감 시각 글자 — 서버 시각(UTC ms)을 기기 시계로 옮겨 기기 시간대·언어로 쓴다("오후 8:30까지", "Due Fri 9:00 PM").
// 남은 시간("40분 뒤") 대신 시각을 쓴다: 화면을 켜 둔 채 시간이 지나도 글자가 틀리지 않아서 다시 그리는 타이머가 필요 없다(기술 해석).
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { type DueStyle, dueStyle } from "./homeView.ts";

const OPTIONS: { readonly [S in DueStyle]: Intl.DateTimeFormatOptions } = {
  time: { hour: "numeric", minute: "2-digit" },
  weekday: { weekday: "short", hour: "numeric", minute: "2-digit" },
  date: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  year: { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};

/** 만들기 비싼 Intl 형식을 언어·모양마다 하나씩 둔다 */
const formats = new Map<string, Intl.DateTimeFormat>();

function formatFor(locale: string, style: DueStyle): Intl.DateTimeFormat {
  const key = `${locale}|${style}`;
  let format = formats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(locale, OPTIONS[style]);
    formats.set(key, format);
  }
  return format;
}

/** 마감 글자. deadlineAt은 서버 시각(ms). 이미 지났으면 "… 마감 지남"(서버가 다시 만들기 전까지 남을 수 있다) */
export function dueText(deadlineAt: number): string {
  // 서버 시계 = 기기 시계 + 차이 → 기기 시각 = 서버 시각 − 차이
  const deadline = new Date(deadlineAt - serverLink.clockOffsetMs());
  const now = new Date();
  const time = formatFor(getLocale(), dueStyle(deadline, now)).format(deadline);
  return deadline.getTime() < now.getTime() ? m.home_item_overdue({ time }) : m.home_item_due({ time });
}

/** 마감이 이미 지났는지(기기 시계로) — 지난 마감은 위험색으로 보인다(글자로도 "마감 지남") */
export function isOverdue(deadlineAt: number): boolean {
  return deadlineAt - serverLink.clockOffsetMs() < Date.now();
}

/** 기계가 읽는 시각(<time dateTime>) */
export function dueIso(deadlineAt: number): string {
  return new Date(deadlineAt - serverLink.clockOffsetMs()).toISOString();
}
