// 옛 모양 덮어쓰기 줄을 지금 모양으로 읽기 — 팩 형식이 바뀌어 지금 스키마가 받지 않는 DB 줄(항목 통째)을, 켤 때 고르기(selectAtBoot) 전과
// 싣기(install) 전에 고쳐 읽는다. 그러지 않으면 켤 때 그 줄이 통째로 invalid_entry로 지워지고(그 항목의 다른 고친 칸도 잃는다), 만든 항목이면
// 그것을 가리키는 다른 줄까지 따라 지워진다.
// DB 줄은 그대로 둔다(그 항목을 다음에 저장할 때 새 모양으로 쓰인다). 고친 줄 키는 켤 때 서버 기록(content boot)에 남는다.
// - items, 팩 core@26(D-501 "적정 스탯"): use.effects[].scale의 옛 모양 {stat, pmPerPoint}(스탯 1점당 ‰)는 뺀다(= 기준 값 그대로).
//   새 모양 {stat, appropriate}로 옮길 값이 없어서다(적정 스탯은 편집기에서 다시 적는다). 25~50% 밖 variancePm도 뺀다(= 설정 칸 값).
// - items, 팩 core@26(D-501 "하나로 통일"): 팩이 id-changes로 지운 중분류(소모품 탄약 ammo 등)를 가리키는 subcategory는 뺀다
//   (= 중분류 없음, 보관 창고는 대분류 기본).
import type { ContentOverrideRecord } from "./boot.ts";
import { type ContentCore, type EntryJson, contentKey } from "./core.ts";

/** 사용 효과 ±오차(‰) 범위(@terra/content ITEM_SCHEMA_LIMITS.useVarianceMinPm·MaxPm과 같다, 시험이 맞춰 본다) */
export const LEGACY_VARIANCE_RANGE = { min: 250, max: 500 } as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 효과 줄 하나: 옛 scale·범위 밖 오차를 뺀다(바뀌지 않으면 같은 객체) */
function upgradeUseLine(line: unknown): unknown {
  if (!isObject(line)) return line;
  let next: Record<string, unknown> = line;
  const scale = line.scale;
  if (isObject(scale) && "pmPerPoint" in scale && !("appropriate" in scale)) {
    const { scale: _drop, ...rest } = next;
    next = rest;
  }
  const variance = line.variancePm;
  if (
    typeof variance === "number" &&
    (variance < LEGACY_VARIANCE_RANGE.min || variance > LEGACY_VARIANCE_RANGE.max)
  ) {
    const { variancePm: _drop, ...rest } = next;
    next = rest;
  }
  return next;
}

/** 아이템 항목 하나(바뀌지 않으면 같은 객체) */
function upgradeItem(entry: EntryJson, removedSubcategories: ReadonlySet<string>): EntryJson {
  let next: EntryJson = entry;
  const subcategory = entry.subcategory;
  if (typeof subcategory === "string" && removedSubcategories.has(subcategory)) {
    const { subcategory: _drop, ...rest } = next;
    next = rest;
  }
  const use = entry.use;
  const effects = isObject(use) ? use.effects : undefined;
  if (isObject(use) && Array.isArray(effects)) {
    const lines: unknown[] = effects.map(upgradeUseLine);
    if (lines.some((line, index) => line !== effects[index]))
      next = { ...next, use: { ...use, effects: lines } };
  }
  return next;
}

/** 팩이 지운(이름을 바꾼) 중분류 중 지금 팩에 없는 것 */
function removedSubcategoriesOf(core: ContentCore): Set<string> {
  return new Set(
    core
      .retiredPack("item_subcategories")
      .filter((id) => core.packEntry("item_subcategories", id) === undefined),
  );
}

/** 덮어쓰기 줄 목록을 지금 모양으로 읽는다. 고친 줄 키(`<분류>/<ID>`)도 돌려준다 */
export function upgradeLegacyRows(
  core: ContentCore,
  rows: readonly ContentOverrideRecord[],
): { rows: ContentOverrideRecord[]; upgraded: string[] } {
  const removed = removedSubcategoriesOf(core);
  const upgraded: string[] = [];
  const out = rows.map((row) => {
    if (row.category !== "items") return row;
    const entry = upgradeItem(row.entry, removed);
    if (entry === row.entry) return row;
    upgraded.push(contentKey(row.category, row.id));
    return { ...row, entry };
  });
  return { rows: out, upgraded };
}
