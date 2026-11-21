// 물류센터(운반 대행 사업장) 요금 셈 — 기획 D-555 1505("운반을 대행하는 서비스업종도 존재한다(물류센터같이)"), D-576(사용자 답 2213 "다": 기본은 운반 명령 때
// 물류센터를 직접 고르고, 설정으로 자동 맡기기를 켜면 같은 도시 물류센터에 자동으로 — 어느 곳은 기술 기본값 = 요금이 가장 싼 곳), D-570 1822(판매자가 정하고
// 적정가를 보인다), docs/adr/2026-11-16-logistics-center.md. 서버 판정과 화면 미리 셈이 같은 셈을 쓴다. 정수·BigInt만.
// - 요금 단위(질문 2213 요금 단위 나 — 기획 "기술 추천"): 무게 × 거리. 한 단위 = 설정 칸 무게(business_haul_unit_g, 출발값 100kg) × 칸 수
//   (business_haul_unit_cells, 10칸). 단위 수 = ⌈무게 ÷ 단위 무게⌉ × ⌈칸 ÷ 단위 칸⌉, 짐이 있으면 적어도 1. 요금 = 한 단위 요금 × 단위 수.
// - 자동으로 맡길 곳: 같은 도시의 받는(요금 0이 아닌) 물류센터 가운데 한 단위 요금이 가장 싼 곳, 같으면 건물 ID가 작은 곳.

/** 운반 한 번의 요금 단위 수(위 머리 주석). 무게·칸이 0 이하면 0, 단위 값이 1보다 작으면 1로 본다 */
export function haulUnits(grams: bigint, cells: number, unitG: number, unitCells: number): bigint {
  if (grams <= 0n) return 0n;
  const g = BigInt(Math.max(1, Math.trunc(unitG)));
  const c = BigInt(Math.max(1, Math.trunc(unitCells)));
  const span = BigInt(Math.max(1, Math.trunc(cells)));
  return ((grams + g - 1n) / g) * ((span + c - 1n) / c);
}

/** 운반 한 번 요금 = 한 단위 요금 × 단위 수(음수 요금은 0) */
export function haulFeeOf(
  perUnit: bigint,
  grams: bigint,
  cells: number,
  unitG: number,
  unitCells: number,
): bigint {
  if (perUnit <= 0n) return 0n;
  return perUnit * haulUnits(grams, cells, unitG, unitCells);
}

/** 물류센터 하나(운반 명령 화면이 고르는 줄 — 서버가 도시 창고 자리에 싣는다) */
export interface HaulCenterView {
  readonly buildingId: number;
  /** 주인 이름은 싣지 않는다(건물 판에서 본다). 내 물류센터인가 */
  readonly mine: boolean;
  /** 지금 받는 한 단위 요금(최소 단위 글자, 정하지 않았으면 적정가). "0"이면 받지 않는다 */
  readonly perUnit: string;
  /** 지금 나를 수 있는 일꾼 수(나르는 중 빼고) */
  readonly workers: number;
  readonly unitG: number;
  readonly unitCells: number;
  /** 요금 화폐 코드(그 도시 나라 화폐 — 기획 D-559 1524 "요금은 그 나라 화폐", 기획 대조 2277). 칸이 없으면 옛 서버(서버 기준 화폐) */
  readonly currency?: string | undefined;
}

/**
 * 계정 자동 맡기기(기획 대조 2272 — tRPC facilities.autoHaul·setAutoHaul). 켜면 via 없는 운반 명령이 내 운반꾼이 없을 때 같은 도시의 가장 싼 물류센터에
 * 맡긴다(서버가 판정). not_ready = 세계가 아직 서지 않음(바꾸지 못한다)
 */
export interface AutoHaulResponse {
  readonly status: "ready" | "not_ready";
  readonly on: boolean;
}

/** 자동으로 맡길 물류센터(위 머리 주석): 받는 곳 가운데 한 단위 요금이 가장 싼 곳. 없으면 undefined */
export function cheapestCenter<T extends { readonly buildingId: number; readonly perUnit: bigint }>(
  centers: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const center of centers) {
    if (center.perUnit <= 0n) continue;
    if (
      !best ||
      center.perUnit < best.perUnit ||
      (center.perUnit === best.perUnit && center.buildingId < best.buildingId)
    )
      best = center;
  }
  return best;
}
