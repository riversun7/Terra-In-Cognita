// 2단계 뒤 채집 티어 검사 — 49 N43·D-506(docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)").
// - 확률표(gather_tiers): 첫 구간 from 0, 파일 차례로 from이 늘어나기만(gather_band_order). 구간이 하나도 없으면 시설 추첨이 못 돈다
//   (gather_bands_missing, 추첨 시설이 있을 때만).
// - 시설 추첨(facilities.gather): 채집 단계(stage gather) 시설에만(gather_stage), 중분류는 원자재(raw) 중분류만(gather_subcategory_major).
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
  let previous = -1;
  bands.forEach((band, index) => {
    const from = get(band, "from");
    if (typeof from !== "number") return;
    if (index === 0 && from !== 0)
      error("gather_tiers.json", band.id, "from", "gather_band_order", "첫 구간은 from 0에서 시작합니다.");
    else if (index > 0 && from <= previous)
      error(
        "gather_tiers.json",
        band.id,
        "from",
        "gather_band_order",
        `구간은 from이 늘어나는 차례로 적습니다(앞 구간 ${previous}).`,
      );
    previous = from;
  });

  const majorOf = new Map(
    (pack.entries.get("item_subcategories") ?? []).map((entry) => [entry.id, get(entry, "major")]),
  );
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
  return issues;
}
