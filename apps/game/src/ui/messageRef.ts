// 화면 문구 참조 — 순수 코드(시험 대상)는 문장 대신 메시지 키를 돌려주고, 화면(text.ts)이 문장으로 바꾼다.
// 키 목록은 messageTable.ts의 표에서 뽑는다(표에 없는 키를 쓰면 타입 검사가 실패한다).
// 타입만 가져오므로 시험은 생성 파일(src/paraglide/) 없이도 돈다.
import type { PLAIN_MESSAGES, WAIT_MESSAGES } from "./messageTable.ts";

/** 변수가 없는 메시지 키 */
export type PlainMessageKey = keyof typeof PLAIN_MESSAGES;

/** 기다릴 시간({wait})을 넣는 메시지 키 — 시도 제한(429) */
export type WaitMessageKey = keyof typeof WAIT_MESSAGES;

export type MessageRef = { key: PlainMessageKey } | { key: WaitMessageKey; waitSec: number };

/**
 * 기다릴 시간을 사람이 읽는 길이로: 1분 미만은 초, 1시간 미만은 분, 그 이상은 시간(올림).
 * 단위 이름은 Intl이 언어에 맞게 붙인다("30초", "2 minutes").
 */
export function formatWait(seconds: number, locale: string): string {
  const total = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 1;
  const [value, unit] =
    total < 60
      ? [total, "second"]
      : total < 3_600
        ? [Math.ceil(total / 60), "minute"]
        : [Math.ceil(total / 3_600), "hour"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
}
