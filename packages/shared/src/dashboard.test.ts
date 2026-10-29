// 홈 대시보드 자료 시험 — 카드·템플릿 목록, 기본 카드, parseHome(모르는 ID 남기기·크기·겹침·상한), 카드 상태 타입(ADR 2026-10-29-app-shell 6·13절)
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CARD_SIZES,
  CARD_STATUSES,
  type CardId,
  type CardState,
  DEFAULT_HOME_TEMPLATE,
  HOME_CARDS,
  HOME_CARDS_MAX,
  HOME_TEMPLATES,
  type ServerCardData,
  type ServerCardId,
  defaultHomeCards,
  isCardId,
  isCardSize,
  isCardSizeAllowed,
  isHomeTemplate,
  parseHome,
} from "./dashboard.ts";
import { ROLES } from "./roles.ts";
import { SAVED_ID_PATTERN } from "./savedId.ts";

/** 그 출처의 카드 ID(표 순서) */
function bySource(source: string): string[] {
  return Object.entries(HOME_CARDS)
    .filter(([, card]) => card.source === source)
    .map(([id]) => id);
}

/** 타입 검사(pnpm typecheck)만 하는 함수 — 실행하지 않는다. @ts-expect-error 줄에 타입 오류가 없으면 타입 검사가 실패한다 */
function cardStateTypeErrors(): CardState[] {
  // @ts-expect-error 자료 모양이 정해지지 않은 카드는 ready를 보낼 수 없다
  const ready: CardState = { id: "units", status: "ready", data: {} };
  // @ts-expect-error 서버 카드가 아닌 카드(기기 카드)
  const device: CardState = { id: "maps", status: "empty" };
  return [ready, device];
}

const PLAYER_DEFAULT = [
  { id: "inbox", size: "2x1" },
  { id: "cyborg", size: "1x1" },
  { id: "units", size: "1x1" },
  { id: "assets", size: "1x1" },
  { id: "faction", size: "1x1" },
  { id: "maps", size: "2x1" },
];

describe("카드 목록", () => {
  it("ADR 37 6절의 카드 9개, 크기 3가지", () => {
    expect(Object.keys(HOME_CARDS)).toEqual([
      "inbox",
      "cyborg",
      "units",
      "assets",
      "faction",
      "timeline",
      "briefing",
      "maps",
      "diagnostics",
    ]);
    expect(CARD_SIZES).toEqual(["1x1", "2x1", "2x2"]);
  });

  it("카드 ID는 저장되는 ID 모양이고, 기본 크기는 고를 수 있는 크기 안에 있다", () => {
    for (const [id, card] of Object.entries(HOME_CARDS)) {
      expect(id).toMatch(SAVED_ID_PATTERN);
      expect(card.sizes.length, id).toBeGreaterThan(0);
      expect(new Set(card.sizes).size, id).toBe(card.sizes.length);
      for (const size of card.sizes) expect(CARD_SIZES, id).toContain(size);
      expect(card.sizes, id).toContain(card.defaultSize);
    }
  });

  it("자료 출처: 서버 카드 4장(사이보그·보유 유닛·자산·세력), 처리할 일 묶음 3장, 기기 2장", () => {
    expect(bySource("server")).toEqual(["cyborg", "units", "assets", "faction"]);
    expect(bySource("inbox")).toEqual(["inbox", "timeline", "briefing"]);
    expect(bySource("device")).toEqual(["maps", "diagnostics"]);
    expectTypeOf<ServerCardId>().toEqualTypeOf<"cyborg" | "units" | "assets" | "faction">();
    // 카드별 ready 자료 자리는 서버 카드와 같아야 한다
    expectTypeOf<keyof ServerCardData>().toEqualTypeOf<ServerCardId>();
  });

  it("판별 함수", () => {
    expect(isCardId("timeline")).toBe(true);
    expect(isCardId("toString")).toBe(false);
    expect(isCardSize("2x2")).toBe(true);
    expect(isCardSize("3x1")).toBe(false);
    expect(isCardSizeAllowed("maps", "2x1")).toBe(true);
    expect(isCardSizeAllowed("maps", "1x1")).toBe(false);
    expect(isCardSizeAllowed("cyborg", "2x2")).toBe(false);
  });
});

describe("템플릿", () => {
  it("6개(D-6005), 기본은 조합(DT-HYBRID, 사용자 결정 2)", () => {
    expect(HOME_TEMPLATES).toEqual([
      "dt_grid",
      "dt_inbox",
      "dt_timeline",
      "dt_city",
      "dt_brief",
      "dt_hybrid",
    ]);
    expect(DEFAULT_HOME_TEMPLATE).toBe("dt_hybrid");
    for (const id of HOME_TEMPLATES) expect(id).toMatch(SAVED_ID_PATTERN);
    expect(isHomeTemplate("dt_city")).toBe(true);
    expect(isHomeTemplate("DT-CITY")).toBe(false);
  });
});

describe("기본 카드", () => {
  it("처리할 일 → 네 카드(1×1) → 지도(2×1). 연결·성능은 dev·admin의 기본에만", () => {
    expect(defaultHomeCards(["player"])).toEqual(PLAYER_DEFAULT);
    expect(defaultHomeCards([])).toEqual(PLAYER_DEFAULT);
    expect(defaultHomeCards(["gm"])).toEqual(PLAYER_DEFAULT);
    for (const roles of [["dev"], ["admin"], ["player", "dev"]] as const) {
      expect(defaultHomeCards(roles)).toEqual([...PLAYER_DEFAULT, { id: "diagnostics", size: "2x1" }]);
    }
    // 역할 목록이 늘면 위 기대값을 다시 본다
    expect(ROLES).toEqual(["player", "gm", "dev", "admin"]);
  });
});

describe("parseHome", () => {
  it("저장한 적 없으면(값·cards가 없음) 그 역할의 기본값", () => {
    expect(parseHome(undefined, ["player"])).toEqual({ template: "dt_hybrid", cards: PLAYER_DEFAULT });
    expect(parseHome({ template: "dt_city" }, ["admin"])).toEqual({
      template: "dt_city",
      cards: defaultHomeCards(["admin"]),
    });
    expect(parseHome("home", ["player"]).cards).toEqual(PLAYER_DEFAULT);
  });

  it("빈 카드 목록은 유저가 모두 뺀 것이라 그대로 둔다", () => {
    expect(parseHome({ cards: [] }, ["player"]).cards).toEqual([]);
  });

  it("모르는 템플릿은 기본값으로 읽는다", () => {
    expect(parseHome({ template: "dt_space", cards: [] }, ["dev"]).template).toBe("dt_hybrid");
    expect(parseHome({ template: 3, cards: [] }, ["dev"]).template).toBe("dt_hybrid");
  });

  it("모르는 카드(더 새 버전이 넣은 것)는 크기와 함께 그대로 남는다", () => {
    const cards = [
      { id: "trade_watch", size: "3x1" },
      { id: "units", size: "2x1" },
    ];
    expect(parseHome({ cards }, ["player"]).cards).toEqual(cards);
  });

  it("아는 카드의 고를 수 없는 크기는 기본 크기로 바꾼다", () => {
    expect(
      parseHome(
        {
          cards: [
            { id: "maps", size: "1x1" },
            { id: "cyborg", size: "9x9" },
            { id: "diagnostics", size: "2x2" },
          ],
        },
        ["player"],
      ).cards,
    ).toEqual([
      { id: "maps", size: "2x1" },
      { id: "cyborg", size: "1x1" },
      { id: "diagnostics", size: "2x2" },
    ]);
  });

  it("모양이 틀린 카드는 버리고, 겹친 카드는 앞의 것만, 상한을 넘으면 뒤를 버린다", () => {
    const parsed = parseHome(
      {
        cards: [
          { id: "inbox", size: "2x2" },
          { id: "inbox", size: "2x1" },
          { id: "Bad Id", size: "1x1" },
          { id: "units" },
          "faction",
          null,
          { id: "assets", size: "1x1", extra: true },
        ],
      },
      ["player"],
    );
    // 카드 안의 모르는 칸(extra)은 남는다
    expect(parsed.cards).toEqual([
      { id: "inbox", size: "2x2" },
      { id: "assets", size: "1x1", extra: true },
    ]);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `card_${i}`, size: "1x1" }));
    const capped = parseHome({ cards: many }, ["player"]).cards;
    expect(capped).toHaveLength(HOME_CARDS_MAX);
    expect(capped.at(-1)).toEqual({ id: "card_23", size: "1x1" });
  });
});

describe("카드 상태 전송 타입", () => {
  it("not_ready·empty·ready. 지금은 ready 자료가 없다(보낼 수 없다)", () => {
    expect(CARD_STATUSES).toEqual(["not_ready", "empty", "ready"]);
    const states: CardState[] = [
      { id: "cyborg", status: "not_ready" },
      { id: "faction", status: "empty" },
    ];
    expect(states.map((state) => state.status)).toEqual(["not_ready", "empty"]);
    expect(cardStateTypeErrors).toBeTypeOf("function");
    expectTypeOf<CardState<"cyborg">["id"]>().toEqualTypeOf<"cyborg">();
    expectTypeOf<CardId>().toEqualTypeOf<keyof typeof HOME_CARDS>();
  });
});
