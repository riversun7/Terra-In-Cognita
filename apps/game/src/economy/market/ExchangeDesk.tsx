// 거래창의 거래소 건물 칸(기획 D-561·D-564 1628·D-571, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)").
// - 건물 이름·팔 물건 자리·도시 창고에 남은 이 물건(거래소로 옮기기 링크). 건물이 없으면 주문을 못 낸다는 알림, 상태 30% 미만이면 "멈춤"(D-559).
// - 개인 창고(1943, 질문 2081 유닛마다): 쓰는 무게/크기 막대, 내 유닛 창고 고르기 → [넓히기](그 도시 화폐로 한 칸 값 — WebSocket market_locker_expand unitId).
// - 거래 직무(1944, 질문 2083·2084): 자리 차지/모두, 나를 위해 일하는 유닛(주문 한도 몫)과 [빼기](직무 배치 = labor_unassign, 빌린 자리·고용 = labor_terminate),
//   같은 2차맵의 쉬는 유닛 고르기 → 내 거래소면 [거래 직무에 두기](labor_assign), 남의 거래소면 주인이 낸 자리 값으로 [자리 빌리기](labor_create lease).
// 판정은 서버. 칸이 없으면(시안·옛 서버) 그 부분을 보이지 않는다.
import type {
  MarketBookResponse,
  MarketDeskUnit,
  MarketDeskView,
  MarketLockerUnit,
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

const lockerUnitLabel = (unit: MarketLockerUnit, max: number): string =>
  unit.cyborg
    ? m.market_locker_unit_cyborg({ steps: unit.steps, max })
    : m.market_locker_unit({ id: unit.unitId, steps: unit.steps, max });

function LockerPart({ city, locker }: { city: number; locker: MarketLockerView }) {
  const sender = useSender();
  const [picked, setPicked] = useState<number | null>(null);
  const used = toBig(locker.usedG);
  const capacity = toBig(locker.capacityG);
  const pm = capacity > 0n ? Number((used * 1000n) / capacity) : used > 0n ? 1000 : 0;
  // 유닛마다 창고(질문 2081): 넓힐 수 있는 유닛만 고른다. 옛 응답(유닛 줄 없음)은 서버가 고른다
  const units = locker.units;
  const open = units?.filter((unit) => unit.steps < locker.maxSteps) ?? [];
  const unitId = open.some((unit) => unit.unitId === picked) ? picked : (open[0]?.unitId ?? null);
  const full = units ? unitId === null : locker.steps >= locker.maxSteps;
  const fieldId = `market-locker-${city}`;
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
      {units === undefined || locker.unitBaseG === undefined ? null : (
        <p className="eco-footnote" data-part="market-locker-units">
          {units.length === 0
            ? m.market_locker_no_units()
            : m.market_locker_units({ count: units.length, base: kg(locker.unitBaseG) })}
        </p>
      )}
      <div className="eco-desk-actions">
        {open.length === 0 ? null : (
          <label className="eco-field" htmlFor={fieldId}>
            <span className="visually-hidden">{m.market_locker_pick()}</span>
            <select
              id={fieldId}
              className="eco-select"
              value={unitId === null ? "" : String(unitId)}
              onChange={(event) => setPicked(Number(event.target.value))}
            >
              {open.map((unit) => (
                <option key={unit.unitId} value={String(unit.unitId)}>
                  {lockerUnitLabel(unit, locker.maxSteps)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="button-small"
          aria-disabled={sender.sending || full ? "true" : undefined}
          onClick={() => {
            if (full) return;
            sender.run(async () => {
              const outcome = await sendMarketCommand({
                t: "market_locker_expand",
                city,
                ...(unitId === null ? {} : { unitId }),
              });
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
            : units
              ? null
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
  // 자리는 거래소 건물마다(질문 2083) — 옛 응답(taken 없음)은 내 유닛 수로 본다
  const taken = desk.taken ?? desk.traders.length;
  const full = taken >= desk.slots;
  // 남의 거래소: 주인이 낸 자리를 빌린다(임대형 계약). 자리를 내지 않았으면 못 둔다
  const others = desk.own === false;
  const closed = others && (desk.rent ?? null) === null;
  const labor = (command: Parameters<typeof sendLaborCommand>[0]): void =>
    sender.run(async () => {
      const outcome = await sendLaborCommand(command);
      return outcome.ok ? null : LABOR_ERROR_TEXT[outcome.code]();
    });
  const fieldId = `market-desk-${buildingId}`;
  return (
    <div className="eco-desk-part" data-part="market-desk">
      <p className="eco-desk-line">
        {desk.taken === undefined
          ? m.market_desk_title({ count: desk.traders.length, slots: desk.slots })
          : m.market_desk_seats({ taken, slots: desk.slots, count: desk.traders.length })}
      </p>
      <p className="eco-footnote">{m.market_desk_rule()}</p>
      {others ? (
        <p className="eco-footnote" data-part="market-desk-rent">
          {closed ? m.market_desk_closed() : m.market_desk_rent({ rent: fmt(desk.rent ?? "0") })}
        </p>
      ) : desk.own === true ? (
        <p className="eco-footnote">{m.market_desk_owner_hint()}</p>
      ) : null}
      {desk.traders.length === 0 ? null : (
        <ul className="eco-desk-list">
          {desk.traders.map((unit) => (
            <li key={unit.unitId} className="eco-desk-unit">
              <span>{unitLabel(unit)}</span>
              <button
                type="button"
                className="button-small"
                aria-disabled={sender.sending ? "true" : undefined}
                onClick={() =>
                  labor(
                    unit.contractId === undefined
                      ? { t: "labor_unassign", unitId: unit.unitId }
                      : { t: "labor_terminate", contractId: unit.contractId },
                  )
                }
              >
                {m.market_desk_unassign()}
              </button>
            </li>
          ))}
        </ul>
      )}
      {closed ? null : desk.candidates.length === 0 ? (
        <p className="eco-footnote">{m.market_desk_no_free()}</p>
      ) : full ? (
        <p className="eco-footnote">{m.market_desk_full()}</p>
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
            aria-disabled={sender.sending || unitId === null ? "true" : undefined}
            onClick={() => {
              if (unitId === null) return;
              labor(
                others
                  ? { t: "labor_create", kind: "lease", buildingId, unitId }
                  : { t: "labor_assign", buildingId, unitId },
              );
            }}
          >
            {others ? m.market_desk_lease() : m.market_desk_assign()}
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
