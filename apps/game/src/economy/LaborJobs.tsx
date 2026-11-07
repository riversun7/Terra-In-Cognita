// 구인 게시판·내 구인(노동 계약 칸 안) — 남의 유닛을 임금형으로 고용(기획 D-479 기획 정리 338~342, D-432).
// docs/adr/2026-11-03-labor-contracts.md "바뀜 (기획 338~342·구인 게시판)". 화면 흐름은 기술 기본안이다(기획 UX 없음).
// - 게시판: 남이 낸 열린 일자리(tRPC labor.jobs, 도시로 거름, 임금 높은 차례). 보낼 유닛을 하나 고르고 줄마다 [받기].
// - 내 구인: 내가 낸 열린 게시(labor.overview jobs)와 [거두기], 구인 내기 폼(시설·조정·자리·기간, 기준 유닛 임금·보증금 미리 셈).
// - [임시] 시설은 번호로 보인다(서버 시설에 이름이 아직 없다). 도시는 도시 이름(이름 없는 도시만 "#ID", cityText.ts). 직무는 시설이 정한다
//   (지금은 채집 하나).
import type { LaborJobView, LaborOverviewResponse } from "@terra/shared/labor";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { useCityText } from "./cityText.ts";
import { fmt, formatDuration } from "./economyText.ts";
import { type LaborRun, adjustInRange, isTerm, previewWage } from "./laborText.ts";
import { Loaded } from "./parts.tsx";
import { useLaborJobs } from "./queries.ts";

const HOUR_MS = 3_600_000;

const JOB_TEXT: Readonly<Record<LaborJobView["job"], () => string>> = {
  gather: m.labor_job_kind_gather,
};

/** 줄 아래 한 줄: 임금 · 자리 · 기간 */
function jobMeta(job: LaborJobView, cycleMs: number): string {
  return [
    m.labor_rate_wage({ amount: fmt(job.wage), cycle: formatDuration(cycleMs) }),
    m.labor_job_slots({ filled: job.filled, slots: job.slots }),
    job.termHours === null
      ? m.labor_job_no_term()
      : m.labor_job_term({ time: formatDuration(job.termHours * HOUR_MS) }),
  ].join(" · ");
}

export function LaborJobBoard({
  data,
  run,
  busy,
}: {
  data: LaborOverviewResponse;
  run: LaborRun;
  busy: boolean;
}) {
  const [city, setCity] = useState("");
  const [unit, setUnit] = useState("");
  const jobs = useLaborJobs([city]);
  const cityText = useCityText();
  const free = data.units.filter((entry) => !entry.busy);
  const chosen = free.find((entry) => String(entry.id) === unit) ?? free[0];
  const take = async (jobId: number): Promise<void> => {
    if (!chosen) return;
    await run({ t: "labor_accept_job", jobId, unitId: chosen.id });
    jobs.refresh();
  };
  return (
    <div className="labor-board" data-part="labor-board">
      <h3 className="eco-subtitle">{m.labor_jobs_title()}</h3>
      <p className="eco-footnote">{m.labor_jobs_hint()}</p>
      <Loaded view={jobs}>
        {(loaded) => (
          <>
            <div className="labor-board-pick">
              <label className="eco-field">
                <span>{m.labor_jobs_city()}</span>
                <select className="eco-select" value={city} onChange={(event) => setCity(event.target.value)}>
                  <option value="">
                    {m.labor_jobs_city_all({
                      count: loaded.cities.reduce((sum, entry) => sum + entry.jobs, 0),
                    })}
                  </option>
                  {loaded.cities.map((entry) => (
                    <option key={entry.id} value={String(entry.id)}>
                      {m.labor_jobs_city_option({ city: cityText(entry.id), count: entry.jobs })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="eco-field">
                <span>{m.labor_job_unit()}</span>
                <select
                  className="eco-select"
                  value={chosen ? String(chosen.id) : ""}
                  onChange={(event) => setUnit(event.target.value)}
                  disabled={free.length === 0}
                >
                  {free.length === 0 ? <option value="">{m.labor_no_unit()}</option> : null}
                  {free.map((entry) => (
                    <option key={entry.id} value={String(entry.id)}>
                      {m.labor_option_unit({ id: entry.id })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {loaded.jobs.length === 0 ? (
              <p className="eco-empty">{m.labor_jobs_empty()}</p>
            ) : (
              <ul className="labor-jobs">
                {loaded.jobs.map((job) => {
                  const titleId = `labor-job-${job.id}`;
                  // 고른 유닛과 다른 2차맵의 일자리는 받을 수 없다(522 ①, 서버 wrong_map)
                  const away = chosen !== undefined && job.mapKey !== null && job.mapKey !== chosen.mapKey;
                  return (
                    <li key={job.id} className="labor-job" data-job={job.id}>
                      <div className="labor-job-main">
                        <span id={titleId} className="eco-row-title">
                          {m.labor_job_title({ building: job.buildingId, job: JOB_TEXT[job.job]() })}
                        </span>
                        <span className="eco-row-meta">
                          {job.cityId === null
                            ? m.labor_job_city_none()
                            : m.labor_job_city({ city: cityText(job.cityId) })}
                          {" · "}
                          {jobMeta(job, data.rules.wageCycleMs)}
                          {away ? ` · ${m.labor_job_other_map()}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button-small"
                        aria-describedby={titleId}
                        disabled={busy || !chosen || away}
                        onClick={() => void take(job.id)}
                      >
                        {m.labor_job_accept()}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {loaded.total > loaded.jobs.length ? (
              <p className="eco-footnote">
                {m.labor_jobs_more({ shown: loaded.jobs.length, total: loaded.total })}
              </p>
            ) : null}
            <p className="eco-footnote">{m.labor_jobs_rate_note()}</p>
          </>
        )}
      </Loaded>
    </div>
  );
}

function PostJob({ data, run, busy }: { data: LaborOverviewResponse; run: LaborRun; busy: boolean }) {
  const [building, setBuilding] = useState("");
  const [adjust, setAdjust] = useState("1000");
  const [slots, setSlots] = useState("1");
  const [term, setTerm] = useState("");
  const own = data.buildings.filter((entry) => entry.own);
  const chosen = own.find((entry) => String(entry.id) === building) ?? own[0];
  const rules = data.rules;
  const adjustPm = Number(adjust);
  const adjustOk = adjustInRange(adjustPm, rules);
  const slotsOk = /^[1-9][0-9]?$|^100$/.test(slots);
  const termOk = isTerm(term);
  const wage = previewWage(rules, adjustPm);
  const ready = chosen !== undefined && adjustOk && slotsOk && termOk;
  return (
    <form
      className="labor-form"
      aria-labelledby="labor-post-title"
      data-part="labor-post"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || !chosen) return;
        void run({
          t: "labor_post_job",
          buildingId: chosen.id,
          adjustPm,
          slots: Number(slots),
          ...(term === "" ? {} : { termHours: Number(term) }),
        });
      }}
    >
      <h4 id="labor-post-title" className="eco-subtitle">
        {m.labor_post_title()}
      </h4>
      <p className="eco-footnote">{m.labor_post_hint()}</p>
      <label className="eco-field">
        <span>{m.labor_field_building()}</span>
        <select
          className="eco-select"
          value={chosen ? String(chosen.id) : ""}
          onChange={(event) => setBuilding(event.target.value)}
        >
          {own.map((entry) => (
            <option key={entry.id} value={String(entry.id)}>
              {m.labor_option_building({ id: entry.id })}
            </option>
          ))}
        </select>
      </label>
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
      <label className="eco-field">
        <span>{m.labor_field_slots()}</span>
        <input
          className="eco-input"
          inputMode="numeric"
          autoComplete="off"
          value={slots}
          aria-invalid={!slotsOk}
          onChange={(event) => setSlots(event.target.value.trim())}
        />
      </label>
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
      <p className="eco-have" data-part="labor-post-preview">
        {m.labor_post_preview({
          wage: fmt(wage),
          cycle: formatDuration(rules.wageCycleMs),
          deposit: fmt(wage * BigInt(rules.depositCycles)),
        })}
      </p>
      <button type="submit" className="eco-submit" disabled={busy || !ready}>
        {m.labor_post_submit()}
      </button>
    </form>
  );
}

export function LaborMyJobs({
  data,
  run,
  busy,
}: {
  data: LaborOverviewResponse;
  run: LaborRun;
  busy: boolean;
}) {
  if (data.jobs.length === 0 && !data.buildings.some((entry) => entry.own)) return null;
  return (
    <div className="labor-board" data-part="labor-my-jobs">
      <h3 className="eco-subtitle">{m.labor_my_jobs_title()}</h3>
      {data.jobs.length === 0 ? (
        <p className="eco-empty">{m.labor_my_jobs_empty()}</p>
      ) : (
        <ul className="labor-jobs">
          {data.jobs.map((job) => {
            const titleId = `labor-my-job-${job.id}`;
            return (
              <li key={job.id} className="labor-job" data-job={job.id}>
                <div className="labor-job-main">
                  <span id={titleId} className="eco-row-title">
                    {m.labor_job_title({ building: job.buildingId, job: JOB_TEXT[job.job]() })}
                  </span>
                  <span className="eco-row-meta">
                    {jobMeta(job, data.rules.wageCycleMs)} ·{" "}
                    {m.labor_job_deposit({ amount: fmt(job.deposit) })}
                  </span>
                </div>
                <button
                  type="button"
                  className="button-small"
                  aria-describedby={titleId}
                  disabled={busy}
                  onClick={() => void run({ t: "labor_withdraw_job", jobId: job.id })}
                >
                  {m.labor_job_withdraw()}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data.buildings.some((entry) => entry.own) ? <PostJob data={data} run={run} busy={busy} /> : null}
    </div>
  );
}
