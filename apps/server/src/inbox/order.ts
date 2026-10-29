// 처리할 일 정렬·묶기 — 순수 함수(시험: order.test.ts). ADR 2026-10-29-app-shell 7절, D-6006·D-6009
// 제공 함수들이 낸 건(InboxEntry)을 줄(InboxItem)로 묶고 정렬해 inbox.list 응답을 만든다.
// - 묶기: 묶는 종류(종류 표 grouped)는 같은 (종류, 키)를 한 줄로 묶는다. 줄은 건 수, 가장 이른 마감, 가장 이른 처음 생긴 시각을 갖는다.
//   줄의 params·target·preview는 그 묶음에서 가장 급한 건(마감 → 처음 생긴 시각)의 것이다.
//   묶지 않는 종류(완료 포함)는 건마다 한 줄이다. 같은 (종류, 키)가 또 오면 같은 대상이므로 가장 급한 건 하나만 남긴다.
// - 정렬 키: (분류 순위, 마감(없으면 그 분류의 끝), 처음 생긴 시각, 항목 ID). 항목 ID는 줄마다 달라서 순서가 하나로 정해진다.
//   마감 없는 항목끼리 "처음 생긴 순"은 Assumed다(ADR 37 7절, Step 5에서 바꿀 수 있다).
// - counts = 분류별 줄 수, badges = 메뉴 항목 → 줄 수(종류 표의 badge). 종 배지(완료를 뺀 줄 수)는 기기가 counts로 센다.
// 같은 입력이면 입력 차례와 상관없이 같은 응답이다(가장 급한 건이 같은 시각이면 값의 JSON으로 가른다).
import {
  INBOX_KINDS,
  type InboxCategory,
  type InboxItem,
  type InboxKindId,
  type InboxListResponse,
  inboxCategoryRank,
  inboxItemId,
} from "@terra/shared/inbox";
import type { InboxEntry } from "./types.ts";

/** 마감 비교: 이른 것이 먼저, 없으면(null) 끝 */
function compareDeadline(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** 글자 단위 비교(언어 설정과 상관없이 늘 같은 순서) */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 묶음 안의 건 차례: 마감 → 처음 생긴 시각 → 값(params·target)의 JSON */
function compareEntries(a: InboxEntry, b: InboxEntry): number {
  return (
    compareDeadline(a.deadlineAt, b.deadlineAt) ||
    a.firstSeenAt - b.firstSeenAt ||
    compareText(JSON.stringify([a.params, a.target]), JSON.stringify([b.params, b.target]))
  );
}

/** 줄 차례: 분류 순위 → 마감 → 처음 생긴 시각 → 항목 ID */
function compareItems(a: InboxItem, b: InboxItem): number {
  return (
    inboxCategoryRank(a.category) - inboxCategoryRank(b.category) ||
    compareDeadline(a.deadlineAt, b.deadlineAt) ||
    a.firstSeenAt - b.firstSeenAt ||
    compareText(a.id, b.id)
  );
}

/** 시각 칸은 유한한 수여야 한다(NaN이면 정렬이 깨진다). 제공 함수의 실수는 바로 드러낸다 */
function checkTimes(entry: InboxEntry): void {
  const deadlineOk = entry.deadlineAt === null || Number.isFinite(entry.deadlineAt);
  if (!deadlineOk || !Number.isFinite(entry.firstSeenAt)) {
    throw new RangeError(`inbox entry ${entry.kind}:${entry.key} has a non-finite time`);
  }
}

/** 묶음 하나(같은 항목 ID의 건들) → 줄 */
function toItem(id: string, kind: InboxKindId, entries: readonly InboxEntry[]): InboxItem {
  const definition = INBOX_KINDS[kind];
  const ordered = entries.toSorted(compareEntries);
  const [lead] = ordered;
  if (!lead) throw new Error(`inbox group ${id} is empty`);
  let firstSeenAt = lead.firstSeenAt;
  for (const entry of ordered) firstSeenAt = Math.min(firstSeenAt, entry.firstSeenAt);
  return {
    id,
    kind,
    category: definition.category,
    count: definition.grouped ? ordered.length : 1,
    // 가장 급한 건의 마감 = 묶음에서 가장 이른 마감(마감 없는 건은 뒤로 정렬된다)
    deadlineAt: lead.deadlineAt,
    // 묶지 않는 종류의 겹친 건도 같은 대상이므로 처음 생긴 시각은 가장 이른 것
    firstSeenAt,
    params: lead.params,
    target: lead.target,
    actions: [...definition.actions],
    ...(lead.preview === true ? { preview: true } : {}),
  };
}

/** 분류별 0. 분류가 늘면 타입 검사가 빠진 칸을 알려 준다 */
function zeroCounts(): Record<InboxCategory, number> {
  return { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 };
}

/** 건 목록 → inbox.list 응답(now = 응답을 만든 서버 시각) */
export function orderInbox(entries: readonly InboxEntry[], now: number): InboxListResponse {
  const groups = new Map<string, { kind: InboxKindId; entries: InboxEntry[] }>();
  for (const entry of entries) {
    checkTimes(entry);
    // 키 모양이 틀리면 RangeError(inboxItemId)
    const id = inboxItemId(entry.kind, entry.key);
    const group = groups.get(id);
    if (group) group.entries.push(entry);
    else groups.set(id, { kind: entry.kind, entries: [entry] });
  }

  const counts = zeroCounts();
  const badges: Record<string, number> = {};
  const items: InboxItem[] = [];
  for (const [id, group] of groups) {
    const item = toItem(id, group.kind, group.entries);
    items.push(item);
    counts[item.category] += 1;
    const badge = INBOX_KINDS[group.kind].badge;
    if (badge !== null) badges[badge] = (badges[badge] ?? 0) + 1;
  }
  items.sort(compareItems);
  return { generatedAt: now, items, counts, badges };
}
