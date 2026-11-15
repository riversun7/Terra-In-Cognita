// 배 시설 판(건물 판 안) — 조선소·정박장·교역 부두. docs/adr/2026-11-15-shipyard-harbor.md, 기획 D-547·D-548.
// - 조선소: 도크(쓰는 수/모두)·모듈(주인, 레벨 2부터)·작업 줄(남은 시간)·배 종류마다 재료·시간·[만들기]·같은 2차맵 내 배 [수리].
// - 정박장: 정박 자리(쓰는 수/모두)·든 배·같은 2차맵 내 배 [여기 정박]/[집 비우기]·받기 범위·하루 정박료(주인).
// - 교역 부두: 임시 자리·머무는 배(남은 시간)·내 배 [N시간 사기]·받기 범위·한 시간 요금(주인).
// - 금고(사업장 장부, D-548)는 주인에게만 보인다. 서버가 소유·거리·자리·받기 범위·돈을 다시 본다. 결과는 판 아래 한 줄에 알리고 판을 다시 읽는다.
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
  const working = harbor.jobs.length > 0 || harbor.visits.length > 0;
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
        {harbor.role === "shipyard" ? ` · ${moduleLabel(harbor.module)}` : ""}
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
                <button
                  type="button"
                  className="button-small button-primary boat-build"
                  disabled={sending || level < 1 || !mine}
                  onClick={() => run("build", { t: "boat_build", buildingId, boatType: type.id })}
                >
                  {m.boat_build()}
                </button>
              </li>
            ))}
          </ul>
          {mine && level >= 2 ? (
            <div className="harbor-row">
              {(["docks", "build", "repair"] as const).map((module) => (
                <button
                  key={module}
                  type="button"
                  className="button-small harbor-module"
                  aria-pressed={harbor.module === module}
                  disabled={sending}
                  onClick={() => run("policy", { t: "harbor_policy", buildingId, module })}
                >
                  {moduleLabel(module)}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {harbor.role === "berth" && harbor.boats.length > 0 ? (
        <ul className="harbor-list">
          {harbor.boats.map((boat) => (
            <li key={boat.boatId} data-boat={boat.boatId}>
              {boatLine(boat)}
              {boat.own ? ` · ${m.gather_building_inside_own()}` : ""}
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
                <span>{boatLine(boat)}</span>
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
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 주인 설정: 받기 범위·요금(정박장·교역 부두) */}
      {mine && harbor.role !== "shipyard" ? (
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
            <span>{harbor.role === "berth" ? m.harbor_fee_day() : m.harbor_fee_hour()}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </label>
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
      ) : !mine && harbor.role !== "shipyard" ? (
        <p className="gather-muted">
          {m.harbor_terms({
            access: accessLabel(harbor.access),
            fee: harbor.fee,
            unit: harbor.role === "berth" ? m.harbor_unit_day() : m.harbor_unit_hour(),
          })}
        </p>
      ) : null}

      {notice ? (
        <p className="boat-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/** 고른 값 → 받기 범위(모르는 값은 같은 나라) */
function accessOf(value: string): HarborAccess {
  return value === "owner" || value === "peace" ? value : "nation";
}
