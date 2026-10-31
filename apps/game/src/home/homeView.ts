// 홈 화면 규칙 — 순수 함수(시험 대상). 화면 부품(템플릿·카드·편집 시트)이 같이 쓴다(ADR 2026-10-29-app-shell 6절, D-6001·D-6005).
// - 템플릿: 플레이어는 늘 조합(DT-HYBRID). 바꿔 보는 것(편집 시트의 템플릿 칸, 주소 ?template=)은 dev·admin만(사용자 결정 2).
//   화면의 가림은 편의이고, 저장 규칙은 서버(W2)가 지킨다.
// - 템플릿마다 "머리"(처리할 일 목록·타임라인·부관 보고 등)를 카드 격자 위에 따로 그린다. 머리가 된 카드는 격자에서 빼고,
//   편집 목록에서는 "맨 위 고정"으로 보인다. 카드 고르기·순서(D-6001)는 어느 템플릿이든 격자에서 지킨다(D-6005 해석).
// - 처리할 일은 어느 템플릿이든 첫 화면 맨 위(격자 템플릿은 첫 카드)에 있고, 마감 없는 항목도 빠지지 않는다(ADR 37 6절).
import type { Role } from "@terra/shared";
import {
  type CardId,
  type CardSize,
  DEFAULT_HOME_TEMPLATE,
  HOME_CARDS,
  type HomeCardEntry,
  type HomeTemplate,
  type ServerCardId,
  isCardId,
  isCardSizeAllowed,
  isHomeTemplate,
} from "@terra/shared/dashboard";
import {
  INBOX_CATEGORIES,
  type InboxCategory,
  type InboxItem,
  type InboxListResponse,
  isInboxCategory,
} from "@terra/shared/inbox";

/** 템플릿 바꾸기·시안 자료를 쓰는 역할. 서버도 이 역할에만 허용한다(권한 home: template·preview) */
const HOME_TOOL_ROLES: readonly Role[] = ["dev", "admin"];

export function canUseHomeTools(roles: readonly Role[]): boolean {
  return roles.some((role) => HOME_TOOL_ROLES.includes(role));
}

/** 지금 그리는 템플릿과 그 출처: fixed = 플레이어(늘 기본), saved = 저장값, address = 주소 ?template=(저장하지 않음) */
export interface TemplateChoice {
  readonly template: HomeTemplate;
  readonly from: "fixed" | "saved" | "address";
}

export function chooseTemplate(
  roles: readonly Role[],
  saved: HomeTemplate,
  requested: string | undefined,
): TemplateChoice {
  if (!canUseHomeTools(roles)) return { template: DEFAULT_HOME_TEMPLATE, from: "fixed" };
  if (isHomeTemplate(requested)) return { template: requested, from: "address" };
  return { template: saved, from: "saved" };
}

/**
 * 템플릿이 격자 위에 따로 그리는 카드(머리). 격자 템플릿만 머리가 없다(처리할 일도 카드 하나).
 * 조합: 처리할 일 위 고정. 처리함: 처리할 일 목록이 중심. 타임라인: "지금" + 시간 순서. 도시: 거점 + 처리할 일. 브리핑: 부관 보고.
 */
const HERO_CARDS: { readonly [T in HomeTemplate]: readonly CardId[] } = {
  dt_grid: [],
  dt_inbox: ["inbox"],
  dt_timeline: ["inbox", "timeline"],
  dt_city: ["inbox"],
  dt_brief: ["inbox", "briefing"],
  dt_hybrid: ["inbox"],
};

export function heroCards(template: HomeTemplate): readonly CardId[] {
  return HERO_CARDS[template];
}

/** 그릴 수 있는 카드 한 장(아는 카드, 고를 수 있는 크기) */
export interface ShownCard {
  readonly id: CardId;
  readonly size: CardSize;
}

/**
 * 격자(처리함 템플릿은 아래 요약 카드 줄)에 그릴 카드: 저장 순서대로, 아는 카드만, 머리 카드는 뺀다.
 * 격자 템플릿에서 처리할 일 카드가 목록에 없으면(옛 값 등) 맨 앞에 기본 크기로 넣어 그린다(처리할 일 먼저).
 */
export function gridCards(template: HomeTemplate, cards: readonly HomeCardEntry[]): ShownCard[] {
  const hero = HERO_CARDS[template];
  const shown: ShownCard[] = [];
  for (const entry of cards) {
    const { id } = entry;
    if (!isCardId(id) || hero.includes(id)) continue;
    shown.push({ id, size: isCardSizeAllowed(id, entry.size) ? entry.size : HOME_CARDS[id].defaultSize });
  }
  if (template === "dt_grid" && !shown.some((card) => card.id === "inbox")) {
    shown.unshift({ id: "inbox", size: HOME_CARDS.inbox.defaultSize });
  }
  return shown;
}

/** 편집 목록에서 옮기고 빼는 카드: 아는 카드 중 그 템플릿의 머리가 아닌 것. 모르는 카드·머리 카드는 제자리에 남는다 */
export function listedIn(template: HomeTemplate): (entry: HomeCardEntry) => boolean {
  const hero = HERO_CARDS[template];
  return (entry) => isCardId(entry.id) && !hero.includes(entry.id);
}

/** 뺄 수 있는 카드. 처리할 일은 늘 남긴다(D-6001 "처리할 일 먼저", 기술 해석) */
export function isRemovable(id: CardId): boolean {
  return id !== "inbox";
}

function isServerCard(id: CardId): id is ServerCardId {
  return HOME_CARDS[id].source === "server";
}

/** 홈이 받아야 할 자료 */
export interface HomeNeeds {
  /** 화면에 보이는 서버 카드(dashboard.cards의 ids). 정렬해 두어 같은 고르기는 같은 값이다 */
  readonly serverCardIds: readonly ServerCardId[];
  /** 부관 보고가 보이는지(summary.get) */
  readonly summary: boolean;
  /** 시안 자료(dev·admin만 켠다. 서버가 역할을 다시 본다) */
  readonly preview: boolean;
}

export function homeNeeds(
  template: HomeTemplate,
  cards: readonly HomeCardEntry[],
  preview: boolean,
): HomeNeeds {
  const shown = gridCards(template, cards);
  const serverCardIds = shown
    .map((card) => card.id)
    .filter(isServerCard)
    .toSorted();
  const summary = template === "dt_brief" || shown.some((card) => card.id === "briefing");
  return { serverCardIds, summary, preview };
}

/** 같은 자료를 부르는 고르기인지(요청을 다시 보낼지) */
export function sameNeeds(a: HomeNeeds, b: HomeNeeds): boolean {
  return (
    a.preview === b.preview &&
    a.summary === b.summary &&
    a.serverCardIds.length === b.serverCardIds.length &&
    a.serverCardIds.every((id, index) => b.serverCardIds[index] === id)
  );
}

/** 앞 limit줄과 나머지(처리함에서 더 보기) */
export function headItems(
  items: readonly InboxItem[],
  limit: number,
): { shown: readonly InboxItem[]; hidden: readonly InboxItem[] } {
  return { shown: items.slice(0, limit), hidden: items.slice(limit) };
}

/**
 * 가린 줄(처리함에서 더 보기)의 분류별 수 — 분류 순서대로, 0인 분류는 뺀다. 줄 수가 모자란 칸(격자의 2×1 카드 3줄 등)에서도
 * 멈춤·완료처럼 마감 없는 줄이 많은 분류가 이름과 수로 보이게 한다(ADR 37 6절 "마감 없는 항목도 빠지지 않는다"의 기술 해석).
 * 이 기기가 모르는 분류(더 새 서버)의 줄은 전체 수에만 든다.
 */
export function hiddenCounts(hidden: readonly InboxItem[]): { category: InboxCategory; count: number }[] {
  return INBOX_CATEGORIES.map((category) => ({
    category,
    count: hidden.filter((item) => item.category === category).length,
  })).filter((entry) => entry.count > 0);
}

/**
 * 타임라인 템플릿: 마감 없는 할 일("지금")은 받은 순서대로(서버 정렬 = 분류 순), 마감 있는 일은 마감 순서(같으면 받은 순서),
 * 완료(확인할 소식, D-6006)는 맨 끝에 따로 둔다. 마감 없는 항목도 빠지지 않는다.
 */
export function splitTimeline(items: readonly InboxItem[]): {
  now: InboxItem[];
  upcoming: InboxItem[];
  done: InboxItem[];
} {
  const pending = items.filter((item) => item.category !== "done");
  const now = pending.filter((item) => item.deadlineAt === null);
  const upcoming = pending
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.deadlineAt !== null)
    .toSorted((a, b) => (a.item.deadlineAt ?? 0) - (b.item.deadlineAt ?? 0) || a.index - b.index)
    .map(({ item }) => item);
  const done = items.filter((item) => item.category === "done");
  return { now, upcoming, done };
}

/** 마감 있는 일만 마감 순서로(타임라인 카드) */
export function upcomingItems(items: readonly InboxItem[]): InboxItem[] {
  return splitTimeline(items).upcoming;
}

/** 처리함 템플릿의 묶음 열쇠: 아는 분류, 또는 이 기기가 모르는 분류(더 새 서버)를 모은 "그 밖의 알림" */
export type InboxGroupKey = InboxCategory | "other";

/** 분류별 묶음(처리함 템플릿). 분류 순서대로, 분류 안은 받은 순서, 빈 분류는 뺀다. 모르는 분류의 줄은 끝의 "other" 묶음에 */
export function groupByCategory(items: readonly InboxItem[]): { key: InboxGroupKey; items: InboxItem[] }[] {
  const groups: { key: InboxGroupKey; items: InboxItem[] }[] = INBOX_CATEGORIES.map((category) => ({
    key: category,
    items: items.filter((item) => item.category === category),
  }));
  groups.push({ key: "other", items: items.filter((item) => !isInboxCategory(item.category)) });
  return groups.filter((group) => group.items.length > 0);
}

/** 분류별 줄 수 중 0이 아닌 것(접은 처리할 일 머리). 서버가 센 값(counts)을 쓴다 */
export function nonZeroCounts(
  counts: InboxListResponse["counts"],
): { category: InboxCategory; count: number }[] {
  return INBOX_CATEGORIES.map((category) => ({ category, count: counts[category] })).filter(
    (entry) => entry.count > 0,
  );
}
