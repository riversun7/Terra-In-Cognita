// 시험 세계 NPC 국가 — docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가(D-460)
// NAS 시험 세계(S2 시험 행성, 시험 2차맵)에 NPC 국가 N개(기본 4)를 둔다: 지금 시험 NPC 세력(s3_test_npc, 가운데 시작 도시)이
// 1번이고, 나머지는 팩 국가 프리셋 차례의 코드(프리셋이 없으면 npc_nation_02…)로 시험 2차맵 첫 장의 둘레 칸에 시작 도시를
// 하나씩 둔다. 모두 고정(D-324)이다.
// 체제는 국가 차례로 셋을 돌리고(시뮬 "mixed"와 같다), 성향은 NPC 사회 런타임이 세계 시드로 굴려 채운다(D-327).
import { PLACEMENT_SIZE } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";

/** 시험 국가 수 상한(NPC_TEST_NATIONS) = 팩 국가 프리셋 수 */
export const MAX_TEST_NATIONS = 16;
/** 2번부터의 국가 코드 앞머리 */
export const NATION_CODE_PREFIX = "npc_nation_";

const REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
const MID = PLACEMENT_SIZE >> 1;
/** 2번부터의 시작 도시 칸(가운데는 1번). 2차맵 한 장 256칸 안, 서로 64칸쯤 떨어진다 */
const SLOTS: readonly (readonly [number, number])[] = [
  [64, 64],
  [192, 64],
  [64, 192],
  [192, 192],
  [MID, 40],
  [216, MID],
  [MID, 216],
  [40, MID],
  [24, 24],
  [232, 24],
  [24, 232],
  [232, 232],
  [MID, 96],
  [MID, 160],
  [96, MID],
];

/** 팩 국가 프리셋(D-086) 하나: 시험 국가의 코드·이름(질문 203 가: 시험 세력 + 프리셋 차례) */
export interface NationPreset {
  readonly code: string;
  readonly name: { readonly ko: string; readonly en: string };
}

/** n번째 국가 코드(1번 = 지금 시험 NPC 세력, 2번부터 = 팩 프리셋 차례, 프리셋이 없으면 npc_nation_NN) */
export function nationCode(n: number, presets: readonly NationPreset[] = []): string {
  if (n === 1) return TEST_NPC_FACTION_CODE;
  return presets[n - 2]?.code ?? `${NATION_CODE_PREFIX}${String(n).padStart(2, "0")}`;
}

/** [임시] 화면 이름(세력 표에 이름 칸이 아직 없다): 프리셋 코드 → 프리셋 이름, npc_nation_NN → "시험 NPC 국가 N" */
export function nationName(
  code: string,
  presets: readonly NationPreset[] = [],
): { ko: string; en: string } | undefined {
  const preset = presets.find((entry) => entry.code === code);
  if (preset) return { ko: preset.name.ko, en: preset.name.en };
  if (!code.startsWith(NATION_CODE_PREFIX)) return undefined;
  const n = Number(code.slice(NATION_CODE_PREFIX.length));
  return Number.isInteger(n) ? { ko: `시험 NPC 국가 ${n}`, en: `Test NPC nation ${n}` } : undefined;
}

/**
 * 시험 국가 2…count를 (없을 때만) 만든다: 세력 행(고정·체제), 소유 주체, 시험 2차맵 첫 장의 시작 도시.
 * 1번(시험 NPC 세력)과 그 시작 도시는 world/cities.ts가 만든다. 이미 있는 행은 고치지 않는다
 */
export async function ensureTestNations(
  pool: QueryPool,
  options: {
    count: number;
    planetId: string;
    mapKey: number;
    nowMs: number;
    presets?: readonly NationPreset[] | undefined;
  },
): Promise<void> {
  const count = Math.max(1, Math.min(MAX_TEST_NATIONS, options.count));
  for (let n = 2; n <= count; n++) {
    const code = nationCode(n, options.presets);
    const regime = REGIMES[(n - 1) % REGIMES.length] ?? "democracy";
    const [x, y] = SLOTS[n - 2] ?? [MID, MID];
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
    await pool.query(
      `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms)
       select coalesce((select max(id) from world_cities), 0) + 1, f.id, $2, $3, $4, $5, true, 40, 1, $6
       from factions f where f.code = $1
       and not exists (select 1 from world_cities c where c.faction_id = f.id and c.start)`,
      [code, options.planetId, options.mapKey, x, y, options.nowMs],
    );
  }
}
