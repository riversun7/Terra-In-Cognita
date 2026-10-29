// 처리할 일 정렬·묶기 시험(ADR 2026-10-29-app-shell 7·13절, D-6006·D-6009)
// 분류 순위, 마감 없는 항목은 분류 끝, 묶음 개수·가장 이른 마감, 같은 입력 → 같은 순서·같은 항목 ID
import type { InboxKindId } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import { orderInbox } from "./order.ts";
import type { InboxEntry } from "./types.ts";

const NOW = 1_761_700_000_000;
const MIN = 60_000;

/** 건 하나. 적지 않은 칸은 마감 없음·지금 생김·값 없음·처리함으로 */
function entry(kind: InboxKindId, key: string, extra: Partial<InboxEntry> = {}): InboxEntry {
  return { kind, key, deadlineAt: null, firstSeenAt: NOW, params: {}, target: null, ...extra };
}

/** 줄 ID 차례 */
const ids = (entries: readonly InboxEntry[]) => orderInbox(entries, NOW).items.map((item) => item.id);

/** 작은 결정적 섞기(선형 합동 난수로 만든 열쇠로 정렬). 시험이 늘 같은 순서들을 본다 */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  let state = seed;
  const keyed = list.map((value) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return { key: state, value };
  });
  return keyed.toSorted((a, b) => a.key - b.key).map((item) => item.value);
}

describe("처리할 일 정렬", () => {
  it("분류 순서: 위협 → 돈·생존 → 멈춤 → 제안·결정 → 완료(D-6009)", () => {
    const entries = [
      entry("craft_done", "e1"),
      entry("contract_match", "c1"),
      entry("unit_idle", "city_1"),
      entry("goods_spoiling", "store_1"),
      entry("wave_incoming", "w1"),
    ];
    expect(orderInbox(entries, NOW).items.map((item) => item.category)).toEqual([
      "threat",
      "money_survival",
      "stalled",
      "decision",
      "done",
    ]);
  });

  it("같은 분류 안에서는 마감이 이른 순, 마감 없는 항목은 그 분류의 끝", () => {
    const entries = [
      entry("siege_declared", "s_none"),
      entry("wave_incoming", "w_late", { deadlineAt: NOW + 90 * MIN }),
      entry("siege_declared", "s_soon", { deadlineAt: NOW + 10 * MIN }),
      entry("wave_incoming", "w_mid", { deadlineAt: NOW + 30 * MIN }),
      // 다음 분류의 마감이 더 일러도 분류가 먼저다
      entry("goods_spoiling", "store_1", { deadlineAt: NOW + MIN }),
    ];
    expect(ids(entries)).toEqual([
      "siege_declared:s_soon",
      "wave_incoming:w_mid",
      "wave_incoming:w_late",
      "siege_declared:s_none",
      "goods_spoiling:store_1",
    ]);
  });

  it("마감이 같거나 없으면 처음 생긴 순, 그것도 같으면 항목 ID 순", () => {
    const entries = [
      entry("building_stopped", "b2", { firstSeenAt: NOW - 5 * MIN }),
      entry("unit_idle", "city_9", { firstSeenAt: NOW - 20 * MIN }),
      entry("building_stopped", "b1", { firstSeenAt: NOW - 5 * MIN }),
    ];
    expect(ids(entries)).toEqual(["unit_idle:city_9", "building_stopped:b1", "building_stopped:b2"]);
  });

  it("같은 입력 → 같은 순서·같은 항목 ID(입력 차례를 섞어도 같다)", () => {
    const entries = [
      entry("unit_idle", "city_1", { firstSeenAt: NOW - 3 * MIN, params: { place: "Nova" } }),
      entry("unit_idle", "city_1", { firstSeenAt: NOW - 9 * MIN, params: { place: "Nova" } }),
      entry("unit_idle", "city_2", { firstSeenAt: NOW - 9 * MIN }),
      entry("wave_incoming", "w1", { deadlineAt: NOW + 5 * MIN }),
      entry("wave_incoming", "w2", { deadlineAt: NOW + 5 * MIN }),
      entry("craft_done", "e7"),
      entry("craft_done", "e3"),
      entry("contract_match", "c1", { deadlineAt: NOW + MIN }),
    ];
    const first = orderInbox(entries, NOW);
    expect(first.items.map((item) => item.id)).toEqual([
      "wave_incoming:w1",
      "wave_incoming:w2",
      "unit_idle:city_1",
      "unit_idle:city_2",
      "contract_match:c1",
      "craft_done:e3",
      "craft_done:e7",
    ]);
    for (const seed of [1, 7, 42, 2026]) {
      expect(orderInbox(shuffled(entries, seed), NOW), `seed ${seed}`).toEqual(first);
    }
  });

  it("generatedAt은 받은 지금 시각, 빈 입력은 빈 목록·분류별 0·배지 없음", () => {
    expect(orderInbox([], NOW)).toEqual({
      generatedAt: NOW,
      items: [],
      counts: { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 },
      badges: {},
    });
  });
});

describe("처리할 일 묶기", () => {
  it("묶는 종류: 같은 키는 한 줄 — 개수, 가장 이른 마감, 가장 이른 처음 생긴 시각", () => {
    const entries = [
      entry("goods_spoiling", "store_1", { deadlineAt: NOW + 50 * MIN, firstSeenAt: NOW - MIN }),
      entry("goods_spoiling", "store_1", { deadlineAt: NOW + 20 * MIN, firstSeenAt: NOW - 2 * MIN }),
      entry("goods_spoiling", "store_1", { deadlineAt: null, firstSeenAt: NOW - 30 * MIN }),
      entry("goods_spoiling", "store_2", { deadlineAt: NOW + 5 * MIN }),
    ];
    const { items } = orderInbox(entries, NOW);
    expect(
      items.map(({ id, count, deadlineAt, firstSeenAt }) => ({ id, count, deadlineAt, firstSeenAt })),
    ).toEqual([
      { id: "goods_spoiling:store_2", count: 1, deadlineAt: NOW + 5 * MIN, firstSeenAt: NOW },
      { id: "goods_spoiling:store_1", count: 3, deadlineAt: NOW + 20 * MIN, firstSeenAt: NOW - 30 * MIN },
    ]);
  });

  it("묶은 줄의 값·이동 화면은 그 묶음에서 가장 급한 건(마감 → 처음 생긴 시각)의 것", () => {
    const entries = [
      entry("unit_injured", "base_1", { params: { place: "Old" }, target: { route: "units" } }),
      entry("unit_injured", "base_1", {
        firstSeenAt: NOW - 4 * MIN,
        params: { place: "Nova" },
        target: { route: "units" },
      }),
      entry("unit_injured", "base_1", { firstSeenAt: NOW - MIN, params: { place: "Mid" } }),
    ];
    const [line] = orderInbox(entries, NOW).items;
    expect(line).toMatchObject({ count: 3, params: { place: "Nova" }, target: { route: "units" } });
  });

  it("완료 분류는 묶지 않는다: 사건마다 한 줄(항목 ID = 사건 ID)", () => {
    const entries = [entry("craft_done", "40213"), entry("craft_done", "40214")];
    expect(orderInbox(entries, NOW).items.map(({ id, count }) => ({ id, count }))).toEqual([
      { id: "craft_done:40213", count: 1 },
      { id: "craft_done:40214", count: 1 },
    ]);
  });

  it("묶지 않는 종류에 같은 키가 또 오면 같은 대상이라 한 줄만 남는다(개수 1, 가장 급한 건)", () => {
    const entries = [
      entry("wave_incoming", "w1", { deadlineAt: NOW + 30 * MIN, params: { place: "Late" } }),
      entry("wave_incoming", "w1", { deadlineAt: NOW + 10 * MIN, params: { place: "Soon" } }),
    ];
    expect(orderInbox(entries, NOW).items).toEqual([
      {
        id: "wave_incoming:w1",
        kind: "wave_incoming",
        category: "threat",
        count: 1,
        deadlineAt: NOW + 10 * MIN,
        firstSeenAt: NOW,
        params: { place: "Soon" },
        target: null,
        actions: ["deploy_defense"],
      },
    ]);
  });

  it("줄에는 종류 표의 분류·바로 처리 동작이 붙고, 시안 자료 표시는 건의 것을 따른다", () => {
    const entries = [entry("contract_match", "c1", { preview: true }), entry("building_stopped", "b1")];
    const { items } = orderInbox(entries, NOW);
    expect(items.map(({ id, category, actions, preview }) => ({ id, category, actions, preview }))).toEqual([
      { id: "building_stopped:b1", category: "stalled", actions: ["repair"], preview: undefined },
      { id: "contract_match:c1", category: "decision", actions: ["accept", "decline"], preview: true },
    ]);
    // 시안 자료가 아닌 줄에는 preview 칸이 아예 없다(JSON에 남지 않는다)
    expect(Object.hasOwn(items[0] ?? {}, "preview")).toBe(false);
  });
});

describe("분류별 수와 메뉴 배지", () => {
  it("counts는 분류별 줄 수(묶은 줄은 1), badges는 종류 표의 메뉴 항목 → 줄 수", () => {
    const entries = [
      entry("unit_idle", "city_1"),
      entry("unit_idle", "city_1"),
      entry("unit_idle", "city_2"),
      entry("unit_injured", "base_1"),
      entry("siege_declared", "s1"),
      entry("building_stopped", "b1"),
      entry("craft_done", "e1"),
    ];
    const { counts, badges } = orderInbox(entries, NOW);
    expect(counts).toEqual({ threat: 1, money_survival: 1, stalled: 3, decision: 0, done: 1 });
    // unit_idle 2줄 + unit_injured 1줄 → 유닛 3. building_stopped·craft_done은 배지가 없다
    expect(badges).toEqual({ units: 3, faction: 1 });
  });
});

describe("제공 함수의 실수는 바로 드러난다", () => {
  it("키 모양이 틀리면 RangeError", () => {
    for (const key of ["", "City_1", "a.b", "a:b", "uuid-like-key"]) {
      expect(() => orderInbox([entry("unit_idle", key)], NOW), key).toThrow(RangeError);
    }
  });

  it("시각이 유한한 수가 아니면 RangeError", () => {
    expect(() => orderInbox([entry("unit_idle", "x1", { firstSeenAt: Number.NaN })], NOW)).toThrow(
      RangeError,
    );
    expect(() =>
      orderInbox([entry("wave_incoming", "x1", { deadlineAt: Number.POSITIVE_INFINITY })], NOW),
    ).toThrow(RangeError);
  });
});
