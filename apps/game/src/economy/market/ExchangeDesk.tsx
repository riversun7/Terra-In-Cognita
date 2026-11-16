// 거래창의 거래소 건물 칸(기획 D-561·D-564 1628·D-571, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)").
// - 건물 이름·팔 물건 자리·도시 창고에 남은 이 물건(거래소로 옮기기 링크). 건물이 없으면 주문을 못 낸다는 알림, 상태 30% 미만이면 "멈춤"(D-559).
// - 개인 창고(1943): 쓰는 무게/크기 막대와 [넓히기](그 도시 화폐로 한 칸 값 — WebSocket market_locker_expand).
// - 거래 직무(1944): 이 거래소에 둔 내 유닛(주문 한도 몫)과 [빼기], 같은 2차맵의 쉬는 유닛 고르기 → [거래 직무에 두기](labor_assign — 남의 거래소에도).
// 판정은 서버. 칸이 없으면(시안·옛 서버) 그 부분을 보이지 않는다.
import type {
  MarketBookResponse,
  MarketDeskUnit,
  MarketDeskView,
  MarketLockerView,
} from "@terra/shared/economy";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { toBig } from "../amount.ts";
import { fmt, pickName } from "../economyText.ts";
import { sendLaborCommand } from "../laborCommands.ts";
import { LABOR_ERROR_TEXT } from "../laborText.ts";
import { sendMarketCommand } from "./marketCommands.ts";
import { MARKET_ERROR_TEXT, refreshMarket } from "./marketText.ts";

/** g → kg 글(버림) */
const kg = (grams: string): string => fmt(toBig(grams) / 1000n);

/** 보내는 동안 잠그고 결과 문구를 보이는 명령 상태 */
function useSender(): {
  readonly sending: boolean;
  readonly error: string | null;
  run(task: () => Promise<string | null>): void;
} {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    sending,
    error,
    run(task) {
      if (sending) return;
      setSending(true);
      setError(null);
      void task().then((failure) => {
        setSending(false);
        setError(failure);
        if (failure === null) refreshMarket();
      });
    },
  };
}

function LockerPart({ city, locker }: { city: number; locker: MarketLockerView }) {
  const sender = useSender();
  const used = toBig(locker.usedG);
  const capacity = toBig(locker.capacityG);
  const pm = capacity > 0n ? Number((used * 1000n) / capacity) : used > 0n ? 1000 : 0;
  const full = locker.steps >= locker.maxSteps;
  return (
    <div className="eco-desk-part" data-part="market-locker">
      <p className="eco-desk-line">
        {m.market_locker_title({ used: kg(locker.usedG), capacity: kg(locker.capacityG) })}
      </p>
      <meter
        className="eco-desk-meter"
        min={0}
        max={1000}
        high={900}
        value={Math.min(1000, pm)}
        aria-label={m.market_locker_meter()}
      />
      <div className="eco-desk-actions">
        <button
          type="button"
          className="button-small"
          aria-disabled={sender.sending || full ? "true" : undefined}
          onClick={() => {
            if (full) return;
            sender.run(async () => {
              const outcome = await sendMarketCommand({ t: "market_locker_expand", city });
              return outcome.ok ? null : MARKET_ERROR_TEXT[outcome.code]();
            });
          }}
        >
          {sender.sending
            ? m.market_sending()
            : m.market_locker_expand({ step: kg(locker.stepG), price: fmt(locker.stepPrice) })}
        </button>
        <span className="eco-footnote">
          {full
            ? m.market_locker_max()
            : m.market_locker_steps({ steps: locker.steps, max: locker.maxSteps })}
        </span>
        {sender.error === null ? null : (
          <span className="eco-sent" role="status" data-tone="error">
            {sender.error}
          </span>
        )}
      </div>
    </div>
  );
}

const unitLabel = (unit: MarketDeskUnit): string =>
  unit.cyborg
    ? m.market_desk_cyborg({ bonus: unit.bonus })
    : m.market_desk_unit({ id: unit.unitId, bonus: unit.bonus });

function DeskPart({ buildingId, desk }: { buildingId: number; desk: MarketDeskView }) {
  const sender = useSender();
  const [picked, setPicked] = useState<number | null>(null);
  const unitId = desk.candidates.some((unit) => unit.unitId === picked)
    ? picked
    : (desk.candidates[0]?.unitId ?? null);
  const full = desk.traders.length >= desk.slots;
  const labor = (command: Parameters<typeof sendLaborCommand>[0]): void =>
    sender.run(async () => {
      const outcome = await sendLaborCommand(command);
      return outcome.ok ? null : LABOR_ERROR_TEXT[outcome.code]();
    });
  const fieldId = `market-desk-${buildingId}`;
  return (
    <div className="eco-desk-part" data-part="market-desk">
      <p className="eco-desk-line">
        {m.market_desk_title({ count: desk.traders.length, slots: desk.slots })}
      </p>
      <p className="eco-footnote">{m.market_desk_rule()}</p>
      {desk.traders.length === 0 ? null : (
        <ul className="eco-desk-list">
          {desk.traders.map((unit) => (
            <li key={unit.unitId} className="eco-desk-unit">
              <span>{unitLabel(unit)}</span>
              <button
                type="button"
                className="button-small"
                aria-disabled={sender.sending ? "true" : undefined}
                onClick={() => labor({ t: "labor_unassign", unitId: unit.unitId })}
              >
                {m.market_desk_unassign()}
              </button>
            </li>
          ))}
        </ul>
      )}
      {desk.candidates.length === 0 ? (
        <p className="eco-footnote">{m.market_desk_no_free()}</p>
      ) : (
        <div className="eco-desk-actions">
          <label className="eco-field" htmlFor={fieldId}>
            <span className="visually-hidden">{m.market_desk_pick()}</span>
            <select
              id={fieldId}
              className="eco-select"
              value={unitId === null ? "" : String(unitId)}
              onChange={(event) => setPicked(Number(event.target.value))}
            >
              {desk.candidates.map((unit) => (
                <option key={unit.unitId} value={String(unit.unitId)}>
                  {unitLabel(unit)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-small"
            aria-disabled={sender.sending || full || unitId === null ? "true" : undefined}
            onClick={() => {
              if (full || unitId === null) return;
              labor({ t: "labor_assign", buildingId, unitId });
            }}
          >
            {m.market_desk_assign()}
          </button>
        </div>
      )}
      {sender.error === null ? null : (
        <span className="eco-sent" role="status" data-tone="error">
          {sender.error}
        </span>
      )}
    </div>
  );
}

/** 거래소 건물 칸. 시안(칸 없음)은 보이지 않는다 */
export function ExchangeDesk({ book }: { book: MarketBookResponse }) {
  const exchange = book.exchange;
  if (exchange === undefined) return null;
  if (exchange === null)
    return (
      <p className="eco-notice" data-tone="warning" data-part="market-no-exchange">
        {book.exchangeStopped === true ? m.market_exchange_stopped() : m.market_exchange_none()}
      </p>
    );
  const buildingId = Number(exchange.buildingId);
  return (
    <section className="eco-notice eco-desk" data-part="market-exchange">
      <p className="eco-desk-line">
        {m.market_exchange_at({ name: pickName(exchange.name, `#${exchange.buildingId}`) })}
        {toBig(exchange.cityGoods) > 0n ? (
          <>
            {" "}
            {m.market_exchange_city_goods({ qty: fmt(exchange.cityGoods) })}{" "}
            <AppLink to={{ route: "economy_production" }}>{m.market_exchange_go_move()}</AppLink>
          </>
        ) : null}
      </p>
      {exchange.locker ? <LockerPart city={Number(book.city)} locker={exchange.locker} /> : null}
      {exchange.desk ? <DeskPart buildingId={buildingId} desk={exchange.desk} /> : null}
    </section>
  );
}
