// [임시] 시안 자료 — W3이 합쳐지기 전 dev·admin 홈 시험용. W3에서는 서버(apps/server/src/inbox/preview.ts)가 만들고 이 파일은 지운다.
// 사용자 결정 2: 시안 자료는 처리할 일(기획 목록의 종류)과 복귀 요약 칸만 쓴다. 사이보그·보유 유닛·자산·세력 카드는 "준비 중"이다.
// 종류는 0단계 종류 표의 8개(모두 planned)이고 5분류·묶기·마감 없음·바로 처리 0~2개를 고루 넣었다(ADR 2026-10-29-app-shell 7절).
// 모든 항목에 preview: true. 수는 시안일 뿐 기획 수치가 아니다. 정렬은 서버 규칙(분류 순위, 마감, 처음 생긴 시각, 항목 ID)과 같다.
import {
  INBOX_KINDS,
  type InboxCategory,
  type InboxItem,
  type InboxKindId,
  type InboxListResponse,
  type SummaryGetResponse,
  inboxCategoryRank,
  inboxItemId,
} from "@terra/shared/inbox";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

interface SampleRow {
  readonly kind: InboxKindId;
  readonly key: string;
  readonly count: number;
  /** 지금부터 마감까지(ms). null = 마감 없음 */
  readonly dueIn: number | null;
  /** 지금보다 얼마 전에 처음 생겼는지(ms) */
  readonly seenAgo: number;
}

const ROWS: readonly SampleRow[] = [
  { kind: "wave_incoming", key: "city_1", count: 1, dueIn: 6 * HOUR, seenAgo: 20 * MINUTE },
  { kind: "siege_declared", key: "siege_3", count: 1, dueIn: 26 * HOUR, seenAgo: 2 * HOUR },
  { kind: "goods_spoiling", key: "warehouse_2", count: 3, dueIn: 40 * MINUTE, seenAgo: 3 * HOUR },
  { kind: "unit_injured", key: "city_1", count: 2, dueIn: null, seenAgo: 5 * HOUR },
  { kind: "unit_idle", key: "city_1", count: 6, dueIn: null, seenAgo: 7 * HOUR },
  { kind: "building_stopped", key: "city_1", count: 1, dueIn: null, seenAgo: 9 * HOUR },
  { kind: "contract_match", key: "contract_41", count: 1, dueIn: 3 * HOUR, seenAgo: HOUR },
  { kind: "craft_done", key: "event_77", count: 1, dueIn: null, seenAgo: 30 * MINUTE },
];

function toItem(row: SampleRow, now: number): InboxItem {
  const kind = INBOX_KINDS[row.kind];
  return {
    id: inboxItemId(row.kind, row.key),
    kind: row.kind,
    category: kind.category,
    count: row.count,
    deadlineAt: row.dueIn === null ? null : now + row.dueIn,
    firstSeenAt: now - row.seenAgo,
    params: { count: row.count },
    // 이동 화면은 종류 표의 주소 ID(매개변수 없는 화면들). 없으면 처리함
    target: kind.route === null ? null : { route: kind.route },
    actions: kind.actions,
    preview: true,
  };
}

/** 서버 정렬 키: (분류 순위, 마감 시각(없으면 그 분류 끝), 처음 생긴 시각, 항목 ID) */
function compare(a: InboxItem, b: InboxItem): number {
  return (
    inboxCategoryRank(a.category) - inboxCategoryRank(b.category) ||
    (a.deadlineAt ?? Number.POSITIVE_INFINITY) - (b.deadlineAt ?? Number.POSITIVE_INFINITY) ||
    a.firstSeenAt - b.firstSeenAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function previewInbox(now: number): InboxListResponse {
  const counts: Record<InboxCategory, number> = {
    threat: 0,
    money_survival: 0,
    stalled: 0,
    decision: 0,
    done: 0,
  };
  const badges: Record<string, number> = {};
  // 줄 수는 묶은 줄이 1이다(서버와 같다)
  for (const row of ROWS) {
    const kind = INBOX_KINDS[row.kind];
    counts[kind.category] += 1;
    if (kind.badge !== null) badges[kind.badge] = (badges[kind.badge] ?? 0) + 1;
  }
  const items = ROWS.map((row) => toItem(row, now)).toSorted(compare);
  return { generatedAt: now, items, counts, badges };
}

export function previewSummary(now: number): SummaryGetResponse {
  return {
    show: true,
    since: now - 9 * HOUR,
    until: now,
    sections: [
      { kind: "production", count: 12, params: { count: 12 }, target: { route: "economy" }, preview: true },
      { kind: "raid", count: 1, params: { count: 1 }, target: { route: "map" }, preview: true },
      { kind: "injury", count: 2, params: { count: 2 }, target: { route: "units" }, preview: true },
      { kind: "world_news", count: 3, params: { count: 3 }, target: null, preview: true },
    ],
  };
}
