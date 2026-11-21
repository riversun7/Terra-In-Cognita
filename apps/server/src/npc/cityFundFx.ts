// 나라 화폐가 바뀐 뒤 도시 운영비 금고 옮기기(바뀜 gov-fix-3 — 질문 2576 다 사용자 답 "옛 화폐 금고를 바꾼 비율로 새 화폐 금고로", docs/adr/2026-11-15-business-ledger.md
// "바뀜 (gov-fix-3)"). 서버에서 나라 화폐(npc/currency.ts nationCurrencies)는 켤 때 국가 프리셋·세력 고리로 다시 정해진다 — 실행 중에 나라 화폐를 바꾸는 길은 아직 없다
// (화폐 단계 안건은 발행 방식만 바꾼다). 그래서 켤 때 한 번, 그 나라 지금 화폐가 아닌 금고를 바꾼 비율로 옮긴다(멱등 — 옮긴 뒤 옛 금고는 0).
// - 비율 = 지난 환전 체결가(로트당 기준 통화 값, 기준 통화 = 로트). 체결가가 없는 화폐는 로트(같은 값 — 물류 요금 haulMoney.ts·조선소 적정가와 같은 셈) [임시].
//   옛 화폐 양 × 옛 화폐 값 ÷ 새 화폐 값(내림 — 로트는 지워진다).
import { type LedgerBook, convertCityFunds } from "@terra/sim";

/** 이 모듈이 읽는 도시 경제(NPC 런타임 economy의 일부) */
export interface CityFundFxEconomy {
  readonly base: string;
  readonly currencyOf: ReadonlyMap<number, string>;
  readonly fx: ReadonlyMap<string, { readonly lastPrice?: bigint | undefined }>;
  readonly settings: { readonly fxLot: bigint };
}

/** 화폐 하나의 로트당 기준 통화 값(기준 통화 = 로트, 체결가가 없으면 로트) */
function lotValue(economy: CityFundFxEconomy, asset: string): bigint {
  const lot = economy.settings.fxLot;
  if (asset === economy.base) return lot;
  const price = economy.fx.get(asset)?.lastPrice;
  return price !== undefined && price > 0n ? price : lot;
}

/** 옛 화폐 양 → 새 화폐 양(내림) */
export function cityFundRate(
  economy: CityFundFxEconomy,
): (amount: bigint, from: string, to: string) => bigint {
  return (amount, from, to) => {
    const to1 = lotValue(economy, to);
    return to1 <= 0n ? 0n : (amount * lotValue(economy, from)) / to1;
  };
}

/** 켤 때 한 번: 지금 화폐가 아닌 도시 운영비 금고를 옮긴다. 옮긴 금고 수(있으면 서버 기록 한 줄) */
export function convertStaleCityFunds(
  book: LedgerBook,
  economy: CityFundFxEconomy,
  atMs: number,
  log: { info(obj: object, message: string): void },
): number {
  const moved = convertCityFunds(
    book,
    (nation) => economy.currencyOf.get(nation),
    cityFundRate(economy),
    atMs,
  );
  if (moved > 0) log.info({ cityFundsConverted: moved }, "city funds moved to the nation's current currency");
  return moved;
}
