// 바로 처리 버튼(D-6015) — 동작 ID → 버튼 이름, 줄에 그릴 버튼(ADR 2026-10-29-app-shell 7절 "바로 처리").
// 바로 처리는 게임 상태를 바꾸므로 WebSocket으로만 보낸다(공용 메시지 inbox_action { id, itemId, action }).
// 그 메시지는 첫 실제 동작을 넣을 때 ADR과 함께 만든다(PROTOCOL_VERSION). 그래서 지금은:
// - 시안 자료 항목(preview): 버튼을 그리고, 누르면 명령을 보내지 않는다. 목록(InboxList.tsx)이 누른 줄 안에
//   "시험 자료라서 명령을 보내지 않았습니다"를 보이고 읽어 준다.
// - 실제 항목: 보낼 길이 없어 버튼을 그리지 않는다. 줄을 눌러 그 화면에서 처리한다. inbox_action을 만들 때 여기를 바꾼다
//   (결과를 받으면 처리할 일을 다시 받는다: store.ts refreshInbox).
//   바뀜 (기획 대조 2163): 그 시스템의 기존 명령으로 처리할 수 있는 종류는 실제 항목에도 버튼을 그린다(LIVE_ACTION_KINDS) — labor_paused의 [기다림]
//   (labor_wait — 계정에 저장해 모든 기기에서 접힘, 기획 대조 2237)·[해지](labor_terminate — 경제 화면과 같은 WebSocket 명령, liveActions.ts).
// - 모르는 동작 ID(더 새 서버)와 모르는 종류의 동작은 그리지 않는다(뜻을 모른다).
// 동작 ID 목록은 종류 표의 타입에서 나온다(값은 가져오지 않는다). 표에 동작이 늘면 satisfies가 빠진 이름을 알려 준다.
import type { INBOX_KINDS, InboxItem, InboxKindId } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";
import { isKnownKind } from "./inboxText.ts";

/** 종류 표에 있는 바로 처리 동작 ID */
export type QuickActionId = (typeof INBOX_KINDS)[InboxKindId]["actions"][number];

const ACTION_LABELS = {
  deploy_defense: (locale) => m.inbox_action_deploy_defense({}, { locale }),
  sell: (locale) => m.inbox_action_sell({}, { locale }),
  auto_assign: (locale) => m.inbox_action_auto_assign({}, { locale }),
  repair: (locale) => m.inbox_action_repair({}, { locale }),
  accept: (locale) => m.inbox_action_accept({}, { locale }),
  decline: (locale) => m.inbox_action_decline({}, { locale }),
  wait: (locale) => m.inbox_action_wait({}, { locale }),
  terminate: (locale) => m.inbox_action_terminate({}, { locale }),
} satisfies Record<QuickActionId, (locale: Locale) => string>;

/** 실제 항목에도 버튼을 그리는 종류(그 시스템의 기존 명령으로 처리 — liveActions.ts) */
const LIVE_ACTION_KINDS: ReadonlySet<string> = new Set(["labor_paused"]);

function isQuickActionId(action: string): action is QuickActionId {
  return Object.hasOwn(ACTION_LABELS, action);
}

export function quickActionLabel(action: QuickActionId, locale: Locale = getLocale()): string {
  return ACTION_LABELS[action](locale);
}

/** 줄에 그릴 바로 처리 버튼(받은 차례). 실제 항목은 처리할 길이 있는 종류(LIVE_ACTION_KINDS)만 */
export function quickActionsFor(item: InboxItem): QuickActionId[] {
  if (!isKnownKind(item.kind)) return [];
  if (item.preview !== true && !LIVE_ACTION_KINDS.has(item.kind)) return [];
  return item.actions.filter(isQuickActionId);
}

/** 이 줄의 버튼이 실제 명령을 보내나(시안 자료가 아닌 실제 항목) */
export function isLiveItem(item: InboxItem): boolean {
  return item.preview !== true && LIVE_ACTION_KINDS.has(item.kind);
}
