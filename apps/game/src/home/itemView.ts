// 처리할 일 한 줄의 홈 보기 값 — 제목·곳 이름·마감 글자는 W3 문구(describeItem), 바로 처리 단추는 W3 규칙(quickActionsFor)을 그대로 쓴다.
// 그래서 홈과 처리함 화면의 글·갈 곳·단추가 같다(ADR 2026-10-29-app-shell 7절). 홈의 줄은 늘 링크다:
// 아는 종류이고 이 기기가 아는 화면이면 그 화면, 아니면(모르는 종류·모르는 화면·갈 화면 없음) 처리함에서 그 항목을 강조한다(?item=).
import type { RouteTarget } from "@terra/shared";
import type { InboxItem } from "@terra/shared/inbox";
import {
  type QuickActionId,
  describeItem,
  inboxItemTarget,
  isKnownCategory,
  quickActionsFor,
} from "./inboxParts.ts";

export interface HomeItemView {
  readonly title: string;
  /** 곳 이름(유저가 지은 이름, 번역하지 않는다). 없으면 null */
  readonly place: string | null;
  /** 마감 글자(목록을 만든 서버 시각 기준 남은 시간). 마감이 없으면 null */
  readonly due: string | null;
  /** 마감이 지났다(글자 "마감 지남"과 같은 기준) */
  readonly overdue: boolean;
  readonly target: RouteTarget;
  readonly preview: boolean;
  /** 이 기기가 아는 분류인지. 모르면(더 새 서버) 분류 이름·색 없이 기본 아이콘으로 그린다 */
  readonly knownCategory: boolean;
  /** 그릴 바로 처리 단추(시안 자료이고 아는 종류일 때만) */
  readonly actions: readonly QuickActionId[];
}

/** now = 목록을 만든 서버 시각(inbox.list의 generatedAt) */
export function homeItemView(item: InboxItem, now: number): HomeItemView {
  // 처리함 화면 밖이라 W3 규칙의 갈 곳은 늘 있다(없으면 처리함의 그 항목)
  const view = describeItem(item, { now, onInboxScreen: false });
  return {
    title: view.title,
    place: view.place,
    due: view.due,
    overdue: item.deadlineAt !== null && item.deadlineAt <= now,
    target: view.target ?? inboxItemTarget(item),
    preview: view.preview,
    knownCategory: isKnownCategory(item.category),
    actions: quickActionsFor(item),
  };
}
