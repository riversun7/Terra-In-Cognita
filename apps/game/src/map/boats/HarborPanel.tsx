// 배 시설 판(건물 판 안) — 조선소·정박장·교역 부두. docs/adr/2026-11-15-shipyard-harbor.md, 기획 D-547·D-548.
// - 조선소: 도크(쓰는 수/모두)·모듈(주인, 레벨 2부터)·작업 줄(남은 시간)·배 종류마다 재료·시간·[만들기]·같은 2차맵 내 배 [수리].
// - 정박장: 정박 자리(쓰는 수/모두)·든 배·같은 2차맵 내 배 [여기 정박]/[집 비우기]·받기 범위·하루 정박료(주인).
// - 교역 부두: 임시 자리·머무는 배(남은 시간)·내 배 [N시간 사기]·받기 범위·한 시간 요금(주인).
// - D-559: 조선소 모듈 자리(레벨마다 하나 더)·도크에 든 배([출고], 남의 배는 장기 보관료)·남의 조선소 [수리](받기 범위·수리 요금)·교역 부두 [연료 채우기]·
//   요금 화폐(그 항구 나라 화폐).
// - D-570: 내 배 줄마다 함포 칸 포획 장비·싣기(BoatPortRow.tsx), 연료 채우기는 내 배 시설에서도(1830), 항구 옆 거래소 알림(1823).
// - 금고(사업장 장부, D-548)는 주인에게만 보인다. 서버가 소유·거리·자리·받기 범위·돈을 다시 본다. 결과는 판 아래 한 줄에 알리고 판을 다시 읽는다.
import { fairText } from "../business/businessText.ts";
import type {
  HarborAccess,
  HarborBoatView,
  HarborPanel as HarborPanelData,
  ShipyardModule,
} from "@terra/shared/harbor";
import { useEffect, useState } from "react";
import { getLocale } from "../../paraglide/runtime.js";
import { m } from "../../paraglide/messages.js";
import { serverLink } from "../../net/serverLink.ts";
import { durationText } from "../travelData.ts";
import { type BoatCommand, sendBoatCommand } from "./boatCommands.ts";
import { type BoatOutcomeKind, boatOutcomeText } from "./boatText.ts";
import { BoatPortRow } from "./BoatPortRow.tsx";
import { BoatPriceRow } from "./BoatPriceRow.tsx";
import "./boats.css";

/** 서버 시각(기기 시계 + 인사 때 잰 차이) */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

const accessLabel = (access: HarborAccess): string =>
  access === "owner"
    ? m.harbor_access_owner()
    : access === "nation"
      ? m.harbor_access_nation()
      : m.harbor_access_peace();

const moduleLabel = (module: ShipyardModule | null): string =>
  module === "docks"
    ? m.harbor_module_docks()
    : module === "build"
      ? m.harbor_module_build()
      : module === "repair"
        ? m.harbor_module_repair()
        : m.harbor_module_none();

const nameOf = (name: { readonly ko: string; readonly en: string } | undefined, fallback: string): string =>
  name ? (getLocale() === "ko" ? name.ko : name.en) : fallback;

/** 배 한 줄 글자(번호·종류·내구도) */
const boatLine = (boat: HarborBoatView): string =>
  m.harbor_boat_line({ id: boat.boatId, type: boat.typeId, percent: Math.floor(boat.hullPm / 10) });

export function HarborPanel({
  buildingId,
  level,
  mine,
  harbor,
  reload,
}: {
  readonly buildingId: number;
  readonly level: number;
  /** 내 시설인가(주인 칸·금고) */
  readonly mine: boolean;
  readonly harbor: HarborPanelData;
  /** 판 자료를 다시 읽는다 */
  readonly reload: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(serverNow);
  const [hours, setHours] = useState(1);
  const [fee, setFee] = useState(String(harbor.fee));
  const [access, setAccess] = useState<HarborAccess>(harbor.access);
  const [modules, setModules] = useState<readonly (ShipyardModule | null)[]>(() =>
    Array.from({ length: harbor.moduleSlots }, (_, index) => harbor.modules[index] ?? null),
  );
  const working =
    harbor.jobs.length > 0 ||
    harbor.visits.length > 0 ||
    harbor.docked.some((row) => row.repairUntil !== null);
  // 작업·머묾 남은 시간을 1초마다 다시 그린다
  useEffect(() => {
    if (!working) return () => undefined;
    const timer = setInterval(() => setNow(serverNow()), 1_000);
    return () => clearInterval(timer);
  }, [working]);

  const run = (kind: BoatOutcomeKind, command: BoatCommand) => {
    setSending(true);
    void sendBoatCommand(command)
      .then((outcome) => {
        const at = serverNow();
        setNow(at);
        setNotice(boatOutcomeText(kind, outcome, at));
        if (outcome.ok) reload();
      })
      .finally(() => setSending(false));
  };

  const roleTitle =
    harbor.role === "shipyard"
      ? m.harbor_docks({ used: harbor.used, capacity: harbor.capacity })
      : harbor.role === "berth"
        ? m.harbor_berths({ used: harbor.used, capacity: harbor.capacity })
        : m.harbor_slots({ used: harbor.used, capacity: harbor.capacity });

  return (
    <div className="gather-section harbor-panel" data-harbor={harbor.role} data-dock={buildingId}>
      <p className="gather-muted">
        {harbor.role === "shipyard"
          ? m.harbor_shipyard_note()
          : harbor.role === "berth"
            ? m.harbor_berth_note()
            : m.harbor_trade_note({ mul: harbor.overstayMul })}
      </p>
      <p className="boat-line harbor-capacity" data-used={harbor.used}>
        {roleTitle}
        {harbor.role === "shipyard"
          ? ` · ${harbor.modules.length > 0 ? harbor.modules.map((module) => moduleLabel(module)).join(", ") : moduleLabel(null)}`
          : ""}
      </p>
      {level < 1 ? <p className="gather-muted">{m.harbor_unbuilt()}</p> : null}
      {harbor.closed ? (
        <p className="harbor-warning" role="status">
          {m.harbor_closed()}
        </p>
      ) : null}
      {mine && harbor.cash !== null ? (
        <p className="gather-muted harbor-cash">{m.harbor_cash({ cash: harbor.cash })}</p>
      ) : null}
      {harbor.currency !== "" ? (
        <p className="gather-muted harbor-currency">{m.harbor_currency({ currency: harbor.currency })}</p>
      ) : null}

      {harbor.role === "shipyard" ? (
        <>
          {harbor.jobs.length > 0 ? (
            <ul className="harbor-list">
              {harbor.jobs.map((job) => (
                <li
                  key={`${job.kind}-${String(job.startedAt)}-${String(job.boatId)}`}
                  className="boat-progress"
                >
                  {job.kind === "build"
                    ? m.harbor_job_build({ type: job.typeId, time: durationText(job.readyAt - now) })
                    : m.harbor_job_repair({ id: job.boatId ?? 0, time: durationText(job.readyAt - now) })}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="harbor-list harbor-types">
            {harbor.types.map((type) => (
              <li key={type.id} className="harbor-type" data-boat-type={type.id}>
                <span className="harbor-type-name">{nameOf(type.name, type.id)}</span>
                <span className="gather-muted">
                  {m.harbor_type_stats({
                    capacity: type.capacity,
                    speed: Math.round(type.speedPm / 10),
                    time: durationText(type.buildMs),
                  })}
                </span>
                <span className="gather-muted">
                  {type.materials
                    .map((stack) => `${nameOf(stack.name, stack.item)} ${String(stack.qty)}`)
                    .join(", ")}
                </span>
                {/* 주인에게 배 한 척 적정가(D-570 1822 — 판매가를 정할 때 곁에) */}
                {mine && type.fair ? (
                  <span className="gather-muted" data-part="harbor-type-fair">
                    {fairText(type.fair, (value) => value, m.harbor_type_fair)}
                  </span>
                ) : null}
                {/* 배 판매가(기획 대조 2057·2072 — 주인이 정하고 주문자·주인 모두 이 값을 금고에 낸다) */}
                <BoatPriceRow
                  buildingId={buildingId}
                  typeId={type.id}
                  price={type.price}
                  priceSet={type.priceSet === true}
                  fairPrice={type.fair?.price}
                  currency={harbor.currency}
                  manage={mine}
                  reload={reload}
                />
                <button
                  type="button"
                  className="button-small button-primary boat-build"
                  disabled={sending || level < 1 || type.price === "0"}
                  onClick={() => run("build", { t: "boat_build", buildingId, boatType: type.id })}
                >
                  {/* 남의 조선소는 주문(D-564 1682), 주인도 판매가를 제 금고에 낸다(2072). 재료는 조선소 창고(D-573 2048) */}
                  {type.price === undefined
                    ? mine
                      ? m.boat_build()
                      : m.harbor_order_build({ fee: harbor.orderFee ?? "0", currency: harbor.currency })
                    : mine
                      ? m.harbor_own_build({ fee: type.price, currency: harbor.currency })
                      : m.harbor_order_build({ fee: type.price, currency: harbor.currency })}
                </button>
              </li>
            ))}
          </ul>
          {/* 도크에 든 배(D-559 1523): 고치는 중·출고 기다림, 내 배는 [출고](남의 조선소면 보관료) */}
          {harbor.docked.length > 0 ? (
            <div className="harbor-docked">
              <p className="gather-inside-title">{m.harbor_docked_title()}</p>
              <ul className="harbor-list">
                {harbor.docked.map((row) => (
                  <li key={row.boatId} className="harbor-boat" data-docked={row.boatId}>
                    <span>
                      {row.repairUntil !== null
                        ? m.harbor_docked_repairing({
                            id: row.boatId,
                            type: row.typeId,
                            time: durationText(row.repairUntil - now),
                          })
                        : m.harbor_docked_ready({ id: row.boatId, type: row.typeId })}
                      {row.storageDue !== "0"
                        ? ` · ${m.harbor_storage_due({ fee: row.storageDue, currency: harbor.currency })}`
                        : ""}
                      {/* 압류(D-564 1686): 밀린 보관료가 배값을 넘으면 조선소 주인 것이 된다 */}
                      {row.impounded === true
                        ? ` · ${m.harbor_impounded({ value: row.value ?? "0", currency: harbor.currency })}`
                        : ""}
                    </span>
                    {row.own ? (
                      <button
                        type="button"
                        className="button-small button-primary harbor-release"
                        disabled={sending || row.repairUntil !== null}
                        onClick={() => run("release", { t: "boat_release", boatId: row.boatId })}
                      >
                        {m.harbor_release()}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="gather-muted harbor-storage-note">
            {m.harbor_storage_note({
              hours: Math.round(harbor.storageFreeMs / 3_600_000),
              fee: harbor.storageFee,
              currency: harbor.currency,
            })}
          </p>
          {mine && harbor.moduleSlots > 0 ? (
            <div className="harbor-row harbor-modules">
              {modules.map((module, index) => (
                <label key={`slot-${String(index)}`} className="harbor-field">
                  <span>{m.harbor_module_slot({ n: index + 1 })}</span>
                  <select
                    className="harbor-module"
                    value={module ?? "none"}
                    onChange={(event) =>
                      setModules(
                        modules.map((old, at) => (at === index ? moduleOf(event.target.value) : old)),
                      )
                    }
                  >
                    {(["none", "docks", "build", "repair"] as const).map((value) => (
                      <option key={value} value={value}>
                        {moduleLabel(value === "none" ? null : value)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="button"
                className="button-small harbor-modules-save"
                disabled={sending}
                onClick={() =>
                  run("policy", {
                    t: "harbor_policy",
                    buildingId,
                    modules: modules.filter((value) => value !== null),
                  })
                }
              >
                {m.harbor_modules_save()}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {harbor.role === "berth" && harbor.boats.length > 0 ? (
        <ul className="harbor-list">
          {harbor.boats.map((boat) => (
            <li key={boat.boatId} data-boat={boat.boatId}>
              {boatLine(boat)}
              {boat.own ? ` · ${m.harbor_own()}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {harbor.role === "trade_dock" && harbor.visits.length > 0 ? (
        <ul className="harbor-list">
          {harbor.visits.map((visit) => (
            <li key={visit.boatId} data-boat={visit.boatId}>
              {visit.until > now
                ? m.harbor_visit({ id: visit.boatId, time: durationText(visit.until - now) })
                : m.harbor_visit_over({ id: visit.boatId })}
            </li>
          ))}
        </ul>
      ) : null}

      {/* 같은 2차맵의 내 배 */}
      {harbor.mine.length > 0 ? (
        <div className="harbor-mine">
          <p className="gather-inside-title">{m.harbor_my_boats()}</p>
          {harbor.exchangeId !== undefined && harbor.exchangeId !== null ? (
            <p className="gather-muted harbor-exchange">{m.harbor_exchange_near()}</p>
          ) : null}
          {harbor.role === "trade_dock" ? (
            <label className="harbor-field">
              <span>{m.harbor_hours()}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={harbor.maxHours}
                value={hours}
                onChange={(event) =>
                  setHours(Math.max(1, Math.min(harbor.maxHours, Number(event.target.value) || 1)))
                }
              />
            </label>
          ) : null}
          <ul className="harbor-list">
            {harbor.mine.map((boat) => (
              <li key={boat.boatId} className="harbor-boat" data-boat={boat.boatId}>
                <span>
                  {boatLine(boat)}
                  {boat.holdGrams !== undefined && boat.holdCapGrams !== undefined
                    ? ` · ${m.harbor_hold({ kg: Math.floor(boat.holdGrams / 1000), cap: Math.floor(boat.holdCapGrams / 1000) })}`
                    : ""}
                </span>
                {/* 배 창고 내리기(D-568): 교역 부두(대어 있을 때)나 내 배 시설 → 그 도시 내 창고 */}
                {(harbor.role === "trade_dock" || mine) && (boat.holdGrams ?? 0) > 0 ? (
                  <button
                    type="button"
                    className="button-small harbor-unload"
                    disabled={sending}
                    onClick={() => run("unload", { t: "boat_unload", boatId: boat.boatId, buildingId })}
                  >
                    {harbor.role === "trade_dock" && !mine ? m.harbor_unload_sell() : m.harbor_unload_store()}
                  </button>
                ) : null}
                {harbor.role === "shipyard" ? (
                  <button
                    type="button"
                    className="button-small harbor-repair"
                    disabled={sending || boat.hullPm >= 1000}
                    onClick={() => run("repair", { t: "boat_repair", boatId: boat.boatId, buildingId })}
                  >
                    {m.harbor_repair()}
                  </button>
                ) : null}
                {harbor.role === "trade_dock" || mine ? (
                  <button
                    type="button"
                    className="button-small harbor-refuel"
                    disabled={sending}
                    onClick={() => run("refuel", { t: "boat_refuel", boatId: boat.boatId, buildingId })}
                  >
                    {m.harbor_refuel()}
                  </button>
                ) : null}
                {harbor.role === "berth" ? (
                  boat.homeId === buildingId ? (
                    <button
                      type="button"
                      className="button-small harbor-unberth"
                      disabled={sending}
                      onClick={() => run("berth", { t: "boat_berth", boatId: boat.boatId, buildingId: null })}
                    >
                      {m.harbor_unberth()}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button-small button-primary harbor-berth"
                      disabled={sending}
                      onClick={() => run("berth", { t: "boat_berth", boatId: boat.boatId, buildingId })}
                    >
                      {m.harbor_berth_here()}
                    </button>
                  )
                ) : null}
                {harbor.role === "trade_dock" ? (
                  <button
                    type="button"
                    className="button-small button-primary harbor-dock-time"
                    disabled={sending}
                    onClick={() =>
                      run("dock_time", { t: "boat_dock_time", boatId: boat.boatId, buildingId, hours })
                    }
                  >
                    {m.harbor_buy_time({ hours, fee: harbor.fee * hours })}
                  </button>
                ) : null}
                {/* 함포 칸 포획 장비·싣기(D-570 1821·1823) */}
                <BoatPortRow boat={boat} buildingId={buildingId} sending={sending} run={run} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 주인 설정: 받기 범위·요금(정박장 하루·교역 부두 한 시간·조선소 남의 배 수리 한 번 — D-559 1522) */}
      {mine ? (
        <div className="harbor-policy">
          <label className="harbor-field">
            <span>{m.harbor_access()}</span>
            <select value={access} onChange={(event) => setAccess(accessOf(event.target.value))}>
              {(["owner", "nation", "peace"] as const).map((value) => (
                <option key={value} value={value}>
                  {accessLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="harbor-field">
            <span>
              {harbor.role === "berth"
                ? m.harbor_fee_day()
                : harbor.role === "shipyard"
                  ? m.harbor_fee_repair()
                  : m.harbor_fee_hour()}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </label>
          {/* 수리 요금을 정하지 않은 조선소는 수리마다 적정가(기획 대조 2161·2167 — 재료·인건비는 조선소) */}
          {harbor.role === "shipyard" && harbor.feeSet === false && harbor.repairFair ? (
            <p className="gather-muted harbor-repair-fair">
              {m.harbor_repair_fair({ price: harbor.repairFair.price, currency: harbor.currency })}
            </p>
          ) : null}
          <button
            type="button"
            className="button-small harbor-save"
            disabled={sending}
            onClick={() =>
              run("policy", {
                t: "harbor_policy",
                buildingId,
                access,
                fee: Math.max(0, Math.floor(Number(fee) || 0)),
              })
            }
          >
            {m.harbor_save()}
          </button>
        </div>
      ) : harbor.role === "shipyard" ? (
        <p className="gather-muted harbor-terms">
          {harbor.feeSet === false
            ? m.harbor_repair_fee_fair({ currency: harbor.currency })
            : m.harbor_repair_fee({ fee: harbor.fee, currency: harbor.currency })}{" "}
          · {accessLabel(harbor.access)}
        </p>
      ) : (
        <p className="gather-muted">
          {m.harbor_terms({
            access: accessLabel(harbor.access),
            fee: harbor.fee,
            unit: harbor.role === "berth" ? m.harbor_unit_day() : m.harbor_unit_hour(),
          })}
        </p>
      )}

      {notice ? (
        <p className="boat-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/** 고른 값 → 조선소 모듈(모르는 값·none은 없음) */
function moduleOf(value: string): ShipyardModule | null {
  return value === "docks" || value === "build" || value === "repair" ? value : null;
}

/** 고른 값 → 받기 범위(모르는 값은 같은 나라) */
function accessOf(value: string): HarborAccess {
  return value === "owner" || value === "peace" ? value : "nation";
}
