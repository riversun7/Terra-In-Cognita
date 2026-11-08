// 보유 물건 화면 자료 시험 — 칸 배치·든 물건 나누기, 정렬(장비 → 소모품 → 그 밖), 걸러 보기, 입을 칸 고르기, 쿨·막대·시계 글자
import type { HoldingView, HoldingsListResponse } from "@terra/shared/holdings";
import { describe, expect, it } from "vitest";
import {
  cooldownFor,
  filterHoldings,
  formatClock,
  isBroken,
  isPacked,
  nextDeadline,
  percentOf,
  pickSlot,
  ratioTone,
  slotChoices,
  unitHoldings,
} from "./holdingsModel.ts";

const UNIT = 40;
const CYBORG_LAYOUT = [
  "weapon",
  "offhand",
  "head",
  "body",
  "accessory",
  "accessory",
  "organ",
  "organ",
  "organ",
];

function holding(id: number, item: string, extra: Partial<HoldingView> = {}): HoldingView {
  return {
    id,
    item,
    name: { ko: item, en: item },
    kind: "instance",
    quantity: 1,
    unit: UNIT,
    place: null,
    slot: null,
    stats: [],
    scorePm: null,
    durability: null,
    maxDurability: null,
    freshnessPm: null,
    spoilsAt: null,
    createdAt: 0,
    source: "dev_grant",
    equipSlot: null,
    useCooldown: null,
    uses: [],
    ...extra,
  };
}

const ring = (id: number, slot: number | null = null) =>
  holding(id, `ring_${String(id)}`, { equipSlot: "accessory", slot });
const tonic = holding(20, "b_tonic", { kind: "stack", quantity: 3, useCooldown: "potion" });
const stew = holding(21, "a_stew", { kind: "lot", quantity: 2, useCooldown: "food", freshnessPm: 640 });
const fish = holding(22, "fish", { kind: "lot", quantity: 5 });
const sword = holding(10, "z_sword", { equipSlot: "weapon", durability: 0, maxDurability: 40 });

function data(holdings: HoldingView[], extra: Partial<HoldingsListResponse> = {}): HoldingsListResponse {
  return { hasOwner: true, holdings, effects: [], cooldowns: [], cyborgUnit: UNIT, units: [], ...extra };
}

const byName = (a: string, b: string) => a.localeCompare(b);
const nameOf = (h: HoldingView) => h.item;

describe("유닛 하나 나누기", () => {
  it("칸은 칸 배치 차례로, 든 물건은 장비 → 쓸 수 있는 것 → 그 밖 + 이름 차례", () => {
    const view = unitHoldings(
      data([fish, tonic, ring(2, 5), stew, sword, holding(30, "other", { unit: 99 })]),
      UNIT,
      CYBORG_LAYOUT,
      0,
      byName,
      nameOf,
    );
    expect(view.slots.map((cell) => cell.kind)).toEqual(CYBORG_LAYOUT);
    expect(view.slots[5]?.holding?.id).toBe(2);
    expect(view.slots[4]?.holding).toBeNull();
    expect(view.carried.map((h) => h.item)).toEqual(["z_sword", "a_stew", "b_tonic", "fish"]);
  });

  it("서버 칸 배치가 있으면 그것을 쓰고, 배치 밖 번호에 입은 물건은 든 물건에 남긴다", () => {
    const view = unitHoldings(
      data([ring(2, 7)], { units: [{ unit: UNIT, kind: "human", slots: ["weapon", "body", "accessory"] }] }),
      UNIT,
      CYBORG_LAYOUT,
      0,
      byName,
      nameOf,
    );
    expect(view.slots.map((cell) => cell.kind)).toEqual(["weapon", "body", "accessory"]);
    expect(view.carried.map((h) => h.id)).toEqual([2]);
  });

  it("끝난 효과·쿨은 빼고 남은 시간이 짧은 차례", () => {
    const view = unitHoldings(
      data([], {
        effects: [
          { unit: UNIT, effect: "late", name: null, value: 5, until: 900, exclusive: null, item: "x" },
          { unit: UNIT, effect: "gone", name: null, value: 5, until: 100, exclusive: null, item: "x" },
          { unit: UNIT, effect: "soon", name: null, value: 5, until: 300, exclusive: "g", item: "x" },
          { unit: 99, effect: "other", name: null, value: 5, until: 900, exclusive: null, item: "x" },
        ],
        cooldowns: [
          { unit: UNIT, kind: "food", until: 600 },
          { unit: UNIT, kind: "potion", until: 150 },
        ],
      }),
      UNIT,
      CYBORG_LAYOUT,
      200,
      byName,
      nameOf,
    );
    expect(view.effects.map((e) => e.effect)).toEqual(["soon", "late"]);
    expect(view.cooldowns.map((c) => c.kind)).toEqual(["food"]);
    expect(cooldownFor(view, stew)).toBe(600);
    expect(cooldownFor(view, tonic)).toBeNull();
    expect(cooldownFor(view, sword)).toBeNull();
  });
});

describe("칸 고르기·걸러 보기", () => {
  it("[장착]은 같은 종류의 빈 칸 먼저, 다 찼으면 첫 칸, 맞는 칸이 없으면 null", () => {
    const empty = unitHoldings(data([ring(1)]), UNIT, CYBORG_LAYOUT, 0, byName, nameOf);
    expect(pickSlot(empty, ring(1))?.index).toBe(4);
    const half = unitHoldings(data([ring(1), ring(2, 4)]), UNIT, CYBORG_LAYOUT, 0, byName, nameOf);
    expect(pickSlot(half, ring(1))?.index).toBe(5);
    const full = unitHoldings(
      data([ring(1), ring(2, 4), ring(3, 5)]),
      UNIT,
      CYBORG_LAYOUT,
      0,
      byName,
      nameOf,
    );
    expect(pickSlot(full, ring(1))?.index).toBe(4);
    expect(pickSlot(full, tonic)).toBeNull();
    expect(pickSlot(full, holding(9, "saddle", { equipSlot: "saddle" }))).toBeNull();
  });

  it("칸의 고를 거리 = 든 같은 종류 장비(파손 포함), 걸러 보기 = 장비·소모품", () => {
    const view = unitHoldings(
      data([ring(1), ring(2, 4), sword, tonic]),
      UNIT,
      CYBORG_LAYOUT,
      0,
      byName,
      nameOf,
    );
    const accessory = view.slots[5];
    if (!accessory) throw new Error("slot");
    expect(slotChoices(view, accessory).map((h) => h.id)).toEqual([1]);
    const weapon = view.slots[0];
    if (!weapon) throw new Error("slot");
    expect(slotChoices(view, weapon).map((h) => h.id)).toEqual([10]);
    expect(isBroken(sword)).toBe(true);
    expect(isBroken(ring(1))).toBe(false);
    expect(filterHoldings([sword, tonic, fish], "equipment").map((h) => h.id)).toEqual([10]);
    expect(filterHoldings([sword, tonic, fish], "consumable").map((h) => h.id)).toEqual([20, 22]);
    expect(filterHoldings([sword, tonic], "all")).toHaveLength(2);
  });
});

describe("수 다듬기", () => {
  it("막대 몫과 색 단계(옛 60%·30% 문턱), ‰ → % 내림", () => {
    expect(ratioTone(40, 40)).toEqual({ ratio: 1, tone: "high" });
    expect(ratioTone(24, 40)).toEqual({ ratio: 0.6, tone: "mid" });
    expect(ratioTone(12, 40)).toEqual({ ratio: 0.3, tone: "low" });
    expect(ratioTone(5, 0)).toEqual({ ratio: 0, tone: "low" });
    expect(percentOf(999)).toBe(99);
    expect(percentOf(-5)).toBe(0);
  });

  it("남은 시간 시계 글자(초 올림), 다음 끝 시각", () => {
    expect(formatClock(29_001)).toBe("0:30");
    expect(formatClock(200)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(299_000)).toBe("4:59");
    expect(formatClock(3_600_000)).toBe("1:00:00");
    const list = data([], {
      effects: [{ unit: UNIT, effect: "a", name: null, value: 1, until: 500, exclusive: null, item: "x" }],
      cooldowns: [{ unit: UNIT, kind: "potion", until: 300 }],
    });
    expect(nextDeadline(list, 100)).toBe(300);
    expect(nextDeadline(list, 400)).toBe(500);
    expect(nextDeadline(list, 600)).toBeNull();
  });
});

describe("식품 포장(D-524)", () => {
  it("packed가 true인 칸만 포장 칸이다(옛 서버는 보내지 않는다)", () => {
    expect(isPacked(holding(1, "stew", { kind: "lot", packed: true }))).toBe(true);
    expect(isPacked(holding(2, "stew", { kind: "lot", packed: false }))).toBe(false);
    expect(isPacked(holding(3, "stew", { kind: "lot" }))).toBe(false);
    expect(isPacked(holding(4, "vest", { packed: null }))).toBe(false);
  });
});
