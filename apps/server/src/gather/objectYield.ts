// 원자재 오브젝트 한 번에서 나오는 아이템 고르기 — 기획 D-540 1222(다 + 나), docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-14)".
// - 기본: 종류의 아이템 하나(item).
// - 굴림표(table, 난파선): 가중치(‰)로 하나를 뽑는다.
// - 사다리 굴림(ladder, 어군): 맡는 시설의 채집 사다리(주 중분류 + 함께 내는 중분류)에서, 그 사다리 띠 표(@terra/shared/gatherMath
//   gatherLadderBands)와 캐는 유닛의 유효 스탯(주 + 보조 + 맡는 시설 레벨 보너스, @terra/sim gatherStat)으로 티어를 뽑고 그 티어 아이템 하나를
//   고른다(@terra/sim rollGatherTier·pickGatherItem — 시설 일꾼 추첨과 같은 함수). 사다리가 비거나 시설을 모르면 대표 아이템.
// 난수는 (유닛, 오브젝트, 차례)로 정한 시드 하나(서버 권위, 같은 입력이면 같은 결과). 정수 연산만 쓴다.
import { createRng } from "@terra/shared";
import { gatherLadderBands } from "@terra/shared/gatherMath";
import { gatherStat, mix32, pickGatherItem, rollGatherTier } from "@terra/sim";
import type { GatherBand, GatherSubcategorySource } from "@terra/sim";
import type { GatherKind } from "./kinds.ts";

/** 사다리 굴림에 드는 시설 자료(시설 목록 FacilityCatalog의 일부) */
export interface ObjectYieldCatalog {
  facility(
    id: string,
  ):
    | { readonly gather?: (GatherSubcategorySource & { readonly mode?: string | undefined }) | undefined }
    | undefined;
  gatherLadder(gather: GatherSubcategorySource): readonly (readonly string[])[];
  readonly gatherBands: readonly GatherBand[];
}

export interface ObjectYieldInput {
  readonly unitId: number;
  readonly objectId: number;
  /** 같은 유닛·오브젝트에서 몇 번째 캐기인가(시드를 바꾼다) */
  readonly seq: number;
  /** 캐는 유닛의 주·보조 스탯 값 */
  readonly primary: number;
  readonly secondary: number;
  /** 맡는 시설 반경 안이면 그 시설 레벨(없으면 1 — 레벨 보너스 0) */
  readonly level: number;
  /** 시설 레벨당 유효 스탯 보너스(설정 칸 N43) */
  readonly levelBonus: number;
}

/** 시드(유닛·오브젝트·차례만으로) */
function yieldSeed(input: ObjectYieldInput): number {
  return mix32(
    Math.imul(input.unitId >>> 0, 0x9e37_79b1) ^
      mix32((input.objectId >>> 0) ^ Math.imul(input.seq >>> 0, 0x85eb_ca6b)),
  );
}

/** 굴림표에서 하나(가중치 합이 0이면 첫 줄) */
export function pickTableItem(
  table: readonly { readonly item: string; readonly weightPm: number }[],
  roll: number,
): string | undefined {
  let total = 0;
  for (const row of table) total += Math.max(0, row.weightPm);
  if (total <= 0) return table[0]?.item;
  let left = roll % total;
  for (const row of table) {
    const weight = Math.max(0, row.weightPm);
    if (left < weight) return row.item;
    left -= weight;
  }
  return table[0]?.item;
}

/**
 * 한 번 캘 때 나오는 아이템 ID(item: 앞머리 없음). 굴림표·사다리 굴림이 없으면 대표 아이템. 사다리 굴림은 맡는 시설의 추첨 방식 채집 칸이
 * 있어야 하고(팩 검사), 사다리가 비면 대표 아이템
 */
export function objectYieldItem(
  kind: Pick<GatherKind, "item" | "table" | "ladder" | "facility">,
  catalog: ObjectYieldCatalog,
  input: ObjectYieldInput,
): string {
  if (kind.table && kind.table.length > 0) {
    const rng = createRng(yieldSeed(input));
    return pickTableItem(kind.table, rng.nextInt(1_000_000)) ?? kind.item;
  }
  if (kind.ladder !== true || kind.facility === null) return kind.item;
  const gather = catalog.facility(kind.facility)?.gather;
  if (!gather || gather.mode === "select") return kind.item;
  const rng = createRng(yieldSeed(input));
  const bands = gatherLadderBands(catalog.gatherBands, gather.subcategory);
  const stat = gatherStat(
    Math.max(0, input.primary) + Math.max(0, input.secondary),
    Math.max(1, input.level),
    input.levelBonus,
  );
  const tier = rollGatherTier(bands, stat, rng);
  const asset = pickGatherItem(catalog.gatherLadder(gather), tier, rng);
  return asset === undefined ? kind.item : asset.replace(/^item:/, "");
}
