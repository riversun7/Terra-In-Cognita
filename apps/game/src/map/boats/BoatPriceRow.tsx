// 조선소 배 판매가 한 줄(건물 판 배 시설 칸, 배 종류마다) — 기획 대조 2057·2074(D-570 1822 "당연히 판매자가 정하지, 적정가격 계산은 … 가격설정시
// 보여줌")·2072(D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매"). 모두에게 지금 판매가(주인이 정한 값, 없으면 적정가 — "0"이면 만들지
// 않음)를 보이고, 주인·대주주에게는 값 칸·[값 정하기]·[적정가로]를 둔다. 명령은 business_price(item = boat:<종류>, 프로토콜 52). 판정은 서버.
import { boatPriceItem } from "@terra/shared/harbor";
import { useState } from "react";
import { parseAmountInput } from "../../economy/amount.ts";
import { m } from "../../paraglide/messages.js";
import { useBooksCommand } from "../business/BooksParts.tsx";

export function BoatPriceRow({
  buildingId,
  typeId,
  price,
  priceSet,
  fairPrice,
  currency,
  manage,
  reload,
}: {
  readonly buildingId: number;
  readonly typeId: string;
  /** 지금 판매가(없으면 주인 없는 조선소 — 줄을 그리지 않는다) */
  readonly price: string | undefined;
  readonly priceSet: boolean;
  /** 적정가(옛 서버·적정가 셈이 없으면 없음) */
  readonly fairPrice: string | undefined;
  readonly currency: string;
  readonly manage: boolean;
  readonly reload: () => void;
}) {
  const [value, setValue] = useState("");
  const { sending, notice, run } = useBooksCommand(reload);
  if (price === undefined) return null;
  const parsed = parseAmountInput(value);
  const save = (next: string): void =>
    run({ t: "business_price", buildingId, item: boatPriceItem(typeId), price: next }, m.boat_price_saved());
  return (
    <span className="harbor-price" data-part="harbor-type-price">
      <span className="gather-muted">
        {price === "0"
          ? m.boat_price_closed()
          : priceSet
            ? m.boat_price_set({ price, currency })
            : m.boat_price_fair({ price, currency })}
      </span>
      {manage ? (
        <span className="bp-form-row">
          <input
            className="bp-input"
            inputMode="numeric"
            aria-label={m.boat_price_input()}
            placeholder={m.boat_price_input()}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="button"
            className="button-small"
            disabled={sending || parsed.kind !== "ok"}
            onClick={() => {
              if (parsed.kind === "ok") save(String(parsed.value));
            }}
          >
            {m.boat_price_save()}
          </button>
          {fairPrice !== undefined ? (
            <button type="button" className="button-small" disabled={sending} onClick={() => save(fairPrice)}>
              {m.boat_price_use_fair()}
            </button>
          ) : null}
        </span>
      ) : null}
      {notice ? (
        <span className="bp-notice" role="status">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
