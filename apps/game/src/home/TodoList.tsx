// 처리할 일 줄 — 템플릿·카드가 함께 쓴다. 줄 하나 = 분류 아이콘 + 제목(누르면 그 화면) + 분류·곳·마감·시험 자료 + 바로 처리 0~2개.
// - 글·갈 곳·단추는 처리함 화면과 같은 W3 규칙이다(itemView.ts): 모르는 종류는 "새 알림"이고 처리함으로 가며 단추가 없다.
//   실제 항목의 바로 처리 단추는 명령을 보낼 길(WebSocket inbox_action)이 생길 때까지 없다(시안 자료에만 있다).
// - 분류는 늘 아이콘 + 이름으로 보인다(색만으로 알리지 않는다, ADR 2026-10-29-app-shell 3·10절). 모르는 분류(더 새 서버)는
//   기본 아이콘만(이름·색 없이) 그린다. 줄은 빠지지 않는다.
// - 제목·정보 줄이 한 링크라 누르는 곳이 44px을 넘는다. 바로 처리 단추는 링크 밖에 둔다(링크 안에 단추를 넣지 않는다).
// - 받은 순서(서버 정렬: 분류 순위 → 마감 → 처음 생긴 시각)를 그대로 그린다. 마감 없는 항목도 빠지지 않는다.
import type { InboxItem } from "@terra/shared/inbox";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { CategoryIcon } from "./cards/icons.tsx";
import { deadlineIso } from "./deadline.ts";
import {
  CATEGORY_NAMES,
  INBOX_TEXT,
  type QuickActionId,
  isKnownCategory,
  quickActionLabel,
} from "./inboxParts.ts";
import { type HomeItemView, homeItemView } from "./itemView.ts";
import { HomeLink } from "./shellParts.tsx";
import "./todo.css";

interface TodoListProps {
  readonly items: readonly InboxItem[];
  /** 목록을 만든 서버 시각(generatedAt) — 마감 글자의 기준 */
  readonly now: number;
  /** false면 바로 처리 단추를 그리지 않는다(좁은 카드) */
  readonly actions?: boolean;
  /** false면 줄마다 분류 이름을 쓰지 않는다(분류별로 묶은 목록 — 묶음 제목이 이미 보인다. 아이콘은 그대로) */
  readonly showCategory?: boolean;
  readonly id?: string | undefined;
}

/** 줄의 data-category(분류 색). 모르는 분류는 "other"(기본 색) */
export function categoryAttr(item: InboxItem, view: HomeItemView): string {
  return view.knownCategory ? item.category : "other";
}

/** 분류·곳·마감·시험 자료 표시 한 줄 */
export function TodoMeta({
  item,
  view,
  showCategory = true,
}: {
  item: InboxItem;
  view: HomeItemView;
  showCategory?: boolean;
}) {
  const category = showCategory && isKnownCategory(item.category) ? CATEGORY_NAMES[item.category]() : null;
  const deadline = item.deadlineAt;
  // 보일 것이 없으면 빈 줄을 두지 않는다
  if (category === null && view.place === null && view.due === null && !view.preview) return null;
  return (
    <span className="todo-meta">
      {category === null ? null : <span className="todo-category">{category}</span>}
      {view.place === null ? null : (
        <span className="todo-place" translate="no">
          {view.place}
        </span>
      )}
      {view.due === null || deadline === null ? null : (
        <time
          className="todo-due"
          dateTime={deadlineIso(deadline)}
          data-overdue={view.overdue ? "true" : undefined}
        >
          {view.due}
        </time>
      )}
      {view.preview ? <span className="home-sample">{INBOX_TEXT.previewTag()}</span> : null}
    </span>
  );
}

/**
 * 바로 처리 단추들과 그 결과 알림 영역(단추 바로 아래, 늘 그려 둔다 — 긴 목록의 끝에서 눌러도 화면 안에 보이고 읽힌다).
 * 지금 단추는 시안 자료 항목에만 있고(quickActionsFor), 누르면 명령을 보내지 않고 그렇다고 알린다(ADR 37 6절).
 * inbox_action(WebSocket)이 생기면 실제 항목은 여기서 보내고, 결과를 받으면 refreshInbox()로 다시 받는다(W3 quickActions.ts).
 */
export function TodoActions({ actions }: { actions: readonly QuickActionId[] }) {
  const notice = useLiveLines();
  if (actions.length === 0) return null;
  return (
    <div className="todo-actions">
      <div className="todo-buttons">
        {actions.map((action, index) => (
          <button
            key={action}
            type="button"
            className={index === 0 ? "button-small button-primary" : "button-small"}
            onClick={() => notice.show([INBOX_TEXT.previewActionDone()])}
          >
            {quickActionLabel(action)}
          </button>
        ))}
      </div>
      <LiveMessage className="todo-feedback" tone="info" lines={notice.lines} version={notice.version} />
    </div>
  );
}

function TodoRow({
  item,
  now,
  actions,
  showCategory,
}: {
  item: InboxItem;
  now: number;
  actions: boolean;
  showCategory: boolean;
}) {
  const view = homeItemView(item, now);
  return (
    <li className="todo" data-category={categoryAttr(item, view)}>
      <span className="todo-icon">
        <CategoryIcon category={item.category} />
      </span>
      <HomeLink to={view.target} className="todo-link">
        <span className="todo-title">{view.title}</span>
        <TodoMeta item={item} view={view} showCategory={showCategory} />
      </HomeLink>
      {actions ? <TodoActions actions={view.actions} /> : null}
    </li>
  );
}

export function TodoList({ items, now, actions = true, showCategory = true, id }: TodoListProps) {
  return (
    <ul className="todo-list" id={id}>
      {items.map((item) => (
        <TodoRow key={item.id} item={item} now={now} actions={actions} showCategory={showCategory} />
      ))}
    </ul>
  );
}
