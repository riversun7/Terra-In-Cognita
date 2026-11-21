// 나라 의결 칸(세력 화면 투표 탭) — docs/adr/2026-11-21-governance.md 7절, 질문 2351~2365 답(D-580·D-581). 내 나라 지배 가문·임기·지배 쪽
// 지분 몫, 안건 올리기(자격이 있을 때 — 2351 가, 독재는 지도자 직권만), 안건마다 찬반 막대·정족수 눈금·마감·집행 시각, 선출 후보와 표, 내 표 버튼,
// 후보로 나서기, 던진 표(공개 투표 — 2365 가). 자료는 tRPC governance.view, 명령은 WebSocket(governanceCommands.ts sendGovernance).
import type {
  AgendaKind,
  GovernanceAgendaView,
  GovernanceRegime,
  GovernanceResponse,
} from "@terra/shared/governance";
import { GOVERNANCE_REGIMES } from "@terra/shared/governance";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { ActionRow, Fact, QueryFailure, StateChip } from "../../sections/screenParts.tsx";
import { dateText, relativeText } from "../../sections/screenText.ts";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { REGIME_NAMES } from "../factionText.ts";
import { barWidth, formatPermille } from "../factionView.ts";
import { type GovernanceRequest, loadGovernance, sendGovernance } from "./governanceCommands.ts";
import {
  AGENDA_KIND_TEXT,
  AGENDA_STATUS_TEXT,
  FAIL_REASON_TEXT,
  GOVERNANCE_ERROR_TEXT,
  houseText,
  permilleOf,
} from "./governanceText.ts";
import "./governance.css";

type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;
type Run = (body: GovernanceRequest) => Promise<void>;

const STATUS_TONE = {
  open: "warn",
  passed: "good",
  enacted: "good",
  failed: "bad",
  cancelled: "plain",
} as const;

function nationText(target: GovernanceAgendaView["targetNation"]): string {
  if (!target) return "";
  const name = target.name ? (getLocale() === "ko" ? target.name.ko : target.name.en) : null;
  return name ?? m.gov_nation_unnamed({ id: String(target.id) });
}

function choiceText(agenda: GovernanceAgendaView, choice: string): string {
  if (choice === "yes") return m.gov_cast_yes();
  if (choice === "no") return m.gov_cast_no();
  if (choice === "abstain") return m.gov_cast_abstain();
  const candidate = agenda.candidates.find((row) => row.key === choice);
  return houseText(candidate ?? null);
}

function AgendaCard({
  agenda,
  now,
  busy,
  run,
}: {
  agenda: GovernanceAgendaView;
  now: number;
  busy: boolean;
  run: Run;
}) {
  const locale = getLocale();
  const titleId = `gov-agenda-${agenda.id}`;
  const open = agenda.status === "open";
  const election = agenda.kind === "leader_election";
  const totals = agenda.totals;
  const yesPm = totals ? permilleOf(totals.yes, agenda.electorate) : 0;
  const noPm = totals ? Math.min(1000 - yesPm, permilleOf(totals.no, agenda.electorate)) : 0;
  return (
    <li>
      <article
        className="faction-item"
        aria-labelledby={titleId}
        data-closed={!open}
        data-agenda={agenda.kind}
      >
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {AGENDA_KIND_TEXT[agenda.kind]()}
          </h3>
          <StateChip tone={STATUS_TONE[agenda.status]} label={AGENDA_STATUS_TEXT[agenda.status]()} />
          {agenda.byAuthority ? <StateChip tone="plain" label={m.gov_authority()} /> : null}
          {agenda.reason ? <StateChip tone="plain" label={FAIL_REASON_TEXT[agenda.reason]()} /> : null}
        </div>
        {agenda.targetRegime ? (
          <p className="faction-vote-detail">
            {m.gov_regime_target({ regime: REGIME_NAMES[agenda.targetRegime]() })}
          </p>
        ) : null}
        {agenda.taxes ? (
          <p className="gov-agenda-target">
            {m.gov_tax_target({
              income:
                agenda.taxes.incomeTaxBp === null ? "—" : `${(agenda.taxes.incomeTaxBp / 100).toFixed(2)}%`,
              resident: agenda.taxes.residentTaxPm === null ? "—" : `${agenda.taxes.residentTaxPm}‰`,
            })}
          </p>
        ) : null}
        {agenda.targetNation ? (
          <p className="faction-vote-detail">
            {m.gov_war_target({ nation: nationText(agenda.targetNation) })}
          </p>
        ) : null}
        {totals && !agenda.byAuthority ? (
          <>
            <div className="faction-vote-bar" aria-hidden="true">
              <span className="faction-vote-yes" style={{ inlineSize: barWidth(yesPm) }} />
              <span className="faction-vote-no" style={{ inlineSize: barWidth(noPm) }} />
              <span className="faction-meter-mark" style={{ insetInlineStart: barWidth(agenda.quorumPm) }} />
            </div>
            <p className="faction-vote-numbers">
              {m.gov_totals({ yes: totals.yes, no: totals.no, abstain: totals.abstain })}
            </p>
            <p className="faction-vote-meta">
              {m.gov_electorate({
                total: agenda.electorate,
                quorum: formatPermille(agenda.quorumPm, locale),
                threshold: formatPermille(agenda.thresholdPm, locale),
              })}
            </p>
          </>
        ) : null}
        {election ? (
          <>
            <p className="faction-vote-meta">
              {m.gov_electorate_election({
                total: agenda.electorate,
                quorum: formatPermille(agenda.quorumPm, locale),
              })}
            </p>
            {agenda.candidates.length === 0 ? (
              <p className="faction-muted">{m.gov_candidates_none()}</p>
            ) : (
              <ul className="gov-candidates">
                {agenda.candidates.map((candidate) => (
                  <li key={candidate.key} className="gov-candidate" data-candidate={candidate.key}>
                    <span className="gov-candidate-name" translate="no">
                      {houseText(candidate)}
                    </span>
                    <span className="faction-muted">{m.gov_candidate_votes({ votes: candidate.votes })}</span>
                    {open && agenda.me.canVote ? (
                      <button
                        type="button"
                        className="button-small"
                        aria-disabled={busy}
                        aria-pressed={agenda.me.choice === candidate.key}
                        onClick={() =>
                          void run({ t: "gov_vote", agendaId: agenda.id, choice: candidate.key })
                        }
                      >
                        {m.gov_cast_for()}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {agenda.winner ? (
              <p className="faction-vote-detail">{m.gov_winner({ name: houseText(agenda.winner) })}</p>
            ) : null}
            {agenda.barred ? (
              <p className="faction-muted">{m.gov_barred({ name: houseText(agenda.barred) })}</p>
            ) : null}
          </>
        ) : null}
        <p className="faction-vote-meta">
          {open && agenda.registerUntilMs !== null && now < agenda.registerUntilMs ? (
            <time
              dateTime={new Date(agenda.registerUntilMs).toISOString()}
              title={dateText(agenda.registerUntilMs)}
            >
              {m.gov_register_until({ time: relativeText(agenda.registerUntilMs, now) })}
            </time>
          ) : null}
          {agenda.byAuthority ? null : (
            <time dateTime={new Date(agenda.closesAtMs).toISOString()} title={dateText(agenda.closesAtMs)}>
              {open
                ? m.gov_closes({ time: relativeText(agenda.closesAtMs, now) })
                : m.gov_closed({ time: relativeText(agenda.closesAtMs, now) })}
            </time>
          )}
          {agenda.effectAtMs !== null && agenda.status === "passed" ? (
            <time dateTime={new Date(agenda.effectAtMs).toISOString()} title={dateText(agenda.effectAtMs)}>
              {m.gov_effect({ time: relativeText(agenda.effectAtMs, now) })}
            </time>
          ) : null}
          {agenda.me.choice ? (
            <span>{m.gov_my_choice({ choice: choiceText(agenda, agenda.me.choice) })}</span>
          ) : null}
        </p>
        {open && (agenda.me.canVote || agenda.me.canRegister) ? (
          <ActionRow>
            {agenda.me.canVote && !election ? (
              <>
                <button
                  type="button"
                  className="button-small button-primary"
                  aria-disabled={busy}
                  aria-pressed={agenda.me.choice === "yes"}
                  onClick={() => void run({ t: "gov_vote", agendaId: agenda.id, choice: "yes" })}
                >
                  {m.gov_cast_yes()}
                </button>
                <button
                  type="button"
                  className="button-small"
                  aria-disabled={busy}
                  aria-pressed={agenda.me.choice === "no"}
                  onClick={() => void run({ t: "gov_vote", agendaId: agenda.id, choice: "no" })}
                >
                  {m.gov_cast_no()}
                </button>
              </>
            ) : null}
            {agenda.me.canVote ? (
              <button
                type="button"
                className="button-small"
                aria-disabled={busy}
                aria-pressed={agenda.me.choice === "abstain"}
                onClick={() => void run({ t: "gov_vote", agendaId: agenda.id, choice: "abstain" })}
              >
                {m.gov_cast_abstain()}
              </button>
            ) : null}
            {agenda.me.canRegister ? (
              <button
                type="button"
                className="button-small button-primary"
                aria-disabled={busy}
                onClick={() => void run({ t: "gov_candidate", agendaId: agenda.id })}
              >
                {m.gov_register()}
              </button>
            ) : null}
          </ActionRow>
        ) : null}
        {open && agenda.me.canVote ? (
          <p className="faction-muted">{m.gov_my_weight({ weight: agenda.me.weight })}</p>
        ) : null}
        {agenda.votes.length === 0 ? null : (
          <details className="gov-ballots">
            <summary>{m.gov_votes_public({ count: String(agenda.votes.length) })}</summary>
            <ul className="gov-ballot-list">
              {agenda.votes.map((vote) => (
                <li key={vote.voter.key} className="gov-ballot">
                  <span translate="no">
                    {vote.voter.key.startsWith("o:")
                      ? (vote.voter.name ?? m.gov_voter_unnamed())
                      : houseText({ name: vote.voter.name, npc: vote.voter.npc })}
                  </span>
                  {vote.voter.npc ? <span className="faction-muted">{m.gov_voter_npc()}</span> : null}
                  <span>{choiceText(agenda, vote.choice)}</span>
                  <span className="faction-muted">{vote.weight}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </article>
    </li>
  );
}

/** 나라 이름(지금 언어). 없으면 "나라 #ID" */
const nationName = (row: GovernanceResponse["warTargets"][number]): string =>
  row.name
    ? getLocale() === "ko"
      ? row.name.ko
      : row.name.en
    : m.gov_nation_unnamed({ id: String(row.id) });

function ProposeForm({ view, busy, run }: { view: GovernanceResponse; busy: boolean; run: Run }) {
  const id = useId();
  const kinds = view.canPropose;
  const [kind, setKind] = useState<AgendaKind | "">(kinds[0] ?? "");
  const regime = view.nation?.regime;
  const regimes = GOVERNANCE_REGIMES.filter((entry) => entry !== regime);
  const [target, setTarget] = useState<GovernanceRegime | "">(regimes[0] ?? "");
  const [war, setWar] = useState<string>(view.warTargets[0] ? String(view.warTargets[0].id) : "");
  const picked: AgendaKind | "" = kinds.find((entry) => entry === kind) ?? kinds[0] ?? "";
  if (kinds.length === 0) return <p className="faction-muted">{m.gov_propose_none()}</p>;
  return (
    <form
      className="gov-propose"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || picked === "") return;
        if (picked === "regime_change") {
          if (target === "") return;
          void run({ t: "gov_propose", kind: picked, regime: target });
        } else if (picked === "war_declaration") {
          const targetNationId = Number(war);
          if (!Number.isSafeInteger(targetNationId) || targetNationId <= 0) return;
          void run({ t: "gov_propose", kind: picked, targetNationId });
        } else void run({ t: "gov_propose", kind: picked });
      }}
    >
      <span className="gov-sub">{m.gov_propose_title()}</span>
      <label className="gov-field">
        <span className="faction-muted">{m.gov_propose_kind()}</span>
        <select
          id={`${id}-kind`}
          className="input"
          value={picked}
          onChange={(event) => {
            const next = kinds.find((entry) => entry === event.target.value);
            if (next) setKind(next);
          }}
        >
          {kinds.map((entry) => (
            <option key={entry} value={entry}>
              {AGENDA_KIND_TEXT[entry]()}
            </option>
          ))}
        </select>
      </label>
      {picked === "regime_change" ? (
        <label className="gov-field">
          <span className="faction-muted">{m.gov_propose_regime()}</span>
          <select
            className="input"
            value={target}
            onChange={(event) => {
              const next = regimes.find((entry) => entry === event.target.value);
              if (next) setTarget(next);
            }}
          >
            {regimes.map((entry) => (
              <option key={entry} value={entry}>
                {REGIME_NAMES[entry]()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {picked === "war_declaration" ? (
        <label className="gov-field">
          <span className="faction-muted">{m.gov_propose_target()}</span>
          <select className="input" value={war} onChange={(event) => setWar(event.target.value)}>
            {view.warTargets.map((row) => (
              <option key={row.id} value={String(row.id)}>
                {nationName(row)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="submit" className="button-small button-primary" aria-disabled={busy}>
        {m.gov_propose_submit()}
      </button>
      {regime === "dictatorship" ? (
        <span className="faction-muted">{m.gov_propose_decree_note()}</span>
      ) : null}
    </form>
  );
}

export function GovernancePanel({ now }: { now: number }) {
  const { state, refresh } = useScreenQuery(loadGovernance);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const view = state.data;
  const run: Run = async (body) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sendGovernance(body);
      if (!outcome.ok) setStatus({ tone: "error", text: GOVERNANCE_ERROR_TEXT[outcome.code]() });
      else {
        const done = {
          proposed: m.gov_done_proposed,
          decided: m.gov_done_decided,
          voted: m.gov_done_voted,
          registered: m.gov_done_registered,
        }[outcome.action];
        setStatus({ tone: "ok", text: done() });
      }
      refresh();
    } finally {
      setBusy(false);
    }
  };
  const locale = getLocale();
  return (
    <section className="gov-panel" aria-labelledby="gov-title" data-testid="governance">
      <h3 id="gov-title" className="gov-sub">
        {m.gov_title()}
      </h3>
      <QueryFailure
        error={state.status === "failed" ? state.error : null}
        title={m.gov_load_failed()}
        onRetry={refresh}
      />
      {view?.status === "not_ready" ? <p className="faction-muted">{m.gov_not_ready()}</p> : null}
      {view?.status === "no_nation" ? <p className="faction-muted">{m.gov_no_nation()}</p> : null}
      {view?.status === "ready" && view.nation ? (
        <>
          <dl className="facts">
            <Fact label={m.gov_ruling()}>
              <span translate="no">{houseText(view.nation.rulingHouse)}</span>
            </Fact>
            <Fact label={m.gov_term_ends()}>
              {view.nation.termEndsAtMs === null ? (
                view.nation.regime === "dictatorship" ? (
                  m.gov_term_none()
                ) : (
                  "—"
                )
              ) : (
                <time
                  dateTime={new Date(view.nation.termEndsAtMs).toISOString()}
                  title={dateText(view.nation.termEndsAtMs)}
                >
                  {relativeText(view.nation.termEndsAtMs, now)}
                </time>
              )}
            </Fact>
            <Fact label={m.gov_ruling_share()}>{formatPermille(view.nation.rulingSharePm, locale)}</Fact>
          </dl>
          {view.leader ? <p className="faction-muted">{m.gov_leader_you()}</p> : null}
          {view.nation.shareVotesSuspended ? <p className="faction-muted">{m.gov_suspended()}</p> : null}
          <ProposeForm key={view.canPropose.join(",")} view={view} busy={busy} run={run} />
          {status ? (
            <p className={status.tone === "ok" ? "gov-status" : "gov-status gov-status-error"} role="status">
              {status.text}
            </p>
          ) : null}
          {view.agendas.length === 0 ? (
            <p className="faction-muted">{m.gov_agendas_empty()}</p>
          ) : (
            <ul className="faction-list">
              {view.agendas.map((agenda) => (
                <AgendaCard key={agenda.id} agenda={agenda} now={now} busy={busy} run={run} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
