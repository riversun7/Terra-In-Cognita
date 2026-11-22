// 열린 쿠데타 맞선 편 시험(줄기 fixes-d592 — 사용자 결정 D-592 2581 (4): 쿠데타 중 같은 나라 공격은 신용 벌점 없이 가담 벌점만)
import { describe, expect, it } from "vitest";
import { coupTruceOf } from "../credit/coupTruce.ts";
import type { CoupRow, CoupSideRow } from "./coupStore.ts";
import { coupFronts, opposedInCoup, refreshCoupTruce, sideIn } from "./coupTruce.ts";
import type { StateRow } from "./store.ts";

const coup = (
  id: number,
  nationId: number,
  houseKey: CoupRow["houseKey"],
  userId: string | null,
): CoupRow => ({
  id,
  nationId,
  houseKey,
  userId,
  openedAtMs: 0,
  gatherUntilMs: 1_000,
  cityId: null,
  status: "gathering",
  result: null,
  decidedAtMs: null,
  battleId: null,
});

/** 지배 가문 기록 없음(의결 틱 고리 시험) */
const states = async () => new Map<number, StateRow>();

const side = (coupId: number, userId: string, which: CoupSideRow["side"]): CoupSideRow => ({
  coupId,
  joinerKey: `u:${userId}`,
  userId,
  side: which,
  power: 0,
  joinedAtMs: 0,
});

describe("열린 쿠데타 맞선 편", () => {
  it("혁명군 = 일으킨 사람·혁명군 참가·일으킨 가문, 정부군 = 정부군 참가·지배 가문 — 참가 줄이 가문보다 앞선다", () => {
    const fronts = coupFronts(
      [coup(1, 50, "p:7", "boss")],
      new Map([[1, [side(1, "r1", "rebel"), side(1, "g1", "government"), side(1, "turncoat", "rebel")]]]),
      () => "p:8",
    );
    const front = fronts[0];
    if (!front) throw new Error("front");
    expect(sideIn(front, { userId: "boss", house: 7 })).toBe("rebel");
    expect(sideIn(front, { userId: "r1", house: undefined })).toBe("rebel");
    expect(sideIn(front, { userId: "g1", house: undefined })).toBe("government");
    expect(sideIn(front, { userId: "member7", house: 7 })).toBe("rebel");
    expect(sideIn(front, { userId: "member8", house: 8 })).toBe("government");
    // 지배 가문원이 혁명군에 들었다
    expect(sideIn(front, { userId: "turncoat", house: 8 })).toBe("rebel");
    expect(sideIn(front, { userId: "bystander", house: 3 })).toBeUndefined();
    expect(sideIn(front, { userId: null, house: 8 })).toBe("government");
  });

  it("맞선 편끼리만 — 같은 편·편이 아닌 사람은 아니다. NPC 지배 가문(n:)·지배 없음은 가문 편이 없다", () => {
    const fronts = coupFronts(
      [coup(1, 50, "n:3", null)],
      new Map([[1, [side(1, "r1", "rebel")]]]),
      () => "n:4",
    );
    expect(opposedInCoup(fronts, { userId: "r1", house: undefined }, { userId: "x", house: 4 })).toBe(false);
    const player = coupFronts(
      [coup(2, 60, "p:7", "boss")],
      new Map([[2, [side(2, "g1", "government"), side(2, "r2", "rebel")]]]),
      () => null,
    );
    expect(opposedInCoup(player, { userId: "boss", house: 7 }, { userId: "g1", house: undefined })).toBe(
      true,
    );
    expect(
      opposedInCoup(player, { userId: "g1", house: undefined }, { userId: "r2", house: undefined }),
    ).toBe(true);
    expect(opposedInCoup(player, { userId: "boss", house: 7 }, { userId: "r2", house: undefined })).toBe(
      false,
    );
    expect(opposedInCoup(player, { userId: "boss", house: 7 }, { userId: "other", house: 2 })).toBe(false);
    expect(opposedInCoup([], { userId: "boss", house: 7 }, { userId: "g1", house: undefined })).toBe(false);
  });

  it("의결 틱 고리: 열린 쿠데타 편으로 원장에 붙인다(주인 → 사용자·가문), 쿠데타가 끝나면 맞선 편이 없다", async () => {
    const ledger = {};
    const persistence = {
      ledger,
      owners: new Map([
        [1, { userId: "boss", factionId: null }],
        [2, { userId: "g1", factionId: null }],
        [3, { userId: "bystander", factionId: null }],
      ]),
    };
    let open = [coup(1, 50, "p:7", "boss")];
    const coups = {
      gathering: async () => open,
      sides: async () => [side(1, "g1", "government")],
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 고리는 저장 층의 원장·주인 표만 읽는다
    const world = { persistence } as unknown as Parameters<typeof refreshCoupTruce>[0]["world"];
    await refreshCoupTruce({ world, coups, states });
    expect(coupTruceOf(ledger)?.(1, 2)).toBe(true);
    expect(coupTruceOf(ledger)?.(2, 1)).toBe(true);
    expect(coupTruceOf(ledger)?.(1, 3)).toBe(false);
    expect(coupTruceOf(ledger)?.(1, 99)).toBe(false);
    open = [];
    await refreshCoupTruce({ world, coups, states });
    expect(coupTruceOf(ledger)?.(1, 2)).toBe(false);
  });
});
