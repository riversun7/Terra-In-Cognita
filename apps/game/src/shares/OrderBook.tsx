// 지분 호가창·회차 시계 — 기획 D-583(질문 2438 답 "호가창처럼 거래가능", 동시호가 그대로), docs/adr/2026-11-21-share-market.md.
// 사업장 지분(ShareMarket.tsx)·도시 정부 지분(CityShareMarket.tsx)이 같이 쓴다.
// - 호가창: 팔 쪽(파랑, 위 — 낮은 값이 가운데에 붙는다)·살 쪽(빨강, 아래 — 높은 값이 가운데에 붙는다, 한국식 시세 색 D-442). 값 칸마다 주 수 막대.
//   가운데 줄 = 지금 닫으면 날 체결가·주 수(동시호가 미리 보기). 값 줄을 누르면 주문 값 칸에 넣는다(onPick).
// - 회차 시계: 다음 체결까지 남은 시간(서버 시계에 맞춘다 — serverLink.clockOffsetMs). 0이 되면 몇 초마다 다시 읽기를 부른다(onDue — 서버는 15초마다
//   경계를 본다).
import type { ShareBookLevel, ShareBookView, ShareExpectedView } from "@terra/shared/shareBook";
import { countdownText } from "@terra/shared/shareBook";
import { useEffect, useRef, useState } from "react";
import { formatAmount } from "../economy/amount.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import "./shares.css";

/** 0이 된 뒤 다시 읽기를 부르는 간격(ms) */
const DUE_RETRY_MS = 6_000;

export function RoundClock({
  nextRoundMs,
  onDue,
}: {
  readonly nextRoundMs: number;
  readonly onDue?: (() => void) | undefined;
}) {
  const [now, setNow] = useState(() => Date.now() + serverLink.clockOffsetMs());
  const lastDue = useRef(0);
  const dueRef = useRef(onDue);
  useEffect(() => {
    dueRef.current = onDue;
  }, [onDue]);
  useEffect(() => {
    const timer = setInterval(() => {
      const at = Date.now() + serverLink.clockOffsetMs();
      setNow(at);
      if (at >= nextRoundMs && at - lastDue.current >= DUE_RETRY_MS) {
        lastDue.current = at;
        dueRef.current?.();
      }
    }, 1_000);
    return () => clearInterval(timer);
  }, [nextRoundMs]);
  const left = nextRoundMs - now;
  return (
    <p className="sm-clock" data-part="round-clock" aria-live="off">
      {left > 0 ? m.book_clock({ left: countdownText(left) }) : m.book_clock_now()}
    </p>
  );
}

interface OrderBookProps {
  readonly book: ShareBookView;
  readonly expected: ShareExpectedView | null | undefined;
  readonly money: string;
  readonly nextRoundMs: number;
  /** 값 줄을 눌렀다(주문 값 칸에 넣기) */
  readonly onPick?: ((price: string) => void) | undefined;
  /** 회차가 지나면 다시 읽는다 */
  readonly onDue?: (() => void) | undefined;
}

export function OrderBook({ book, expected, money, nextRoundMs, onPick, onDue }: OrderBookProps) {
  const locale = getLocale();
  let top = 1n;
  for (const level of [...book.asks, ...book.bids])
    if (BigInt(level.shares) > top) top = BigInt(level.shares);
  const width = (level: ShareBookLevel): string => `${Number((BigInt(level.shares) * 100n) / top)}%`;
  // 팔 쪽은 높은 값이 위(낮은 값이 가운데에 붙는다)
  const asks = book.asks.toReversed();
  const row = (level: ShareBookLevel, side: "ask" | "bid") => {
    const qty = (
      <span className="sm-qty">
        <span className="sm-bar" data-side={side} style={{ inlineSize: width(level) }} aria-hidden="true" />
        <span className="sm-num">{formatAmount(level.shares, locale)}</span>
      </span>
    );
    return (
      <tr key={`${side}-${level.price}`} className="sm-level" data-side={side}>
        <td className="sm-cell sm-ask">{side === "ask" ? qty : null}</td>
        <td className="sm-cell sm-price">
          {onPick ? (
            <button
              type="button"
              className="sm-price-pick"
              data-side={side}
              aria-label={m.book_pick({ price: formatAmount(level.price, locale) })}
              onClick={() => onPick(level.price)}
            >
              {formatAmount(level.price, locale)}
            </button>
          ) : (
            formatAmount(level.price, locale)
          )}
        </td>
        <td className="sm-cell sm-bid">{side === "bid" ? qty : null}</td>
      </tr>
    );
  };
  return (
    <section className="bp-card sm-book" aria-label={m.book_title()} data-part="order-book">
      <div className="sm-book-head">
        <h3 className="bp-card-title">{m.book_title()}</h3>
        <RoundClock nextRoundMs={nextRoundMs} onDue={onDue} />
      </div>
      {book.asks.length === 0 && book.bids.length === 0 ? (
        <p className="bp-muted" data-part="book-empty">
          {m.book_empty()}
        </p>
      ) : (
        <table className="sm-ladder">
          <thead>
            <tr>
              <th scope="col" className="sm-ask">
                {m.book_ask_col()}
              </th>
              <th scope="col" className="sm-price">
                {m.book_price_col()}
              </th>
              <th scope="col" className="sm-bid">
                {m.book_bid_col()}
              </th>
            </tr>
          </thead>
          <tbody>
            {asks.map((level) => row(level, "ask"))}
            <tr className="sm-mid">
              <td colSpan={3} data-part="book-expected">
                {expected
                  ? m.book_expected({
                      price: formatAmount(expected.price, locale),
                      money,
                      count: formatAmount(expected.shares, locale),
                    })
                  : m.book_no_match()}
              </td>
            </tr>
            {book.bids.map((level) => row(level, "bid"))}
          </tbody>
        </table>
      )}
      <p className="bp-muted">{m.book_rule()}</p>
    </section>
  );
}
