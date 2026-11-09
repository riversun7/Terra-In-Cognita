// 시험 세계 NPC 국가 — docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가(D-460), docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"
// NAS 시험 세계(S2 시험 행성, 시험 2차맵)에 고정 NPC 국가 N개(기본 4)를 둔다: 시험 NPC 세력(s3_test_npc)이 1번이고, 나머지는 팩 국가
// 프리셋 차례의 코드(프리셋이 없으면 npc_nation_02…)다. 모두 고정(D-324)이다.
// 세계 씨앗(D-6041 "세력마다 시작 도시 여러 곳", 60 §7.1 "2~4곳"): 국가마다 시작 도시 수 = 국가 프리셋 성격 칸(큰 나라·작은 나라, 기획 답
// 504 다)을 설정 칸 worldSeed 아래 끝~위 끝 안으로 자른 값, 칸이 없으면 아래 끝(모든 국가 같은 수). NPC 도시 이름은 프리셋 도시 이름 목록을
// 차례로 쓴다(기획 답 510 다, D-476 번역 안 함 — 이름이 없는 도시만 켤 때 채운다). docs/adr/2026-11-07-play-flow.md "WP5 나라 성격".
// 고정 나라가 아닌 세력(반란·독립·새 가문)의 도시는 그 세력이 따르는 나라(반란 부모 → 종주 → 태어날 때 부모, 화폐·성격과 같은 차례)의 목록에서
// 이름을 받는다(기획 답 601 나, nationPresetOf). 따르는 나라가 없을 때만 이름 없이 둔다(화면은 "<국가> 도시 N").
// 시작 도시 자리: 행성 값이 있는 세계는 국가마다 행성 위 자기 자리(수도 + 붙은 2차맵, 다른 세력 영향권 밖 — world/worldLayout.ts,
// docs/adr/2026-11-07-world-layout.md), 행성 값이 없는 세계(시험·DB만 있는 개발)는 옛 방식대로 띄운 시험 2차맵들에 고르게 나눈다
// (자리 차례 = 칸 자리마다 2차맵을 돈다). 켤 때마다 모자란 도시만 더한다(있는 도시는 그대로,
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
/** [임시] 새 시작 도시의 주거 기본값(옛 시작 도시와 같다). 실제 값은 설정 칸 npc_seed_housing(worldSeed.startHousing) */
export const START_CITY_HOUSING = 40;

/** 새 시작 도시의 주거(설정 칸, 4 이상 정수 — 칸이 없거나 틀리면 기본값) */
export function startHousingOf(seed: WorldSeedCoefficients): number {
  const value = Math.trunc(seed.startHousing);
  return Number.isFinite(value) && value >= 4 ? value : START_CITY_HOUSING;
}

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
  /** 처음 창고 생필품: 휴먼 수 × 몇 시간분(기획 답 554 다, 없으면 48시간) */
  readonly startNecessityHours?: number | undefined;
  /** 처음 창고 특산 물건: NPC 도시 하나가 한 번 받는 고정 양(팩 수량 = 묶음 단위, 554 다) */
  readonly startStock?: readonly { readonly item: string; readonly qty: number }[] | undefined;
}

/** 팩 국가 프리셋(D-086) 하나: 시험 국가의 코드·이름(질문 203 가: 시험 세력 + 프리셋 차례)·성격·도시 이름 */
export interface NationPreset {
  readonly code: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly personality?: NationPersonality | undefined;
  /** NPC 도시 이름(번역하지 않는다, D-476) */
  readonly cityNames?: readonly string[] | undefined;
  /** 국가 지도자 사이보그 이름(docs/adr/2026-11-07-play-flow.md "WP-NPC", 팩 [임시]). 없으면 화면이 "지도자" */
  readonly leaderName?: { readonly ko: string; readonly en: string } | undefined;
  /** NPC 휴먼 이름 조각(기획 답 773 나, 번역 안 함 — npc/humanNames.ts, "WP-NPC4", 팩 [임시]). 없으면 화면이 "휴먼 #ID" */
  readonly humanNames?: { readonly given: readonly string[]; readonly family: readonly string[] } | undefined;
  /** 세력 약어·시그니처 컬러(docs/adr/2026-11-09-faction-profiles.md, 팩 [임시]). 세력 정체성을 처음 정할 때 쓴다 */
  readonly shortName?: string | undefined;
  readonly color?: string | undefined;
  /** 나라 화폐(원장 자산 = "cur:<code>")와 표시(기호·3글자 약어). 화폐 표시를 처음 정할 때 쓴다 */
  readonly currency?:
    | {
        readonly code: string;
        readonly name: { readonly ko: string; readonly en: string };
        readonly symbol?: string | undefined;
        readonly ticker?: string | undefined;
      }
    | undefined;
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

/** 국가 지도자 이름(세력 코드의 프리셋 leaderName — 1번은 nationName과 같은 16번째 프리셋). 없으면 undefined */
export function nationLeaderName(
  code: string,
  presets: readonly NationPreset[] = [],
): { ko: string; en: string } | undefined {
  const name = presetOfCode(code, presets)?.leaderName;
  return name ? { ko: name.ko, en: name.en } : undefined;
}

/**
 * 세력 코드의 국가 프리셋(이름·성격·도시 이름): 1번(시험 NPC 세력)은 MAX_TEST_NATIONS번째(팩 16번째) 프리셋, 2번부터는 코드가 같은 프리셋.
 * 없으면 undefined(프리셋 없는 시험 국가 npc_nation_NN·유저 세력)
 */
export function presetOfCode(code: string, presets: readonly NationPreset[] = []): NationPreset | undefined {
  if (code === TEST_NPC_FACTION_CODE) return presets[MAX_TEST_NATIONS - 1];
  return presets.find((entry) => entry.code === code);
}

/** 나라를 따라 올라가는 세력 하나(거울 세계 SimFaction·세력 행 모두 이 모양) */
export interface NationLink {
  readonly code: string;
  /** 반란으로 생긴 세력이면 되찾으려는 원래 세력 */
  readonly rebelOf: number | null;
  /** 종주(봉신 관계) */
  readonly overlord: number | null;
  /** 태어날 때 부모(세력 행 born_of, 기획 답 620 나 — 독립을 고른 새 가문처럼 반란 부모·종주가 없는 세력). 모르면 null·없음 */
  readonly bornOf?: number | null | undefined;
}

/**
 * 세력이 따르는 나라 프리셋(기획 답 601 나 — 화폐·성격과 같은 "부모 나라를 따른다" 차례): 자기 코드의 프리셋 → 반란 부모 → 종주 → 태어날 때
 * 부모 가운데 처음 있는 세력을 따라 올라간다. 끝까지 없으면 undefined(프리셋 없는 시험 국가·유저 세력·부모 없는 세력)
 */
export function nationPresetOf(
  id: number,
  linkOf: (id: number) => NationLink | undefined,
  presets: readonly NationPreset[],
  seen = new Set<number>(),
): NationPreset | undefined {
  const link = linkOf(id);
  if (!link) return undefined;
  const own = presetOfCode(link.code, presets);
  if (own) return own;
  seen.add(id);
  for (const parentId of [link.rebelOf, link.overlord, link.bornOf ?? null])
    if (parentId !== null && !seen.has(parentId) && linkOf(parentId) !== undefined)
      return nationPresetOf(parentId, linkOf, presets, seen);
  return undefined;
}

/** 이름이 모자랄 때 붙이는 번호의 끝(목록 32개 × 이 수까지 — 넘으면 이름 없이 둔다) */
const CITY_NAME_ROUNDS = 999;

/**
 * 이름 목록에서 아직 쓰지 않은 첫 이름. 목록을 다 쓰면 번호를 붙여 다시 돈다("<첫 이름> 2", "<둘째 이름> 2", …, "<첫 이름> 3" — 기획 답
 * 552 다). 목록이 없으면 undefined
 */
export function nextCityName(
  names: readonly string[] | undefined,
  used: ReadonlySet<string>,
): string | undefined {
  if (!names || names.length === 0) return undefined;
  const free = names.find((name) => !used.has(name));
  if (free !== undefined) return free;
  for (let round = 2; round <= CITY_NAME_ROUNDS; round += 1)
    for (const name of names) {
      const numbered = `${name} ${String(round)}`;
      if (!used.has(numbered)) return numbered;
    }
  return undefined;
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

/** 이미 선 도시 하나(새 시작 도시 자리를 고를 때 본다) */
export interface ExistingCity extends CitySpot {
  readonly factionId: number;
  readonly start: boolean;
  /** 발전도(영향권 반경 = 등급, D-104) */
  readonly development: number;
}

/**
 * 새 시작 도시 자리를 고르는 함수(행성 값이 있는 세계: world/worldBoot.ts가 세계 배치 worldLayout.ts로 만든다 — 국가마다 행성 위 자기
 * 자리, docs/adr/2026-11-07-world-layout.md). 없으면 옛 방식(시험 2차맵들에 나눔, planStartCities)
 */
export type StartCityPlacer = (
  nations: readonly { readonly factionId: number; readonly code: string; readonly missing: number }[],
  existing: readonly ExistingCity[],
  ruins: readonly CitySpot[],
) => readonly { readonly factionId: number; readonly spot: CitySpot }[];

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
    /** 새 시작 도시 자리(행성 값이 있는 세계). 없으면 시험 2차맵들에 나눈다 */
    placer?: StartCityPlacer | undefined;
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
    `select faction_id, map_key, cell_x, cell_y, start, development from world_cities where planet_id = $1 order by id`,
    [options.planetId],
  );
  const have = new Map<number, number>();
  for (const row of cities.rows)
    if (row.start === true) have.set(Number(row.faction_id), (have.get(Number(row.faction_id)) ?? 0) + 1);
  const nations = codes.flatMap((code) => {
    const factionId = idOf.get(code);
    if (factionId === undefined) return [];
    const want = startCitiesFor(options.seed, presetOfCode(code, options.presets)?.personality?.startCities);
    return [{ factionId, code, missing: Math.max(0, want - (have.get(factionId) ?? 0)) }];
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
  const existing: ExistingCity[] = cities.rows.map((row) => ({
    factionId: Number(row.faction_id),
    mapKey: Number(row.map_key),
    x: Number(row.cell_x),
    y: Number(row.cell_y),
    start: row.start === true,
    development: Number(row.development ?? 0),
  }));
  const ruinSpots = ruins.rows.map((row) => ({
    mapKey: Number(row.map_key),
    x: Number(row.cell_x),
    y: Number(row.cell_y),
  }));
  const planned = nations.some((nation) => nation.missing > 0)
    ? options.placer
      ? options.placer(nations, existing, ruinSpots)
      : planStartCities(nations, options.mapKeys, taken)
    : [];
  for (const { factionId, spot } of planned)
    await pool.query(
      `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms)
       select coalesce((select max(id) from world_cities), 0) + 1, $1, $2, $3, $4, $5, true, $6, 1, $7`,
      [factionId, options.planetId, spot.mapKey, spot.x, spot.y, startHousingOf(options.seed), options.nowMs],
    );
  const fixedNames = codes.flatMap((code) => {
    const factionId = idOf.get(code);
    const names = presetOfCode(code, options.presets)?.cityNames;
    return factionId === undefined || !names ? [] : [{ factionId, names }];
  });
  // 고정 나라 다음에 그 밖의 NPC 세력(세력 ID 차례)이 따르는 나라 목록에서(601 나 — 실행 중에 이름을 받지 못한 옛 마을)
  await nameNationCities(pool, options.planetId, [
    ...fixedNames,
    ...(await followerNames(pool, new Set(idOf.values()), options.presets ?? [])),
  ]);
  return planned.length;
}

/**
 * 고정 나라가 아닌 NPC 세력마다 따르는 나라의 도시 이름 목록(601 나): 세력 행의 반란 부모(rebel_of)·종주(parent_id)를 따라 올라간다(사라진
 * 세력 행도 고리로 쓴다)·태어날 때 부모(born_of, 기획 답 620 나 — 이 판 전에 태어난 세력은 비어 있어 모른다)
 */
async function followerNames(
  pool: QueryPool,
  fixed: ReadonlySet<number>,
  presets: readonly NationPreset[],
): Promise<{ factionId: number; names: readonly string[] }[]> {
  if (presets.length === 0) return [];
  const found = await pool.query(
    `select id, code, parent_id, rebel_of, born_of from factions where kind = 'npc' order by id`,
  );
  const links = new Map<number, NationLink>(
    found.rows.map((row) => [
      Number(row.id),
      {
        code: typeof row.code === "string" ? row.code : "",
        rebelOf: row.rebel_of === null ? null : Number(row.rebel_of),
        overlord: row.parent_id === null ? null : Number(row.parent_id),
        bornOf: row.born_of === null || row.born_of === undefined ? null : Number(row.born_of),
      },
    ]),
  );
  return [...links.keys()].flatMap((factionId) => {
    if (fixed.has(factionId)) return [];
    const names = nationPresetOf(factionId, (id) => links.get(id), presets)?.cityNames;
    return names ? [{ factionId, names }] : [];
  });
}

/**
 * NPC 도시 이름(기획 답 510 다·552 다): 국가마다 그 행성의 이름 없는 도시(ID 차례)에 프리셋 목록에서 그 행성 도시·폐허가 아직 쓰지 않은
 * 이름을 붙인다(폐허 이름은 복원되면 그 도시가 되찾으므로 비워 둔다). 목록을 다 쓰면 번호를 붙인다("<첫 이름> 2", nextCityName). 이미 붙은
 * 이름은 고치지 않는다(멱등 — 목록을 바꿔도, 점령으로 주인이 바뀌어도 옛 이름은 그대로). 붙인 수를 돌려준다
 */
export async function nameNationCities(
  pool: QueryPool,
  planetId: string,
  nations: readonly { readonly factionId: number; readonly names: readonly string[] }[],
): Promise<number> {
  if (nations.length === 0) return 0;
  const [result, ruins] = await Promise.all([
    pool.query(`select id, faction_id, name from world_cities where planet_id = $1 order by id`, [planetId]),
    pool.query(`select name from world_ruins where planet_id = $1 and name is not null`, [planetId]),
  ]);
  const used = new Set(
    [...result.rows, ...ruins.rows].flatMap((row) => (typeof row.name === "string" ? [row.name] : [])),
  );
  let named = 0;
  for (const nation of nations) {
    const mine = result.rows.filter((row) => Number(row.faction_id) === nation.factionId);
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
    /** 새 시작 도시 자리(행성 값이 있는 세계, ensureTestNations) */
    placer?: StartCityPlacer | undefined;
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
    placer: options.placer,
  });
}
