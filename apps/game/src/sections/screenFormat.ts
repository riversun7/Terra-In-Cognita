// 화면 공용 수·시간 글자 — 순수 함수(시험 대상). 최소 단위 정수 금액의 자리 나눔, 남은·지난 시간의 단위(내림).
// 문장(뒤·전·남음)은 screenText.ts가 메시지 키로 만든다. 이 파일은 메시지를 가져오지 않는다.

/** 최소 단위 정수 글자 → 자리 나눔(BigInt로, 아주 큰 수도 잃지 않는다). 정수 글자가 아니면 그대로 */
export function formatAmount(amount: string, locale: string): string {
  if (!/^-?\d+$/.test(amount)) return amount;
  return new Intl.NumberFormat(locale).format(BigInt(amount));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 시간 길이 → 단위와 수(내림: 늘려 말하지 않는다). 1분 미만은 under_minute */
export type Span =
  | { readonly unit: "under_minute" }
  | { readonly unit: "minute" | "hour" | "day"; readonly value: number };

/** 48시간까지는 시간, 그 뒤는 날(처리함 마감 문구와 같은 경계) */
export function spanOf(ms: number): Span {
  const length = Math.abs(ms);
  if (length < MINUTE) return { unit: "under_minute" };
  if (length < HOUR) return { unit: "minute", value: Math.floor(length / MINUTE) };
  if (length < 48 * HOUR) return { unit: "hour", value: Math.floor(length / HOUR) };
  return { unit: "day", value: Math.floor(length / DAY) };
}

/** 길이 글자(Intl 단위: "20시간", "20 hours", "3 days"). under_minute은 null(문구 키로 쓴다) */
export function formatSpan(span: Span, locale: string): string | null {
  if (span.unit === "under_minute") return null;
  return new Intl.NumberFormat(locale, { style: "unit", unit: span.unit, unitDisplay: "long" }).format(
    span.value,
  );
}
