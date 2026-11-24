// 정부 판의 [도시 화폐] 칸 — 사용자 결정 2026-11-24 "도시는 기축통화로 화폐 한가지를 정해야하며 도시내 모든 사업장은 기축통화로 거래 및 세금을 낸다 …
// 타국가 화폐이용시 국고에 100000개이상 보관필요". docs/adr/2026-11-24-city-money.md.
// - 모두에게: 지금 도시 화폐(화폐 이름 + 찍는 나라 국기).
// - 고를 수 있는 사람(서버 canSet — 도시 주인 나라 지도자): 화폐 고르기 → WebSocket city_currency(프로토콜 69). 다른 나라 화폐는 국고에 그 화폐가
//   reserveMin 이상 있어야 고른다(목록에 국고 잔고를 같이 보인다 — 모자라면 고르지 못한다). 판정은 서버가 다시 한다.
import type { CityMoneyResultCode } from "@terra/protocol";
import type { GovernmentCityMoney } from "@terra/shared/government";
import { useId, useState } from "react";
import { currencyName, indexCatalog } from "../economy/economyText.ts";
import { NO_ARGS, useCatalog } from "../economy/queries.ts";
import { HOUSE_MEMBER_ERROR_TEXT } from "../faction/identity/houseText.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { amountText } from "../sections/screenText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { sendCityCurrency } from "./cityMoneyCommands.ts";

type Nation = GovernmentCityMoney["nation"];

const nationLabel = (nation: Nation): string | undefined =>
  nation?.name ? (getLocale() === "en" ? nation.name.en : nation.name.ko) : undefined;

function errorText(code: CityMoneyResultCode | "offline" | "timeout", min: string): string {
  if (code === "unknown_city") return m.government_money_err_city();
  if (code === "unknown_currency") return m.government_money_err_currency();
  if (code === "reserve_short") return m.government_money_err_reserve({ amount: amountText(min) });
  return HOUSE_MEMBER_ERROR_TEXT[code]();
}

/** 화폐 이름 뒤 국기(그 화폐를 찍는 나라) */
function Flag({ nation }: { nation: Nation }) {
  if (!nation?.emblem) return null;
  const name = nationLabel(nation);
  return (
    <NationEmblem
      spec={nation.emblem.spec}
      color={nation.emblem.color}
      uploaded={nation.emblem.uploaded}
      size={18}
      label={name === undefined ? undefined : m.asset_flag_label({ nation: name })}
      className="asset-flag"
    />
  );
}

export function CityMoneyPolicy({ cityId, money }: { cityId: number; money: GovernmentCityMoney }) {
  const titleId = useId();
  const selectId = useId();
  const catalog = useCatalog(NO_ARGS);
  const index = indexCatalog(catalog.data);
  const [shown, setShown] = useState({ code: money.code, nation: money.nation, own: money.own });
  const [picked, setPicked] = useState(money.code);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const min = amountText(money.reserveMin);

  const save = async (): Promise<void> => {
    if (busy || picked === shown.code) return;
    notice.clear();
    problem.clear();
    const option = money.options.find((entry) => entry.code === picked);
    setBusy(true);
    try {
      const outcome = await sendCityCurrency({ cityId, currency: option?.own ? null : picked });
      if (outcome.ok) {
        const now = money.options.find((entry) => entry.code === outcome.currency);
        setShown({ code: outcome.currency, nation: now?.nation ?? null, own: now?.own ?? false });
        setPicked(outcome.currency);
        notice.show([m.government_money_done({ currency: currencyName(index, outcome.currency) })]);
      } else problem.show([errorText(outcome.code, money.reserveMin)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gov-section gov-band" aria-labelledby={titleId} data-part="government-city-money">
      <h3 id={titleId} className="gov-section-title">
        {m.government_money_title()}
      </h3>
      <p className="gov-muted">{m.government_money_hint({ amount: min })}</p>
      <dl className="gov-facts">
        <div className="gov-fact gov-entry-row" data-part="government-money-now">
          <dt>{m.government_money_now()}</dt>
          <dd>
            <span className="gov-money-name" data-part="government-money-value">
              {currencyName(index, shown.code)}
              <Flag nation={shown.nation} />
            </span>
            <span className="gov-person-note">
              {shown.own ? m.government_money_own() : m.government_money_foreign()}
            </span>
          </dd>
        </div>
      </dl>
      {money.canSet ? (
        <div className="gov-tax-edit" data-part="government-money-edit">
          <label className="gov-tax-input" htmlFor={selectId}>
            <span>{m.government_money_pick()}</span>
            <select
              id={selectId}
              className="gov-entry-input"
              value={picked}
              disabled={busy}
              onChange={(event) => setPicked(event.target.value)}
              data-part="government-money-select"
            >
              {money.options.map((option) => (
                <option key={option.code} value={option.code} disabled={!option.allowed}>
                  {option.own
                    ? m.government_money_option_own({ currency: currencyName(index, option.code) })
                    : m.government_money_option({
                        currency: currencyName(index, option.code),
                        nation: nationLabel(option.nation) ?? option.code,
                        reserve: amountText(option.reserve),
                      })}
                </option>
              ))}
            </select>
          </label>
          <div className="gov-tax-actions">
            <button
              type="button"
              className="button-small"
              disabled={busy || picked === shown.code}
              onClick={() => void save()}
              data-part="government-money-save"
            >
              {m.government_money_save()}
            </button>
          </div>
        </div>
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
