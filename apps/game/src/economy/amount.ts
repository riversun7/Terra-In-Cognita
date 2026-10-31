// 금액·수량 글자 — 최소 단위 정수(BigInt)만 다룬다(AGENTS 4장: 실수 계산 없음). 순수 함수(시험 대상).
// 서버는 10진 글자(DecimalString, @terra/shared/economy)로 보낸다. 입력칸 글은 자리 나눔(쉼표·빈칸·밑줄)을 빼고 읽는다.

/** 서버 10진 글자 → BigInt. 모양이 틀리면 0(서버 약속이 깨진 것. 화면이 멈추지 않게) */
export function toBig(value: string | null | undefined): bigint {
  if (value === null || value === undefined || !/^\d{1,30}$/.test(value)) return 0n;
  return BigInt(value);
}

/** 입력 글 읽기 결과 */
export type AmountInput =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | { readonly kind: "ok"; readonly value: bigint };

/** 자리 나눔으로 쓰는 글자(쉼표·빈칸·밑줄·아포스트로피) */
const SEPARATORS = /[\s,_']/g;

/** 입력칸 글 → 0 이상 정수. 소수점·음수·글자가 섞이면 invalid */
export function parseAmountInput(text: string): AmountInput {
  const bare = text.replace(SEPARATORS, "");
  if (bare === "") return { kind: "empty" };
  if (!/^\d{1,30}$/.test(bare)) return { kind: "invalid" };
  return { kind: "ok", value: BigInt(bare) };
}

/** 언어마다 하나씩 둔 수 형식(만들기 비싸다) */
const formats = new Map<string, Intl.NumberFormat>();

/** 자리 나눔 글(1250000 → "1,250,000") */
export function formatAmount(value: bigint | string, locale: string): string {
  let format = formats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale);
    formats.set(locale, format);
  }
  return format.format(typeof value === "string" ? toBig(value) : value);
}

/** 만분율 → 부호 있는 백분율 글(1234 → "+12.34%", −5 → "−0.05%", 0 → "0.00%"). 정수 계산만 쓴다 */
export function formatBp(bp: number): string {
  const whole = Math.trunc(bp);
  const sign = whole > 0 ? "+" : whole < 0 ? "−" : "";
  const abs = Math.abs(whole);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}%`;
}

/** 만분율 → 부호 없는 백분율 글(200 → "2.00%") */
export function formatRate(bp: number): string {
  const abs = Math.abs(Math.trunc(bp));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}%`;
}

/** 오르내림 방향(색·화살표). 같으면 flat */
export type Trend = "up" | "down" | "flat";

export function trendOf(bp: number | null): Trend {
  if (bp === null || bp === 0) return "flat";
  return bp > 0 ? "up" : "down";
}

/** 0 아래로 내려가지 않는 뺄셈 */
export function subFloor(a: bigint, b: bigint): bigint {
  return a > b ? a - b : 0n;
}
