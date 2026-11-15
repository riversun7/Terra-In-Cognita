// 2단계 뒤 채집 티어 검사 — 49 N43·D-506(docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)").
// - 확률표(gather_tiers, 표 하나 — 기획 D-552): 첫 구간 from 0, 파일 차례로 from이 늘어나기만(gather_band_order). 구간이 하나도 없으면 시설
//   추첨이 못 돈다(gather_bands_missing, 추첨 시설이 있을 때만).
// - 시설 추첨(facilities.gather): 채집 단계(stage gather) 시설에만(gather_stage), 중분류는 원자재(raw) 중분류만(gather_subcategory_major).
//   함께 내는 중분류(extraSubcategories, 질문 946 나)도 원자재만이고 주 중분류·서로 겹치지 않는다(gather_subcategory_duplicate).
// - 수확량(facilities.gather.yield*, D-507): 상한이 기본 개수보다 작으면 오류(gather_yield_cap).
// 건설 재료(facilities.build) 검사는 facilities.ts.
// 참조가 없는 경우는 참조 단계가 알린다. 항목은 스키마를 통과한 파싱 결과(참조 = ContentRef)다(items.ts와 같은 방식).
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { ContentRef } from "../schema/common.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

export function checkGather(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const error = (file: string, id: string, path: string, code: string, message: string) =>
    issues.push({ stage: "references", level: "error", file, id, path, message, code });

  const bands = pack.entries.get("gather_tiers") ?? [];
  const majorOf = new Map(
    (pack.entries.get("item_subcategories") ?? []).map((entry) => [entry.id, get(entry, "major")]),
  );
  // 표 하나(기획 D-552 "표 하나"): 첫 구간 from 0, 파일 차례로 늘어나기만
  let previous: number | undefined;
  for (const band of bands) {
    const from = get(band, "from");
    if (typeof from !== "number") continue;
    if (previous === undefined && from !== 0)
      error("gather_tiers.json", band.id, "from", "gather_band_order", "첫 구간은 from 0에서 시작합니다.");
    else if (previous !== undefined && from <= previous)
      error(
        "gather_tiers.json",
        band.id,
        "from",
        "gather_band_order",
        `구간은 from이 늘어나는 차례로 적습니다(앞 구간 ${previous}).`,
      );
    previous = from;
  }

  for (const facility of pack.entries.get("facilities") ?? []) {
    const gather = get(facility, "gather");
    if (gather === undefined) continue;
    if (get(facility, "stage") !== "gather")
      error(
        "facilities.json",
        facility.id,
        "gather",
        "gather_stage",
        "티어 추첨(gather)은 채집 단계(stage gather) 시설에만 씁니다.",
      );
    const sub = get(gather, "subcategory");
    const major = sub instanceof ContentRef ? majorOf.get(sub.id) : undefined;
    if (major !== undefined && major !== "raw")
      error(
        "facilities.json",
        facility.id,
        "gather.subcategory",
        "gather_subcategory_major",
        "티어 추첨 중분류는 원자재(raw) 중분류여야 합니다.",
      );
    const extras = get(gather, "extraSubcategories");
    const seen = new Set(sub instanceof ContentRef ? [sub.id] : []);
    if (Array.isArray(extras))
      extras.forEach((extra: unknown, index) => {
        if (!(extra instanceof ContentRef)) return;
        const path = `gather.extraSubcategories.${index}`;
        const extraMajor = majorOf.get(extra.id);
        if (extraMajor !== undefined && extraMajor !== "raw")
          error(
            "facilities.json",
            facility.id,
            path,
            "gather_subcategory_major",
            "함께 내는 중분류도 원자재(raw) 중분류여야 합니다.",
          );
        if (seen.has(extra.id))
          error(
            "facilities.json",
            facility.id,
            path,
            "gather_subcategory_duplicate",
            `중분류 ${extra.id}가 사다리에 두 번 들어갑니다. 주 중분류와 함께 내는 중분류는 서로 달라야 합니다.`,
          );
        seen.add(extra.id);
      });
    if (bands.length === 0)
      error(
        "facilities.json",
        facility.id,
        "gather",
        "gather_bands_missing",
        "티어 추첨 시설이 있는데 확률표(gather_tiers)가 비었습니다.",
      );
    const cap = get(gather, "yieldCap");
    const base = get(gather, "yieldBase") ?? 1;
    if (typeof cap === "number" && typeof base === "number" && cap < base)
      error(
        "facilities.json",
        facility.id,
        "gather.yieldCap",
        "gather_yield_cap",
        `수확량 상한(${cap})이 기본 개수(${base})보다 작습니다. 상한을 기본 개수 이상으로 적으세요.`,
      );
    const catchRule = get(gather, "catch");
    const catchBase = catchRule === undefined ? undefined : get(catchRule, "basePm");
    const catchMax = catchRule === undefined ? undefined : get(catchRule, "maxPm");
    if (typeof catchBase === "number" && typeof catchMax === "number" && catchMax < catchBase)
      error(
        "facilities.json",
        facility.id,
        "gather.catch.maxPm",
        "gather_catch_range",
        `성공 확률 상한(${catchMax}‰)이 기본(${catchBase}‰)보다 작습니다. 상한을 기본 이상으로 적으세요.`,
      );
  }
  checkGatherObjects(pack, error);
  return issues;
}

/**
 * 원자재 오브젝트의 굴림표·티어 범위(기획 D-540 1222, D-552 — docs/adr/2026-11-15-gather-object-tiers.md): 굴림표 가중치 합 1000·같은 아이템
 * 두 번 없음·대표 아이템(item)이 표 안(gather_table_*), 티어 범위는 굴림표와 함께 쓰지 않음(gather_tier_range_table)·아래 ≤ 위
 * (gather_tier_range_order). 굴림표가 아닌 오브젝트는 모두 대표 아이템 중분류 사다리에서 티어를 굴린다(범위가 없으면 대표 아이템 티어 하나)
 */
function checkGatherObjects(
  pack: ContentPack,
  error: (file: string, id: string, path: string, code: string, message: string) => void,
): void {
  const FILE = "gather_objects.json";
  for (const entry of pack.entries.get("gather_objects") ?? []) {
    const table = get(entry, "table");
    const item = get(entry, "item");
    const range = get(entry, "tierRange");
    if (Array.isArray(table)) {
      const ids: string[] = [];
      let sum = 0;
      for (const row of table as unknown[]) {
        const ref = get(row, "item");
        const weight = get(row, "weightPm");
        if (ref instanceof ContentRef) ids.push(ref.id);
        if (typeof weight === "number") sum += weight;
      }
      if (sum !== 1000)
        error(
          FILE,
          entry.id,
          "table",
          "gather_table_sum",
          `굴림표 가중치 합이 ${sum}입니다. 합은 1000(‰)이어야 합니다.`,
        );
      if (new Set(ids).size !== ids.length)
        error(FILE, entry.id, "table", "gather_table_duplicate", "굴림표에 같은 아이템을 두 번 적지 마세요.");
      if (item instanceof ContentRef && !ids.includes(item.id))
        error(
          FILE,
          entry.id,
          "item",
          "gather_table_item",
          `대표 아이템(item ${item.id})이 굴림표에 없습니다. 굴림표 가운데 하나를 대표로 적으세요.`,
        );
      if (range !== undefined)
        error(
          FILE,
          entry.id,
          "tierRange",
          "gather_tier_range_table",
          "굴림표(table) 오브젝트는 티어를 굴리지 않아 티어 범위(tierRange)를 쓰지 않습니다.",
        );
    }
    // 티어 범위(기획 D-552): 아래 ≤ 위
    if (range !== undefined) {
      const min = get(range, "min");
      const max = get(range, "max");
      if (typeof min === "number" && typeof max === "number" && min > max)
        error(
          FILE,
          entry.id,
          "tierRange",
          "gather_tier_range_order",
          `티어 범위 아래(min ${min})가 위(max ${max})보다 큽니다.`,
        );
    }
  }
}
