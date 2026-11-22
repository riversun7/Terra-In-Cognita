// 수호신 상태 저장·복구 DB 통합 시험(사용자 결정 2026-11-22 "4종류는 고정", 기획 D-589·D-311) — TEST_DATABASE_URL이 있을 때만.
// 계정은 시험용 가짜 값이다. 수호신은 종류가 아니라 휴먼(4)의 상태다: 표시한 휴먼은 다시 켜도 수호신이고(world_units.guardian), 직전 판 앱이
// 쓴 옛 종류 6 줄은 부팅이 휴먼 + 수호신 상태로 바꾼다(마이그레이션 guardian_state와 같은 문장). 수호신은 옮길 수 없다(unit_stays).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { addTestUnits } from "./testSupport.ts";
import { unitControlDenial } from "./unitControl.ts";
import { LEGACY_UNIT_KIND_GUARDIAN, UNIT_KIND_HUMAN, isGuardianUnit } from "./unitKinds.ts";
import { type World, startWorld } from "./world.ts";

const T0 = 1_800_000_000_000;

let test: TestDatabase;
const worlds: World[] = [];
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => T0,
    log: quiet,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    holdings: { content: () => TEST_HOLDING_CONTENT },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

const infoOf = (world: World, unitId: number) => {
  for (const map of world.maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return info;
  }
  return undefined;
};

describe.skipIf(!TEST_DATABASE_URL)("수호신 = 휴먼의 상태(D-589)", () => {
  it("표시한 휴먼은 다시 켜도 수호신이고, 옛 종류 6 줄은 부팅이 휴먼 + 수호신으로 바꾼다", async () => {
    const first = await boot();
    const p = first.persistence;
    if (!p) throw new Error("no persistence");
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const user = await fakeUser("guardian_state");
    const [marked = 0, legacy = 0, plain = 0] = addTestUnits(first, user, mapKey, 3, T0);
    expect(first.maps.get(mapKey)?.markGuardian(marked)).toBe(true);
    expect(isGuardianUnit(infoOf(first, marked))).toBe(true);
    await p.writer.durable();
    await first.stop();
    worlds.splice(0);
    // 직전 판 앱이 배포 사이에 옛 종류 코드로 다시 쓴 줄
    await rows(test.db, `update world_units set kind = $1, guardian = false where id = $2`, [
      LEGACY_UNIT_KIND_GUARDIAN,
      legacy,
    ]);

    const second = await boot();
    const units = await rows<{ id: string; kind: number; guardian: boolean }>(
      test.db,
      `select id, kind, guardian from world_units where id = any($1) order by id`,
      [[marked, legacy, plain]],
    );
    expect(units.map((row) => [Number(row.id), row.kind, row.guardian])).toEqual([
      [marked, UNIT_KIND_HUMAN, true],
      [legacy, UNIT_KIND_HUMAN, true],
      [plain, UNIT_KIND_HUMAN, false],
    ]);
    const ownerId = second.persistence?.settlement.ownerOfUser(user, T0).id;
    for (const unitId of [marked, legacy]) {
      const info = infoOf(second, unitId);
      expect(info?.kind).toBe(UNIT_KIND_HUMAN);
      expect(isGuardianUnit(info)).toBe(true);
      expect(unitControlDenial(info, ownerId, false)).toBe("unit_stays");
    }
    expect(isGuardianUnit(infoOf(second, plain))).toBe(false);
    expect(unitControlDenial(infoOf(second, plain), ownerId, false)).toBeNull();
  });
});
