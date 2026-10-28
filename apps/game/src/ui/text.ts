// 메시지 참조(MessageRef) → 지금 언어의 문장. 순수 코드가 돌려준 키를 화면에서 문장으로 바꿀 때 쓴다.
import { getLocale } from "../paraglide/runtime.js";
import { type MessageRef, formatWait } from "./messageRef.ts";
import { PLAIN_MESSAGES, WAIT_MESSAGES } from "./messageTable.ts";

export function text(ref: MessageRef): string {
  if ("waitSec" in ref) return WAIT_MESSAGES[ref.key]({ wait: formatWait(ref.waitSec, getLocale()) });
  return PLAIN_MESSAGES[ref.key]();
}
