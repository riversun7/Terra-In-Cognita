// 국고 지분 안건(팔기·사기) — 칸 검사와 집행. service.ts(1,000줄 상한 가까움)가 부른다. docs/adr/2026-11-21-share-market-2.md.
// - 국고 지분 팔기(질문 2438 답 D-583, 줄기 governance-3): 그 나라 도시·주 수(국고가 가진 만큼)·한 주 가장 낮은 값. 승인되면 정부 지분 시장에 국고 팔 주문
//   (approvedShareSale — cityShares/service.ts approvedSale). 바뀜(D-587 질문 2473 다): 그 값에 다 팔릴 때까지 남고 저절로 거두지 않는다. 지도자가 거둔다.
// - 국고 지분 사기(D-587 질문 2479 나 — 줄기 share-market-2): 아무 도시(제 나라 도시 = 되사기, 남의 나라 도시)·주 수·한 주 가장 높은 값. 칸 검사 때 그 도시
//   화폐로 국고 돈이 주 수 × 값만큼 있어야 한다(shareBuyCheck — 시장이 본다). 승인되면 국고 사기 주문(approvedShareBuy — cityShares/service.ts
//   approvedBuy, 국고 돈을 묶는다). 투표 묶음·문턱은 팔기와 같다 [임시]. 독재는 지배 가문장 직권(팔기와 같다).
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

/** 가결·직권 국고 지분 안건 집행: 시장 고리에 넘긴다. 칸이 맞고(팔기는 국고가 가진 주가 넉넉) 넘겼으면 true(enacted), 아니면 false(cancelled) */
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
    const valid = minPrice !== undefined && port.treasuryShares(nation, cityId) >= BigInt(shares);
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
