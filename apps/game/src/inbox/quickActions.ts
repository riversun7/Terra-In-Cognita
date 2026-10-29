// 바로 처리 버튼(D-6015) — 동작 ID → 버튼 이름, 줄에 그릴 버튼(ADR 2026-10-29-app-shell 7절 "바로 처리").
// 바로 처리는 게임 상태를 바꾸므로 WebSocket으로만 보낸다(공용 메시지 inbox_action { id, itemId, action }).
// 그 메시지는 첫 실제 동작을 넣을 때 ADR과 함께 만든다(PROTOCOL_VERSION). 그래서 지금은:
// - 시안 자료 항목(preview): 버튼을 그리고, 누르면 명령을 보내지 않는다. 화면이 "시험 자료라서 명령을 보내지 않았습니다"를 알린다.
// - 실제 항목: 보낼 길이 없어 버튼을 그리지 않는다. 줄을 눌러 그 화면에서 처리한다. inbox_action을 만들 때 여기를 바꾼다
//   (결과를 받으면 처리할 일을 다시 받는다: store.ts refreshInbox).
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
} satisfies Record<QuickActionId, (locale: Locale) => string>;

function isQuickActionId(action: string): action is QuickActionId {
  return Object.hasOwn(ACTION_LABELS, action);
}

export function quickActionLabel(action: QuickActionId, locale: Locale = getLocale()): string {
  return ACTION_LABELS[action](locale);
}

/** 줄에 그릴 바로 처리 버튼(받은 차례). 실제 항목은 명령을 보낼 길이 생길 때까지 없다 */
export function quickActionsFor(item: InboxItem): QuickActionId[] {
  if (item.preview !== true || !isKnownKind(item.kind)) return [];
  return item.actions.filter(isQuickActionId);
}
