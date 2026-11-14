// 사다리 띠 표 측정(기획 D-540 1217 나): 낮은 유효 스탯에서 원자재(석재·잡석·소나무 원목·자생초·미꾸라지)마다 일꾼 하나가 시간당 내는 양.
// 서버 채집 직무와 같은 함수(labor/gatherWork.ts gatherLots — 진행·티어 추첨·수확량·성공 확률)를 시설 레벨 1·컨디션 0으로 1,000시간 돌린다.
// "전" = 띠 표 하나(팩 core@80: 0~59 구간 T1 350‰ 표를 모든 사다리가 씀), "뒤" = 지금 팩의 사다리 띠 표(광석 전용 표 + 기본 표).
// 실행: pnpm --filter @terra/server bench:gather-ladders
import { fileURLToPath } from "node:url";
import {
  facilityEntrySchema,
  gatherBandOfEntry,
  gatherTierEntrySchema,
  itemEntrySchema,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import {
  type GatherBand,
  TEST_SOCIETY_COEFFICIENTS,
  gatherLadderBands,
  gatherSubcategories,
} from "@terra/sim";
import { gatherLots, gatherSettingsOf } from "../src/labor/gatherWork.ts";

const contentDir = fileURLToPath(new URL("../../../content/core", import.meta.url));
const pack = loadContentPack(contentDir);
if (!pack.pack) throw new Error("팩을 읽지 못했다");
const reparse = (entry: unknown): unknown => JSON.parse(JSON.stringify(entry));
const entries = (category: string) => pack.pack?.entries.get(category) ?? [];
const facilities = entries("facilities").map((entry) => facilityEntrySchema.parse(reparse(entry)));
const items = entries("items").map((entry) => itemEntrySchema.parse(reparse(entry)));
const after: GatherBand[] = entries("gather_tiers").map((entry) =>
  gatherBandOfEntry(gatherTierEntrySchema.parse(reparse(entry))),
);
// 전: 광석 표(core@80의 띠 하나와 같은 값)를 모든 사다리가 쓴다
const before: GatherBand[] = gatherLadderBands(after, "ore").map((band) => ({
  from: band.from,
  weightsPm: band.weightsPm,
}));

const settings = gatherSettingsOf(TEST_SOCIETY_COEFFICIENTS);
const HOURS = 1000;
const CYCLE_MS = 60_000;
const MATERIALS: readonly { item: string; facility: string }[] = [
  { item: "stone", facility: "mine" },
  { item: "rubble", facility: "mine" },
  { item: "pine_log", facility: "lumber_camp" },
  { item: "wild_herb", facility: "herb_field" },
  { item: "loach", facility: "fishing_spot" },
];
const STATS = [20, 30, 40, 50];

/** 시설 하나·유효 스탯 하나·띠 표 하나 → 아이템마다 시간당 개수(광석은 g ÷ 1000 = kg) */
function perHour(facilityId: string, stat: number, bands: readonly GatherBand[]): Map<string, number> {
  const facility = facilities.find((entry) => entry.id === facilityId);
  const gather = facility?.gather;
  if (!gather) throw new Error(facilityId);
  const rule = {
    primary: gather.primary,
    secondary: gather.secondary,
    subcategory: gather.subcategory.id,
    mode: gather.mode,
    yieldBase: gather.yieldBase,
    yieldPerStatPm: gather.yieldPerStatPm,
    yieldCap: gather.yieldCap,
    catch: gather.catch,
  };
  const subs = gatherSubcategories(rule);
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
  const site = {
    buildingId: 1,
    facilityId,
    level: 1,
    rule,
    ladder,
    bands: gatherLadderBands(bands, rule.subcategory),
    lotSize,
    cityId: null,
  };
  let progress = { points: 0, seq: 0 };
  const total = new Map<string, bigint>();
  for (let hour = 0; hour < HOURS; hour++) {
    const result = gatherLots(progress, 60, { unitId: 7, site, primaries, settings, cycleMs: CYCLE_MS });
    progress = { points: result.points, seq: result.seq };
    for (const stack of result.outputs) total.set(stack.asset, (total.get(stack.asset) ?? 0n) + stack.qty);
  }
  const out = new Map<string, number>();
  for (const [asset, qty] of total) {
    const grams = lotSize.has(asset);
    out.set(asset.slice(5), Number(qty) / (grams ? 1000 : 1) / HOURS);
  }
  return out;
}

const lines: string[] = [];
lines.push(`| 원자재 | 시설 | ${STATS.map((stat) => `유효 ${stat} 전 → 뒤`).join(" | ")} |`);
lines.push(`|---|---|${STATS.map(() => "---").join("|")}|`);
for (const { item, facility } of MATERIALS) {
  const cells = STATS.map((stat) => {
    const a = perHour(facility, stat, before).get(item) ?? 0;
    const b = perHour(facility, stat, after).get(item) ?? 0;
    const change = a > 0 ? `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(0)}%` : "—";
    return `${a.toFixed(2)} → ${b.toFixed(2)} (${change})`;
  });
  lines.push(`| ${item} | ${facility} | ${cells.join(" | ")} |`);
}
console.log(`일꾼 하나 시간당 개수(광석은 kg), 시설 Lv1·컨디션 0, ${HOURS}시간\n`);
console.log(lines.join("\n"));
