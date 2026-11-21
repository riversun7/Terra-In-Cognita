// 외교 칸(세력 화면 외교 탭) — 사용자 결정 D-588(질문 2497 가·나): 지도자끼리 조약을 내고(가 — 상대가 기한 안에 받으면 맺음), 받은 조약의 조항을 고쳐
// 되돌리며(나 — 협상) 받기·거절한다. 조항 카드는 D-292(휴전·강화·불가침·동맹·보호), 카드마다 투표 필요(D-444 167 — 독재가 아니면 비준 투표, 의결 칸에서 표를 던진다).
// 맺은 동맹·보호 조약은 참전 요청·답(D-291 요청 → 수락 → 전쟁 참가자 등록, 질문 2498 기술 기본값). docs/adr/2026-11-21-diplomacy-treaties.md.
// 자료는 tRPC diplomacy.view, 명령은 WebSocket dip_*(diplomacyCommands.ts). 판정은 서버가 한다(여기는 고를 수 없는 칸만 미리 막는다).
import {
  type DiplomacyPartner,
  type DiplomacyResponse,
  TREATY_CLAUSE_KINDS,
  type TreatyClauseKind,
  type TreatyView,
  type WarJoinView,
  treatyPathOf,
} from "@terra/shared/treaty";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { ActionRow, QueryFailure, StateChip } from "../../sections/screenParts.tsx";
import { dateText, relativeText } from "../../sections/screenText.ts";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { TREATY_DECISION_NOTES, TREATY_NAMES } from "../factionText.ts";
import { formatPermille } from "../factionView.ts";
import {
  type ClauseDraft,
  type DiplomacyRequest,
  loadDiplomacy,
  sendDiplomacy,
} from "./diplomacyCommands.ts";
import {
  DIPLOMACY_DONE_TEXT,
  DIPLOMACY_ERROR_TEXT,
  JOIN_STATE_TEXT,
  TREATY_STATE_TEXT,
  TREATY_STATE_TONE,
  WAITING_TEXT,
  nationText,
} from "./diplomacyText.ts";
import "./diplomacy.css";

type Run = (body: DiplomacyRequest) => Promise<void>;
type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;

/** 시각 한 칸(상대 시간 + 전체 날짜 풍선) */
function When({ at, now }: { at: number; now: number }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={dateText(at)}>
      {relativeText(at, now)}
    </time>
  );
}

/** 조항 한 줄 글(보호는 누가 보호하는지·공물) */
function clauseText(clause: TreatyView["clauses"][number]): string {
  const name = TREATY_NAMES[clause.kind]();
  if (clause.kind !== "protection") return name;
  const who = clause.weProtect ? m.dip_we_protect() : m.dip_they_protect();
  const tribute = formatPermille(clause.tributePm ?? 0, getLocale());
  return `${name} · ${who} · ${m.dip_tribute({ value: tribute })}`;
}

interface FormProps {
  readonly view: DiplomacyResponse;
  readonly busy: boolean;
  readonly run: Run;
  /** 고쳐 되돌릴 조약(없으면 새 제안) */
  readonly counter?: TreatyView | undefined;
  readonly onCancel?: (() => void) | undefined;
}

/** 조약 고르기 칸(새 제안·맞제안) */
function TreatyForm({ view, busy, run, counter, onCancel }: FormProps) {
  const id = useId();
  const partners = view.partners;
  const [target, setTarget] = useState<number>(counter?.other.id ?? partners[0]?.id ?? 0);
  const partner: DiplomacyPartner | undefined = partners.find((row) => row.id === target);
  const atWar = partner?.atWar === true;
  const start = counter?.clauses.map((clause) => clause.kind) ?? (atWar ? ["ceasefire"] : ["non_aggression"]);
  const [kinds, setKinds] = useState<ReadonlySet<TreatyClauseKind>>(new Set(start));
  const protection = counter?.clauses.find((clause) => clause.kind === "protection");
  const [weProtect, setWeProtect] = useState<boolean>(protection?.weProtect ?? false);
  const [tribute, setTribute] = useState<number>(protection?.tributePm ?? 0);
  const [days, setDays] = useState<number>(Math.min(view.maxDays, counter?.days ?? 14));
  if (!counter && partners.length === 0) return <p className="faction-muted">{m.dip_no_partners()}</p>;
  // 전쟁 중이면 휴전·강화가 꼭 들고, 전쟁이 아니면 넣지 않는다(서버도 막는다 — D-292)
  const picked = TREATY_CLAUSE_KINDS.filter((kind) => (kind === "ceasefire" ? atWar : kinds.has(kind)));
  const path = view.nation ? treatyPathOf(picked, view.nation.regime) : "vote";
  const toggle = (kind: TreatyClauseKind, on: boolean): void => {
    const next = new Set(kinds);
    if (on) next.add(kind);
    else next.delete(kind);
    setKinds(next);
  };
  return (
    <form
      className="dip-form"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || picked.length === 0 || !partner) return;
        const clauses: ClauseDraft[] = picked.map((kind) =>
          kind === "protection"
            ? { kind, protector: weProtect ? "us" : "them", tributePm: tribute }
            : { kind },
        );
        void run(
          counter
            ? { t: "dip_counter", treatyId: counter.id, clauses, days }
            : { t: "dip_propose", targetNationId: partner.id, clauses, days },
        );
      }}
    >
      <span id={`${id}-title`} className="gov-sub">
        {counter ? m.dip_counter_title() : m.dip_propose_title()}
      </span>
      {counter ? null : (
        <label className="gov-field">
          <span className="faction-muted">{m.dip_target()}</span>
          <select
            className="input"
            value={String(target)}
            onChange={(event) => setTarget(Number(event.target.value))}
          >
            {partners.map((row) => (
              <option key={row.id} value={String(row.id)}>
                {nationText(row)}
                {row.atWar ? ` · ${m.dip_at_war()}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="dip-clauses">
        <legend className="faction-muted">{m.dip_clauses()}</legend>
        {TREATY_CLAUSE_KINDS.map((kind) => {
          const fixed = kind === "ceasefire";
          return (
            <label key={kind} className="dip-check">
              <input
                type="checkbox"
                checked={fixed ? atWar : kinds.has(kind)}
                disabled={fixed}
                onChange={(event) => toggle(kind, event.target.checked)}
              />
              <span>{TREATY_NAMES[kind]()}</span>
            </label>
          );
        })}
        <span className="faction-muted">{atWar ? m.dip_ceasefire_needed() : m.dip_ceasefire_war_only()}</span>
      </fieldset>
      {kinds.has("protection") ? (
        <div className="dip-protection">
          <label className="gov-field">
            <span className="faction-muted">{m.dip_protector()}</span>
            <select
              className="input"
              value={weProtect ? "us" : "them"}
              onChange={(event) => setWeProtect(event.target.value === "us")}
            >
              <option value="us">{m.dip_we_protect()}</option>
              <option value="them">{m.dip_they_protect()}</option>
            </select>
          </label>
          <label className="gov-field">
            <span className="faction-muted">
              {m.dip_tribute_field({ max: formatPermille(view.tributeMaxPm, getLocale()) })}
            </span>
            <input
              className="input dip-number"
              type="number"
              inputMode="numeric"
              min={0}
              max={view.tributeMaxPm}
              value={tribute}
              onChange={(event) =>
                setTribute(
                  Math.max(0, Math.min(view.tributeMaxPm, Math.trunc(Number(event.target.value) || 0))),
                )
              }
            />
          </label>
        </div>
      ) : null}
      <label className="gov-field">
        <span className="faction-muted">{m.dip_days({ max: String(view.maxDays) })}</span>
        <input
          className="input dip-number"
          type="number"
          inputMode="numeric"
          min={1}
          max={view.maxDays}
          value={days}
          onChange={(event) =>
            setDays(Math.max(1, Math.min(view.maxDays, Math.trunc(Number(event.target.value) || 1))))
          }
        />
      </label>
      <span className="faction-muted">{TREATY_DECISION_NOTES[path]()}</span>
      <ActionRow>
        <button
          type="submit"
          className="button-small button-primary"
          aria-disabled={busy || picked.length === 0}
        >
          {counter ? m.dip_counter_submit() : m.dip_propose_submit()}
        </button>
        {onCancel ? (
          <button type="button" className="button-small" onClick={onCancel}>
            {m.dip_cancel()}
          </button>
        ) : null}
      </ActionRow>
    </form>
  );
}

function TreatyCard({
  treaty,
  view,
  now,
  busy,
  run,
}: {
  treaty: TreatyView;
  view: DiplomacyResponse;
  now: number;
  busy: boolean;
  run: Run;
}) {
  const [countering, setCountering] = useState(false);
  const titleId = `dip-treaty-${treaty.id}`;
  return (
    <li>
      <article
        className="faction-item"
        aria-labelledby={titleId}
        data-closed={treaty.state !== "active" && treaty.waiting === null}
        data-treaty-state={treaty.state}
      >
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title" translate="no">
            {nationText(treaty.other)}
          </h3>
          <StateChip tone={TREATY_STATE_TONE[treaty.state]} label={TREATY_STATE_TEXT[treaty.state]()} />
          {treaty.waiting ? <StateChip tone="plain" label={WAITING_TEXT[treaty.waiting]()} /> : null}
        </div>
        <ul className="dip-clause-list">
          {treaty.clauses.map((clause) => (
            <li key={clause.kind}>{clauseText(clause)}</li>
          ))}
        </ul>
        <p className="faction-vote-detail">
          {m.dip_days_value({ days: String(treaty.days) })}
          {treaty.revision > 0 ? ` · ${m.dip_revision({ revision: String(treaty.revision) })}` : ""}
          {` · ${treaty.authoredByUs ? m.dip_authored_us() : m.dip_authored_them()}`}
        </p>
        {treaty.respondByMs !== null && treaty.waiting !== null ? (
          <p className="faction-vote-detail">
            {m.dip_respond_by()} <When at={treaty.respondByMs} now={now} />
          </p>
        ) : null}
        {treaty.state === "active" && treaty.expiresAtMs !== null ? (
          <p className="faction-vote-detail">
            {m.dip_expires()} <When at={treaty.expiresAtMs} now={now} />
          </p>
        ) : null}
        {treaty.waiting === "our_vote" ? <p className="faction-muted">{m.dip_vote_hint()}</p> : null}
        {treaty.can.accept || treaty.can.decline ? (
          <ActionRow>
            {treaty.can.accept ? (
              <button
                type="button"
                className="button-small button-primary"
                aria-disabled={busy}
                onClick={() => void run({ t: "dip_respond", treatyId: treaty.id, accept: true })}
              >
                {m.dip_accept()}
              </button>
            ) : null}
            {treaty.can.counter ? (
              <button
                type="button"
                className="button-small"
                aria-expanded={countering}
                onClick={() => setCountering(!countering)}
              >
                {m.dip_counter()}
              </button>
            ) : null}
            {treaty.can.decline ? (
              <button
                type="button"
                className="button-small"
                aria-disabled={busy}
                onClick={() => void run({ t: "dip_respond", treatyId: treaty.id, accept: false })}
              >
                {treaty.authoredByUs ? m.dip_withdraw() : m.dip_decline()}
              </button>
            ) : null}
          </ActionRow>
        ) : null}
        {countering ? (
          <TreatyForm
            view={view}
            busy={busy}
            run={run}
            counter={treaty}
            onCancel={() => setCountering(false)}
          />
        ) : null}
      </article>
    </li>
  );
}

function WarJoinRow({ join, now, busy, run }: { join: WarJoinView; now: number; busy: boolean; run: Run }) {
  return (
    <li className="dip-join" data-join-state={join.state}>
      <span className="dip-join-text">
        {m.dip_join_line({
          requester: nationText(join.requester),
          joiner: nationText(join.joiner),
          enemy: nationText(join.enemy),
        })}
      </span>
      <StateChip tone={join.state === "joined" ? "bad" : "plain"} label={JOIN_STATE_TEXT[join.state]()} />
      {join.auto ? <StateChip tone="plain" label={m.dip_join_auto()} /> : null}
      {join.state === "requested" ? (
        <span className="faction-muted">
          {m.dip_respond_by()} <When at={join.respondByMs} now={now} />
        </span>
      ) : null}
      {join.canAnswer ? (
        <ActionRow>
          <button
            type="button"
            className="button-small button-primary"
            aria-disabled={busy}
            onClick={() => void run({ t: "dip_war_respond", requestId: join.id, accept: true })}
          >
            {m.dip_join_accept()}
          </button>
          <button
            type="button"
            className="button-small"
            aria-disabled={busy}
            onClick={() => void run({ t: "dip_war_respond", requestId: join.id, accept: false })}
          >
            {m.dip_decline()}
          </button>
        </ActionRow>
      ) : null}
    </li>
  );
}

/** 맺은 동맹·보호 상대에게 참전 요청(D-291) */
function WarRequests({ view, busy, run }: { view: DiplomacyResponse; busy: boolean; run: Run }) {
  const rows = view.partners.filter((row) => row.requestTreatyId !== null && row.requestable.length > 0);
  if (!view.leader || rows.length === 0) return null;
  return (
    <ul className="dip-requests">
      {rows.flatMap((row) =>
        row.requestable.map((enemy) => (
          <li key={`${row.id}-${enemy.id}`}>
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={() => {
                if (row.requestTreatyId === null) return;
                void run({ t: "dip_war_request", treatyId: row.requestTreatyId, enemyNationId: enemy.id });
              }}
            >
              {m.dip_request_war({ ally: nationText(row), enemy: nationText(enemy) })}
            </button>
          </li>
        )),
      )}
    </ul>
  );
}

export function DiplomacyPanel({ now }: { now: number }) {
  const { state, refresh } = useScreenQuery(loadDiplomacy);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const view = state.data;
  const run: Run = async (body) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sendDiplomacy(body);
      setStatus(
        outcome.ok
          ? { tone: "ok", text: DIPLOMACY_DONE_TEXT[outcome.action]() }
          : { tone: "error", text: DIPLOMACY_ERROR_TEXT[outcome.code]() },
      );
      refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="gov-panel" aria-labelledby="dip-title" data-testid="diplomacy">
      <h3 id="dip-title" className="gov-sub">
        {m.dip_title()}
      </h3>
      <QueryFailure
        error={state.status === "failed" ? state.error : null}
        title={m.dip_load_failed()}
        onRetry={refresh}
      />
      {view?.status === "not_ready" ? <p className="faction-muted">{m.gov_not_ready()}</p> : null}
      {view?.status === "no_nation" ? <p className="faction-muted">{m.gov_no_nation()}</p> : null}
      {view?.status === "ready" ? (
        <>
          <p className="faction-muted">{view.leader ? m.dip_leader_you() : m.dip_leader_only()}</p>
          {status ? (
            <p className={status.tone === "ok" ? "gov-status" : "gov-status gov-status-error"} role="status">
              {status.text}
            </p>
          ) : null}
          {view.leader ? (
            <TreatyForm
              key={view.partners.map((row) => row.id).join(",")}
              view={view}
              busy={busy}
              run={run}
            />
          ) : null}
          <span className="gov-sub">{m.dip_treaties()}</span>
          {view.treaties.length === 0 ? (
            <p className="faction-muted">{m.dip_treaties_empty()}</p>
          ) : (
            <ul className="faction-list">
              {view.treaties.map((treaty) => (
                <TreatyCard key={treaty.id} treaty={treaty} view={view} now={now} busy={busy} run={run} />
              ))}
            </ul>
          )}
          <span className="gov-sub">{m.dip_war_joins()}</span>
          <WarRequests view={view} busy={busy} run={run} />
          {view.warJoins.length === 0 ? (
            <p className="faction-muted">{m.dip_war_joins_empty()}</p>
          ) : (
            <ul className="dip-join-list">
              {view.warJoins.map((join) => (
                <WarJoinRow key={join.id} join={join} now={now} busy={busy} run={run} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
