// 팩 항목 덮어쓰기 접근자 시험 — docs/adr/2026-11-01-skill-editor.md 3·4절과 "꼬임 점검".
// 실제 팩(content/core)으로: 묶음 검사(팩 검사기), 만들기·고치기·끄기·되돌리기, 팩과 같은 내용, 다시 쓸 수 없는 ID, 켤 때 고르기
// (가장 나중에 바꾼 것이 이김·빠진 항목·틀린 줄, 던지지 않음), 전투 자료(유닛 화면)에 바로 듦.
import { combatCatalogFrom } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { effectsOf } from "../world/combatCatalog.ts";
import {
  type ContentOverrideRecord,
  type EntryJson,
  contentKey,
  createContentEditState,
  entryHash,
} from "./state.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const source = loaded.source;
const fresh = () => createContentEditState(source, effectsOf(source));

const packSkill = (id: string): Record<string, unknown> => {
  const entry = fresh().packEntry("skills", id);
  if (!entry) throw new Error(`fixture ${id}`);
  return structuredClone({ ...entry });
};

let clock = 1_000;
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
  contentVersion: "core@21",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs: (clock += 1),
});

describe("팩 항목 덮어쓰기 묶음(plan)", () => {
  it("스킬 고치기는 팩 검사를 통과하면 받고, install 뒤 실효 항목·전투 자료에 바로 든다", () => {
    const state = fresh();
    const roster = rosterCatalogOf(source, undefined, undefined, () => state.effective());
    const before = roster.combat;
    const edited = { ...packSkill("power_strike"), cost: 33 };
    const plan = state.plan([{ category: "skills", id: "power_strike", entry: edited }]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changes).toMatchObject([{ id: "power_strike", before: null, packHash: expect.any(String) }]);
    // plan은 메모리를 바꾸지 않는다
    expect(state.effective().skills.find((s) => s.id === "power_strike")?.cost).toBe(10);
    state.install(
      plan.changes.flatMap((c) => (c.after ? [record("skills", c.id, c.after, c.packHash)] : [])),
      1,
    );
    expect(state.revision()).toBe(1);
    expect(state.effective().skills.find((s) => s.id === "power_strike")?.cost).toBe(33);
    expect(roster.combat).not.toBe(before);
    expect(roster.combat.skills.find((s) => s.id === "power_strike")?.cost).toBe(33);
    // 같은 스냅숏이면 같은 묶음(요청마다 새로 만들지 않는다)
    expect(roster.combat).toBe(roster.combat);
  });

  it("팩 스키마·모양 규칙·참조가 틀리면 묶음 전체를 받지 않고 문제 줄을 돌려준다", () => {
    const state = fresh();
    const bad = { ...packSkill("power_strike"), radius: 2 };
    const ok = { ...packSkill("fire_bolt"), cost: 1 };
    const plan = state.plan([
      { category: "skills", id: "fire_bolt", entry: ok },
      { category: "skills", id: "power_strike", entry: bad },
    ]);
    expect(plan).toMatchObject({ ok: false, reason: "invalid_entry" });
    if (plan.ok) return;
    expect(plan.details.some((line) => line.includes("radius"))).toBe(true);
    const unknownEffect = {
      ...packSkill("power_strike"),
      effects: [{ effect: "no_such_effect", value: 1, chancePm: 1000 }],
    };
    expect(state.plan([{ category: "skills", id: "power_strike", entry: unknownEffect }])).toMatchObject({
      ok: false,
      reason: "invalid_entry",
    });
    // 맨손 스킬과 필요한 무기 칸을 같이 적으면 팩 검사가 막는다(D-490)
    const both = { ...packSkill("power_strike"), bareHand: true, weaponField: "physical" };
    expect(state.plan([{ category: "skills", id: "power_strike", entry: both }]).ok).toBe(false);
  });

  it("새 스킬 만들기(팩에 없는 ID)는 분류 끝에 붙고, 되돌리면 사라진다", () => {
    const state = fresh();
    const created = { ...packSkill("power_strike"), id: "editor_kick", bareHand: true };
    const plan = state.plan([{ category: "skills", id: "editor_kick", entry: created }]);
    expect(plan).toMatchObject({ ok: true, changes: [{ id: "editor_kick", packHash: null }] });
    state.install([record("skills", "editor_kick", created, null)], 1);
    expect(state.effective().skills.at(-1)?.id).toBe("editor_kick");
    expect(state.effective().skills.at(-1)?.bareHand).toBe(true);
    const revert = state.plan([{ category: "skills", id: "editor_kick", entry: null }]);
    expect(revert).toMatchObject({ ok: true, changes: [{ id: "editor_kick", after: null }] });
    state.install([], 2);
    expect(state.effective().skills.some((s) => s.id === "editor_kick")).toBe(false);
  });

  it("팩과 같은 내용·없는 덮어쓰기 되돌리기는 할 일이 없고, 같은 칸 두 번·ID가 다른 항목은 받지 않는다", () => {
    const state = fresh();
    expect(
      state.plan([{ category: "skills", id: "fire_bolt", entry: packSkill("fire_bolt") }]),
    ).toMatchObject({
      ok: true,
      changes: [],
    });
    expect(state.plan([{ category: "skills", id: "fire_bolt", entry: null }])).toMatchObject({
      ok: true,
      changes: [],
    });
    const edited = { ...packSkill("fire_bolt"), cost: 2 };
    expect(
      state.plan([
        { category: "skills", id: "fire_bolt", entry: edited },
        { category: "skills", id: "fire_bolt", entry: null },
      ]),
    ).toMatchObject({ ok: false, reason: "duplicate_entry" });
    expect(state.plan([{ category: "skills", id: "power_strike", entry: edited }])).toMatchObject({
      ok: false,
      reason: "invalid_entry",
    });
    expect(
      state.plan([
        { category: "skills", id: "fire_bolt", entry: { ...edited, name: { ko: "\u0000", en: "x" } } },
      ]),
    ).toMatchObject({ ok: false, reason: "invalid_entry" });
  });

  it("한 번 쓰고 지운 ID(팩 id-changes)는 새 항목 ID로 받지 않는다", () => {
    const files = new Map(source.files);
    files.set(
      "id-changes.json",
      JSON.stringify({
        renamed: [],
        removed: [{ category: "skills", id: "old_slash", since: 1, compensation: { kind: "none" } }],
      }),
    );
    const state = createContentEditState({ packId: source.packId, files }, effectsOf(source));
    expect(state.retiredIds("skills")).toEqual(["old_slash"]);
    const reuse = { ...packSkill("power_strike"), id: "old_slash" };
    expect(state.plan([{ category: "skills", id: "old_slash", entry: reuse }])).toMatchObject({
      ok: false,
      reason: "retired_id",
    });
  });
});

describe("켤 때 고르기(가장 나중에 바꾼 것이 이긴다, D-461)", () => {
  it("저장 때 팩 해시와 지금 해시가 같으면 듣고, 다르면 팩이 이기고, 빠진 항목·틀린 줄은 지운다(던지지 않는다)", () => {
    const state = fresh();
    const hash = state.packHash("skills", "power_strike");
    const edited = { ...packSkill("power_strike"), cost: 40 };
    const kept = record("skills", "power_strike", edited, hash);
    const stale = record("skills", "fire_bolt", { ...packSkill("fire_bolt"), cost: 3 }, "0".repeat(64));
    const appeared = record("skills", "shock_bash", { ...packSkill("shock_bash"), cost: 1 }, null);
    const gone = record(
      "skills",
      "removed_skill",
      { ...packSkill("power_strike"), id: "removed_skill" },
      hash,
    );
    const broken = record(
      "skills",
      "editor_bad",
      { ...packSkill("power_strike"), id: "editor_bad", range: -1 },
      null,
    );
    const wrongId = record("skills", "editor_x", { ...packSkill("power_strike"), id: "editor_y" }, null);
    // 만든 항목과 같은 ID가 팩에 생겼다: 내용이 다르면 잠재우고(id_collision), 같으면 내보내기를 넣은 것이라 조용히 지운다(adopted)
    const adopted = record("skills", "fire_bolt_copy", packSkill("fire_bolt"), null);
    const selection = state.selectAtBoot([kept, stale, appeared, gone, broken, wrongId]);
    expect(selection.keep.map((r) => r.id)).toEqual(["power_strike"]);
    expect(selection.packWon.map((r) => r.id)).toEqual(["fire_bolt"]);
    expect(selection.slept.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["shock_bash", "id_collision"],
    ]);
    expect(state.selectAtBoot([{ ...adopted, id: "fire_bolt" }]).adopted.map((r) => r.id)).toEqual([
      "fire_bolt",
    ]);
    expect(selection.dropped.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["removed_skill", "unknown_entry"],
      ["editor_x", "invalid_entry"],
      ["editor_bad", "invalid_entry"],
    ]);
    state.install(selection.keep, 7);
    expect(state.effective().skills.find((s) => s.id === "power_strike")?.cost).toBe(40);
    expect(state.snapshot().overrides.has(contentKey("skills", "power_strike"))).toBe(true);
  });

  it("무기 소모 덮어쓰기(아이템 통째)도 같은 길로 고르고 전투 자료 무기 사양에 든다", () => {
    const state = fresh();
    const sword = state.packEntry("items", "test_sword");
    if (!sword) throw new Error("fixture");
    const next: Record<string, unknown> = structuredClone({ ...sword });
    const equip = next.equip;
    if (typeof equip !== "object" || equip === null) throw new Error("fixture");
    const weapon: unknown = Reflect.get(equip, "weapon");
    if (typeof weapon !== "object" || weapon === null) throw new Error("fixture");
    Reflect.set(weapon, "staminaCost", 4);
    expect(entryHash(next)).not.toBe(state.packHash("items", "test_sword"));
    const selection = state.selectAtBoot([
      record("items", "test_sword", next, state.packHash("items", "test_sword")),
    ]);
    expect(selection.keep).toHaveLength(1);
    state.install(selection.keep, 1);
    const catalog = combatCatalogFrom({
      statRows: [],
      effects: [...state.effects],
      ...state.effective(),
    });
    expect(catalog.equipment.find((item) => item.id === "test_sword")?.weapon?.staminaCost).toBe(4);
  });
});
