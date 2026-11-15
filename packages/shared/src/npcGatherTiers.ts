// NPC 배후지 채집의 티어 규칙을 팩 오브젝트에서 끌어낸다 — 기획 D-562 1562(사용자 "무슨말이냐 npc도 스탯티어 따른다"), D-552(오브젝트 티어 범위),
// docs/adr/2026-11-15-gather-object-tiers.md "바뀜 (2026-11-15, D-562)".
// NPC 경제(시뮬·서버 NPC 도시)는 2차맵 오브젝트를 하나하나 캐지 않고 배후지 칸 몫으로 돈다. 그래서 NPC 채집 시설 = 그 시설이 맡는 오브젝트들을
// 한데 모은 것으로 보고, 플레이어와 같은 확률표 하나로 뽑은 티어에 그 묶음의 규칙을 건다:
// - 위 끝 = 묶음 오브젝트 범위의 가장 높은 위 끝. 아래 끝은 막지 않는다(T0 — 배후지에는 늘 낮은 티어 오브젝트가 섞인다: 낙석·잔가지·물터).
// - 자리(배후지 땅)에 따라 묶음이 다르다:
//   · 산지 전용 = 바위 지표 오브젝트(source rock — 광맥, 산비탈). 평지 위 끝(rock 뺀 묶음)과 산지 위 끝(rock 넣은 묶음)이 다르면 평지 위
//     끝 위를 뽑은 번은 배후지 광석의 산지 몫(highOrePm)만큼만 그대로 둔다(@terra/shared/catchment oreTierCapOf — 옛 산지 규칙의 자리,
//     설정 칸 ore_low_tier_max·ore_flat_high_pm은 없앴다).
//   · 물 오브젝트 = 물 종류(waters)가 있는 밭·물터(source plot)와 어군(source school — 집 물 = 수가 가장 많은 바이옴의 물 종류). 낚시터는
//     배후지 물 종류(spotFishWater)의 묶음을 쓴다(설정 칸 fish_tier_*는 없앴다). 그 물 종류 오브젝트가 없으면 모든 물 묶음.
//   · 지형별 특수 자리(source site — 바이옴마다 드물게 서는 운석·거대목·고산 약초 등): 바뀜 (기획 D-566 1722 — D-212 "NPC도 같은 시스템",
//     D-562 1562): 배후지 칸의 바이옴을 아는 자리(서버 NPC 도시 — 행성 칸 바이옴)면 그 바이옴에 서는 자리 오브젝트를 평지·산지 묶음 둘 다에
//     더한다(위 끝·비중). 바이옴을 모르는 자리(시뮬 평면)는 넣지 않는다(옛 규칙 그대로). 저장하지 않고 셈할 때마다 배후지 칸에서 끌어내므로 이미
//     있는 세계 도시에도 그대로 든다(리셋 없음).
//   · 굴림표 오브젝트(난파선·고래 무리)는 티어를 굴리지 않아 넣지 않는다.
// - 같은 티어 아이템 고르기(기획 D-562 1561과 같은 규칙): 묶음 오브젝트의 대표 아이템과 비중을 적은 아이템이 그 티어 후보다(오브젝트 하나마다
//   1씩 더한 비중). 후보가 없는 티어는 고르게.
// 정수만 쓴다. 다른 내부 패키지를 가져오지 않는다.
import { FISH_WATERS, type FishTierRanges, type FishWater, fishWaterOfBiome } from "./fishWater.ts";

/** 티어 끝(T0 ~ T9) */
const TIER_TOP = 9;

/** 규칙을 끌어내는 오브젝트 요약(팩 gather_objects 한 줄) */
export interface NpcObjectSource {
  readonly source: "prop" | "rock" | "plot" | "outcrop" | "site" | "school";
  /** 맡는 시설(없으면 NPC 시설과 상관없다) */
  readonly facility?: string | null | undefined;
  /** 대표 아이템 ID */
  readonly item: string;
  /** 굴림표 오브젝트인가 */
  readonly table?: boolean | undefined;
  /** 티어 범위(없으면 대표 아이템 티어 하나) */
  readonly tierRange?: { readonly min: number; readonly max: number } | undefined;
  /** 아이템별 비중(기획 D-562 1561) */
  readonly itemWeights?: readonly { readonly item: string; readonly weight: number }[] | undefined;
  /** plot: 서는 물 종류(기획 D-562 1565) */
  readonly waters?: readonly FishWater[] | undefined;
  /** school: 바이옴마다 어군 수(집 물 = 수가 가장 많은 바이옴, 같으면 앞 줄) */
  readonly biomes?: readonly { readonly biome: string; readonly amount: number }[] | undefined;
  /** site: 서는 바이옴(기획 D-566 1722 — 배후지에 이 바이옴 칸이 있으면 NPC 묶음에 든다) */
  readonly siteBiomes?: readonly string[] | undefined;
}

/** 묶음 하나의 규칙: 위 끝과 같은 티어 아이템 비중(아이템 ID → 비중) */
export interface NpcTierRule {
  readonly maxTier: number;
  readonly weights: ReadonlyMap<string, number>;
}

/** NPC 채집 시설 하나의 규칙(묶음이 없는 자리는 undefined) */
export interface NpcFacilityTiers {
  /** 어디에나 서는 오브젝트(rock·site·물 오브젝트 빼고) */
  readonly flat?: NpcTierRule | undefined;
  /** 산지 = 위 + 바위 지표 오브젝트 */
  readonly mountain?: NpcTierRule | undefined;
  /** 물 종류마다(낚시터 — 물 오브젝트가 있는 시설만) */
  readonly waters?: Readonly<Partial<Record<FishWater, NpcTierRule>>> | undefined;
  /** 모든 물 묶음(배후지 물 종류를 모르거나 그 물 오브젝트가 없을 때) */
  readonly anyWater?: NpcTierRule | undefined;
  /** 지형별 특수 자리(서는 바이옴마다 — 기획 D-566 1722). 배후지 바이옴을 알 때만 더한다 */
  readonly sites?: readonly { readonly biomes: readonly string[]; readonly rule: NpcTierRule }[] | undefined;
}

const clampTier = (tier: number): number => Math.max(0, Math.min(TIER_TOP, Math.trunc(tier)));

/** 쌓는 중인 묶음 */
interface Pool {
  maxTier: number;
  readonly weights: Map<string, number>;
}

function addTo(pool: Pool | undefined, maxTier: number, picks: readonly string[]): Pool {
  const out = pool ?? { maxTier: 0, weights: new Map<string, number>() };
  out.maxTier = Math.max(out.maxTier, maxTier);
  for (const item of picks) out.weights.set(item, (out.weights.get(item) ?? 0) + 1);
  return out;
}

/** 오브젝트의 집 물 종류들(plot waters, school = 수가 가장 많은 바이옴) */
function watersOf(object: NpcObjectSource): FishWater[] {
  if (object.source === "plot") return [...(object.waters ?? [])];
  if (object.source !== "school") return [];
  let best: { water: FishWater; amount: number } | undefined;
  for (const row of object.biomes ?? []) {
    const water = fishWaterOfBiome(row.biome);
    if (water !== undefined && (!best || row.amount > best.amount)) best = { water, amount: row.amount };
  }
  return best ? [best.water] : [];
}

/**
 * 시설 ID → NPC 규칙(머리 주석). itemTier = 대표 아이템 티어(범위가 없는 오브젝트의 위 끝, 모르면 0). 맡는 시설이 없는 오브젝트는 빠진다
 */
export function npcGatherTiersOf(
  objects: readonly NpcObjectSource[],
  itemTier: (item: string) => number | undefined,
): Map<string, NpcFacilityTiers> {
  const pools = new Map<
    string,
    {
      flat?: Pool;
      mountain?: Pool;
      waters: Map<FishWater, Pool>;
      anyWater?: Pool;
      sites: { biomes: readonly string[]; rule: Pool }[];
    }
  >();
  for (const object of objects) {
    if (!object.facility || object.table === true) continue;
    if (object.source === "site" && (object.siteBiomes?.length ?? 0) === 0) continue;
    const own = clampTier(itemTier(object.item) ?? 0);
    const maxTier = clampTier(object.tierRange ? Math.max(object.tierRange.min, object.tierRange.max) : own);
    const picks = [
      object.item,
      ...(object.itemWeights ?? []).filter((row) => row.weight > 0).map((row) => row.item),
    ];
    let entry = pools.get(object.facility);
    if (!entry) {
      entry = { waters: new Map(), sites: [] };
      pools.set(object.facility, entry);
    }
    if (object.source === "site") {
      entry.sites.push({ biomes: [...(object.siteBiomes ?? [])], rule: addTo(undefined, maxTier, picks) });
      continue;
    }
    const waters = watersOf(object);
    if (waters.length > 0 || object.source === "school") {
      for (const water of waters) entry.waters.set(water, addTo(entry.waters.get(water), maxTier, picks));
      entry.anyWater = addTo(entry.anyWater, maxTier, picks);
      continue;
    }
    if (object.source !== "rock") entry.flat = addTo(entry.flat, maxTier, picks);
    entry.mountain = addTo(entry.mountain, maxTier, picks);
  }
  const out = new Map<string, NpcFacilityTiers>();
  for (const [facility, entry] of pools) {
    const waters: Partial<Record<FishWater, NpcTierRule>> = {};
    for (const water of FISH_WATERS) {
      const pool = entry.waters.get(water);
      if (pool) waters[water] = pool;
    }
    out.set(facility, {
      ...(entry.flat ? { flat: entry.flat } : {}),
      ...(entry.mountain ? { mountain: entry.mountain } : {}),
      ...(entry.anyWater ? { waters, anyWater: entry.anyWater } : {}),
      ...(entry.sites.length > 0 ? { sites: entry.sites } : {}),
    });
  }
  return out;
}

/** 두 묶음 합치기(위 끝 = 큰 쪽, 비중 = 더함). 한쪽이 없으면 다른 쪽 그대로 */
function mergeRule(a: NpcTierRule | undefined, b: NpcTierRule | undefined): NpcTierRule | undefined {
  if (!a || !b) return a ?? b;
  const weights = new Map(a.weights);
  for (const [item, weight] of b.weights) weights.set(item, (weights.get(item) ?? 0) + weight);
  return { maxTier: Math.max(a.maxTier, b.maxTier), weights };
}

/** 규칙 → 바이옴 자리 열쇠(맞는 자리 번호) → 자리를 더한 평지·산지 묶음(셈할 때마다 합치지 않게 붙잡는다) */
const siteCache = new WeakMap<
  NpcFacilityTiers,
  Map<string, { flat?: NpcTierRule | undefined; mountain?: NpcTierRule | undefined }>
>();

/** 배후지 바이옴에 서는 자리를 평지·산지 묶음에 더한다(바이옴을 모르거나 맞는 자리가 없으면 그대로) */
function withSites(
  tiers: NpcFacilityTiers,
  biomes: ReadonlySet<string> | undefined,
): { flat?: NpcTierRule | undefined; mountain?: NpcTierRule | undefined } {
  const sites = tiers.sites;
  if (!sites || !biomes || biomes.size === 0) return tiers;
  const hits: number[] = [];
  sites.forEach((site, index) => {
    if (site.biomes.some((biome) => biomes.has(biome))) hits.push(index);
  });
  if (hits.length === 0) return tiers;
  const key = hits.join(",");
  let byKey = siteCache.get(tiers);
  if (!byKey) {
    byKey = new Map();
    siteCache.set(tiers, byKey);
  }
  const known = byKey.get(key);
  if (known) return known;
  let extra: NpcTierRule | undefined;
  for (const index of hits) extra = mergeRule(extra, sites[index]?.rule);
  const out = { flat: mergeRule(tiers.flat, extra), mountain: mergeRule(tiers.mountain, extra) };
  byKey.set(key, out);
  return out;
}

/** 굴림 입력에 거는 규칙(@terra/sim rollGatherOutputs의 tierCap·tierRange·weights 모양, 비중은 아이템 ID) */
export interface NpcTierRoll {
  readonly tierCap?: { readonly maxTier: number; readonly keepAbovePm: number } | undefined;
  readonly tierRange?: { readonly min: number; readonly max: number } | undefined;
  readonly weights?: ReadonlyMap<string, number> | undefined;
}

/**
 * 시설 규칙 + 배후지 자리 → 굴림 규칙. water = 배후지 물 종류(낚시터, 모르면 undefined), highOrePm = 배후지 광석의 산지 몫(‰, 모르면
 * undefined — 산지로 셈: 평지 위 끝으로 막지 않는다). 규칙이 없으면 빈 규칙(막지 않는다)
 */
export function npcTierRollOf(
  tiers: NpcFacilityTiers | undefined,
  place: {
    readonly water?: FishWater | undefined;
    readonly highOrePm?: number | undefined;
    /** 배후지 칸 바이옴들(기획 D-566 1722). 없으면 지형별 특수 자리를 넣지 않는다 */
    readonly biomes?: ReadonlySet<string> | undefined;
  },
): NpcTierRoll {
  if (!tiers) return {};
  if (tiers.anyWater) {
    const rule = (place.water === undefined ? undefined : tiers.waters?.[place.water]) ?? tiers.anyWater;
    return { tierRange: { min: 0, max: rule.maxTier }, weights: rule.weights };
  }
  const { flat, mountain } = withSites(tiers, place.biomes);
  if (flat && mountain && mountain.maxTier > flat.maxTier) {
    const high = place.highOrePm;
    const tierCap =
      high === undefined || high >= 1000
        ? undefined
        : { maxTier: flat.maxTier, keepAbovePm: Math.max(0, Math.min(1000, Math.trunc(high))) };
    return {
      ...(tierCap ? { tierCap } : {}),
      tierRange: { min: 0, max: mountain.maxTier },
      weights: mountain.weights,
    };
  }
  const rule = flat ?? mountain;
  return rule ? { tierRange: { min: 0, max: rule.maxTier }, weights: rule.weights } : {};
}

/**
 * 화면용 물 종류마다 범위(낚시터 — 물 오브젝트가 있는 첫 시설): 아래 0 · 위 = 그 물 묶음 위 끝(없으면 모든 물 묶음). 물 오브젝트가 없으면
 * undefined
 */
export function npcFishRanges(tiers: ReadonlyMap<string, NpcFacilityTiers>): FishTierRanges | undefined {
  for (const rule of tiers.values()) {
    const any = rule.anyWater;
    if (!any) continue;
    const range = (water: FishWater) => ({ min: 0, max: (rule.waters?.[water] ?? any).maxTier });
    return {
      fresh: range("fresh"),
      coast: range("coast"),
      shelf: range("shelf"),
      deep: range("deep"),
    };
  }
  return undefined;
}
