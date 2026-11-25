// 홈 카드 목록 바꾸기 시험 — 보이는 카드끼리만 옮기기, 모르는 카드·고정 카드 제자리, 자리 알림 값, 크기·더하기·빼기·기본값,
// 뺀 뒤 초점을 옮길 줄
import { HOME_CARDS_MAX, type HomeCardEntry, defaultHomeCards, isCardId } from "@terra/shared/dashboard";
import { describe, expect, it } from "vitest";
import {
  addCard,
  addableCards,
  moveCard,
  nearestRemovable,
  removeCard,
  resetCards,
  resizeCard,
} from "./reorder.ts";

const card = (id: string, size = "1x1", extra: Record<string, unknown> = {}): HomeCardEntry => ({
  id,
  size,
  ...extra,
});
const ids = (cards: readonly HomeCardEntry[]): string[] => cards.map((entry) => entry.id);

/** 아는 카드면 보인다(조합 템플릿처럼 처리할 일을 위에 고정하면 그것도 뺀다) */
const knownListed = (entry: HomeCardEntry): boolean => isCardId(entry.id);
const hybridListed = (entry: HomeCardEntry): boolean => isCardId(entry.id) && entry.id !== "inbox";

describe("moveCard", () => {
  const cards = [card("inbox", "2x1"), card("cyborg"), card("units"), card("assets"), card("faction")];

  it("한 칸 위·아래, 맨 위, 자리 번호로 옮기고 새 자리·개수를 돌려준다", () => {
    expect(moveCard(cards, knownListed, "units", "up")).toEqual({
      cards: [card("inbox", "2x1"), card("units"), card("cyborg"), card("assets"), card("faction")],
      position: 2,
      total: 5,
    });
    expect(ids(moveCard(cards, knownListed, "units", "down")?.cards ?? [])).toEqual([
      "inbox",
      "cyborg",
      "assets",
      "units",
      "faction",
    ]);
    const top = moveCard(cards, knownListed, "faction", "top");
    expect(ids(top?.cards ?? [])).toEqual(["faction", "inbox", "cyborg", "units", "assets"]);
    expect(top?.position).toBe(1);
    const to = moveCard(cards, knownListed, "inbox", 3);
    expect(ids(to?.cards ?? [])).toEqual(["cyborg", "units", "assets", "inbox", "faction"]);
    expect(to?.position).toBe(4);
  });

  it("끝에서 더 옮기면 같은 배열을 그대로 돌려준다(저장하지 않아도 된다)", () => {
    const first = moveCard(cards, knownListed, "inbox", "up");
    expect(first?.cards).toBe(cards);
    expect(first?.position).toBe(1);
    const last = moveCard(cards, knownListed, "faction", "down");
    expect(last?.cards).toBe(cards);
    expect(last?.position).toBe(5);
    // 범위 밖 자리 번호는 끝으로 맞춘다
    expect(ids(moveCard(cards, knownListed, "cyborg", 99)?.cards ?? []).at(-1)).toBe("cyborg");
    expect(ids(moveCard(cards, knownListed, "faction", -3)?.cards ?? [])[0]).toBe("faction");
  });

  it("없는 카드·보이지 않는 카드는 옮기지 않는다(null)", () => {
    expect(moveCard(cards, knownListed, "timeline", "up")).toBeNull();
    expect(moveCard(cards, hybridListed, "inbox", "down")).toBeNull();
  });

  it("모르는 카드와 고정 카드는 전체 목록의 같은 자리에 남는다", () => {
    const mixed = [
      card("inbox", "2x1"),
      card("future_card", "3x1", { color: "gold" }),
      card("cyborg"),
      card("units"),
      card("another_future", "1x1"),
      card("assets"),
    ];
    const result = moveCard(mixed, hybridListed, "assets", "top");
    expect(ids(result?.cards ?? [])).toEqual([
      "inbox",
      "future_card",
      "assets",
      "cyborg",
      "another_future",
      "units",
    ]);
    // 보이는 것은 cyborg·units·assets 셋이다
    expect(result?.position).toBe(1);
    expect(result?.total).toBe(3);
    // 모르는 카드 안의 칸은 그대로 남는다
    expect(result?.cards[1]).toEqual({ id: "future_card", size: "3x1", color: "gold" });
  });

  it("원래 배열을 고치지 않는다", () => {
    const before = cards.map((entry) => ({ ...entry }));
    moveCard(cards, knownListed, "units", "top");
    expect(cards).toEqual(before);
  });
});

describe("addCard·removeCard", () => {
  it("더하면 끝에 기본 크기로 붙고, 보이는 개수 중 마지막 자리다", () => {
    const cards = [card("inbox", "2x1"), card("future_card"), card("cyborg")];
    const result = addCard(cards, hybridListed, "timeline");
    expect(result?.cards.at(-1)).toEqual({ id: "timeline", size: "2x1" });
    expect(result?.position).toBe(2);
    expect(result?.total).toBe(2);
  });

  it("이미 있는 카드, 가득 찬 목록에는 더하지 않는다", () => {
    expect(addCard([card("cyborg")], knownListed, "cyborg")).toBeNull();
    const full = Array.from({ length: HOME_CARDS_MAX }, (_, index) => card(`future_${index}`));
    expect(addCard(full, knownListed, "cyborg")).toBeNull();
  });

  it("빼면 그 카드만 빠지고 모르는 카드는 남는다", () => {
    const cards = [card("future_card"), card("cyborg"), card("units")];
    const result = removeCard(cards, knownListed, "cyborg");
    expect(ids(result?.cards ?? [])).toEqual(["future_card", "units"]);
    expect(result?.total).toBe(1);
    expect(removeCard(cards, knownListed, "assets")).toBeNull();
  });
});

describe("resizeCard", () => {
  it("고를 수 있는 크기로만 바꾸고 카드 안의 다른 칸은 남긴다", () => {
    const cards = [card("inbox", "2x1", { pinnedNote: 1 }), card("cyborg")];
    const result = resizeCard(cards, knownListed, "inbox", "2x2");
    expect(result?.cards[0]).toEqual({ id: "inbox", size: "2x2", pinnedNote: 1 });
    expect(result?.position).toBe(1);
    // 사이보그 카드는 2×2를 고를 수 없다
    expect(resizeCard(cards, knownListed, "cyborg", "2x2")).toBeNull();
    // 모르는 카드의 크기는 바꾸지 않는다
    expect(resizeCard([card("future_card")], knownListed, "future_card", "2x1")).toBeNull();
  });
});

describe("resetCards·addableCards", () => {
  it("역할의 기본 카드로 되돌리되 모르는 카드는 뒤에 남긴다", () => {
    const cards = [card("future_card"), card("timeline", "2x2")];
    const player = resetCards(cards, knownListed, ["player"]);
    expect(player.cards).toEqual([...defaultHomeCards(["player"]), card("future_card")]);
    expect(player.total).toBe(defaultHomeCards(["player"]).length);
    // dev·admin 기본에는 연결·성능이 있다
    expect(ids(resetCards([], knownListed, ["admin"]).cards)).toContain("diagnostics");
  });

  it("홈에 없는 아는 카드를 카드 목록 순서로 돌려준다", () => {
    expect(addableCards(defaultHomeCards(["player"]))).toEqual(["timeline", "briefing", "diagnostics"]);
    expect(addableCards([card("future_card")])).toHaveLength(10);
  });
});

/** 처리할 일 카드만 뺄 수 없다(편집 시트와 같다) */
const removable = (entry: HomeCardEntry): boolean => entry.id !== "inbox";

describe("nearestRemovable", () => {
  const rows = [card("inbox", "2x1"), card("cyborg"), card("units"), card("assets")];

  it("가장 가까운 줄, 거리가 같으면 뒤 줄이 먼저다", () => {
    expect(nearestRemovable(rows, 2, removable)?.id).toBe("assets");
    expect(nearestRemovable(rows, 3, removable)?.id).toBe("units");
  });

  it("가까운 줄이 뺄 수 없는 카드(처리할 일)면 건너뛴다 — 처리할 일 바로 뒤 줄을 뺄 때(검토 지적)", () => {
    // 처리할 일을 아래로 옮긴 목록: 사이보그 · 처리할 일 · 보유 유닛
    const moved = [card("cyborg"), card("inbox", "2x1"), card("units")];
    expect(nearestRemovable(moved, 0, removable)?.id).toBe("units");
  });

  it("뺄 수 있는 줄이 없으면 null(시트 제목으로)", () => {
    expect(nearestRemovable([card("cyborg"), card("inbox", "2x1")], 0, removable)).toBeNull();
    expect(nearestRemovable([card("cyborg")], 0, removable)).toBeNull();
  });
});
