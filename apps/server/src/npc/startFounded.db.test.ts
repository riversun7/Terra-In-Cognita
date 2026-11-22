// 쿠데타로 잃은 시작 도시를 다시 켤 때 채우지 않는다 — DB 통합 시험(질문 2612 답, 기획 D-585 8·2572 나, docs/adr/2026-11-21-governance.md "바뀜 (fixes-1117e)").
// TEST_DATABASE_URL이 있을 때만. 계정은 쓰지 않는다.
// 1. 처음 켜면 고정 국가마다 시작 도시를 세우고 세운 수를 적는다(nation_start_cities).
// 2. 쿠데타 길(portCoup.ts cityIndependence와 같은 차례 — 시뮬 society.cityIndependence(coup) → 시작 도시 표시 지움 → 틱 → 저장)으로 한 국가의 도시
//    하나와 다른 국가의 도시 모두를 떼어 낸다.
// 3. 다시 켜도 옛 나라에 새 시작 도시가 서지 않고(도시 줄 수 그대로), 떼어 낸 도시는 시작 도시 표시 없이 새 나라 것으로 남는다. 도시를 모두 잃은
//    고정 국가도 "처음 서는 나라"로 보지 않는다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
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
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  await world.persistence?.writer.durable();
  return world;
}

async function stop(world: World): Promise<void> {
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
}

type CityRow = { id: string; faction_id: string; start: boolean; fixed: boolean };
const cities = () =>
  rows<CityRow>(
    test.db,
    `select c.id, c.faction_id, c.start, f.fixed from world_cities c join factions f on f.id = c.faction_id order by c.id`,
  );
const founded = async (): Promise<Map<number, number>> =>
  new Map(
    (
      await rows<{ faction_id: string; founded: number }>(
        test.db,
        `select faction_id, founded from nation_start_cities order by faction_id`,
      )
    ).map((row) => [Number(row.faction_id), row.founded]),
  );
/** 고정 국가(세력 행 ID 차례)마다 그 국가 것인 시작 도시 ID */
const startsByNation = (list: readonly CityRow[]): Map<number, number[]> => {
  const out = new Map<number, number[]>();
  for (const city of list) {
    if (!city.fixed) continue;
    const id = Number(city.faction_id);
    if (!out.has(id)) out.set(id, []);
    if (city.start) out.get(id)?.push(Number(city.id));
  }
  return out;
};

/** 쿠데타로 도시 하나를 떼어 낸다(governance/portCoup.ts cityIndependence와 같은 차례) */
async function coupSplit(world: World, cityId: number): Promise<void> {
  const npc = world.npc;
  if (!npc) throw new Error("npc");
  const child = npc.society.cityIndependence(cityId, clock, true);
  if (child === undefined) throw new Error(`no split ${String(cityId)}`);
  const city = npc.world.cities.get(cityId);
  if (city) city.start = false;
  await npc.tick(true);
  await world.persistence?.writer.durable();
}

describe.skipIf(!TEST_DATABASE_URL)("쿠데타로 잃은 시작 도시(질문 2612)", () => {
  it("다시 켜도 채우지 않는다: 도시 줄 수 그대로, 떼어 낸 도시는 표시 없이 새 나라 것, 도시를 모두 잃은 고정 국가도 처음 서는 나라가 아니다", async () => {
    const first = await boot();
    const before = await cities();
    const starts = startsByNation(before);
    const [bigId, smallId] = [...starts.keys()].toSorted((a, b) => a - b);
    if (bigId === undefined || smallId === undefined) throw new Error("nations");
    const big = starts.get(bigId) ?? [];
    const small = starts.get(smallId) ?? [];
    expect(big.length).toBeGreaterThanOrEqual(2);
    expect(small.length).toBeGreaterThanOrEqual(1);
    // 1. 세운 수를 적는다
    expect(await founded()).toEqual(
      new Map([
        [bigId, big.length],
        [smallId, small.length],
      ]),
    );
    const techBefore = await rows<{ id: string; tech_level: number }>(
      test.db,
      `select id, tech_level from factions where id = any($1::bigint[]) order by id`,
      [[bigId, smallId]],
    );
    // 2. 쿠데타: 큰 나라 도시 하나(수도가 아닌 마지막), 작은 나라 도시 모두
    const splitCities = [big.at(-1) ?? 0, ...small];
    for (const cityId of splitCities) await coupSplit(first, cityId);
    const split = await cities();
    for (const cityId of splitCities) {
      const row = split.find((city) => Number(city.id) === cityId);
      expect(row?.start).toBe(false);
      expect(row?.fixed).toBe(false);
    }
    expect(startsByNation(split).get(bigId)).toEqual(big.slice(0, -1));
    expect(startsByNation(split).get(smallId) ?? []).toEqual([]);
    await stop(first);

    // 3. 다시 켠다
    clock += 3_600_000;
    const second = await boot();
    const after = await cities();
    expect(after.length).toBe(split.length);
    expect(startsByNation(after).get(bigId)).toEqual(big.slice(0, -1));
    expect(startsByNation(after).get(smallId) ?? []).toEqual([]);
    for (const cityId of splitCities)
      expect(after.find((city) => Number(city.id) === cityId)?.start).toBe(false);
    expect(await founded()).toEqual(
      new Map([
        [bigId, big.length],
        [smallId, small.length],
      ]),
    );
    // 도시를 모두 잃은 나라의 기술 단계를 등급 값으로 다시 올리지 않는다(처음 서는 나라가 아니다)
    expect(
      await rows<{ id: string; tech_level: number }>(
        test.db,
        `select id, tech_level from factions where id = any($1::bigint[]) order by id`,
        [[bigId, smallId]],
      ),
    ).toEqual(techBefore);
    await stop(second);
  }, 120_000);
});
