// 채집 오브젝트 티어 범위 측정(기획 D-552 — docs/adr/2026-11-15-gather-object-tiers.md): 낮은 유효 스탯에서 채집소 일꾼 하나가 시간당 내는 양을
// 오브젝트(반경 안에 그 오브젝트만 있을 때)마다 잰다. 서버 채집 직무와 같은 함수(labor/gatherWork.ts gatherLots — 진행·티어 추첨·수확량·성공
// 확률)를 시설 레벨 1·컨디션 0으로 1,000시간 돌린다.
// "전" = core@95 규칙(시설 사다리를 굴림, 광산은 광석 전용 표 0~39 T0 500·T1 350 / 40~59 T0 500·T1 350·T2 120, 다른 시설은 기본 표, 산지 막기 없음),
// "뒤" = 지금 팩(표 하나 + 묶음마다 그 오브젝트의 티어 범위·대표 아이템 — gather/objectYield.ts objectRollOf와 같은 규칙).
// 맨 아래 줄은 T0~T1(레벨 0 건물이 받는 띠, D-552) 합이다.
// 실행: pnpm --filter @terra/server bench:gather-objects
import { fileURLToPath } from "node:url";
import {
  facilityEntrySchema,
  gatherBandOfEntry,
  gatherObjectEntrySchema,
  gatherTierEntrySchema,
  itemEntrySchema,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { type GatherBand, TEST_SOCIETY_COEFFICIENTS, gatherSubcategories } from "@terra/sim";
import { type GatherSite, type LotRoll, gatherLots, gatherSettingsOf } from "../src/labor/gatherWork.ts";

const contentDir = fileURLToPath(new URL("../../../content/core", import.meta.url));
const pack = loadContentPack(contentDir);
if (!pack.pack) throw new Error("팩을 읽지 못했다");
const reparse = (entry: unknown): unknown => JSON.parse(JSON.stringify(entry));
const entries = (category: string) => pack.pack?.entries.get(category) ?? [];
const facilities = entries("facilities").map((entry) => facilityEntrySchema.parse(reparse(entry)));
const items = entries("items").map((entry) => itemEntrySchema.parse(reparse(entry)));
const objects = entries("gather_objects").map((entry) => gatherObjectEntrySchema.parse(reparse(entry)));
const after: GatherBand[] = entries("gather_tiers").map((entry) =>
  gatherBandOfEntry(gatherTierEntrySchema.parse(reparse(entry))),
);
// 전: core@95 광석 전용 표(0~59만 다르다 — 60 위는 기본 표와 같았다)
const OLD_ORE_LOW: readonly (readonly number[])[] = [
  [500, 350, 100, 50, 0, 0, 0, 0, 0, 0],
  [500, 350, 100, 50, 0, 0, 0, 0, 0, 0],
  [500, 350, 120, 30, 0, 0, 0, 0, 0, 0],
];
const oldOre: GatherBand[] = after.map((band, index) => ({
  from: band.from,
  weightsPm: OLD_ORE_LOW[index] ?? band.weightsPm,
}));

const settings = gatherSettingsOf(TEST_SOCIETY_COEFFICIENTS);
const HOURS = 1000;
const CYCLE_MS = 60_000;
const OBJECTS = [
  "conifer_tree",
  "broadleaf_tree",
  "boulder_stone",
  "scree",
  "ore_vein",
  "copper_outcrop",
  "herb_bush",
  "fishing_water",
];
const STATS = [20, 40, 60];
const tierOf = new Map(items.map((item) => [`item:${item.id}`, item.tier]));

/** 오브젝트 하나·유효 스탯 하나 → 아이템마다 시간당 개수(묶음이 g인 광석은 kg) */
function perHour(objectId: string, stat: number, rule: "before" | "after"): Map<string, number> {
  const object = objects.find((entry) => entry.id === objectId);
  const facility = facilities.find((entry) => entry.id === object?.facility?.id);
  const gather = facility?.gather;
  if (!object || !facility || !gather) throw new Error(objectId);
  const catalogRule = {
    primary: gather.primary,
    secondary: gather.secondary,
    subcategory: gather.subcategory.id,
    mode: gather.mode,
    yieldBase: gather.yieldBase,
    yieldPerStatPm: gather.yieldPerStatPm,
    yieldCap: gather.yieldCap,
    catch: gather.catch,
  };
  const subs = gatherSubcategories(catalogRule);
  const ladder = Array.from({ length: 10 }, (): string[] => []);
  const lotSize = new Map<string, bigint>();
  for (const item of items)
    if (item.enabled && item.subcategory && subs.includes(item.subcategory.id)) {
      ladder[Math.min(9, item.tier)]?.push(`item:${item.id}`);
      if ((item.lotSize ?? 1) !== 1) lotSize.set(`item:${item.id}`, BigInt(item.lotSize ?? 1));
    }
  const half = Math.floor(stat / 2);
  const primaries = { str: 0, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 };
  Reflect.set(primaries, gather.primary, stat - half);
  Reflect.set(primaries, gather.secondary, half);
  const site: GatherSite = {
    buildingId: 1,
    facilityId: facility.id,
    level: 1,
    rule: catalogRule,
    ladder,
    bands: rule === "before" && gather.subcategory.id === "ore" ? oldOre : after,
    lotSize,
    cityId: null,
  };
  const prefer = `item:${object.item.id}`;
  const tier = tierOf.get(prefer) ?? 0;
  const roll: LotRoll = {
    ladder,
    tierRange: object.tierRange ?? { min: tier, max: tier },
    prefer,
  };
  let progress = { points: 0, seq: 0 };
  const total = new Map<string, bigint>();
  for (let hour = 0; hour < HOURS; hour++) {
    const result = gatherLots(progress, 60, {
      unitId: 7,
      site,
      primaries,
      settings,
      cycleMs: CYCLE_MS,
      ...(rule === "after" ? { lotRoll: () => roll } : {}),
    });
    progress = { points: result.points, seq: result.seq };
    for (const stack of result.outputs) total.set(stack.asset, (total.get(stack.asset) ?? 0n) + stack.qty);
  }
  const out = new Map<string, number>();
  for (const [asset, qty] of total) out.set(asset, Number(qty) / (lotSize.has(asset) ? 1000 : 1) / HOURS);
  return out;
}

const fmt = (value: number): string => value.toFixed(2);
const lines: string[] = [];
lines.push(`| 오브젝트(범위) | 아이템 | ${STATS.map((stat) => `유효 ${stat} 전 → 뒤`).join(" | ")} |`);
lines.push(`|---|---|${STATS.map(() => "---").join("|")}|`);
for (const id of OBJECTS) {
  const object = objects.find((entry) => entry.id === id);
  const range = object?.tierRange ? `T${object.tierRange.min}~T${object.tierRange.max}` : "대표";
  const runs = STATS.map((stat) => ({
    before: perHour(id, stat, "before"),
    after: perHour(id, stat, "after"),
  }));
  const assets = new Set<string>();
  for (const run of runs) for (const asset of [...run.before.keys(), ...run.after.keys()]) assets.add(asset);
  const ordered = [...assets].toSorted(
    (a, b) => (tierOf.get(a) ?? 0) - (tierOf.get(b) ?? 0) || a.localeCompare(b),
  );
  for (const asset of ordered.filter((entry) => (tierOf.get(entry) ?? 0) <= 3)) {
    const cells = runs.map((run) => `${fmt(run.before.get(asset) ?? 0)} → ${fmt(run.after.get(asset) ?? 0)}`);
    lines.push(`| ${id} (${range}) | ${asset.slice(5)} T${tierOf.get(asset) ?? 0} | ${cells.join(" | ")} |`);
  }
  const band = (run: Map<string, number>) =>
    [...run].filter(([asset]) => (tierOf.get(asset) ?? 0) <= 1).reduce((sum, [, value]) => sum + value, 0);
  const cells = runs.map((run) => `${fmt(band(run.before))} → ${fmt(band(run.after))}`);
  lines.push(`| ${id} (${range}) | **T0~T1 합** | ${cells.join(" | ")} |`);
}
console.log(
  `채집소 일꾼 하나 시간당 개수(광석 g 묶음은 kg), 시설 Lv1·컨디션 0, ${HOURS}시간, T4 위 아이템 줄은 생략\n`,
);
console.log(lines.join("\n"));
