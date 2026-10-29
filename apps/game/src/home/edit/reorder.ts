// 홈 카드 목록 바꾸기 — 순수 함수(시험 대상). 편집 시트의 버튼(↑·↓·맨 위로·크기·더하기·빼기)과 끌어 옮기기가 같은 함수를 쓴다
// (ADR 2026-10-29-app-shell 6·10절). 결과를 그대로 저장한다(mergeHome의 cards).
// - 옮기기는 "편집 목록에 보이는 카드"끼리만 자리를 바꾼다. 보이지 않는 칸은 제자리에 남는다:
//   이 기기가 모르는 카드(더 새 버전이 넣은 것, 지우지 않는다)와 템플릿이 위에 고정한 처리할 일 카드.
// - 결과에 "보이는 n개 중 k번째"를 함께 돌려준다. 알림 영역이 "7개 중 3번째로 옮겼습니다"로 읽는다.
// - 카드 안의 모르는 칸(더 새 버전이 넣은 것)은 건드리지 않는다(크기를 바꿀 때도 나머지 칸은 그대로).
import {
  type CardId,
  type CardSize,
  HOME_CARDS,
  HOME_CARDS_MAX,
  type HomeCardEntry,
  defaultHomeCards,
  isCardId,
  isCardSizeAllowed,
} from "@terra/shared/dashboard";
import type { Role } from "@terra/shared";

/** 편집 목록에 보이는 카드인지(옮길 수 있는 카드) */
export type ListedPredicate = (entry: HomeCardEntry) => boolean;

/** 옮길 곳: 한 칸 위·아래, 맨 위, 또는 보이는 목록의 자리(0부터) */
export type MoveTarget = "up" | "down" | "top" | number;

export interface ListChange {
  readonly cards: readonly HomeCardEntry[];
  /** 바꾼 카드의 자리(1부터, 보이는 카드 기준). 뺀 카드면 0 */
  readonly position: number;
  /** 보이는 카드 수(바꾼 뒤) */
  readonly total: number;
}

/** 보이는 카드의 자리(전체 목록의 index) */
function listedSlots(cards: readonly HomeCardEntry[], listed: ListedPredicate): number[] {
  const slots: number[] = [];
  cards.forEach((entry, index) => {
    if (listed(entry)) slots.push(index);
  });
  return slots;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 보이는 카드 하나를 옮긴다. 없는 카드면 null. 이미 그 자리면 cards를 그대로(같은 배열) 돌려준다.
 * 보이지 않는 칸은 전체 목록의 같은 index에 그대로 남는다.
 */
export function moveCard(
  cards: readonly HomeCardEntry[],
  listed: ListedPredicate,
  id: string,
  target: MoveTarget,
): ListChange | null {
  const slots = listedSlots(cards, listed);
  const order = slots.map((slot) => cards[slot]).filter((entry) => entry !== undefined);
  const from = order.findIndex((entry) => entry.id === id);
  if (from < 0) return null;
  const wanted = target === "up" ? from - 1 : target === "down" ? from + 1 : target === "top" ? 0 : target;
  const to = clamp(Math.trunc(wanted), 0, order.length - 1);
  if (to === from) return { cards, position: from + 1, total: order.length };
  const [entry] = order.splice(from, 1);
  if (entry === undefined) return null;
  order.splice(to, 0, entry);
  const next = cards.slice();
  slots.forEach((slot, k) => {
    const moved = order[k];
    if (moved !== undefined) next[slot] = moved;
  });
  return { cards: next, position: to + 1, total: order.length };
}

/** 카드를 끝에 더한다. 이미 있거나 모르는 카드거나 목록이 가득(24장)이면 null */
export function addCard(
  cards: readonly HomeCardEntry[],
  listed: ListedPredicate,
  id: CardId,
): ListChange | null {
  if (cards.some((entry) => entry.id === id) || cards.length >= HOME_CARDS_MAX) return null;
  const next = [...cards, { id, size: HOME_CARDS[id].defaultSize }];
  const total = listedSlots(next, listed).length;
  return { cards: next, position: total, total };
}

/** 카드를 뺀다. 없으면 null */
export function removeCard(
  cards: readonly HomeCardEntry[],
  listed: ListedPredicate,
  id: string,
): ListChange | null {
  if (!cards.some((entry) => entry.id === id)) return null;
  const next = cards.filter((entry) => entry.id !== id);
  return { cards: next, position: 0, total: listedSlots(next, listed).length };
}

/** 카드 크기를 바꾼다. 없는 카드·고를 수 없는 크기면 null. 카드 안의 다른 칸은 그대로 둔다 */
export function resizeCard(
  cards: readonly HomeCardEntry[],
  listed: ListedPredicate,
  id: string,
  size: CardSize,
): ListChange | null {
  const index = cards.findIndex((entry) => entry.id === id);
  const entry = cards[index];
  if (entry === undefined || !isCardId(entry.id) || !isCardSizeAllowed(entry.id, size)) return null;
  const next = cards.slice();
  next[index] = { ...entry, size };
  const slots = listedSlots(next, listed);
  return { cards: next, position: slots.indexOf(index) + 1, total: slots.length };
}

/**
 * [카드 기본값으로] — 그 역할의 기본 카드로 되돌린다.
 * 이 기기가 모르는 카드(더 새 버전이 넣은 것)는 여기서 고를 수 없으므로 지우지 않고 뒤에 그대로 둔다.
 */
export function resetCards(
  cards: readonly HomeCardEntry[],
  listed: ListedPredicate,
  roles: readonly Role[],
): ListChange {
  const unknown = cards.filter((entry) => !isCardId(entry.id));
  const next = [...defaultHomeCards(roles), ...unknown].slice(0, HOME_CARDS_MAX);
  return { cards: next, position: 0, total: listedSlots(next, listed).length };
}

/** 아직 홈에 없는 아는 카드(카드 목록 순서 = 카드 더하기 순서) */
export function addableCards(cards: readonly HomeCardEntry[]): CardId[] {
  const present = new Set(cards.map((entry) => entry.id));
  return Object.keys(HOME_CARDS)
    .filter(isCardId)
    .filter((id) => !present.has(id));
}
