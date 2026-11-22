// 국고 지분 안건(팔기·사기) — 칸 검사와 집행. service.ts(1,000줄 상한 가까움)가 부른다. docs/adr/2026-11-21-share-market-2.md.
// - 국고 지분 팔기(질문 2438 답 D-583, 줄기 governance-3): 그 나라 도시·주 수(국고가 가진 만큼)·한 주 가장 낮은 값. 승인되면 정부 지분 시장에 국고 팔 주문
//   (approvedShareSale — cityShares/service.ts approvedSale). 바뀜(D-587 질문 2473 다): 그 값에 다 팔릴 때까지 남고 저절로 거두지 않는다. 지도자가 거둔다.
// - 국고 지분 사기(D-587 질문 2479 나 — 줄기 share-market-2): 아무 도시(제 나라 도시 = 되사기, 남의 나라 도시)·주 수·한 주 가장 높은 값. 칸 검사 때 그 도시
//   화폐로 국고 돈이 주 수 × 값만큼 있어야 한다(shareBuyCheck — 시장이 본다). 승인되면 국고 사기 주문(approvedShareBuy — cityShares/service.ts
//   approvedBuy, 국고 돈을 묶는다). 투표 묶음·문턱은 팔기와 같다 [임시]. 독재는 지배 가문장 직권(팔기와 같다).
// - 바뀜(gov-fix-4 — 사용자 결정 D-591 2526 "돈이없으면 못사는거고 취득량만 정하는거다. 통과된안건은 주-월 단위 기간이 있고 실행되지못하면 취소할지 계속할지 재투표"):
//   사기 안건은 수량만 정한다 — 열 때 국고 돈을 보지 않는다(shareBuyCheck는 시장·도시만). 승인되면 집행 기간(설정 칸 gov_share_exec_ms) 동안 돈이 있는 만큼 산다
//   (cityShares/treasuryRuns.ts). 팔기도 같은 집행 길이다(승인 때 국고가 가진 주를 다시 보지 않고 기간 동안 가진 만큼 판다 — 열 때 검사는 그대로, 질문 2667).
//   기간이 끝나도 남으면 같은 종류 안건을 남은 수량으로 다시 연다(payload renewOf — 재투표).
import type { AgendaKind } from "@terra/shared/governance";
import type { GovernanceResultCode } from "@terra/protocol";
import type { GovernanceNation, GovernancePort } from "./port.ts";
import type { AgendaPayload } from "./store.ts";

/** 국고 지분 안건 종류 */
export type ShareAgendaKind = Extract<AgendaKind, "treasury_share_sale" | "treasury_share_buy">;

export const isShareAgenda = (kind: AgendaKind): kind is ShareAgendaKind =>
  kind === "treasury_share_sale" || kind === "treasury_share_buy";

/** 승인된 국고 지분 팔기(정부 지분 시장 cityShares/service.ts approvedSale이 받는다 — D-583) */
export interface ApprovedShareSale {
  readonly nationRowId: number;
  readonly agendaId: number;
  readonly cityId: number;
  readonly shares: bigint;
  readonly minPrice: bigint;
}

/** 승인된 국고 지분 사기(정부 지분 시장 cityShares/service.ts approvedBuy가 받는다 — D-587 질문 2479 나) */
export interface ApprovedShareBuy {
  readonly nationRowId: number;
  readonly agendaId: number;
  readonly cityId: number;
  readonly shares: bigint;
  readonly maxPrice: bigint;
}

export interface ShareAgendaHooks {
  readonly approvedShareSale?: ((sale: ApprovedShareSale, nowMs: number) => Promise<void>) | undefined;
  readonly approvedShareBuy?: ((buy: ApprovedShareBuy, nowMs: number) => Promise<void>) | undefined;
  /** 국고 지분 사기 칸 검사(그 도시가 있고 국고 돈이 넉넉한가). 없으면 사기 안건은 꺼져 있다(kind_disabled) */
  readonly shareBuyCheck?:
    | ((
        nation: GovernanceNation,
        cityId: number,
        shares: bigint,
        maxPrice: bigint,
      ) => GovernanceResultCode | undefined)
    | undefined;
}

export interface ShareAgendaInput {
  readonly cityId?: number | undefined;
  readonly shares?: string | undefined;
  readonly minPrice?: string | undefined;
  readonly maxPrice?: string | undefined;
}

/** 국고 지분 안건 칸 검사 — 맞으면 안건 칸, 틀리면 실패 코드 */
export function shareAgendaPayload(
  kind: ShareAgendaKind,
  nation: GovernanceNation,
  input: ShareAgendaInput,
  port: Pick<GovernancePort, "treasuryShares">,
  hooks: ShareAgendaHooks,
): AgendaPayload | GovernanceResultCode {
  const { cityId, shares } = input;
  if (cityId === undefined || shares === undefined || BigInt(shares) <= 0n) return "invalid_choice";
  if (kind === "treasury_share_sale") {
    const { minPrice } = input;
    if (minPrice === undefined || !nation.cities.includes(cityId)) return "invalid_choice";
    if (port.treasuryShares(nation, cityId) < BigInt(shares)) return "not_enough_shares";
    return { cityId, shares, minPrice };
  }
  const { maxPrice } = input;
  if (maxPrice === undefined || BigInt(maxPrice) <= 0n) return "invalid_choice";
  if (!hooks.shareBuyCheck) return "kind_disabled";
  const problem = hooks.shareBuyCheck(nation, cityId, BigInt(shares), BigInt(maxPrice));
  return problem ?? { cityId, shares, maxPrice };
}

/** 같은 도시에 같은 종류 국고 지분 안건이 이미 열려 있나 */
export function shareAgendaOpen(
  kind: ShareAgendaKind,
  cityId: number | undefined,
  open: readonly { readonly kind: AgendaKind; readonly payload: AgendaPayload }[],
): boolean {
  return open.some((agenda) => agenda.kind === kind && agenda.payload.cityId === cityId);
}

/** 가결·직권 국고 지분 안건 집행: 시장 고리(집행 기간 — treasuryRuns.ts)에 넘긴다. 칸이 맞고 넘겼으면 true(enacted), 아니면 false(cancelled) */
export async function enactShareAgenda(
  kind: ShareAgendaKind,
  agenda: { readonly id: number; readonly payload: AgendaPayload },
  nation: GovernanceNation,
  port: Pick<GovernancePort, "treasuryShares">,
  hooks: ShareAgendaHooks,
  nowMs: number,
): Promise<boolean> {
  const { cityId, shares, minPrice, maxPrice } = agenda.payload;
  if (cityId === undefined || shares === undefined) return false;
  if (kind === "treasury_share_sale") {
    // 승인 때 국고 주를 다시 보지 않는다(집행 기간 동안 가진 만큼 판다 — 바뀜 gov-fix-4)
    void port;
    const valid = minPrice !== undefined && BigInt(shares) > 0n;
    if (valid && hooks.approvedShareSale)
      await hooks.approvedShareSale(
        {
          nationRowId: nation.rowId,
          agendaId: agenda.id,
          cityId,
          shares: BigInt(shares),
          minPrice: BigInt(minPrice),
        },
        nowMs,
      );
    return valid;
  }
  if (maxPrice === undefined || !hooks.approvedShareBuy) return false;
  await hooks.approvedShareBuy(
    {
      nationRowId: nation.rowId,
      agendaId: agenda.id,
      cityId,
      shares: BigInt(shares),
      maxPrice: BigInt(maxPrice),
    },
    nowMs,
  );
  return true;
}
