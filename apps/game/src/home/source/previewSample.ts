// [임시] 시안 자료 — W3이 합쳐지기 전 dev·admin 홈 시험용. W3에서는 서버(apps/server/src/inbox/preview.ts)가 만들고 이 파일은 지운다.
// 값은 W3 서버의 시안 자료(가지 work/app-shell-w3, 커밋 5ea6c4c)를 서버가 묶고 정렬한 결과와 같게 두었다. 그래서 W3을 꽂아도 홈 모습이 같다:
// 종류 표의 8종류(모두 planned), 5분류·묶음·마감 없음·바로 처리 0~2개, 곳 이름(place) Nova·Vega, 키는 preview_로 시작, 모든 항목 preview: true.
// 복귀 요약은 칸 4종(생산·습격과 방어·부상·세계 소식)이고 8시간 전에 확인한 것으로 본다. 수는 시안일 뿐 기획 수치가 아니다.
// 사용자 결정 2: 사이보그·보유 유닛·자산·세력 카드는 시안에서도 "준비 중"이다(standInQueries.ts).
import {
  INBOX_KINDS,
  type InboxCategory,
  type InboxItem,
  type InboxKindId,
  type InboxListResponse,
  type InboxParams,
  type SummaryGetResponse,
  inboxItemId,
} from "@terra/shared/inbox";
import type { RouteTarget } from "@terra/shared";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 묶고 정렬한 뒤의 한 줄(W3 order.ts 결과): 마감·처음 생긴 시각은 묶음에서 가장 이른 것, 값·갈 곳은 가장 급한 건의 것 */
interface SampleRow {
  readonly kind: InboxKindId;
  readonly key: string;
  readonly count: number;
  /** 지금부터 마감까지(ms). null = 마감 없음 */
  readonly dueIn: number | null;
  /** 지금보다 얼마 전에 처음 생겼는지(ms) */
  readonly seenAgo: number;
  readonly params: InboxParams;
  readonly target: RouteTarget | null;
}

/** 서버 정렬 차례(분류 순위 → 마감(없으면 분류 끝) → 처음 생긴 시각 → 항목 ID) 그대로 */
const ROWS: readonly SampleRow[] = [
  {
    kind: "wave_incoming",
    key: "preview_wave_1",
    count: 1,
    dueIn: 2 * HOUR,
    seenAgo: 20 * MINUTE,
    params: { place: "Nova" },
    target: { route: "map" },
  },
  {
    kind: "siege_declared",
    key: "preview_siege_1",
    count: 1,
    dueIn: 26 * HOUR,
    seenAgo: 3 * HOUR,
    params: { place: "Nova" },
    target: { route: "faction" },
  },
  {
    kind: "goods_spoiling",
    key: "preview_store_1",
    count: 2,
    dueIn: 5 * HOUR,
    seenAgo: 6 * HOUR,
    params: { place: "Nova" },
    target: { route: "economy" },
  },
  {
    kind: "unit_injured",
    key: "preview_base_1",
    count: 2,
    dueIn: null,
    seenAgo: 60 * MINUTE,
    params: { place: "Nova" },
    target: { route: "units" },
  },
  {
    kind: "building_stopped",
    key: "preview_base_2",
    count: 1,
    dueIn: null,
    seenAgo: 5 * HOUR,
    params: { place: "Vega" },
    target: { route: "map" },
  },
  {
    kind: "unit_idle",
    key: "preview_base_1",
    count: 6,
    dueIn: null,
    seenAgo: 45 * MINUTE,
    params: { place: "Nova" },
    target: { route: "units" },
  },
  {
    kind: "contract_match",
    key: "preview_contract_1",
    count: 1,
    dueIn: 20 * HOUR,
    seenAgo: 15 * MINUTE,
    params: {},
    target: null,
  },
  {
    kind: "craft_done",
    key: "preview_event_1",
    count: 1,
    dueIn: null,
    seenAgo: 10 * MINUTE,
    params: {},
    target: { route: "economy" },
  },
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
    params: row.params,
    target: row.target,
    actions: kind.actions,
    preview: true,
  };
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
  return { generatedAt: now, items: ROWS.map((row) => toItem(row, now)), counts, badges };
}

export function previewSummary(now: number): SummaryGetResponse {
  return {
    show: true,
    since: now - 8 * HOUR,
    until: now,
    sections: [
      { kind: "production", count: 3, params: {}, target: { route: "economy" }, preview: true },
      { kind: "raid", count: 1, params: {}, target: { route: "map" }, preview: true },
      { kind: "injury", count: 2, params: {}, target: { route: "units" }, preview: true },
      { kind: "world_news", count: 4, params: {}, target: null, preview: true },
    ],
  };
}
