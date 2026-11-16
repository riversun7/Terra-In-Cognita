// 사업장 지급준비금 셈(기획 D-564 1623·1624 — 사용자 원문 "지급준비율처럼 남길 비율선택 임금비율 한달치보증금등 자동 계산. 임금이 상승할경우도
// 고려하여 대략적인 지급준비율을 유여있게 산정. 핵심은 끊기지 않게 돌아가는것"). 사업장 장부 코어(core.ts)가 정산 때, 장부 화면이 보일 때 같은 셈을 쓴다.
// - 필요액(화폐마다) = 열린 임금형 계약마다 (다음 정산 주기까지 낼 임금 + 한 달치 보증금에서 모자란 양)의 합.
// - 남길 돈 = 필요액 × (1000 + 임금 상승 여유‰)/1000 × 지급준비율‰/1000, 올림(@terra/shared/businessBooks reserveKeep).
// - 계약마다 줄(needs)은 정산이 모자란 보증금을 채우는 차례(계약 ID 차례)다.
// - 바뀜 (기획 D-570 1783 — 사용자 "다음 임금만큼 남김", "핵심은 끊기지 않게"): 남길 돈의 바닥 = 다음 정산까지 낼 임금 합(floor). 지급준비율이
//   0%여도 이만큼은 늘 남긴다 — 남길 돈 = max(비율 셈, 바닥).
import { reserveKeep } from "@terra/shared/businessBooks";

/** 열린 임금형 계약 하나의 필요액(노동 서비스가 채운다) */
export interface WageNeed {
  readonly contractId: number;
  readonly asset: string;
  /** 다음 정산 주기까지 낼 임금(주기당 임금 × 그 안의 지급 수) */
  readonly nextWage: bigint;
  /** 한 달치(N48 보증금 날수) 보증금에서 모자란 양(0 이상) */
  readonly shortfall: bigint;
}

/** 사업장 장부가 쓰는 노동 계약 고리(labor/service.ts가 단다) */
export interface BusinessLaborHook {
  /** 그 사업장의 열린 임금형 계약 필요액(계약 ID 차례). periodMs = 정산 주기(0이면 한 지급) */
  wageNeeds(buildingId: number, periodMs: number): readonly WageNeed[];
  /** 그 계약의 보증금을 사업장 금고에서 더 묶는다(fundLaborDeposit). 묶은 양 */
  fund(contractId: number, amount: bigint, atMs: number): bigint;
}

/** 화폐 하나의 지급준비금 줄 */
export interface ReserveLine {
  /** 필요액(여유·비율 전) */
  readonly needed: bigint;
  /** 남길 돈(비율 셈과 바닥 가운데 큰 값) */
  readonly keep: bigint;
  /** 바닥 = 다음 정산까지 낼 임금 합(D-570 1783 — 비율이 0%여도 남긴다) */
  readonly floor: bigint;
  readonly needs: readonly WageNeed[];
}

export interface ReservePlan {
  /** 쓰는 지급준비율(‰) */
  readonly ratioPm: number;
  /** 주인이 고른 비율인가(아니면 설정 칸 기본값) */
  readonly chosen: boolean;
  readonly marginPm: number;
  readonly assets: ReadonlyMap<string, ReserveLine>;
}

export function planReserve(input: {
  readonly needs: readonly WageNeed[];
  readonly marginPm: number;
  readonly ratioPm: number;
  readonly chosen: boolean;
}): ReservePlan {
  const byAsset = new Map<string, WageNeed[]>();
  for (const need of input.needs) {
    const list = byAsset.get(need.asset) ?? [];
    list.push(need);
    byAsset.set(need.asset, list);
  }
  const assets = new Map<string, ReserveLine>();
  for (const [asset, list] of byAsset) {
    const needs = list.toSorted((a, b) => a.contractId - b.contractId);
    let needed = 0n;
    let floor = 0n;
    for (const need of needs) {
      needed += need.nextWage + (need.shortfall > 0n ? need.shortfall : 0n);
      if (need.nextWage > 0n) floor += need.nextWage;
    }
    const ratio = reserveKeep(needed, input.marginPm, input.ratioPm);
    assets.set(asset, { needed, keep: ratio > floor ? ratio : floor, floor, needs });
  }
  return { ratioPm: input.ratioPm, chosen: input.chosen, marginPm: input.marginPm, assets };
}
