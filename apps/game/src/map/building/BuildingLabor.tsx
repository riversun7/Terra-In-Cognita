// 건물 판 [일꾼·계약] 칸 — 사용자 요청 2026-11-15 "임금형, 임대형 제대로 구현하라", 기획 D-479(임금형·임대형 2종)·338~342·347~350·49 N48·
// D-555(돈은 사업장 금고로), docs/adr/2026-11-15-building-screen.md.
// - 누구나: 걸린 임대료(시간당)·열린 일자리(임금·보증금·자리)·이 건물 계약 목록(임금·보증금 남은 주기·다음 지급·유예).
// - 남: 내 유닛(같은 2차맵, 쉬는 유닛)으로 [일자리 받기](임금형 — 고용주 = 시설 주인, 보증금은 그 사업장 금고에서) 또는 [빌리기](임대형 — 시간당
//   임대료를 미리 냄, 산출은 내 몫).
// - 주인·대주주·운영자 모드(관리): 임대료 정하기(0 = 빌려주지 않음), 일자리 내기·거두기(임금 조정 ‰·자리·기간), 계약 해고·보증금 채우기.
// - 판정은 서버(labor_* 명령, 프로토콜 7·8). 자료는 tRPC labor.building.
import type { LaborBuildingContractView, LaborBuildingResponse } from "@terra/shared/labor";
import { useCallback, useEffect, useState } from "react";
import { formatAmount } from "../../economy/amount.ts";
import { formatDuration } from "../../economy/economyText.ts";
import { type LaborCommand, sendLaborCommand } from "../../economy/laborCommands.ts";
import {
  LABOR_ERROR_TEXT,
  adjustInRange,
  isAmount,
  isTerm,
  isWhole,
  previewWage,
} from "../../economy/laborText.ts";
import { api } from "../../net/api.ts";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { EntityRef } from "../../ui/EntityRef.tsx";
import { timeText } from "../business/booksData.ts";
import { moneyName } from "../business/businessText.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

type Ready = Extract<LaborBuildingResponse, { status: "ready" }>;

const STATE_TEXT: Readonly<Record<LaborBuildingContractView["state"], () => string>> = {
  active: m.blabor_state_active,
  paused: m.blabor_state_paused,
  grace: m.blabor_state_grace,
  ended: m.blabor_state_ended,
};

/** 건물 노동 판 자료 읽기(시간 제한 REQUEST_TIMEOUT_MS) */
function loadLabor(buildingId: number, signal?: AbortSignal): Promise<LaborBuildingResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return api.labor.building.query(
    { buildingId },
    { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
  );
}

/** 건물 노동 판 자료(켜졌을 때만, reload는 명령 뒤) */
export function useLaborBuilding(
  buildingId: number,
  enabled: boolean,
): { readonly data: LaborBuildingResponse | null; readonly reload: () => void } {
  const [data, setData] = useState<LaborBuildingResponse | null>(null);
  useEffect(() => {
    if (!enabled) return () => undefined;
    const controller = new AbortController();
    loadLabor(buildingId, controller.signal)
      .then((response) => setData(response))
      .catch(() => undefined);
    return () => controller.abort();
  }, [buildingId, enabled]);
  const reload = useCallback(() => {
    if (!enabled) return;
    loadLabor(buildingId)
      .then((response) => setData(response))
      .catch(() => undefined);
  }, [buildingId, enabled]);
  return { data: data?.buildingId === buildingId ? data : null, reload };
}

interface BuildingLaborProps {
  readonly buildingId: number;
  readonly data: LaborBuildingResponse | null;
  readonly reload: () => void;
  /** 관리 단추(주인·대주주 — 서버 canManage, 또는 운영자 모드) */
  readonly manage: boolean;
  /** 유닛 이름(지도 이름표와 같다) */
  readonly unitLabel: (unitId: number) => string;
  /** 고른 유닛(있으면 처음 고른 후보) */
  readonly actor: number | null;
  /** 관리 칸만(관리 탭) 또는 보기·신청 칸만(일꾼 탭) */
  readonly section: "work" | "manage";
}

export function BuildingLabor({
  buildingId,
  data,
  reload,
  manage,
  unitLabel,
  actor,
  section,
}: BuildingLaborProps) {
  const locale = getLocale();
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unit, setUnit] = useState<number | null>(null);
  const [term, setTerm] = useState("");
  const [rent, setRent] = useState("");
  const [adjust, setAdjust] = useState("1000");
  const [slots, setSlots] = useState("1");
  const [jobTerm, setJobTerm] = useState("");
  const [topUp, setTopUp] = useState<Record<number, string>>({});

  const run = (command: LaborCommand, done: string) => {
    setSending(true);
    void sendLaborCommand(command)
      .then((outcome) => {
        setNotice(outcome.ok ? done : LABOR_ERROR_TEXT[outcome.code]());
        reload();
      })
      .finally(() => setSending(false));
  };

  if (!data || data.status !== "ready")
    return (
      <p className="bp-muted">
        {data?.status === "unknown_building" ? m.blabor_unknown() : m.books_loading()}
      </p>
    );
  const ready: Ready = data;
  const money = moneyName(ready.currency);
  const free = ready.myUnits.filter((entry) => !entry.busy);
  const chosen = free.find((entry) => entry.id === (unit ?? actor)) ?? free[0];
  const now = serverNow();
  const adjustPm = Number(adjust);
  const previewCycle = previewWage(ready.rules, adjustPm);

  const unitPicker =
    free.length === 0 ? (
      <p className="bp-muted">{m.blabor_no_free_unit()}</p>
    ) : (
      <label className="bp-field">
        <span>{m.blabor_pick_unit()}</span>
        <select
          className="bp-input"
          value={chosen?.id ?? ""}
          onChange={(event) => setUnit(Number(event.target.value))}
          data-part="labor-unit"
        >
          {free.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {unitLabel(entry.id)}
            </option>
          ))}
        </select>
      </label>
    );

  const offers = (
    <section className="bp-card" aria-label={m.blabor_offers()} data-part="labor-offers">
      <h3 className="bp-card-title">{m.blabor_offers()}</h3>
      <div className="bp-kpis">
        <div className="bp-kpi" data-kind="wage">
          <span className="bp-kpi-label">{m.blabor_wage_job()}</span>
          <span className="bp-kpi-value" data-part="labor-job">
            {ready.job
              ? m.blabor_job_value({ wage: formatAmount(ready.job.wage, locale), money })
              : m.blabor_job_none()}
          </span>
          {ready.job ? (
            <span className="bp-muted">
              {m.blabor_job_detail({
                deposit: formatAmount(ready.job.deposit, locale),
                filled: ready.job.filled,
                slots: ready.job.slots,
                term:
                  ready.job.termHours === null
                    ? m.blabor_term_none()
                    : m.blabor_term_hours({ hours: ready.job.termHours }),
              })}
            </span>
          ) : null}
        </div>
        <div className="bp-kpi" data-kind="lease">
          <span className="bp-kpi-label">{m.blabor_rent()}</span>
          <span className="bp-kpi-value" data-part="labor-rent">
            {ready.rent === null
              ? m.blabor_rent_none()
              : m.blabor_rent_value({ rent: formatAmount(ready.rent, locale), money })}
          </span>
          <span className="bp-muted">
            {m.blabor_grace_note({ time: formatDuration(ready.rules.graceMs) })}
          </span>
        </div>
        <div className="bp-kpi">
          <span className="bp-kpi-label">{m.blabor_slots()}</span>
          <span className="bp-kpi-value">
            {ready.filled}/{ready.slots}
          </span>
          <span className="bp-meter" aria-hidden="true">
            <span
              className="bp-meter-fill"
              data-tone="lead"
              style={{
                inlineSize: `${ready.slots > 0 ? Math.min(100, (ready.filled * 100) / ready.slots) : 0}%`,
              }}
            />
          </span>
        </div>
      </div>
      {!ready.canManage && !ready.ownerless && (ready.job || ready.rent !== null) ? (
        <div className="bp-apply">
          {unitPicker}
          {ready.job ? (
            <button
              type="button"
              className="button-small button-primary"
              data-part="labor-accept"
              disabled={sending || !chosen}
              onClick={() => {
                if (!chosen || !ready.job) return;
                run({ t: "labor_accept_job", jobId: ready.job.id, unitId: chosen.id }, m.blabor_accepted());
              }}
            >
              {m.blabor_accept()}
            </button>
          ) : null}
          {ready.rent !== null ? (
            <div className="bp-form-row">
              <input
                className="bp-input"
                inputMode="numeric"
                aria-label={m.blabor_lease_term()}
                placeholder={m.blabor_lease_term()}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
              <button
                type="button"
                className="button-small"
                data-part="labor-lease"
                disabled={sending || !chosen || !isTerm(term)}
                onClick={() => {
                  if (!chosen) return;
                  run(
                    {
                      t: "labor_create",
                      kind: "lease",
                      buildingId,
                      unitId: chosen.id,
                      ...(term === "" ? {} : { termHours: Number(term) }),
                    },
                    m.blabor_leased(),
                  );
                }}
              >
                {m.blabor_lease()}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  const contracts = (
    <section className="bp-card" aria-label={m.blabor_contracts()} data-part="labor-contracts">
      <h3 className="bp-card-title">
        {m.blabor_contracts()} <span className="bp-muted">· {ready.contracts.length}</span>
      </h3>
      {ready.contracts.length === 0 ? (
        <p className="bp-muted">{m.blabor_contracts_none()}</p>
      ) : (
        <ul className="bp-list">
          {ready.contracts.map((c) => {
            const boss = manage || c.role === "owner" || c.role === "both";
            const worker = c.role === "worker" || c.role === "both";
            const cyclesPct = Math.min(100, (c.cyclesLeft * 100) / Math.max(1, ready.rules.depositCycles));
            return (
              <li
                key={c.id}
                className="bp-contract"
                data-kind={c.kind}
                data-state={c.state}
                data-contract={c.id}
              >
                <div className="bp-good-head">
                  <span className="bp-tag" data-kind={c.kind}>
                    {c.kind === "wage" ? m.blabor_kind_wage() : m.blabor_kind_lease()}
                  </span>
                  <span className="bp-grow">
                    <EntityRef
                      kind="unit"
                      role={worker ? "cyborg" : "human"}
                      name={unitLabel(c.unitId)}
                      mine={worker}
                      popup={{
                        kind: "unit",
                        role: worker ? "cyborg" : "human",
                        title: unitLabel(c.unitId),
                        kindLabel: worker ? m.entity_kind_cyborg() : m.entity_kind_unit(),
                        facts: [
                          { label: m.entity_unit_field_state(), value: STATE_TEXT[c.state]() },
                          { label: m.entity_unit_field_id(), value: `#${c.unitId}` },
                        ],
                      }}
                    />
                  </span>
                  <span className="bp-tag" data-state={c.state}>
                    {STATE_TEXT[c.state]()}
                  </span>
                </div>
                <p className="bp-muted">
                  {c.kind === "wage"
                    ? m.blabor_wage_line({
                        rate: formatAmount(c.rate, locale),
                        money,
                        deposit: formatAmount(c.deposit, locale),
                        cycles: c.cyclesLeft,
                      })
                    : m.blabor_lease_line({
                        rate: formatAmount(c.rate, locale),
                        money,
                        paid: formatAmount(c.paidTotal, locale),
                      })}
                  {c.nextDueAt !== null
                    ? ` · ${m.blabor_next_due({ time: formatDuration(Math.max(0, c.nextDueAt - now)) })}`
                    : ""}
                  {c.graceUntil !== null
                    ? ` · ${m.blabor_grace_until({ at: timeText(c.graceUntil, locale) })}`
                    : ""}
                </p>
                {c.kind === "wage" && c.net ? (
                  <p className="bp-muted" data-part="blabor-net-wage">
                    {m.blabor_net_wage({
                      net: formatAmount(c.net.net, locale),
                      money,
                      income: formatAmount(c.net.incomeTax, locale),
                      house: formatAmount(c.net.houseTax, locale),
                    })}
                  </p>
                ) : null}
                {c.kind === "wage" ? (
                  <span className="bp-meter" aria-hidden="true">
                    <span
                      className="bp-meter-fill"
                      data-tone={c.warning ? "warn" : "lead"}
                      style={{ inlineSize: `${cyclesPct}%` }}
                    />
                  </span>
                ) : null}
                {c.warning ? <p className="bp-warn">{m.blabor_deposit_warn()}</p> : null}
                {(boss || worker) && c.state !== "grace" ? (
                  <div className="bp-form-row">
                    {boss && c.kind === "wage" && section === "manage" ? (
                      <>
                        <input
                          className="bp-input"
                          inputMode="numeric"
                          aria-label={m.blabor_top_up_amount()}
                          placeholder={m.blabor_top_up_amount()}
                          value={topUp[c.id] ?? ""}
                          onChange={(event) => setTopUp({ ...topUp, [c.id]: event.target.value })}
                        />
                        <button
                          type="button"
                          className="button-small"
                          disabled={sending || !isAmount(topUp[c.id] ?? "")}
                          onClick={() =>
                            run(
                              { t: "labor_top_up", contractId: c.id, amount: topUp[c.id] ?? "" },
                              m.blabor_topped_up(),
                            )
                          }
                        >
                          {m.blabor_top_up()}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="button-small"
                      data-part="labor-terminate"
                      disabled={sending}
                      onClick={() => run({ t: "labor_terminate", contractId: c.id }, m.blabor_terminated())}
                    >
                      {boss ? m.blabor_fire() : m.blabor_quit()}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const terms = (
    <section className="bp-card" aria-label={m.blabor_terms()} data-part="labor-terms">
      <h3 className="bp-card-title">{m.blabor_terms()}</h3>
      <div className="bp-form-row">
        <label className="bp-field">
          <span>{m.blabor_rent_input({ money })}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={rent}
            placeholder={ready.rent ?? "0"}
            onChange={(event) => setRent(event.target.value)}
            data-part="labor-rent-input"
          />
        </label>
        <button
          type="button"
          className="button-small"
          data-part="labor-set-rent"
          disabled={sending || !isWhole(rent)}
          onClick={() =>
            run(
              { t: "labor_set_rent", buildingId, rent },
              rent === "0" ? m.blabor_rent_stopped() : m.blabor_rent_set(),
            )
          }
        >
          {m.blabor_set_rent()}
        </button>
      </div>
      <p className="bp-muted">{m.blabor_rent_hint()}</p>
      <div className="bp-form-row">
        <label className="bp-field">
          <span>{m.blabor_adjust({ min: ready.rules.adjustMinPm, max: ready.rules.adjustMaxPm })}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={adjust}
            onChange={(event) => setAdjust(event.target.value)}
            data-part="labor-adjust"
          />
        </label>
        <label className="bp-field">
          <span>{m.blabor_job_slots()}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={slots}
            onChange={(event) => setSlots(event.target.value)}
          />
        </label>
        <label className="bp-field">
          <span>{m.blabor_job_term()}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={jobTerm}
            placeholder={m.blabor_term_none()}
            onChange={(event) => setJobTerm(event.target.value)}
          />
        </label>
      </div>
      <p className="bp-muted" data-part="labor-preview">
        {m.blabor_job_preview({
          wage: formatAmount(previewCycle, locale),
          deposit: formatAmount(previewCycle * BigInt(ready.rules.depositCycles), locale),
          money,
        })}
      </p>
      <div className="bp-actions">
        <button
          type="button"
          className="button-small button-primary"
          data-part="labor-post"
          disabled={
            sending ||
            !adjustInRange(adjustPm, ready.rules) ||
            !/^[1-9][0-9]?$|^100$/.test(slots) ||
            !isTerm(jobTerm)
          }
          onClick={() =>
            run(
              {
                t: "labor_post_job",
                buildingId,
                adjustPm,
                slots: Number(slots),
                ...(jobTerm === "" ? {} : { termHours: Number(jobTerm) }),
              },
              m.blabor_posted(),
            )
          }
        >
          {ready.job ? m.blabor_repost() : m.blabor_post()}
        </button>
        {ready.job ? (
          <button
            type="button"
            className="button-small"
            data-part="labor-withdraw"
            disabled={sending}
            onClick={() => {
              if (ready.job) run({ t: "labor_withdraw_job", jobId: ready.job.id }, m.blabor_withdrawn());
            }}
          >
            {m.blabor_withdraw()}
          </button>
        ) : null}
      </div>
    </section>
  );

  return (
    <div className="bp-labor" data-part="building-labor">
      {section === "work" ? (
        <>
          {offers}
          {contracts}
        </>
      ) : manage ? (
        <>
          {terms}
          {contracts}
        </>
      ) : null}
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
