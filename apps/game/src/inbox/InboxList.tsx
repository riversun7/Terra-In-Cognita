// 처리할 일 목록 — 분류마다 묶어(위협 → 돈·생존 → 멈춤 → 제안·결정 → 완료, 서버가 정렬한 차례 그대로) 줄을 그린다.
// 처리함 화면(InboxScreen.tsx)과 홈(처리할 일 카드·템플릿)이 함께 쓴다. ADR 2026-10-29-app-shell 7절, D-6006·D-6009·D-6015
// - 줄 = 제목(누르면 그 화면, 링크가 카드 전체를 덮는다) + 곳·마감·"시험 자료" + 바로 처리 버튼(0~2개).
// - 분류는 아이콘 + 이름 + 줄 수로 보인다. 색은 상태색만 쓴다(위협 danger, 돈·생존 warning, 완료 success, 멈춤·제안은 글자색).
// - 모르는 분류의 줄은 그리지 않는다(분류는 닫힌 목록이다). 모르는 종류는 "새 알림"으로 그린다(inboxText.ts).
// - 앱 안 링크: navigate가 있으면 보통 왼쪽 누름을 앱 안 이동으로 바꾼다(보조 키·가운데 버튼은 브라우저에 맡긴다).
//   통합 때 화면 틀(W1)의 AppLink로 바꿔도 된다.
import type { InboxCategory, InboxItem } from "@terra/shared/inbox";
import { type MouseEvent, useId } from "react";
import { m } from "../paraglide/messages.js";
import { CategoryIcon, ChevronIcon } from "./icons.tsx";
import { CATEGORY_NAMES, describeItem, isKnownCategory } from "./inboxText.ts";
import { type QuickActionId, quickActionLabel, quickActionsFor } from "./quickActions.ts";

export interface InboxListProps {
  /** 서버가 정렬한 줄들 */
  readonly items: readonly InboxItem[];
  /** 마감을 잴 기준(목록을 만든 서버 시각, generatedAt) */
  readonly now: number;
  /** 강조할 항목 ID(처리함의 ?item=) */
  readonly highlightId?: string | null | undefined;
  /** 처리함 화면 안이면 true: 이동 화면이 없는 줄은 링크를 두지 않는다(그 줄이 이미 여기 있다) */
  readonly onInboxScreen: boolean;
  /** 앱 안 이동(라우터). 없으면 보통 링크다 */
  readonly navigate?: ((path: string) => void) | undefined;
  /** 바로 처리 버튼을 눌렀다 */
  readonly onQuickAction: (item: InboxItem, action: QuickActionId) => void;
  /** 분류 제목의 단계(처리함 화면 2, 홈 카드 안 3) */
  readonly headingLevel?: 2 | 3;
}

interface Group {
  readonly category: InboxCategory;
  readonly items: InboxItem[];
}

/** 차례를 지키며 분류마다 묶는다(서버가 분류 순서로 정렬해 보낸다). 모르는 분류는 뺀다 */
function groupByCategory(items: readonly InboxItem[]): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    const category: string = item.category;
    if (!isKnownCategory(category)) continue;
    const last = groups.at(-1);
    if (last?.category === category) last.items.push(item);
    else groups.push({ category, items: [item] });
  }
  return groups;
}

/** 보통 왼쪽 누름만 앱 안 이동으로 바꾼다 */
function followInApp(
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  navigate: (path: string) => void,
): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(path);
}

interface RowProps {
  readonly item: InboxItem;
  readonly now: number;
  readonly highlighted: boolean;
  readonly onInboxScreen: boolean;
  readonly navigate: ((path: string) => void) | undefined;
  readonly onQuickAction: (item: InboxItem, action: QuickActionId) => void;
}

/** 강조한 줄이 처음 그려지면 화면 가운데로 */
function scrollIntoViewOnce(element: HTMLLIElement | null): void {
  element?.scrollIntoView({ block: "center" });
}

function InboxRow({ item, now, highlighted, onInboxScreen, navigate, onQuickAction }: RowProps) {
  const view = describeItem(item, { now, onInboxScreen });
  const actions = quickActionsFor(item);
  const { href } = view;
  return (
    <li
      className="inbox-item"
      data-highlight={highlighted ? "true" : undefined}
      ref={highlighted ? scrollIntoViewOnce : undefined}
    >
      <div className="inbox-item-head">
        <div className="inbox-item-main">
          {href === null ? (
            <p className="inbox-item-title">{view.title}</p>
          ) : (
            <a
              className="inbox-item-title inbox-item-link"
              href={href}
              onClick={navigate ? (event) => followInApp(event, href, navigate) : undefined}
            >
              {view.title}
            </a>
          )}
          {view.place !== null || view.due !== null || view.preview ? (
            <p className="inbox-item-meta">
              {view.place !== null ? (
                <span className="inbox-item-place" translate="no">
                  {view.place}
                </span>
              ) : null}
              {view.due !== null ? <span className="inbox-item-due">{view.due}</span> : null}
              {view.preview ? <span className="inbox-tag">{m.inbox_preview_tag()}</span> : null}
            </p>
          ) : null}
        </div>
        {href === null ? null : <ChevronIcon />}
      </div>
      {actions.length > 0 ? (
        <div className="inbox-item-actions">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className="button-small"
              onClick={() => onQuickAction(item, action)}
            >
              {quickActionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function GroupSection({
  group,
  headingLevel,
  rowProps,
}: {
  group: Group;
  headingLevel: 2 | 3;
  rowProps: Omit<RowProps, "item" | "highlighted"> & { highlightId: string | null };
}) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { highlightId, ...shared } = rowProps;
  return (
    <section className="inbox-group" data-category={group.category} aria-labelledby={headingId}>
      <Heading className="inbox-group-title" id={headingId}>
        <span className="inbox-group-mark">
          <CategoryIcon category={group.category} />
        </span>
        <span className="inbox-group-name">{CATEGORY_NAMES[group.category]()}</span>
        <span className="inbox-group-count">{group.items.length}</span>
      </Heading>
      <ul className="inbox-items">
        {group.items.map((item) => (
          <InboxRow key={item.id} item={item} highlighted={item.id === highlightId} {...shared} />
        ))}
      </ul>
    </section>
  );
}

export function InboxList({
  items,
  now,
  highlightId = null,
  onInboxScreen,
  navigate,
  onQuickAction,
  headingLevel = 2,
}: InboxListProps) {
  return (
    <div className="inbox-list">
      {groupByCategory(items).map((group) => (
        <GroupSection
          key={group.category}
          group={group}
          headingLevel={headingLevel}
          rowProps={{ now, onInboxScreen, navigate, onQuickAction, highlightId }}
        />
      ))}
    </div>
  );
}
