// 켤 때 잠재우기 DB 시험 — docs/adr/2026-11-01-skill-editor.md 2절 "켤 때"(아이템 편집기 설계안 4.5 WP-0 a).
// 새 판(N+1 = 지금 팩 판 + 1)이 저장한 줄을 옛 판(N = 지금 팩)으로 켜면(되돌림 배포): 읽지 못하는 줄은 지우지 않고 잠재우고(감사 content.slept),
// N+1을 다시 켜면 다시 든다. N+1에서 바뀐 팩 항목의 줄은 N에서 팩이 이긴다. TEST_DATABASE_URL이 있을 때만.
import type { PackSource } from "@terra/content";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { bootContentEdit, createContentEditShared } from "./services.ts";
import { type ContentEditState, createContentEditState, entryHash } from "./state.ts";
import { CONTENT_AUDIT_ACTIONS, loadContentOverrides } from "./store.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const packN = loaded.source;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** 분류 파일의 항목 목록 */
function entriesOf(source: PackSource, file: string): Record<string, unknown>[] {
  const value: unknown = JSON.parse(source.files.get(file) ?? '{"entries":[]}');
  const list: unknown = isRecord(value) ? value.entries : [];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}
const skillOf = (source: PackSource, id: string): Record<string, unknown> => {
  const found = entriesOf(source, "skills.json").find((entry) => entry.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return structuredClone(found);
};

/** 지금 팩 판(manifest version) */
const N = ((): number => {
  const manifest: unknown = JSON.parse(packN.files.get("manifest.json") ?? "{}");
  const version = isRecord(manifest) ? manifest.version : undefined;
  if (typeof version !== "number") throw new Error("fixture manifest");
  return version;
})();

/** 새 판 팩(core@N+1): 새 효과 n1_freeze·새 스킬 n1_spark를 더한다. changeShockBash면 팩 항목 shock_bash도 바꾼다 */
function packN1(changeShockBash = false): PackSource {
  const files = new Map(packN.files);
  const manifest: unknown = JSON.parse(files.get("manifest.json") ?? "{}");
  files.set("manifest.json", JSON.stringify({ ...(isRecord(manifest) ? manifest : {}), version: N + 1 }));
  const freeze = {
    ...entriesOf(packN, "effects.json").find((entry) => entry.id === "burn"),
    id: "n1_freeze",
    name: { ko: "얼음", en: "Freeze" },
  };
  files.set("effects.json", JSON.stringify({ entries: [...entriesOf(packN, "effects.json"), freeze] }));
  const spark = { ...skillOf(packN, "power_strike"), id: "n1_spark", name: { ko: "불티", en: "Spark" } };
  const skills = entriesOf(packN, "skills.json").map((entry) =>
    changeShockBash && entry.id === "shock_bash" ? { ...entry, cost: 99 } : entry,
  );
  files.set("skills.json", JSON.stringify({ entries: [...skills, spark] }));
  return { packId: packN.packId, files };
}

const freezePart = [{ effect: "n1_freeze", value: 100, chancePm: 1000 }];
const silentLog = { info() {}, warn() {} };
const cost = (state: ContentEditState, id: string) =>
  state.effective().skills.find((skill) => skill.id === id)?.cost;

describe.skipIf(!TEST_DATABASE_URL)("스킬 편집기 켤 때 잠재우기 (DB)", () => {
  let test: TestDatabase;

  const insert = async (id: string, entry: Record<string, unknown>, packHash: string | null) => {
    await test.db.$client.query(
      `insert into content_overrides (category, id, entry, pack_hash, content_version, note, updated_by, updated_at)
       values ('skills', $1, $2::jsonb, $3, $4, null, null, now())`,
      [id, JSON.stringify(entry), packHash, `core@${N + 1}`],
    );
  };
  const boot = async (source: PackSource): Promise<ContentEditState> => {
    const state = createContentEditState(source);
    const version = state.packVersion;
    const shared = createContentEditShared({
      state,
      pack: { packId: "core", contentVersion: `core@${version}` },
      now: () => Date.now(),
      log: silentLog,
    });
    await bootContentEdit(test.db, shared);
    return state;
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    const n1 = packN1();
    const n1State = createContentEditState(n1);
    // N+1이 저장한 세 줄: 만든 항목, 해시가 같은 고친 항목(power_strike는 두 판이 같다), N에 없는 항목(n1_spark)
    await insert(
      "editor_nova",
      { ...skillOf(packN, "power_strike"), id: "editor_nova", effects: freezePart },
      null,
    );
    await insert(
      "power_strike",
      { ...skillOf(packN, "power_strike"), cost: 33, effects: freezePart },
      n1State.packHash("skills", "power_strike"),
    );
    await insert(
      "n1_spark",
      {
        ...skillOf(packN, "power_strike"),
        id: "n1_spark",
        name: { ko: "불티", en: "Spark" },
        cost: 7,
        effects: freezePart,
      },
      n1State.packHash("skills", "n1_spark"),
    );
  }, 120_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("N+1이 저장한 줄(만든 항목·해시 같은 고친 항목·N에 없는 항목)은 N을 켜도 지우지 않고, 적용하지 않는다(감사 content.slept)", async () => {
    expect(entryHash(skillOf(packN, "power_strike"))).toBe(
      createContentEditState(packN1()).packHash("skills", "power_strike"),
    );
    const state = await boot(packN);
    expect(state.packVersion).toBe(N);
    expect(state.sleepingCount()).toBe(3);
    expect(
      state.effective().skills.some((skill) => skill.id === "editor_nova" || skill.id === "n1_spark"),
    ).toBe(false);
    expect(cost(state, "power_strike")).toBe(10);
    const stored = await loadContentOverrides(test.db);
    expect(stored.rows.map((row) => row.id).toSorted()).toEqual(["editor_nova", "n1_spark", "power_strike"]);
    const audits = await rows<{ before: { changes: { id: string; reason: string }[] } }>(
      test.db,
      "select before from audit_log where action = $1",
      [CONTENT_AUDIT_ACTIONS.slept],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.before.changes.map((change) => [change.id, change.reason]).toSorted()).toEqual([
      ["editor_nova", "newer_pack"],
      ["n1_spark", "newer_pack"],
      ["power_strike", "newer_pack"],
    ]);
    // 뒤의 install(이 판에서 다른 줄을 저장한 뒤)도 잠든 줄을 넣지 않는다
    state.install(stored.rows, stored.revision);
    expect(cost(state, "power_strike")).toBe(10);
    expect(state.sleepingCount()).toBe(3);
  });

  it("N+1을 다시 켜면 잠든 줄이 다시 든다", async () => {
    const state = await boot(packN1());
    expect(state.sleepingCount()).toBe(0);
    expect(cost(state, "power_strike")).toBe(33);
    expect(cost(state, "editor_nova")).toBe(10);
    expect(cost(state, "n1_spark")).toBe(7);
    expect((await loadContentOverrides(test.db)).rows).toHaveLength(3);
  });

  it("N+1에서 바뀐 팩 항목의 줄은 N을 켜면 팩이 이긴다(되돌림 배포가 그 항목을 바꿈, 감사 content.pack_won)", async () => {
    const changed = packN1(true);
    const changedState = createContentEditState(changed);
    await insert(
      "shock_bash",
      { ...skillOf(packN, "shock_bash"), cost: 50 },
      changedState.packHash("skills", "shock_bash"),
    );
    const state = await boot(packN);
    expect(cost(state, "shock_bash")).toBe(15);
    expect((await loadContentOverrides(test.db)).rows.some((row) => row.id === "shock_bash")).toBe(false);
    const won = await rows<{ before: { changes: { id: string }[] } }>(
      test.db,
      "select before from audit_log where action = $1",
      [CONTENT_AUDIT_ACTIONS.pack_won],
    );
    expect(won.flatMap((row) => row.before.changes.map((change) => change.id))).toContain("shock_bash");
    // 잠든 셋은 그대로 남는다
    expect(state.sleepingCount()).toBe(3);
  });
});
