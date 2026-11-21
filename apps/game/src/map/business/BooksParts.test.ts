// 손익계산서 원천징수 덧줄 그리기 시험(기획 D-578, BooksParts.tsx IncomeStatement) — 원천징수 칸이 있으면 임금 아래 덧줄로 보이고 비용 합·이익에는 다시 더하지 않는다.
// react-dom/server로 HTML을 만들어 본다(브라우저 없이)
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { m } from "../../paraglide/messages.js";
import type { BooksOk } from "./booksData.ts";
import { IncomeStatement } from "./BooksParts.tsx";

const books = (columns: BooksOk["totals"][number]["columns"], profit: string): BooksOk => ({
  status: "ok",
  buildingId: 7,
  facilityId: "temple",
  facilityName: null,
  ownerKind: "me",
  mine: true,
  holders: [],
  vault: [],
  debt: [],
  debtSinceMs: null,
  suspendedAtMs: null,
  goods: [],
  nextSettleMs: null,
  taxBp: 200,
  minLot: 10,
  retail: false,
  fromMs: 0,
  toMs: 86_400_000,
  firstMs: null,
  totals: [{ asset: "s3_test_credit", columns, profit }],
  days: [],
  entries: [],
});

describe("손익계산서 원천징수 덧줄(D-578)", () => {
  it("원천징수 칸이 있으면 임금 아래 덧줄, 비용 합은 임금만", () => {
    const html = renderToStaticMarkup(
      createElement(IncomeStatement, {
        books: books({ income: "1000", wages: "-600", withholding: "-12" }, "400"),
      }),
    );
    expect(html).toContain('data-part="books-withholding"');
    expect(html).toContain(m.books_col_withholding());
    expect(html).toContain("−12");
    // 비용 합 = 임금 −600(원천징수 −12를 다시 더하지 않는다)
    expect(html).toContain("−600");
    expect(html).not.toContain("−612");
  });

  it("원천징수 칸이 없으면 덧줄도 없다", () => {
    const html = renderToStaticMarkup(
      createElement(IncomeStatement, { books: books({ income: "1000", wages: "-600" }, "400") }),
    );
    expect(html).not.toContain('data-part="books-withholding"');
  });
});
