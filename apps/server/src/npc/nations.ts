// 시험 세계 NPC 국가 — docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가(D-460), docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"
// NAS 시험 세계(S2 시험 행성, 시험 2차맵)에 고정 NPC 국가 N개(기본 4)를 둔다: 시험 NPC 세력(s3_test_npc)이 1번이고, 나머지는 팩 국가
// 프리셋 차례의 코드(프리셋이 없으면 npc_nation_02…)다. 모두 고정(D-324)이다.
// 세계 씨앗(D-6041 "세력마다 시작 도시 여러 곳", 60 §7.1 "2~4곳"): 국가마다 시작 도시 수 = 국가 프리셋 성격 칸(큰 나라·작은 나라, 기획 답
// 504 다)을 설정 칸 worldSeed 아래 끝~위 끝 안으로 자른 값, 칸이 없으면 아래 끝(모든 국가 같은 수). NPC 도시 이름은 프리셋 도시 이름 목록을
// 차례로 쓴다(기획 답 510 다, D-476 번역 안 함 — 이름이 없는 도시만 켤 때 채운다). docs/adr/2026-11-07-play-flow.md "WP5 나라 성격".
// 시작 도시는 띄운 시험 2차맵들에 고르게 나눈다(자리 차례 = 칸 자리마다 2차맵을 돈다). 켤 때마다 모자란 도시만 더한다(있는 도시는 그대로,
// 옛 세계의 첫 장 고정 자리 도시도 그대로 — 멱등). 시작 도시는 주인이 바뀌지 않으므로(D-325·D-341) 지우거나 옮기지 않는다.
// 체제는 국가 차례로 셋을 돌리고(시뮬 "mixed"와 같다), 성향은 NPC 사회 런타임이 세계 시드로 굴려 채운다(D-327).
import { PLACEMENT_SIZE, type WorldSeedCoefficients, startCitiesFor } from "@terra/sim";
import { ensureTestStartCities } from "../world/cities.ts";
import type { QueryPool } from "../world/persist/load.ts";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";

/** 시험 국가 수 상한(NPC_TEST_NATIONS) = 팩 국가 프리셋 수 */
export const MAX_TEST_NATIONS = 16;
/** 2번부터의 국가 코드 앞머리 */
export const NATION_CODE_PREFIX = "npc_nation_";
/** [임시] 새 시작 도시의 주거(옛 시작 도시와 같다) */
export const START_CITY_HOUSING = 40;

const REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
const MID = PLACEMENT_SIZE >> 1;
/**
 * 2차맵 한 장 안의 시작 도시 자리 차례(첫 자리 = 가운데). 옛 세계의 고정 자리((64,64)·(192,64)·(64,192) 등)를 품어서 옛 도시가 그 자리를
 * 차지한 것으로 친다. 서로 40칸 넘게 떨어진다
 */
export const START_CITY_SLOTS: readonly (readonly [number, number])[] = [
  [MID, MID],
  [64, 64],
  [192, 192],
  [192, 64],
  [64, 192],
  [MID, 40],
  [MID, 216],
  [40, MID],
  [216, MID],
  [24, 24],
  [232, 24],
  [24, 232],
  [232, 232],
  [MID, 88],
  [MID, 168],
  [88, MID],
  [168, MID],
];
/** 이 거리(칸) 안에 같은 2차맵 도시가 있으면 그 자리는 찼다 */
export const START_CITY_GAP = 32;

/** 나라 성격(팩 국가 프리셋 personality, 기획 답 504 다·531 다·533 다). 칸마다 없으면 모든 국가가 같은 기본 */
export interface NationPersonality {
  /** 시작 도시 수(설정 칸 아래 끝~위 끝 안으로 자른다) */
  readonly startCities?: number | undefined;
  /** 도시 직무: 그 시설 건물이 없는 NPC 도시의 휴먼이 돌리는 레시피(npc/economy.ts) */
  readonly cityJobs?: readonly { readonly facility: string; readonly recipe: string }[] | undefined;
  /** 처음 창고: NPC 도시 하나가 한 번 받는 물건(팩 수량 = 묶음 단위) */
  readonly startStock?: readonly { readonly item: string; readonly qty: number }[] | undefined;
}

/** 팩 국가 프리셋(D-086) 하나: 시험 국가의 코드·이름(질문 203 가: 시험 세력 + 프리셋 차례)·성격·도시 이름 */
export interface NationPreset {
  readonly code: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly personality?: NationPersonality | undefined;
  /** NPC 도시 이름(번역하지 않는다, D-476) */
  readonly cityNames?: readonly string[] | undefined;
}

/** n번째 국가 코드(1번 = 시험 NPC 세력, 2번부터 = 팩 프리셋 차례, 프리셋이 없으면 npc_nation_NN) */
export function nationCode(n: number, presets: readonly NationPreset[] = []): string {
  if (n === 1) return TEST_NPC_FACTION_CODE;
  return presets[n - 2]?.code ?? `${NATION_CODE_PREFIX}${String(n).padStart(2, "0")}`;
}

/**
 * [임시] 화면 이름(세력 표에 이름 칸이 아직 없다): 프리셋 코드 → 프리셋 이름, npc_nation_NN → "시험 NPC 국가 N".
 * 1번(시험 NPC 세력)은 2번부터의 코드가 쓰지 않는 프리셋(MAX_TEST_NATIONS번째 = 팩 16번째)의 이름이다 — 16개 프리셋이 16개 국가에 하나씩
 * 붙는다. 그 프리셋이 없으면 "시험 NPC 국가 1"
 */
export function nationName(
  code: string,
  presets: readonly NationPreset[] = [],
): { ko: string; en: string } | undefined {
  const preset = presetOfCode(code, presets);
  if (preset) return { ko: preset.name.ko, en: preset.name.en };
  if (code === TEST_NPC_FACTION_CODE) return { ko: "시험 NPC 국가 1", en: "Test NPC nation 1" };
  if (!code.startsWith(NATION_CODE_PREFIX)) return undefined;
  const n = Number(code.slice(NATION_CODE_PREFIX.length));
  return Number.isInteger(n) ? { ko: `시험 NPC 국가 ${n}`, en: `Test NPC nation ${n}` } : undefined;
}

/**
 * 세력 코드의 국가 프리셋(이름·성격·도시 이름): 1번(시험 NPC 세력)은 MAX_TEST_NATIONS번째(팩 16번째) 프리셋, 2번부터는 코드가 같은 프리셋.
 * 없으면 undefined(프리셋 없는 시험 국가 npc_nation_NN·유저 세력)
 */
export function presetOfCode(code: string, presets: readonly NationPreset[] = []): NationPreset | undefined {
  if (code === TEST_NPC_FACTION_CODE) return presets[MAX_TEST_NATIONS - 1];
  return presets.find((entry) => entry.code === code);
}

/** 이름 목록에서 아직 쓰지 않은 첫 이름(없으면 undefined) */
export function nextCityName(
  names: readonly string[] | undefined,
  used: ReadonlySet<string>,
): string | undefined {
  return names?.find((name) => !used.has(name));
}

/** 시작 도시 자리(2차맵 키, 칸) */
export interface CitySpot {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/**
 * 국가마다 모자란 시작 도시의 자리를 고른다(순수 함수). 후보 차례 = 자리 차례마다 2차맵 차례(가운데를 모든 2차맵에 먼저, 다음 자리…)라
 * 한 국가의 도시가 서로 다른 2차맵에 가고 2차맵마다 도시 수가 고르다. 국가 차례로 앞 후보부터 빈 것을 가진다. 같은 2차맵에서
 * START_CITY_GAP 안에 도시(옛 도시·다른 세력 도시·이번에 고른 도시)가 있는 후보는 건너뛴다. 후보가 다 차면 남은 도시는 고르지 않는다
 */
export function planStartCities(
  nations: readonly { readonly factionId: number; readonly missing: number }[],
  mapKeys: readonly number[],
  taken: readonly CitySpot[],
): { factionId: number; spot: CitySpot }[] {
  const used: CitySpot[] = [...taken];
  const gap2 = START_CITY_GAP * START_CITY_GAP;
  const free = (spot: CitySpot) =>
    used.every((other) => {
      if (other.mapKey !== spot.mapKey) return true;
      const dx = other.x - spot.x;
      const dy = other.y - spot.y;
      return dx * dx + dy * dy >= gap2;
    });
  const candidates: CitySpot[] = START_CITY_SLOTS.flatMap(([x, y]) =>
    mapKeys.map((mapKey) => ({ mapKey, x, y })),
  );
  const out: { factionId: number; spot: CitySpot }[] = [];
  for (const nation of nations) {
    for (let k = 0; k < nation.missing; k++) {
      const spot = candidates.find(free);
      if (!spot) return out;
      used.push(spot);
      out.push({ factionId: nation.factionId, spot });
    }
  }
  return out;
}

/**
 * 고정 국가 1…count를 (없을 때만) 만들고, 국가마다 시작 도시를 설정 칸 수만큼 채운다(모자란 것만). 1번 세력 행·소유 주체는
 * persist/load.ts ensureTestNpcOwner가 먼저 만든다. 이미 있는 세력·도시 행은 고치지 않는다(1번은 고정 표시만 켠다).
 * 더한 도시 수를 돌려준다
 */
export async function ensureTestNations(
  pool: QueryPool,
  options: {
    count: number;
    planetId: string;
    /** 띄운 시험 2차맵(새 시작 도시를 나눌 곳) */
    mapKeys: readonly number[];
    nowMs: number;
    presets?: readonly NationPreset[] | undefined;
    /** 세계 씨앗 설정 칸(시작 도시 수) */
    seed: WorldSeedCoefficients;
  },
): Promise<number> {
  const count = Math.max(1, Math.min(MAX_TEST_NATIONS, options.count));
  await pool.query(`update factions set fixed = true where code = $1`, [TEST_NPC_FACTION_CODE]);
  for (let n = 2; n <= count; n++) {
    const code = nationCode(n, options.presets);
    const regime = REGIMES[(n - 1) % REGIMES.length] ?? "democracy";
    await pool.query(
      `insert into factions (kind, code, regime, fixed) values ('npc', $1, $2, true) on conflict (code) do nothing`,
      [code, regime],
    );
    await pool.query(
      `insert into world_owners (id, faction_id, settled_at_ms)
       select coalesce((select max(id) from world_owners), 0) + 1, f.id, $2 from factions f
       where f.code = $1 and not exists (select 1 from world_owners o where o.faction_id = f.id)`,
      [code, options.nowMs],
    );
  }
  const codes = Array.from({ length: count }, (_, index) => nationCode(index + 1, options.presets));
  const factions = await pool.query(`select id, code from factions where code = any($1::text[])`, [codes]);
  const idOf = new Map(factions.rows.map((row) => [String(row.code), Number(row.id)]));
  const cities = await pool.query(
    `select faction_id, map_key, cell_x, cell_y, start from world_cities where planet_id = $1`,
    [options.planetId],
  );
  const have = new Map<number, number>();
  for (const row of cities.rows)
    if (row.start === true) have.set(Number(row.faction_id), (have.get(Number(row.faction_id)) ?? 0) + 1);
  const nations = codes.flatMap((code) => {
    const factionId = idOf.get(code);
    if (factionId === undefined) return [];
    const want = startCitiesFor(options.seed, presetOfCode(code, options.presets)?.personality?.startCities);
    return [{ factionId, missing: Math.max(0, want - (have.get(factionId) ?? 0)) }];
  });
  // 폐허 자리(docs/adr/2026-11-07-ruins-restoration.md)도 찬 자리로 친다(복원되면 같은 자리에 도시가 돌아온다)
  const ruins = await pool.query(`select map_key, cell_x, cell_y from world_ruins where planet_id = $1`, [
    options.planetId,
  ]);
  const taken = [...cities.rows, ...ruins.rows].map((row) => ({
    mapKey: Number(row.map_key),
    x: Number(row.cell_x),
    y: Number(row.cell_y),
  }));
  const planned = planStartCities(nations, options.mapKeys, taken);
  for (const { factionId, spot } of planned)
    await pool.query(
      `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms)
       select coalesce((select max(id) from world_cities), 0) + 1, $1, $2, $3, $4, $5, true, $6, 1, $7`,
      [factionId, options.planetId, spot.mapKey, spot.x, spot.y, START_CITY_HOUSING, options.nowMs],
    );
  await nameNationCities(
    pool,
    options.planetId,
    codes.flatMap((code) => {
      const factionId = idOf.get(code);
      const names = presetOfCode(code, options.presets)?.cityNames;
      return factionId === undefined || !names ? [] : [{ factionId, names }];
    }),
  );
  return planned.length;
}

/**
 * NPC 도시 이름(기획 답 510 다): 국가마다 그 행성의 이름 없는 도시(ID 차례)에 프리셋 목록에서 그 국가 도시가 아직 쓰지 않은 이름을 붙인다.
 * 이미 붙은 이름은 고치지 않는다(멱등 — 목록을 바꿔도 옛 이름은 그대로). 목록이 모자라면 남은 도시는 이름 없이 둔다(화면이 "도시 N").
 * 붙인 수를 돌려준다
 */
export async function nameNationCities(
  pool: QueryPool,
  planetId: string,
  nations: readonly { readonly factionId: number; readonly names: readonly string[] }[],
): Promise<number> {
  if (nations.length === 0) return 0;
  const result = await pool.query(
    `select id, faction_id, name from world_cities where planet_id = $1 and faction_id = any($2::bigint[]) order by id`,
    [planetId, nations.map((nation) => nation.factionId)],
  );
  let named = 0;
  for (const nation of nations) {
    const mine = result.rows.filter((row) => Number(row.faction_id) === nation.factionId);
    const used = new Set(mine.flatMap((row) => (typeof row.name === "string" ? [row.name] : [])));
    for (const row of mine) {
      if (typeof row.name === "string") continue;
      const name = nextCityName(nation.names, used);
      if (name === undefined) break;
      used.add(name);
      await pool.query(`update world_cities set name = $1 where id = $2 and name is null`, [
        name,
        Number(row.id),
      ]);
      named += 1;
    }
  }
  return named;
}

/**
 * 부팅 때 세계의 국가·시작 도시를 차린다(world.ts가 한 번 부른다): NPC 사회 세계(npc 설정이 있음)는 고정 국가 1…N과 국가마다 시작 도시
 * 여러 곳(ensureTestNations), NPC 사회를 끈 세계는 옛 방식 그대로 시험 NPC 세력의 2차맵마다 가운데 도시(world/cities.ts)
 */
export async function ensureWorldNations(
  pool: QueryPool,
  options: {
    npc: { readonly testNations: number; readonly presets?: readonly NationPreset[] | undefined } | undefined;
    planetId: string;
    mapKeys: readonly number[];
    nowMs: number;
    seed: WorldSeedCoefficients;
  },
): Promise<void> {
  const { npc, planetId, mapKeys, nowMs } = options;
  if (!npc) {
    await ensureTestStartCities(pool, TEST_NPC_FACTION_CODE, planetId, mapKeys, nowMs);
    return;
  }
  await ensureTestNations(pool, {
    count: npc.testNations,
    planetId,
    mapKeys,
    nowMs,
    presets: npc.presets,
    seed: options.seed,
  });
}
