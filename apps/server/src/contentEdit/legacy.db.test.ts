// 옛 모양 덮어쓰기 줄 DB 시험(legacy.ts, 팩 core@26) — core@25가 저장한 아이템 줄(옛 효과량 칸 scale {stat, pmPerPoint}, 지운 중분류 ammo)을
// core@26으로 켜면: 지우지 않고(감사 content.dropped 없음) 지금 모양으로 고쳐 실어 실효 항목이 되고, DB 줄 원본은 그대로다. 저장 뒤 다시
// 읽어 싣는 길(install)도 같은 줄을 고쳐 읽어 팩 항목으로 물러나지 않는다. TEST_DATABASE_URL이 있을 때만.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { bootContentEdit, createContentEditShared } from "./services.ts";
import { type ContentEditState, createContentEditState } from "./state.ts";
import { CONTENT_AUDIT_ACTIONS, loadContentOverrides } from "./store.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const source = loaded.source;
const silentLog = { info() {}, warn() {} };

const oldPotion = {
  id: "editor_old_potion",
  name: { ko: "옛 물약", en: "Old potion" },
  category: "consumable",
  subcategory: "ammo",
  tier: 1,
  baseValue: 5,
  use: { effects: [{ effect: "mend", value: 40, chancePm: 1000, scale: { stat: "vit", pmPerPoint: 10 } }] },
  enabled: true,
};

describe.skipIf(!TEST_DATABASE_URL)("옛 모양 덮어쓰기 줄 켤 때 고쳐 읽기 (DB)", () => {
  let test: TestDatabase;

  const boot = async (): Promise<ContentEditState> => {
    const state = createContentEditState(source);
    const shared = createContentEditShared({
      state,
      pack: { packId: "core", contentVersion: `core@${state.packVersion}` },
      now: () => Date.now(),
      log: silentLog,
    });
    await bootContentEdit(test.db, shared);
    return state;
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    await test.db.$client.query(
      `insert into content_overrides (category, id, entry, pack_hash, content_version, note, updated_by, updated_at)
       values ('items', $1, $2::jsonb, null, 'core@25', null, null, now())`,
      ["editor_old_potion", JSON.stringify(oldPotion)],
    );
  }, 120_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("지우지 않고 지금 모양으로 실어 실효 항목이 되고(옛 scale·중분류만 빠짐), DB 줄은 그대로다", async () => {
    const state = await boot();
    const potion = state.effective().items.find((item) => item.id === "editor_old_potion");
    expect(potion?.subcategory).toBeUndefined();
    expect(potion?.use?.effects).toEqual([
      { effect: expect.objectContaining({ id: "mend" }), value: 40, chancePm: 1000 },
    ]);
    const dropped = await rows(test.db, "select 1 from audit_log where action = $1", [
      CONTENT_AUDIT_ACTIONS.dropped,
    ]);
    expect(dropped).toHaveLength(0);
    const stored = await loadContentOverrides(test.db);
    expect(stored.rows.find((row) => row.id === "editor_old_potion")?.entry).toEqual(oldPotion);
    // 저장 뒤처럼 DB 줄 전부를 다시 실어도 고쳐 읽는다(팩 항목으로 물러나지 않음)
    state.install(stored.rows, stored.revision + 1);
    expect(state.effective().items.some((item) => item.id === "editor_old_potion")).toBe(true);
    expect(state.appliedCount()).toBe(1);
  });
});
