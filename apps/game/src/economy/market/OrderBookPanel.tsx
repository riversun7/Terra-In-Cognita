// 호가창 — 매도 호가(위, 높은 값이 맨 위)·현재가·차이·매수 호가(아래). 잔량 막대는 두 쪽 가장 큰 잔량 기준이다.
// 값 줄을 누르면 그 값을 주문표에 넣는다(HTS 방식). 내 주문이 걸린 단계는 표시한다(나와는 체결하지 않는다).
// 쪽은 색과 함께 제목·위치로도 가른다(색만으로 알리지 않는다).
import type { BookLevel } from "@terra/shared/economy";
import { m } from "../../paraglide/messages.js";
import { fmt } from "../economyText.ts";
import { Change } from "../parts.tsx";
import { type DepthRow, bookRows, spreadOf } from "../shape.ts";

function LevelButton({
  row,
  side,
  onPick,
}: {
  row: DepthRow;
  side: "buy" | "sell";
  onPick: (price: bigint) => void;
}) {
  const price = fmt(row.price);
  const qty = fmt(row.qty);
  return (
    <li>
      <button
        type="button"
        className="eco-level"
        data-side={side}
        aria-label={
          row.mine > 0n
            ? `${m.economy_book_pick({ price, qty })} · ${m.economy_book_mine()}`
            : m.economy_book_pick({ price, qty })
        }
        onClick={() => onPick(row.price)}
      >
        <span className="eco-level-bar" style={{ inlineSize: `${(row.depth * 100).toFixed(1)}%` }} />
        <span className="eco-level-price eco-num">{price}</span>
        <span className="eco-level-qty eco-num">{qty}</span>
        {row.mine > 0n ? <span className="eco-level-mine" aria-hidden="true" /> : null}
      </button>
    </li>
  );
}

export function OrderBookPanel({
  asks,
  bids,
  last,
  changeBp,
  onPick,
}: {
  asks: readonly BookLevel[];
  bids: readonly BookLevel[];
  last: string | null;
  changeBp: number | null;
  onPick: (price: bigint) => void;
}) {
  const rows = bookRows(asks, bids);
  const spread = spreadOf(asks, bids);
  return (
    <section className="eco-book" aria-labelledby="eco-book-title">
      <h2 id="eco-book-title" className="eco-panel-title">
        {m.economy_book_title()}
      </h2>
      <div className="eco-book-head" aria-hidden="true">
        <span>{m.economy_col_price()}</span>
        <span>{m.economy_col_qty()}</span>
      </div>
      <h3 className="visually-hidden">{m.economy_book_asks()}</h3>
      {rows.asks.length === 0 ? (
        <p className="eco-book-empty">{m.economy_book_empty()}</p>
      ) : (
        <ul className="eco-levels">
          {rows.asks.map((row) => (
            <LevelButton key={String(row.price)} row={row} side="sell" onPick={onPick} />
          ))}
        </ul>
      )}
      <div className="eco-book-mid">
        <span className="eco-book-last eco-num">{last === null ? "—" : fmt(last)}</span>
        <Change bp={changeBp} />
        {spread === null ? null : (
          <span className="eco-book-spread">{m.economy_book_spread({ amount: fmt(spread) })}</span>
        )}
      </div>
      <h3 className="visually-hidden">{m.economy_book_bids()}</h3>
      {rows.bids.length === 0 ? (
        <p className="eco-book-empty">{m.economy_book_empty()}</p>
      ) : (
        <ul className="eco-levels">
          {rows.bids.map((row) => (
            <LevelButton key={String(row.price)} row={row} side="buy" onPick={onPick} />
          ))}
        </ul>
      )}
    </section>
  );
}
