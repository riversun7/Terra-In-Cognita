// 생산 — docs/adr/2026-10-31-economy-core.md 2절, 기획 D-114(4단계)·D-119(효율)·D-5001(시설 Lv1~5 → 최고 티어)
// - 레시피 한 번 = 장부 거래 하나: 재료(그 도시 창고) → 소멸 계정, 생산원 계정 → 산출(그 도시 창고). 재료가 모자라면 하지 않는다.
//   일반 자원은 소멸·생산원(다시 자람)으로, 총량 자원은 매장량 계정으로 돈다(계정을 고르는 함수는 부르는 쪽이 준다).
// - 속도: 시설의 시간당 작업량 = 배치한 일꾼 효율 합(효율 1000 = 기준 일꾼 한 명). 한 번에 드는 시간 = ⌈작업량 × 1시간 ÷ 시간당 작업량⌉.
//   채집 시설(스탯 짝이 있는 시설)은 효율 = 1000 × 진행 속도(max(1, ⌊주 스탯 ÷ 20⌋), 49 N32·D-507, gather.ts gatherProgress).
//   그 밖의 시설 효율은 [임시] 1000(직무 효율 식 P9 출발값 없음).
// - 수량은 원장 기본 단위다(팩 레시피의 묶음 수 × 묶음 크기, 302·D-506. 바꾸는 곳은 simulator/catalog.ts prepareCatalog).
// - 티어 상한(D-5001 시설 Lv → 최고 티어)은 제작 시설에만 건다. 채집 단계 시설은 레벨이 티어를 막지 않는다(D-506): 채집 티어는
//   일꾼 스탯 확률표(gather.ts)가 정한다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";

export const HOUR_MS = 3_600_000;

/** 채집 방식: roll = 스탯 확률표 추첨(광산·벌목장·약초원·낚시터), select = 해금 티어에서 고름(농장·목장, 옛 ITM-10) */
export type GatherMode = "roll" | "select";
/** 기준 일꾼 효율(천분율) */
export const BASE_EFFICIENCY = 1000;

export interface Stack {
  readonly asset: string;
  readonly qty: bigint;
}

export interface RecipeSpec {
  readonly id: string;
  readonly facility: string;
  readonly inputs: readonly Stack[];
  readonly outputs: readonly Stack[];
  /** 한 번에 드는 작업량(효율 1000 일꾼 한 시간 = 1000) */
  readonly work: number;
  /** 산출 가운데 가장 높은 티어 */
  readonly tier: number;
  /**
   * 채집 티어 추첨(D-506): 있으면 산출(outputs)은 대표값이고, 한 번 돌릴 때마다 lots개 묶음의 티어를 그 중분류 사다리에서 뽑는다
   * (gather.ts rollGatherOutputs). mode "select"(농장·목장 선택 + 효율, 49 P8)면 뽑지 않고 일꾼 해금 티어에서 고른다. 없으면 산출 그대로
   */
  readonly gather?:
    | { readonly subcategory: string; readonly lots: number; readonly mode?: GatherMode | undefined }
    | undefined;
}

/** 시설 레벨의 티어 상한을 받는가(D-5001). 채집 단계(gather)는 받지 않는다(D-506) */
export function tierCappedByLevel(stage: string): boolean {
  return stage !== "gather";
}

/** 시설 레벨이 다루는 최고 티어(D-5001: Lv1 = T1, Lv2 = T3, … Lv5 = T9) */
export function maxTierForLevel(level: number): number {
  return Math.max(0, Math.min(9, level * 2 - 1));
}

/** 시간당 작업량으로 한 번 만드는 데 드는 시간(ms). 작업량이 0이면 undefined */
export function batchDurationMs(work: number, pointsPerHour: number): number | undefined {
  if (pointsPerHour <= 0) return undefined;
  return Math.ceil((work * HOUR_MS) / pointsPerHour);
}

/** 재료가 사라지는 곳·산출이 나오는 곳 계정 */
export interface ProductionAccounts {
  consume(asset: string): number;
  source(asset: string): number;
}

/**
 * 레시피를 한 번 돌린다. 재료가 모자라면 아무것도 하지 않고 false. outputs를 주면 레시피 산출 대신 그것을 낸다(채집 티어 추첨 결과).
 * 재료도 산출도 없으면(추첨이 모두 빈 묶음) 장부 거래 없이 true(일은 했다)
 */
export function runRecipe(
  book: LedgerBook,
  owner: number,
  location: number,
  recipe: RecipeSpec,
  accounts: ProductionAccounts,
  atMs: number,
  outputs: readonly Stack[] = recipe.outputs,
): boolean {
  for (const input of recipe.inputs)
    if (book.balanceOf(owner, input.asset, location) < input.qty) return false;
  const entries: LedgerEntry[] = [];
  for (const input of recipe.inputs) {
    entries.push({ account: book.ownerAccount(owner, input.asset, location), amount: -input.qty });
    entries.push({ account: accounts.consume(input.asset), amount: input.qty });
  }
  for (const output of outputs) {
    if (output.qty <= 0n) continue;
    entries.push({ account: accounts.source(output.asset), amount: -output.qty });
    entries.push({ account: book.ownerAccount(owner, output.asset, location), amount: output.qty });
  }
  if (entries.length > 0) book.post({ kind: "produce", atMs, entries });
  return true;
}
