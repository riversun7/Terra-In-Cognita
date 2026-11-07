// 노동 계약 칸(생산 칸 아래) — 임금형·임대형(D-479), 규칙 값 49 N48. docs/adr/2026-11-03-labor-contracts.md
// - 자료는 tRPC labor.overview·labor.jobs(실제 자료만, 시안 자료 없음), 바꾸는 명령은 WebSocket(laborCommands.ts)이다.
// - 서버가 판정한다(소유·임금 식·보증금·잔고). 화면은 미리 셈(임금·보증금)만 보이고 결과 코드를 문구로 바꾼다.
// - 차례: 잔고 → 내 계약 → 구인 게시판(남의 일자리를 내 유닛으로) → 새 계약(내 시설·내 유닛, 남의 시설 임대) → 내 구인 → 임대료.
// - 임대형은 손 해지도 유예에 든다(기획 341). 유예는 손으로 끝내지 않아 [해지]가 없고, 남은 물건 안내는 표시만이다(시설 창고 없음).
// - [임시] 시설·유닛은 번호로 보인다(서버 시설에 종류·이름이 아직 없다).
import type { LaborContractView, LaborOverviewResponse } from "@terra/shared/labor";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { fmt, formatDuration } from "./economyText.ts";
import { LaborJobBoard, LaborMyJobs } from "./LaborJobs.tsx";
import { sendLaborCommand } from "./laborCommands.ts";
import {
  LABOR_ERROR_TEXT,
  type LaborRun,
  adjustInRange,
  isAmount,
  isTerm,
  isWhole,
  previewWage,
} from "./laborText.ts";
import { Loaded } from "./parts.tsx";
import { NO_ARGS, useLabor, useNowTick } from "./queries.ts";
import "./labor.css";

const STATE_TEXT: Readonly<Record<LaborContractView["state"], () => string>> = {
  active: m.labor_state_active,
  paused: m.labor_state_paused,
  grace: m.labor_state_grace,
  ended: m.labor_state_ended,
};

const END_TEXT: Readonly<Record<NonNullable<LaborContractView["endReason"]>, () => string>> = {
  owner: m.labor_end_owner,
  worker: m.labor_end_worker,
  deposit_used_up: m.labor_end_deposit_used_up,
  rent_unpaid: m.labor_end_rent_unpaid,
  expired: m.labor_end_expired,
  unit_gone: m.labor_end_unit_gone,
  building_gone: m.labor_end_building_gone,
};

const ROLE_TEXT: Readonly<Record<LaborContractView["role"], () => string>> = {
  owner: m.labor_role_owner,
  worker: m.labor_role_worker,
  both: m.labor_role_both,
};

function ContractRow({
  contract,
  data,
  now,
  run,
  busy,
}: {
  contract: LaborContractView;
  data: LaborOverviewResponse;
  now: number;
  run: LaborRun;
  busy: boolean;
}) {
  const [amount, setAmount] = useState("");
  const wage = contract.kind === "wage";
  const open = contract.state === "active" || contract.state === "paused";
  const cycle = formatDuration(wage ? data.rules.wageCycleMs : data.rules.rentCycleMs);
  const titleId = `labor-contract-${contract.id}`;
  const canTopUp = wage && open && contract.role !== "worker";
  return (
    <li className="labor-contract" data-contract={contract.id} data-state={contract.state}>
      <div className="labor-contract-head">
        <span id={titleId} className="eco-row-title">
          {m.labor_row_title({ unit: contract.unitId, building: contract.buildingId })}
        </span>
        <span className="eco-tag">{wage ? m.labor_kind_wage() : m.labor_kind_lease()}</span>
        <span
          className="eco-tag"
          data-tone={contract.state === "active" ? "on" : contract.state === "ended" ? undefined : "warning"}
        >
          {STATE_TEXT[contract.state]()}
        </span>
        {contract.warning ? (
          <span className="eco-tag" data-tone="warning">
            {m.labor_warning()}
          </span>
        ) : null}
      </div>
      <p className="eco-row-meta">
        {ROLE_TEXT[contract.role]()} ·{" "}
        {(wage ? m.labor_rate_wage : m.labor_rate_lease)({ amount: fmt(contract.rate), cycle })} ·{" "}
        {m.labor_paid_total({ amount: fmt(contract.paidTotal) })}
      </p>
      {wage && contract.state !== "ended" ? (
        <p className="eco-row-meta">
          {m.labor_deposit({ amount: fmt(contract.deposit), cycles: contract.cyclesLeft })}
        </p>
      ) : null}
      {open && contract.nextDueAt !== null ? (
        <p className="eco-row-meta">
          {m.labor_next_due({ time: formatDuration(contract.nextDueAt - now) })}
          {contract.endsAt === null
            ? ""
            : ` · ${m.labor_ends_in({ time: formatDuration(contract.endsAt - now) })}`}
        </p>
      ) : null}
      {contract.state === "grace" && contract.graceUntil !== null ? (
        <>
          <p className="eco-row-meta">
            {m.labor_grace_until({ time: formatDuration(contract.graceUntil - now) })}
          </p>
          <p className="eco-row-meta">{m.labor_grace_note()}</p>
        </>
      ) : null}
      {contract.endReason !== null ? <p className="eco-row-meta">{END_TEXT[contract.endReason]()}</p> : null}
      {contract.leftoversMovedAt !== null ? (
        <p className="eco-row-meta">{m.labor_leftovers_moved()}</p>
      ) : null}
      {open && !wage ? (
        <p className="eco-row-meta">
          {m.labor_terminate_grace_hint({ grace: formatDuration(data.rules.graceMs) })}
        </p>
      ) : null}
      {open ? (
        <div className="labor-actions">
          {canTopUp ? (
            <form
              className="labor-inline"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isAmount(amount)) return;
                void run({ t: "labor_top_up", contractId: contract.id, amount }).then((ok) => {
                  if (ok) setAmount("");
                });
              }}
            >
              <label className="visually-hidden" htmlFor={`labor-topup-${contract.id}`}>
                {m.labor_amount_label()}
              </label>
              <input
                id={`labor-topup-${contract.id}`}
                className="eco-input"
                inputMode="numeric"
                autoComplete="off"
                placeholder={m.labor_amount_label()}
                value={amount}
                onChange={(event) => setAmount(event.target.value.trim())}
              />
              <button type="submit" className="button-small" disabled={busy || !isAmount(amount)}>
                {m.labor_top_up()}
              </button>
            </form>
          ) : null}
          <button
            type="button"
            className="button-small"
            aria-describedby={titleId}
            disabled={busy}
            onClick={() => void run({ t: "labor_terminate", contractId: contract.id })}
          >
            {m.labor_terminate()}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function NewContract({ data, run, busy }: { data: LaborOverviewResponse; run: LaborRun; busy: boolean }) {
  const [kind, setKind] = useState<"wage" | "lease">("wage");
  const [building, setBuilding] = useState("");
  const [unit, setUnit] = useState("");
  const [adjust, setAdjust] = useState("1000");
  const [term, setTerm] = useState("");
  const buildings = data.buildings.filter((entry) =>
    kind === "wage" ? entry.own : !entry.own && entry.rent !== null,
  );
  const chosenBuilding = buildings.find((entry) => String(entry.id) === building) ?? buildings[0];
  const idle = data.units.filter((entry) => !entry.busy);
  // 고른 시설과 같은 2차맵의 유닛만 일할 수 있다(기획 정리 D-518 522 ①, 서버 wrong_map)
  const units = chosenBuilding ? idle.filter((entry) => entry.mapKey === chosenBuilding.mapKey) : idle;
  const elsewhere = idle.length - units.length;
  const chosenUnit = units.find((entry) => String(entry.id) === unit) ?? units[0];
  const rules = data.rules;
  const adjustPm = Number(adjust);
  const adjustOk = adjustInRange(adjustPm, rules);
  const termOk = isTerm(term);
  // 미리 셈(서버와 같은 식, 판정은 서버)
  const perCycle = previewWage(rules, adjustPm);
  const ready =
    chosenBuilding !== undefined && chosenUnit !== undefined && termOk && (kind === "lease" || adjustOk);
  return (
    <form
      className="labor-form"
      aria-labelledby="labor-new-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || !chosenBuilding || !chosenUnit) return;
        void run({
          t: "labor_create",
          kind,
          buildingId: chosenBuilding.id,
          unitId: chosenUnit.id,
          ...(kind === "wage" ? { adjustPm } : {}),
          ...(term === "" ? {} : { termHours: Number(term) }),
        });
      }}
    >
      <h3 id="labor-new-title" className="eco-subtitle">
        {m.labor_new_title()}
      </h3>
      <label className="eco-field">
        <span>{m.labor_field_kind()}</span>
        <select
          className="eco-select"
          value={kind}
          onChange={(event) => setKind(event.target.value === "lease" ? "lease" : "wage")}
        >
          <option value="wage">{m.labor_kind_wage()}</option>
          <option value="lease">{m.labor_kind_lease()}</option>
        </select>
      </label>
      <label className="eco-field">
        <span>{m.labor_field_building()}</span>
        <select
          className="eco-select"
          value={chosenBuilding ? String(chosenBuilding.id) : ""}
          onChange={(event) => setBuilding(event.target.value)}
          disabled={buildings.length === 0}
        >
          {buildings.length === 0 ? <option value="">{m.labor_no_building()}</option> : null}
          {buildings.map((entry) => (
            <option key={entry.id} value={String(entry.id)}>
              {entry.rent === null || kind === "wage"
                ? m.labor_option_building({ id: entry.id })
                : m.labor_option_building_rent({ id: entry.id, rent: fmt(entry.rent) })}
            </option>
          ))}
        </select>
      </label>
      <label className="eco-field">
        <span>{m.labor_field_unit()}</span>
        <select
          className="eco-select"
          value={chosenUnit ? String(chosenUnit.id) : ""}
          onChange={(event) => setUnit(event.target.value)}
          disabled={units.length === 0}
        >
          {units.length === 0 ? <option value="">{m.labor_no_unit()}</option> : null}
          {units.map((entry) => (
            <option key={entry.id} value={String(entry.id)}>
              {m.labor_option_unit({ id: entry.id })}
            </option>
          ))}
        </select>
      </label>
      {elsewhere > 0 ? <p className="eco-footnote">{m.labor_units_other_map({ count: elsewhere })}</p> : null}
      {kind === "wage" ? (
        <label className="eco-field">
          <span>{m.labor_field_adjust({ min: rules.adjustMinPm, max: rules.adjustMaxPm })}</span>
          <input
            className="eco-input"
            inputMode="numeric"
            autoComplete="off"
            value={adjust}
            aria-invalid={!adjustOk}
            onChange={(event) => setAdjust(event.target.value.trim())}
          />
        </label>
      ) : null}
      <label className="eco-field">
        <span>{m.labor_field_term()}</span>
        <input
          className="eco-input"
          inputMode="numeric"
          autoComplete="off"
          value={term}
          aria-invalid={!termOk}
          onChange={(event) => setTerm(event.target.value.trim())}
        />
      </label>
      <p className="eco-have" data-part="labor-preview">
        {kind === "wage"
          ? m.labor_preview_wage({
              wage: fmt(perCycle),
              cycle: formatDuration(rules.wageCycleMs),
              deposit: fmt(perCycle * BigInt(rules.depositCycles)),
            })
          : chosenBuilding?.rent
            ? m.labor_preview_lease({
                rent: fmt(chosenBuilding.rent),
                cycle: formatDuration(rules.rentCycleMs),
              })
            : m.labor_no_building()}
      </p>
      <button type="submit" className="eco-submit" disabled={busy || !ready}>
        {m.labor_create()}
      </button>
    </form>
  );
}

function RentRow({ id, rent, run, busy }: { id: number; rent: string | null; run: LaborRun; busy: boolean }) {
  const [value, setValue] = useState(rent ?? "");
  const inputId = `labor-rent-${id}`;
  return (
    <li className="eco-row">
      <form
        className="labor-inline labor-rent"
        onSubmit={(event) => {
          event.preventDefault();
          if (isWhole(value)) void run({ t: "labor_set_rent", buildingId: id, rent: value });
        }}
      >
        <label className="eco-row-main" htmlFor={inputId}>
          <span className="eco-row-title">{m.labor_option_building({ id })}</span>
          <span className="eco-row-meta">
            {rent === null ? m.labor_rent_none() : m.labor_rent_now({ rent: fmt(rent) })}
          </span>
        </label>
        <input
          id={inputId}
          className="eco-input"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={value !== "" && !isWhole(value)}
          onChange={(event) => setValue(event.target.value.trim())}
        />
        <button type="submit" className="button-small" disabled={busy || !isWhole(value)}>
          {m.labor_rent_save()}
        </button>
      </form>
    </li>
  );
}

export function LaborPanel() {
  const labor = useLabor(NO_ARGS);
  const tick = useNowTick();
  const live = useLiveLines();
  const [busy, setBusy] = useState(false);
  const [tone, setTone] = useState<"success" | "error">("success");
  const run: LaborRun = async (command) => {
    setBusy(true);
    const outcome = await sendLaborCommand(command);
    setBusy(false);
    setTone(outcome.ok ? "success" : "error");
    live.show([outcome.ok ? m.labor_done() : LABOR_ERROR_TEXT[outcome.code]()]);
    labor.refresh();
    return outcome.ok;
  };
  const data = labor.data;
  const now = data ? data.generatedAt + Math.max(0, tick - labor.receivedAt) : tick;
  const rules = data?.rules;
  return (
    <section className="panel labor" aria-labelledby="labor-title" data-part="labor">
      <h2 id="labor-title" className="eco-section-title">
        {m.labor_title()}
      </h2>
      {rules ? (
        <p className="eco-footnote">
          {m.labor_rules({
            days: rules.depositDays,
            warn: rules.warnDays,
            grace: formatDuration(rules.graceMs),
          })}
        </p>
      ) : null}
      <Loaded view={labor}>
        {(loaded) =>
          loaded.status === "not_ready" ? (
            <p className="eco-empty">{m.labor_not_ready()}</p>
          ) : (
            <>
              <p className="eco-have" data-part="labor-balance">
                {m.labor_balance({ amount: fmt(loaded.balance) })}
              </p>
              {loaded.contracts.length === 0 ? (
                <p className="eco-empty">{m.labor_empty()}</p>
              ) : (
                <ul className="labor-contracts">
                  {loaded.contracts.map((contract) => (
                    <ContractRow
                      key={contract.id}
                      contract={contract}
                      data={loaded}
                      now={now}
                      run={run}
                      busy={busy}
                    />
                  ))}
                </ul>
              )}
              <LaborJobBoard data={loaded} run={run} busy={busy} />
              <NewContract data={loaded} run={run} busy={busy} />
              <LaborMyJobs data={loaded} run={run} busy={busy} />
              {loaded.buildings.some((entry) => entry.own) ? (
                <div className="labor-rents">
                  <h3 className="eco-subtitle">{m.labor_rent_title()}</h3>
                  <ul className="eco-rows">
                    {loaded.buildings
                      .filter((entry) => entry.own)
                      .map((entry) => (
                        <RentRow key={entry.id} id={entry.id} rent={entry.rent} run={run} busy={busy} />
                      ))}
                  </ul>
                </div>
              ) : null}
            </>
          )
        }
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}
