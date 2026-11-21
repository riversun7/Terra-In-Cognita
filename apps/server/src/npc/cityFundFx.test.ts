// 나라 화폐가 바뀐 뒤 도시 운영비 금고 옮기기 시험(gov-fix-3 — 질문 2576 다): 비율 = 지난 환전 체결가(로트당 기준 통화 값), 체결가가 없으면 로트
import { TEST_ASSET_CREDIT, cityFundCode, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { cityFundRate, convertStaleCityFunds } from "./cityFundFx.ts";

const BASE = "credit_base";
const economy = (prices: Record<string, bigint>) => ({
  base: BASE,
  currencyOf: new Map([[1, "currency_new"]]),
  fx: new Map(Object.entries(prices).map(([asset, lastPrice]) => [asset, { lastPrice }])),
  settings: { fxLot: 10n },
});

describe("도시 운영비 금고 화폐 옮기기(cityFundFx)", () => {
  it("옛 화폐 양 × 옛 화폐 값 ÷ 새 화폐 값(내림), 기준 통화 = 로트, 체결가가 없으면 로트", () => {
    const rate = cityFundRate(economy({ currency_old: 30n, currency_new: 20n }));
    expect(rate(100n, "currency_old", "currency_new")).toBe(150n);
    expect(rate(100n, BASE, "currency_new")).toBe(50n);
    expect(rate(7n, "currency_new", "currency_old")).toBe(4n);
    expect(rate(100n, "currency_unknown", BASE)).toBe(100n);
  });

  it("켤 때 한 번 지금 화폐가 아닌 금고를 옮기고 서버 기록을 남긴다(다시 켜면 아무것도 안 한다)", () => {
    let account = 0;
    let tx = 0;
    const book = createLedgerBook({ nextAccountId: () => (account += 1), nextTxId: () => (tx += 1) });
    book.post({
      kind: "city_fund",
      atMs: 0,
      entries: [
        { account: book.systemAccount("issue:x", TEST_ASSET_CREDIT), amount: -40n },
        {
          account: book.systemAccount(cityFundCode(1, 5, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT),
          amount: 40n,
        },
      ],
    });
    const lines: object[] = [];
    const log = { info: (obj: object) => lines.push(obj) };
    const e = economy({ [TEST_ASSET_CREDIT]: 10n, currency_new: 20n });
    expect(convertStaleCityFunds(book, e, 1, log)).toBe(1);
    const fund = book.systemAccount(cityFundCode(1, 5, "currency_new"), "currency_new");
    expect(book.balance(fund)).toBe(20n);
    expect(lines).toEqual([{ cityFundsConverted: 1 }]);
    expect(convertStaleCityFunds(book, e, 2, log)).toBe(0);
    expect(lines).toHaveLength(1);
  });
});
