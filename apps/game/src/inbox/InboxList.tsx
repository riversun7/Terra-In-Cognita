// 처리할 일 목록 — 분류마다 묶어(위협 → 돈·생존 → 멈춤 → 제안·결정 → 완료, 분류 안은 서버가 정렬한 차례 그대로) 줄을 그린다.
// 처리함 화면(InboxScreen.tsx)과 홈(처리할 일 카드·템플릿)이 함께 쓴다. ADR 2026-10-29-app-shell 7절, D-6006·D-6009·D-6011·D-6015
// - 줄 = 제목(누르면 그 화면, 링크가 카드 전체를 덮는다) + 곳·마감·"시험 자료" + 바로 처리 버튼(0~2개).
// - 분류는 아이콘 + 이름 + 줄 수로 보인다. 색은 상태색만 쓴다(위협 danger, 돈·생존 warning, 완료 success, 멈춤·제안은 글자색).
//   분류 묶음은 표지(region)가 아니라 제목(h2·h3)이 나눈다(표지 목록이 분류 수만큼 늘지 않게).
// - 모르는 분류(더 새 서버)의 줄은 끝의 "그 밖의 알림" 묶음에 그린다. 처리함에는 늘 모든 항목이 나오고(D-6011), 종 배지도 센다.
//   모르는 종류는 "새 알림"으로 그린다(inboxText.ts).
// - 바로 처리 결과는 누른 버튼 바로 아래 그 줄의 알림 영역이 보이고 읽는다(긴 목록의 끝에서 눌러도 화면 안에 보인다).
// - 앱 안 링크: onNavigate가 있으면 보통 왼쪽 누름을 앱 안 이동(화면, RouteTarget)으로 바꾼다. 보조 키·가운데 버튼은 브라우저에 맡긴다.
//   화면 틀(W1)의 라우터 navigate를 그대로 받는다. W1이 합쳐진 뒤 AppLink로 바꿔도 된다(그때 onNavigate 칸을 지운다).
// - 목록 CSS(inbox.css)는 이 파일이 가져온다. 홈이 이 부품만 써도 모양이 같다.
import type { RouteTarget } from "@terra/shared";
import type { InboxCategory, InboxItem } from "@terra/shared/inbox";
import { type MouseEvent, useState } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { Icon } from "../ui/icons.tsx";
import { ChevronIcon, type InboxGroupKind } from "./icons.tsx";
import {
  CATEGORY_NAMES,
  CATEGORY_ORDER,
  OTHER_GROUP_NAME,
  describeItem,
  isInboxItemTarget,
  isKnownCategory,
} from "./inboxText.ts";
import { runLiveAction } from "./liveActions.ts";
import { type QuickActionId, isLiveItem, quickActionLabel, quickActionsFor } from "./quickActions.ts";
import "./inbox.css";

/** 앱 안 이동 — 화면 틀(W1) 라우터의 navigate(target, { focusId })와 같은 모양. focusId: 옮긴 뒤 초점을 둘 요소 id */
export type InboxNavigate = (target: RouteTarget, options?: { readonly focusId?: string }) => void;

/** ?item=으로 강조한 줄 제목의 id. 처리함의 그 줄로 옮길 때 초점을 이리로 둔다(줄이 아직 없으면 화면 틀이 화면 제목에 둔다) */
export const INBOX_HIGHLIGHT_ID = "inbox-highlight";

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
  readonly onNavigate?: InboxNavigate | undefined;
  /** 분류 제목의 단계(처리함 화면 2, 홈 카드 안 3) */
  readonly headingLevel?: 2 | 3;
}

interface Group {
  readonly kind: InboxGroupKind;
  readonly items: InboxItem[];
}

/**
 * 분류마다 묶는다: 분류 순서(위협 → … → 완료)대로, 분류 안에서는 받은 차례 그대로(서버가 마감 순으로 정렬해 보낸다).
 * 받은 차례가 섞여 와도 분류 제목이 두 번 나오지 않는다. 모르는 분류는 끝의 "그 밖의 알림" 묶음 하나에 받은 차례로 모은다
 */
function groupByCategory(items: readonly InboxItem[]): Group[] {
  const byCategory = new Map<InboxCategory, InboxItem[]>();
  const other: InboxItem[] = [];
  for (const item of items) {
    const category: string = item.category;
    if (!isKnownCategory(category)) {
      other.push(item);
      continue;
    }
    const list = byCategory.get(category);
    if (list) list.push(item);
    else byCategory.set(category, [item]);
  }
  const groups = CATEGORY_ORDER.flatMap((category): Group[] => {
    const list = byCategory.get(category);
    return list ? [{ kind: category, items: list }] : [];
  });
  if (other.length > 0) groups.push({ kind: "other", items: other });
  return groups;
}

/** 보통 왼쪽 누름만 앱 안 이동으로 바꾼다. 처리함의 한 줄로 가면 그 줄 제목에 초점을 둔다 */
function followInApp(
  event: MouseEvent<HTMLAnchorElement>,
  target: RouteTarget,
  onNavigate: InboxNavigate,
): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (isInboxItemTarget(target)) onNavigate(target, { focusId: INBOX_HIGHLIGHT_ID });
  else onNavigate(target);
}

/** 강조한 줄이 처음 그려지면 화면 가운데로 */
function scrollIntoViewOnce(element: HTMLLIElement | null): void {
  element?.scrollIntoView({ block: "center" });
}

/**
 * 바로 처리 버튼과 그 결과 알림 영역(버튼 바로 아래, 늘 그려 둔다). 시안 자료 항목은 누르면 명령을 보내지 않고 그렇다고 알린다.
 * 실제 항목(그 시스템의 기존 명령으로 처리하는 종류 — 기획 대조 2163 labor_paused)은 liveActions.ts가 처리하고 결과를 같은 영역에 보인다
 */
function QuickActions({ item, actions }: { item: InboxItem; actions: readonly QuickActionId[] }) {
  const notice = useLiveLines();
  const [sending, setSending] = useState(false);
  const press = (action: QuickActionId): void => {
    if (!isLiveItem(item)) {
      notice.show([m.inbox_action_preview_done()]);
      return;
    }
    setSending(true);
    void runLiveAction(item, action).then((line) => {
      setSending(false);
      notice.show([line]);
    });
  };
  return (
    <div className="inbox-item-actions">
      <div className="inbox-item-buttons">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="button-small"
            disabled={sending}
            onClick={() => press(action)}
          >
            {quickActionLabel(action)}
          </button>
        ))}
      </div>
      <LiveMessage
        tone="info"
        lines={notice.lines}
        version={notice.version}
        className="inbox-item-feedback"
      />
    </div>
  );
}

interface RowProps {
  readonly item: InboxItem;
  readonly now: number;
  readonly highlighted: boolean;
  readonly onInboxScreen: boolean;
  readonly onNavigate: InboxNavigate | undefined;
}

function InboxRow({ item, now, highlighted, onInboxScreen, onNavigate }: RowProps) {
  const view = describeItem(item, { now, onInboxScreen });
  const actions = quickActionsFor(item);
  const { target, href } = view;
  // 강조한 줄: 보이는 테두리와 함께 읽기 프로그램에도 알린다(aria-current + 제목 앞 숨은 글)
  const titleId = highlighted ? INBOX_HIGHLIGHT_ID : undefined;
  const title = (
    <>
      {highlighted ? <span className="visually-hidden">{m.inbox_item_opened()} </span> : null}
      {view.title}
    </>
  );
  return (
    <li
      className="inbox-item"
      data-highlight={highlighted ? "true" : undefined}
      aria-current={highlighted ? "true" : undefined}
      ref={highlighted ? scrollIntoViewOnce : undefined}
    >
      <div className="inbox-item-head">
        <div className="inbox-item-main">
          {target === null || href === null ? (
            <p className="inbox-item-title" id={titleId}>
              {title}
            </p>
          ) : (
            <a
              className="inbox-item-title inbox-item-link"
              id={titleId}
              href={href}
              onClick={onNavigate ? (event) => followInApp(event, target, onNavigate) : undefined}
            >
              {title}
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
      {actions.length > 0 ? <QuickActions item={item} actions={actions} /> : null}
    </li>
  );
}

function GroupBlock({
  group,
  headingLevel,
  rowProps,
}: {
  group: Group;
  headingLevel: 2 | 3;
  rowProps: Omit<RowProps, "item" | "highlighted"> & { highlightId: string | null };
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { highlightId, ...shared } = rowProps;
  const name = group.kind === "other" ? OTHER_GROUP_NAME() : CATEGORY_NAMES[group.kind]();
  return (
    <div className="inbox-group" data-category={group.kind}>
      <Heading className="inbox-group-title">
        <span className="inbox-group-mark">
          <Icon name={group.kind === "other" ? "bell" : group.kind} className="inbox-icon" />
        </span>
        <span className="inbox-group-name">{name}</span>
        <span className="inbox-group-count">{group.items.length}</span>
      </Heading>
      <ul className="inbox-items">
        {group.items.map((item) => (
          <InboxRow key={item.id} item={item} highlighted={item.id === highlightId} {...shared} />
        ))}
      </ul>
    </div>
  );
}

export function InboxList({
  items,
  now,
  highlightId = null,
  onInboxScreen,
  onNavigate,
  headingLevel = 2,
}: InboxListProps) {
  return (
    <div className="inbox-list">
      {groupByCategory(items).map((group) => (
        <GroupBlock
          key={group.kind}
          group={group}
          headingLevel={headingLevel}
          rowProps={{ now, onInboxScreen, onNavigate, highlightId }}
        />
      ))}
    </div>
  );
}
