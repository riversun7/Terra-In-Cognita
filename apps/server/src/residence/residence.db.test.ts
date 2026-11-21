// 사는 곳 표 DB 시험(D-585 1) — TEST_DATABASE_URL이 있을 때만. 마이그레이션으로 만든 표 unit_residences에 쓰고 읽고 지운다(가짜 번호).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { deleteResidence, loadResidences, markResidencePaused, saveResidence } from "./store.ts";

let test: TestDatabase;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

describe.skipIf(!TEST_DATABASE_URL)("사는 곳 표(DB)", () => {
  it("한 유닛에 한 줄 — 다시 고르면 바뀌고, 풀면 지워진다", async () => {
    const pool = test.db.$client;
    await saveResidence(pool, { unitId: 41, ownerId: 7, buildingId: 900, chosenAtMs: 1000 });
    await saveResidence(pool, { unitId: 40, ownerId: 7, buildingId: 901, chosenAtMs: 1001 });
    await saveResidence(pool, { unitId: 41, ownerId: 7, buildingId: 902, chosenAtMs: 1002 });
    expect(await loadResidences(pool)).toEqual([
      { unitId: 40, ownerId: 7, buildingId: 901, chosenAtMs: 1001, pausedSinceMs: null },
      { unitId: 41, ownerId: 7, buildingId: 902, chosenAtMs: 1002, pausedSinceMs: null },
    ]);
    await deleteResidence(pool, 40);
    // 쉼 표시(질문 2485 가 — 처리할 일 residence_paused): 적고, 다시 고르면 지운다
    await markResidencePaused(pool, 41, 5000);
    expect(await loadResidences(pool)).toEqual([
      { unitId: 41, ownerId: 7, buildingId: 902, chosenAtMs: 1002, pausedSinceMs: 5000 },
    ]);
    await saveResidence(pool, { unitId: 41, ownerId: 7, buildingId: 902, chosenAtMs: 1003 });
    expect(await loadResidences(pool)).toEqual([
      { unitId: 41, ownerId: 7, buildingId: 902, chosenAtMs: 1003, pausedSinceMs: null },
    ]);
  });
});
