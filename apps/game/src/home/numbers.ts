// 수 글자 — 기기 언어의 자리 나눔으로 쓴다(1284 → "1,284"). 처리할 일 수·묶은 줄 개수·복귀 요약 수가 쓴다.
import { getLocale } from "../paraglide/runtime.js";

/** 만들기 비싼 Intl 형식을 언어마다 하나씩 둔다 */
const formats = new Map<string, Intl.NumberFormat>();

export function formatCount(value: number): string {
  const locale = getLocale();
  let format = formats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale);
    formats.set(locale, format);
  }
  return format.format(value);
}
