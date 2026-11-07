// 유닛 상세 [부상·병원] 칸 — 기획 D-521(부상 4단계 초록·흰·노랑·빨강, 자연 치유는 한 단계씩, 병원은 등급·의사 스탯·스킬로 매우 빠르고 비용이
// 든다, 병원 필수 부상 없음), docs/adr/2026-11-08-injury.md. 모바일 우선: 단계 표·길 → 자연 치유 규칙 → 그 유닛이 선 도시 병원의 견적 카드
// ([병원 치료 · 값], 초록까지 남은 시간·배율·의사) → (dev·admin) 개발 시험 부상 주기.
// 자료는 tRPC hospital.overview, 바꾸는 명령은 WebSocket(프로토콜 17 hospital_treat·dev_injure_unit). 명령 뒤에는 목록을 다시 받는다.
import type { HospitalOverviewResponse } from "@terra/shared/hospital";
import type { RosterInjury } from "@terra/shared/roster";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { formatDuration } from "../economy/economyText.ts";
import { api } from "../net/api.ts";
import { field } from "../net/json.ts";
import { m } from "../paraglide/messages.js";
import { InjuryBadge, InjuryTrack, injuryStageName } from "../roster/InjuryBadge.tsx";
import { Section } from "../roster/parts.tsx";
import { formatAmount, formatNumber, remaining } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { times } from "./fusionParts.tsx";
import { type HospitalCommand, type HospitalOutcome, sendHospitalCommand } from "./hospitalCommands.ts";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: HospitalOverviewResponse }
  | { readonly status: "failed"; readonly message: string };

type FailCode = Extract<HospitalOutcome, { ok: false }>["code"];

const RESULT_TEXT: Readonly<Record<FailCode, () => string>> = {
  sign_in_required: m.hospital_err_sign_in,
  busy: m.hospital_err_busy,
  rate_limited: m.hospital_err_rate_limited,
  internal_error: m.hospital_err_internal,
  forbidden: m.hospital_err_forbidden,
  no_cyborg: m.hospital_err_no_cyborg,
  unknown_unit: m.hospital_err_unknown_unit,
  captive: m.hospital_captive,
  not_injured: m.hospital_err_not_injured,
  not_hospital: m.hospital_err_not_hospital,
  hospital_closed: m.hospital_err_closed,
  wrong_city: m.hospital_err_wrong_city,
  not_faster: m.hospital_not_faster,
  cost_changed: m.hospital_err_cost_changed,
  insufficient_funds: m.hospital_err_funds,
  offline: m.hospital_err_offline,
  timeout: m.hospital_err_timeout,
};

/** 조회 실패 문구: 세계 준비 전(PRECONDITION_FAILED)은 따로 알린다 */
function loadError(error: unknown): string {
  const code = field(field(error, "data"), "code");
  if (code === "UNAUTHORIZED") {
    void refreshSession();
    return m.auth_notice_session_ended();
  }
  if (code === "PRECONDITION_FAILED") return m.hospital_not_ready();
  return m.hospital_load_failed();
}

export function HospitalCare({
  id,
  unit,
  injury,
  now,
  onChanged,
}: {
  id: string;
  /** 세계 유닛 ID */
  unit: number;
  /** 유닛 목록이 받은 부상(조회 전에도 보인다) */
  injury: RosterInjury;
  now: number;
  /** 치료·부상 뒤 유닛 목록·생명 수치를 다시 받는다 */
  onChanged?: (() => void) | undefined;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const fetchOverview = (): Promise<void> =>
    api.hospital.overview.query().then(
      (data) => setLoad({ status: "ready", data }),
      (error: unknown) => setLoad({ status: "failed", message: loadError(error) }),
    );

  // 처음 한 번 받는다(받은 뒤 setLoad는 비동기 콜백 안이다). 다른 유닛을 열면 key가 바뀌어 다시 돈다
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void api.hospital.overview.query().then(
      (data) => setLoad({ status: "ready", data }),
      (error: unknown) => setLoad({ status: "failed", message: loadError(error) }),
    );
  }, []);

  const run = async (
    busyKey: string,
    command: HospitalCommand,
    success: (outcome: HospitalOutcome) => string,
  ) => {
    if (busy !== null) return;
    setBusy(busyKey);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendHospitalCommand(command);
      if (outcome.ok) notice.show([success(outcome)]);
      else problem.show([RESULT_TEXT[outcome.code]()]);
    } finally {
      await fetchOverview();
      onChanged?.();
      setBusy(null);
    }
  };

  const data = load.status === "ready" ? load.data : null;
  const mine = data?.units.find((entry) => entry.unit === unit);
  // 조회 값이 있으면 그 값(서버 시각), 없으면 목록이 받은 부상
  const shown: RosterInjury = mine
    ? { stage: mine.stage, untilMs: mine.untilMs, greenAtMs: mine.greenAtMs, healPm: mine.healPm }
    : data
      ? { stage: 0, untilMs: null }
      : injury;
  const at = data?.generatedAt ?? now;
  const heal = data?.healMs ?? [];
  const hospitalOf = (buildingId: number) => data?.hospitals.find((entry) => entry.buildingId === buildingId);

  return (
    <Section id={id} title={m.hospital_title()}>
      <div className="hospital-state" data-part="injury-state">
        <InjuryBadge injury={shown} now={at} showHealthy />
        <InjuryTrack stage={shown.stage} />
      </div>
      {shown.stage > 0 && shown.greenAtMs ? (
        <p className="roster-note">{m.injury_green_in({ time: remaining(shown.greenAtMs, at) ?? "" })}</p>
      ) : null}
      {shown.stage >= 3 ? <p className="roster-note">{m.injury_red_note()}</p> : null}
      {shown.healPm !== undefined && shown.healPm > 1000 ? (
        <p className="roster-note">{m.injury_treated({ speed: times(shown.healPm) })}</p>
      ) : null}
      {data ? (
        <p className="field-hint">
          {m.injury_rule({
            red: formatDuration(heal[3] ?? 0),
            yellow: formatDuration(heal[2] ?? 0),
            white: formatDuration(heal[1] ?? 0),
          })}
        </p>
      ) : null}
      {load.status === "loading" ? <p className="field-hint">{m.hospital_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="units-panel-actions">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void fetchOverview()}>
            {m.hospital_retry()}
          </button>
        </div>
      ) : null}
      {data && mine ? (
        <>
          <p className="field-hint">{m.hospital_lead()}</p>
          {mine.captive ? (
            <p className="roster-note">{m.hospital_captive()}</p>
          ) : mine.options.length === 0 ? (
            <p className="roster-empty">
              {mine.healPm > 1000 ? m.hospital_not_faster() : m.hospital_none_here()}
            </p>
          ) : (
            <ul className="hospital-options">
              {mine.options.map((option) => {
                const site = hospitalOf(option.buildingId);
                return (
                  <li key={option.buildingId} className="hospital-option" data-part="hospital-option">
                    <span className="hospital-option-main">
                      <span className="hospital-option-title">
                        {m.hospital_option({
                          id: formatNumber(option.buildingId),
                          level: formatNumber(site?.level ?? 1),
                          speed: times(option.speedPm),
                        })}
                      </span>
                      <span className="roster-meta">
                        {m.hospital_eta({ time: remaining(option.greenAtMs, at) ?? m.roster_soon() })}
                      </span>
                      <span className="roster-meta">
                        {site?.doctor
                          ? m.hospital_doctor({
                              id: formatNumber(site.doctor.unitId),
                              stat: formatNumber(site.doctor.stat),
                              grade: formatNumber(site.doctor.skillGrade),
                            })
                          : m.hospital_no_doctor()}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="button-small"
                      disabled={busy !== null || !option.affordable}
                      onClick={() =>
                        void run(
                          `treat-${option.buildingId}`,
                          { t: "hospital_treat", buildingId: option.buildingId, unit, cost: option.cost },
                          (outcome) =>
                            m.hospital_treated({
                              time:
                                outcome.ok && outcome.greenAtMs
                                  ? (remaining(outcome.greenAtMs, Date.now()) ?? "")
                                  : "",
                            }),
                        )
                      }
                    >
                      {m.hospital_treat({ cost: formatAmount(option.cost) })}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="field-hint">{m.hospital_have({ have: formatAmount(data.balance) })}</p>
        </>
      ) : null}
      {data?.devGrant ? (
        <div className="hospital-dev" data-part="hospital-dev">
          <span className="field-hint">{m.hospital_dev_title()}</span>
          {[1, 2, 3].map((stage) => (
            <button
              key={stage}
              type="button"
              className="button-small"
              disabled={busy !== null}
              onClick={() =>
                void run(`injure-${stage}`, { t: "dev_injure_unit", unit, stage }, () =>
                  m.hospital_dev_done({ stage: injuryStageName(stage) }),
                )
              }
            >
              {injuryStageName(stage)}
            </button>
          ))}
        </div>
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </Section>
  );
}
