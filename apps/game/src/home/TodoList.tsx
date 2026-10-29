// 처리할 일 줄 — 템플릿·카드가 함께 쓴다. 줄 하나 = 분류 아이콘 + 제목(누르면 그 화면) + 분류·마감·시험 자료 + 바로 처리 0~2개.
// - 분류는 늘 아이콘 + 이름으로 보인다(색만으로 알리지 않는다, ADR 2026-10-29-app-shell 3·10절).
// - 제목·정보 줄이 한 링크라 누르는 곳이 44px을 넘는다. 바로 처리 단추는 링크 밖에 둔다(링크 안에 단추를 넣지 않는다).
// - 받은 순서(서버 정렬: 분류 순위 → 마감 → 처음 생긴 시각)를 그대로 그린다. 마감 없는 항목도 빠지지 않는다.
// - 묶은 줄의 개수는 제목 문구에 들어 있다(예: "명령 없는 유닛 6").
import type { InboxItem } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { CategoryIcon } from "./cards/icons.tsx";
import { dueIso, dueText, isOverdue } from "./dueText.ts";
import { itemHref } from "./homeView.ts";
import { actionLabel, categoryName, itemTitle } from "./itemText.ts";
import { HomeLink } from "./shellParts.tsx";
import "./todo.css";

interface TodoListProps {
  readonly items: readonly InboxItem[];
  readonly onQuickAction: (item: InboxItem, action: string) => void;
  /** false면 바로 처리 단추를 그리지 않는다(좁은 카드) */
  readonly actions?: boolean;
  /** false면 줄마다 분류 이름을 쓰지 않는다(분류별로 묶은 목록 — 묶음 제목이 이미 보인다. 아이콘은 그대로) */
  readonly showCategory?: boolean;
  readonly id?: string | undefined;
}

/** 분류·마감·시험 자료 표시 한 줄 */
export function TodoMeta({ item, showCategory = true }: { item: InboxItem; showCategory?: boolean }) {
  // 보일 것이 없으면 빈 줄을 두지 않는다
  if (!showCategory && item.deadlineAt === null && item.preview !== true) return null;
  return (
    <span className="todo-meta">
      {showCategory ? <span className="todo-category">{categoryName(item.category)}</span> : null}
      {item.deadlineAt === null ? null : (
        <time
          className="todo-due"
          dateTime={dueIso(item.deadlineAt)}
          data-overdue={isOverdue(item.deadlineAt) ? "true" : undefined}
        >
          {dueText(item.deadlineAt)}
        </time>
      )}
      {item.preview === true ? <span className="home-sample">{m.home_preview_tag()}</span> : null}
    </span>
  );
}

/** 바로 처리 단추들. 모르는 동작은 그리지 않는다 */
export function TodoActions({
  item,
  onQuickAction,
}: {
  item: InboxItem;
  onQuickAction: (item: InboxItem, action: string) => void;
}) {
  const buttons = item.actions
    .map((action) => ({ action, label: actionLabel(action) }))
    .filter((entry): entry is { action: string; label: string } => entry.label !== null);
  if (buttons.length === 0) return null;
  return (
    <span className="todo-actions">
      {buttons.map(({ action, label }, index) => (
        <button
          key={action}
          type="button"
          className={index === 0 ? "button-small button-primary" : "button-small"}
          onClick={() => onQuickAction(item, action)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

export function TodoList({ items, onQuickAction, actions = true, showCategory = true, id }: TodoListProps) {
  return (
    <ul className="todo-list" id={id}>
      {items.map((item) => (
        <li key={item.id} className="todo" data-category={item.category}>
          <span className="todo-icon">
            <CategoryIcon category={item.category} />
          </span>
          <HomeLink href={itemHref(item)} className="todo-link">
            <span className="todo-title">{itemTitle(item)}</span>
            <TodoMeta item={item} showCategory={showCategory} />
          </HomeLink>
          {actions ? <TodoActions item={item} onQuickAction={onQuickAction} /> : null}
        </li>
      ))}
    </ul>
  );
}
