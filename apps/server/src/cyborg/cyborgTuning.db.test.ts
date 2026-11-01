// 사이보그 만들기 × 설정 칸 바로 바꾸기 DB 통합 시험 — docs/adr/2026-11-01-dev-settings-panel.md 7절·"꼬임 점검"(사용자 답 204).
// - 굴림 도중 다시 굴리기 횟수(N9)를 줄이거나 늘려도 남은 횟수는 0 아래로 가지 않고, 그때 상한으로 센다.
// - 명령 하나는 시작할 때 받은 값 한 벌만 쓴다(만들기의 분배 검사·지원금이 서로 다른 값으로 섞이지 않는다).
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { DEFAULT_CYBORG_APPEARANCE } from "@terra/shared/cyborg";
import { type SocietyCoefficients, societyCoefficientsFrom } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";

let test: TestDatabase;
const clock = 1_800_000_000_000;
const worlds: World[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(rules: () => SocietyCoefficients): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    cyborgRules: rules,
    onFatal: (error) => {
      throw error;
    },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

const withValues = (entries: readonly (readonly [string, number])[]) =>
  societyCoefficientsFrom(new Map(entries));

describe.skipIf(!TEST_DATABASE_URL)("사이보그 만들기 × 설정 칸 바로 바꾸기", () => {
  it("굴림 도중 다시 굴리기 횟수를 줄이면 남은 횟수는 0(음수 아님)이고 막히며, 늘리면 다시 굴린다", async () => {
    let current = withValues([]);
    const world = await boot(() => current);
    const service = world.persistence?.cyborgs;
    if (!service) throw new Error("no cyborg service");
    const user = await fakeUser("Tune_Roller");
    for (let i = 0; i < 3; i++) expect((await service.roll(user, "combat")).ok).toBe(true);
    expect(service.creation(user, clock).roll).toMatchObject({ rollsLeft: 1, rollsMax: 4 });
    // 개발자 패널: N9 다시 굴리기 3 → 1(상한 2). 이미 3번 굴렸다
    current = withValues([["n9_initial_rerolls", 1]]);
    expect(service.creation(user, clock).roll).toMatchObject({ rollsLeft: 0, rollsMax: 2 });
    expect(service.creation(user, clock).rules.rollsMax).toBe(2);
    expect(await service.roll(user, "tech")).toEqual({ ok: false, code: "rolls_exhausted" });
    // 3 → 5(상한 6): 다시 굴린다
    current = withValues([["n9_initial_rerolls", 5]]);
    const again = await service.roll(user, "tech");
    expect(again).toMatchObject({ ok: true, roll: { rollsLeft: 2, rollsMax: 6 } });
  });

  it("만들기 한 명령은 시작할 때 받은 값 한 벌만 쓴다: 명령 중에 값이 바뀌어도 분배 검사와 지원금이 같은 값", async () => {
    // 첫 번째로 읽힌 값(N36 점수 10, N39 기본액 72) 뒤로는 다른 값(점수 12, 기본액 1000)을 돌려준다
    const first = withValues([]);
    const later = withValues([
      ["n36_element_points", 12],
      ["n39_grant_base", 1000],
    ]);
    let calls = 0;
    let armed = false;
    const world = await boot(() => {
      if (!armed) return first;
      calls += 1;
      return calls === 1 ? first : later;
    });
    const service = world.persistence?.cyborgs;
    if (!service) throw new Error("no cyborg service");
    const user = await fakeUser("Tune_Maker");
    await service.roll(user, "combat");
    const faction = service.creation(user, clock).factions[0];
    const city = faction?.cities[0];
    if (!faction || !city) throw new Error("no start city");
    armed = true;
    const result = await service.create(user, {
      name: "Snapshot",
      appearance: DEFAULT_CYBORG_APPEARANCE,
      factionId: faction.id,
      cityId: city.id,
      // 점수 10 = 첫 값으로 맞는 분배
      elements: { fire: 6, wind: 4 },
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
    // 지원금도 첫 값(72 × 1.5 = 108). 기본액 1000이 섞였다면 1500
    expect(service.record(user)?.startGrant).toBe(108n);
    const owner = world.ownerOfUser?.(user);
    if (owner === undefined) throw new Error("no owner");
    expect(world.persistence?.ledger.balanceOf(owner, ASSET_CREDIT)).toBe(108n);
  });
});
