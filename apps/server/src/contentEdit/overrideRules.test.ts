// 덮어쓰기 층 보강 시험(아이템 편집기 WP-1, docs/adr/2026-11-01-item-editor.md 4절) — 실제 팩(content/core)으로:
// baseHash(같은 항목을 누가 먼저 고쳤을 때만 충돌), 만든 항목 지우기 → 은퇴 ID, 대분류 잠금, 크기 상한, 아이템 분류 자료 덮어쓰기,
// 켤 때 만든 항목 ID가 팩에 생기면 잠재우기·같은 내용이면 조용히 지우기, 반씩 나눠 틀린 줄 찾기.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { type ContentOverrideRecord, type EntryJson, createContentEditState, entryHash } from "./state.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const source = loaded.source;
const fresh = () => createContentEditState(source);

const packEntry = (category: "items" | "skills", id: string): Record<string, unknown> => {
  const entry = fresh().packEntry(category, id);
  if (!entry) throw new Error(`fixture ${id}`);
  return structuredClone({ ...entry });
};

let clock = 5_000;
const record = (
  category: ContentOverrideRecord["category"],
  id: string,
  entry: EntryJson,
  packHash: string | null,
): ContentOverrideRecord => ({
  category,
  id,
  entry,
  packHash,
  contentVersion: "core@24",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs: (clock += 1),
});

/** plan을 받아 install까지(DB 대신) */
function apply(state: ReturnType<typeof fresh>, puts: Parameters<ReturnType<typeof fresh>["plan"]>[0]) {
  const plan = state.plan(puts);
  if (!plan.ok) throw new Error(`${plan.reason} ${plan.details.join(",")}`);
  const records = new Map(
    [...state.snapshot().overrides.values()].map((r): [string, ContentOverrideRecord] => [
      `${r.category}/${r.id}`,
      r,
    ]),
  );
  for (const change of plan.changes) {
    const key = `${change.category}/${change.id}`;
    if (change.after === null) records.delete(key);
    else records.set(key, record(change.category, change.id, change.after, change.packHash));
  }
  state.addRetired(plan.retire);
  state.install(records.values(), state.revision() + 1);
  return plan;
}

const ration = packEntry("items", "ration");
// 배급 식량은 중분류 요리(dish, core@60)·소분류 기본 배급식(core@152): 대분류·중분류를 바꾸는 시험은 옛 소분류를 뺀다
const newItem = (id: string, extra: Record<string, unknown> = {}) => {
  const { weaponType: _drop, ...withoutKind } = ration;
  const base = "category" in extra || "subcategory" in extra ? withoutKind : ration;
  return { ...base, id, ...extra };
};

describe("baseHash: 같은 항목을 누가 먼저 고쳤을 때만 충돌", () => {
  it("지금 실효 해시와 같으면 받고, 다르면 entry_changed(키), 새 항목(null)인데 그새 생겼으면 entry_changed", () => {
    const state = fresh();
    const base = state.hashOf("items", "ration");
    expect(base).toBe(state.packHash("items", "ration"));
    apply(state, [{ category: "items", id: "ration", entry: { ...ration, tier: 2 }, baseHash: base }]);
    // 다른 사람이 같은 항목을 낡은 해시로 보냄
    expect(
      state.plan([{ category: "items", id: "ration", entry: { ...ration, tier: 3 }, baseHash: base }]),
    ).toMatchObject({ ok: false, reason: "entry_changed", details: ["items/ration"] });
    // 다른 항목은 그대로 받는다
    expect(
      state.plan([
        {
          category: "items",
          id: "grain",
          entry: { ...packEntry("items", "grain"), tier: 1 },
          baseHash: state.hashOf("items", "grain"),
        },
      ]).ok,
    ).toBe(true);
    apply(state, [{ category: "items", id: "fresh_bread", entry: newItem("fresh_bread"), baseHash: null }]);
    expect(
      state.plan([{ category: "items", id: "fresh_bread", entry: newItem("fresh_bread"), baseHash: null }]),
    ).toMatchObject({ ok: false, reason: "entry_changed" });
  });
});

describe("은퇴 ID", () => {
  it("만든 항목을 지우면 그 ID를 은퇴시키고, 다시 만들지 못한다(팩 항목 되돌리기는 은퇴가 아니다)", () => {
    const state = fresh();
    apply(state, [{ category: "items", id: "fresh_bread", entry: newItem("fresh_bread") }]);
    apply(state, [{ category: "items", id: "ration", entry: { ...ration, tier: 3 } }]);
    const plan = apply(state, [
      { category: "items", id: "fresh_bread", entry: null },
      { category: "items", id: "ration", entry: null },
    ]);
    expect(plan.retire).toEqual([{ category: "items", id: "fresh_bread" }]);
    expect(state.retiredIds("items")).toContain("fresh_bread");
    expect(state.worldRetired()).toEqual([{ category: "items", id: "fresh_bread" }]);
    expect(
      state.plan([{ category: "items", id: "fresh_bread", entry: newItem("fresh_bread") }]),
    ).toMatchObject({
      ok: false,
      reason: "retired_id",
    });
  });
});

describe("아이템 대분류·크기", () => {
  it("팩 항목의 대분류는 잠그고, 만든 항목은 가리키는 곳이 없고 귀금속과 오가지 않을 때만 바꾼다", () => {
    const state = fresh();
    expect(
      state.plan([
        { category: "items", id: "grain", entry: { ...packEntry("items", "grain"), category: "processed" } },
      ]),
    ).toMatchObject({
      ok: false,
      reason: "category_locked",
    });
    apply(state, [{ category: "items", id: "odd_loaf", entry: newItem("odd_loaf") }]);
    expect(
      state.plan([
        {
          category: "items",
          id: "odd_loaf",
          entry: newItem("odd_loaf", { category: "raw", subcategory: "ore" }),
        },
      ]).ok,
    ).toBe(true);
    expect(
      state.plan([
        { category: "items", id: "odd_loaf", entry: newItem("odd_loaf", { category: "precious" }) },
      ]),
    ).toMatchObject({ ok: false, reason: "category_locked" });
    // 다른 만든 항목이 신선도 사슬로 가리키면 잠근다
    apply(state, [
      {
        category: "items",
        id: "stale_loaf",
        entry: newItem("stale_loaf", { perish: { shelfLifeMs: 3_600_000, spoilsTo: "odd_loaf" } }),
      },
    ]);
    expect(
      state.plan([
        {
          category: "items",
          id: "odd_loaf",
          entry: newItem("odd_loaf", { category: "raw", subcategory: "ore" }),
        },
      ]),
    ).toMatchObject({ ok: false, reason: "category_locked" });
  });

  it("항목 하나는 4 KiB까지(entry_too_large)", () => {
    const state = fresh();
    const big = newItem("big_loaf", { description: { ko: "가".repeat(1500), en: "x" } });
    expect(state.plan([{ category: "items", id: "big_loaf", entry: big }])).toMatchObject({
      ok: false,
      reason: "entry_too_large",
    });
  });

  it("검사 문제는 코드가 붙은 모양(issues)으로도 온다", () => {
    const state = fresh();
    const plan = state.plan([
      {
        category: "items",
        id: "bad_loaf",
        entry: newItem("bad_loaf", { weight: -1, subcategory: "no_such" }),
      },
    ]);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.issues.map((issue) => [issue.id, issue.path, issue.code])).toEqual([
      ["bad_loaf", "weight", "too_small"],
    ]);
  });
});

describe("아이템 분류 자료 덮어쓰기", () => {
  it("중분류·태그·무기 종류도 같은 길로 만들고, 아이템이 가리킬 수 있다", () => {
    const state = fresh();
    apply(state, [
      {
        category: "item_tags",
        id: "starter",
        entry: { id: "starter", name: { ko: "초보", en: "Starter" }, enabled: true },
      },
      { category: "items", id: "ration", entry: { ...ration, tags: ["starter"], subcategory: "dish" } },
    ]);
    expect(state.effective().itemTags.map((tag) => tag.id)).toEqual(["starter"]);
    expect(state.effective().items.find((item) => item.id === "ration")?.subcategory?.id).toBe("dish");
    // 가리키는 태그를 지우면 참조 문제로 받지 않는다
    expect(state.plan([{ category: "item_tags", id: "starter", entry: null }])).toMatchObject({
      ok: false,
      reason: "invalid_entry",
    });
  });
});

describe("켤 때: 만든 항목과 같은 ID가 팩에 생김, 반씩 나눠 틀린 줄 찾기", () => {
  it("다른 내용이면 잠재우고(적용하지 않음, 잠든 줄로 보임), install도 넣지 않는다", () => {
    const state = fresh();
    const collision = record("items", "ration", { ...ration, tier: 9 }, null);
    const selection = state.selectAtBoot([collision]);
    expect(selection.slept.map(({ row, reason }) => [row.id, reason])).toEqual([["ration", "id_collision"]]);
    state.install([collision], 3);
    expect(state.effective().items.find((item) => item.id === "ration")?.tier).toBe(0);
    expect(state.sleepingRows()).toEqual([
      { category: "items", id: "ration", reason: "id_collision", contentVersion: "core@24" },
    ]);
    expect(state.sleepingRecord("items", "ration")?.entry).toMatchObject({ tier: 9 });
  });

  it("틀린 줄이 여럿이어도 저장 차례로 반씩 나눠 맞는 줄만 남긴다", () => {
    const state = fresh();
    const good = (id: string) => record("items", id, newItem(id), null);
    const bad = (id: string) => record("items", id, newItem(id, { tier: 99 }), null);
    const rows = [
      good("bread_a"),
      bad("bread_b"),
      good("bread_c"),
      good("bread_d"),
      bad("bread_e"),
      good("bread_f"),
    ];
    const selection = state.selectAtBoot(rows);
    expect(selection.keep.map((r) => r.id)).toEqual(["bread_a", "bread_c", "bread_d", "bread_f"]);
    expect(selection.dropped.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["bread_b", "invalid_entry"],
      ["bread_e", "invalid_entry"],
    ]);
    expect(entryHash(selection.keep[0]?.entry)).toBe(entryHash(newItem("bread_a")));
  });
});
