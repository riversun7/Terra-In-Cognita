// 실효 팩 차례와 내보내기 차이 얹기 시험 — 시뮬레이터 --tuning(entries)이 그 차이를 팩에 넣은 것과 같은 자료로 도는지
// (docs/adr/2026-11-01-item-editor.md 4절). 서버 실효 차례(팩 차례 → 만든 항목 ID 차례)와도 같아야 한다.
import { describe, expect, it } from "vitest";
import { effectiveEntries } from "../effective.ts";
import { itemNamed, fixture } from "../testFixtures.ts";
import { validatePack } from "../validate/pack.ts";
import { applyEntriesDiff } from "./entriesDiff.ts";
import { overlayEntriesDiff } from "./entriesOverlay.ts";
import { hashEntry } from "./hash.ts";
import { itemEntrySchema } from "../schema/items.ts";

const ore = itemNamed("iron_ore");
const copper = itemNamed("copper_ore");
const source = fixture({ "items.json": { entries: [ore, copper] } });
const ids = (list: readonly { id?: unknown }[] | undefined) => (list ?? []).map((entry) => entry.id);

describe("실효 항목 차례", () => {
  it("팩 차례로 바꿔 넣고, 팩에 없는 ID는 끝에 ID 차례로 붙인다(덮어쓰기 차례와 상관없이)", () => {
    const entries = effectiveEntries(
      source,
      ["items"],
      [
        { category: "items", id: "zinc_ore", entry: itemNamed("zinc_ore") },
        { category: "items", id: "copper_ore", entry: { ...copper, tier: 3 } },
        { category: "items", id: "amber", entry: itemNamed("amber") },
      ],
    );
    const items = entries.get("items") ?? [];
    expect(ids(items)).toEqual(["iron_ore", "copper_ore", "amber", "zinc_ore"]);
    expect(items[1]?.tier).toBe(3);
  });
});

describe("내보내기 차이 얹기(시뮬레이터 --tuning)", () => {
  const changes = [
    { category: "items", id: "zinc_ore", from: null, entry: itemNamed("zinc_ore") },
    { category: "items", id: "copper_ore", from: hashEntry(copper), entry: { ...copper, tier: 2 } },
    { category: "items", id: "amber", from: null, entry: itemNamed("amber") },
  ] as const;

  it("얹은 팩의 항목 = 같은 차이를 팩 파일에 넣은 항목(차례·내용 바이트까지)", () => {
    const overlay = overlayEntriesDiff(source, changes);
    expect(overlay.skipped).toEqual([]);
    expect(overlay.stale).toEqual([]);
    const applied = applyEntriesDiff([ore, copper], changes, itemEntrySchema);
    const withApplied = fixture({ "items.json": { entries: applied.entries } });
    const a = validatePack(overlay.source);
    const b = validatePack(withApplied);
    expect(a.issues).toEqual([]);
    expect(b.issues).toEqual([]);
    expect(JSON.stringify(a.pack?.entries.get("items"))).toBe(JSON.stringify(b.pack?.entries.get("items")));
    expect(ids(a.pack?.entries.get("items"))).toEqual(["iron_ore", "copper_ore", "amber", "zinc_ore"]);
  });

  it("만든 항목이 팩 ID와 겹치거나(collision) 팩에 없는 항목을 고친 줄(unknown)은 얹지 않고, 내보낼 때와 다른 팩 항목은 알린다", () => {
    const overlay = overlayEntriesDiff(source, [
      { category: "items", id: "iron_ore", from: null, entry: { ...ore, tier: 5 } },
      { category: "items", id: "gone", from: hashEntry(itemNamed("gone")), entry: itemNamed("gone") },
      { category: "items", id: "copper_ore", from: hashEntry({ ...copper, tier: 9 }), entry: copper },
    ]);
    expect(overlay.skipped).toEqual([
      { category: "items", id: "iron_ore", reason: "collision" },
      { category: "items", id: "gone", reason: "unknown" },
    ]);
    expect(overlay.stale).toEqual(["items/copper_ore"]);
    const items = validatePack(overlay.source).pack?.entries.get("items");
    expect(ids(items)).toEqual(["iron_ore", "copper_ore"]);
  });
});
