// 지급준비금 칸(건물 판 [관리] — 주인·대주주·운영자) — 기획 D-564 1623·1624(사용자 원문 "지급준비율처럼 남길 비율선택 임금비율 한달치보증금등 자동 계산 …
// 핵심은 끊기지 않게 돌아가는것"). 서버가 정산 때 남길 돈 = 필요액(다음 정산까지 임금 + 한 달치 보증금 모자람) × 임금 상승 여유 × 고른 비율을 계산하고
// 남긴 돈으로 모자란 보증금부터 채운다. 화면은 계산값을 보이고 비율만 고른다(business_reserve, 프로토콜 40). 판정은 서버.
// 바뀜 (D-570 1783 "다음 임금만큼 남김"): 비율이 0%여도 다음 정산까지 낼 임금(floor)은 늘 남긴다 — 그 줄을 함께 보인다.
import { RESERVE_CHOICES_PM } from "@terra/shared/businessBooks";
import { formatAmount } from "../../economy/amount.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { useBooksCommand } from "./BooksParts.tsx";
import type { BooksOk } from "./booksData.ts";
import { moneyName } from "./businessText.ts";

/** ‰ → "100%"(소수 한 자리까지) */
function pctText(pm: number): string {
  const whole = Math.trunc(pm / 10);
  const tenth = pm % 10;
  return tenth === 0 ? `${whole}%` : `${whole}.${tenth}%`;
}

export function ReserveTools({ books, reload }: { readonly books: BooksOk; readonly reload: () => void }) {
  const locale = getLocale();
  const { sending, notice, run } = useBooksCommand(reload);
  const reserve = books.reserve;
  if (!reserve) return null;
  const choose = (pm: number | null): void =>
    run({ t: "business_reserve", buildingId: books.buildingId, reservePm: pm }, m.reserve_saved());
  return (
    <section className="bp-card" aria-label={m.reserve_title()} data-part="books-reserve">
      <h3 className="bp-card-title">{m.reserve_title()}</h3>
      <p className="bp-muted">{m.reserve_hint({ margin: pctText(reserve.marginPm) })}</p>
      {reserve.lines.length === 0 ? (
        <p className="bp-muted" data-part="reserve-none">
          {m.reserve_none()}
        </p>
      ) : (
        <ul className="bp-list">
          {reserve.lines.map((line) => (
            <li key={line.asset} className="bp-good-head" data-part="reserve-line">
              <span>
                {m.reserve_needed({
                  amount: `${formatAmount(line.needed, locale)} ${moneyName(line.asset)}`,
                })}
              </span>
              <strong className="bp-num">
                {m.reserve_keep({ amount: `${formatAmount(line.keep, locale)} ${moneyName(line.asset)}` })}
              </strong>
              {line.floor !== undefined && line.floor !== "0" ? (
                <span className="bp-muted" data-part="reserve-floor">
                  {m.reserve_floor({
                    amount: `${formatAmount(line.floor, locale)} ${moneyName(line.asset)}`,
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <fieldset className="bp-periods">
        <legend className="bp-muted">
          {reserve.chosen
            ? m.reserve_ratio({ pct: pctText(reserve.ratioPm) })
            : m.reserve_ratio_default({ pct: pctText(reserve.ratioPm) })}
        </legend>
        {RESERVE_CHOICES_PM.map((pm) => {
          const on = reserve.chosen && reserve.ratioPm === pm;
          return (
            <button
              key={pm}
              type="button"
              className={on ? "button-small button-primary" : "button-small"}
              aria-pressed={on}
              data-reserve={pm}
              disabled={sending}
              onClick={() => choose(pm)}
            >
              {pctText(pm)}
            </button>
          );
        })}
        <button
          type="button"
          className={reserve.chosen ? "button-small" : "button-small button-primary"}
          aria-pressed={!reserve.chosen}
          data-reserve="default"
          disabled={sending}
          onClick={() => choose(null)}
        >
          {m.reserve_default()}
        </button>
      </fieldset>
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
