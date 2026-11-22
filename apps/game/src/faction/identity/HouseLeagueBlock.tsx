// "내 가문" 칸의 가문 연맹 부분(league-2, 사용자 결정 D-590 — 질문 2501 다·2502 다·2503 가·2504 나). docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (league-2, D-590)".
// - 모두에게: 연맹 목록(대표·든 가문·붙은 조항 카드·열린 투표). 연맹은 나라와 상관없는 가문끼리의 조약이다(D-587 4).
// - 가문장: [연맹 만들기], 들지 않은 연맹에 [가입 신청]·[신청 거두기], 받은 초대 [초대 받기]·[거절], 든 연맹에서 [나가기]·대표 투표.
// - 대표 가문장: 조항 카드 [붙이기]·[떼기], 신청 [받기]·[거절], [초대]·[초대 거두기], [대표 넘기기].
// 자료는 tRPC factionIdentity.leagues, 바꾸는 명령은 WebSocket house_league(leagueCommands.ts). 명령 뒤에는 자료를 다시 받는다. 판정은 서버가 다시 한다.
import { HOUSE_LEAGUE_CLAUSES, type HouseLeagueClause } from "@terra/protocol";
import type { HouseLeagueView, HouseLeaguesResponse } from "@terra/shared/houseLeague";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { loadHouseLeagues } from "./identityQueries.ts";
import { type LeagueRequest, sendHouseLeague } from "./leagueCommands.ts";
import { LEAGUE_CLAUSE_NAME, LEAGUE_ERROR_TEXT, leagueClauseHint, leagueHouseName } from "./leagueText.ts";

type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;

const okText = (body: LeagueRequest, pending: boolean): string => {
  if (pending) return m.fid_league_ok_pending();
  if (body.action === "found") return m.fid_league_ok_found();
  if (body.action === "join") return m.fid_league_ok_join();
  if (body.action === "leave") return m.fid_league_ok_leave();
  return m.fid_league_ok_done();
};

/** 고르기 칸 + 단추(초대·투표·대표 넘기기) */
function PickForm({
  label,
  button,
  options,
  busy,
  part,
  onPick,
}: {
  label: string;
  button: string;
  options: readonly { readonly key: string; readonly name: string }[];
  busy: boolean;
  part: string;
  onPick: (key: string) => void;
}) {
  const id = useId();
  const [picked, setPicked] = useState("");
  const value = options.some((option) => option.key === picked) ? picked : (options[0]?.key ?? "");
  if (options.length === 0) return null;
  return (
    <form
      className="fid-house-home-form"
      data-part={part}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && value !== "") onPick(value);
      }}
    >
      <label className="fid-house-sub" htmlFor={id}>
        {label}
      </label>
      <span className="fid-house-invite-row">
        <select id={id} className="input" value={value} onChange={(event) => setPicked(event.target.value)}>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.name}
            </option>
          ))}
        </select>
        <button type="submit" className="button-small" aria-disabled={busy}>
          {button}
        </button>
      </span>
    </form>
  );
}

function LeagueCard({
  league,
  view,
  busy,
  run,
}: {
  league: HouseLeagueView;
  view: HouseLeaguesResponse;
  busy: boolean;
  run: (body: LeagueRequest) => void;
}) {
  const me = view.me;
  const leader = me?.leader === true;
  const member = me !== null && league.members.some((house) => house.key === me.house);
  const rep = me !== null && league.representative === me.house;
  const myRequest =
    me === null ? undefined : league.requests.find((request) => request.house.key === me.house);
  const repHouse = league.members.find((house) => house.key === league.representative);
  const names = league.members.map((house) => ({ key: house.key, name: leagueHouseName(house) }));
  const requested = new Set(league.requests.map((request) => request.house.key));
  const candidates = view.houses
    .filter((house) => !league.members.some((m2) => m2.key === house.key) && !requested.has(house.key))
    .map((house) => ({ key: house.key, name: leagueHouseName(house) }));
  const attached = new Set(league.clauses);
  return (
    <li className="fid-league" data-league={league.id}>
      <span className="fid-house-row-main">
        <span className="fid-house-row-name">{m.fid_league_name({ id: league.id })}</span>
        <span className="faction-muted">
          {m.fid_league_rep_line({
            name: repHouse ? leagueHouseName(repHouse) : league.representative,
            count: league.members.length,
          })}
        </span>
      </span>
      <div className="fid-house-block">
        <h4 className="fid-house-sub">{m.fid_league_members()}</h4>
        <ul className="fid-house-list" data-part="league-members">
          {league.members.map((house) => (
            <li key={house.key} className="fid-league-member" data-house={house.key}>
              <span translate="no">{leagueHouseName(house)}</span>
              {house.key === league.representative ? (
                <span className="fid-league-tag">{m.fid_league_rep_tag()}</span>
              ) : null}
              {house.npc ? <span className="fid-league-tag">{m.fid_league_npc()}</span> : null}
              {me?.house === house.key ? <span className="fid-league-tag">{m.fid_league_mine()}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="fid-house-block">
        <h4 className="fid-house-sub">{m.fid_league_clauses()}</h4>
        <ul className="fid-house-list" data-part="league-clauses">
          {HOUSE_LEAGUE_CLAUSES.map((clause: HouseLeagueClause) => {
            const on = attached.has(clause);
            return (
              <li key={clause} className="fid-house-row" data-clause={clause} data-on={on ? "1" : "0"}>
                <span className="fid-house-row-main">
                  <span className="fid-house-row-name">
                    {LEAGUE_CLAUSE_NAME[clause]()} ·{" "}
                    {on ? m.fid_league_clause_on() : m.fid_league_clause_off()}
                  </span>
                  <span className="faction-muted">{leagueClauseHint(clause, view.feeDiscountPm)}</span>
                </span>
                {rep && leader ? (
                  <button
                    type="button"
                    className="button-small"
                    aria-disabled={busy}
                    onClick={() =>
                      run({ action: on ? "clause_off" : "clause_on", leagueId: league.id, clause })
                    }
                  >
                    {on ? m.fid_league_clause_detach() : m.fid_league_clause_attach()}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {league.votes.length > 0 ? (
        <p className="faction-muted" data-part="league-vote-open">
          {m.fid_league_vote_open({ count: league.votes.length })}
        </p>
      ) : null}
      {leader && !member ? (
        <div className="fid-house-actions" data-part="league-join">
          {myRequest?.kind === "invite" ? (
            <>
              <span className="faction-muted">{m.fid_league_invited()}</span>
              <button
                type="button"
                className="button-small button-primary"
                aria-disabled={busy}
                onClick={() => run({ action: "join", leagueId: league.id })}
              >
                {m.fid_league_accept()}
              </button>
              <button
                type="button"
                className="button-small"
                aria-disabled={busy}
                onClick={() => run({ action: "decline", leagueId: league.id })}
              >
                {m.fid_league_decline()}
              </button>
            </>
          ) : myRequest?.kind === "apply" ? (
            <>
              <span className="faction-muted">{m.fid_league_applied()}</span>
              <button
                type="button"
                className="button-small"
                aria-disabled={busy}
                onClick={() => run({ action: "decline", leagueId: league.id })}
              >
                {m.fid_league_withdraw()}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button-small button-primary"
              aria-disabled={busy}
              onClick={() => run({ action: "join", leagueId: league.id })}
            >
              {m.fid_league_apply()}
            </button>
          )}
        </div>
      ) : null}
      {leader && member ? (
        <>
          {rep ? (
            <div className="fid-house-block" data-part="league-requests">
              <h4 className="fid-house-sub">{m.fid_league_requests()}</h4>
              {league.requests.length > 0 ? (
                <ul className="fid-house-list">
                  {league.requests.map((request) => (
                    <li key={request.house.key} className="fid-house-row" data-request={request.house.key}>
                      <span className="fid-house-row-main">
                        <span translate="no">{leagueHouseName(request.house)}</span>
                        <span className="faction-muted">
                          {request.kind === "apply"
                            ? m.fid_league_request_apply()
                            : m.fid_league_request_invite()}
                        </span>
                      </span>
                      {request.kind === "apply" ? (
                        <button
                          type="button"
                          className="button-small button-primary"
                          aria-disabled={busy}
                          onClick={() =>
                            run({ action: "approve", leagueId: league.id, house: request.house.key })
                          }
                        >
                          {m.fid_league_approve()}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button-small"
                        aria-disabled={busy}
                        onClick={() =>
                          run({ action: "decline", leagueId: league.id, house: request.house.key })
                        }
                      >
                        {request.kind === "apply" ? m.fid_league_decline() : m.fid_league_cancel_invite()}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {candidates.length > 0 ? (
                <PickForm
                  label={m.fid_league_invite_label()}
                  button={m.fid_league_invite()}
                  options={candidates}
                  busy={busy}
                  part="league-invite"
                  onPick={(house) => run({ action: "invite", leagueId: league.id, house })}
                />
              ) : (
                <p className="faction-muted">{m.fid_league_no_candidates()}</p>
              )}
              <PickForm
                label={m.fid_league_delegate_label()}
                button={m.fid_league_delegate()}
                options={names.filter((house) => house.key !== league.representative)}
                busy={busy}
                part="league-delegate"
                onPick={(house) => run({ action: "delegate", leagueId: league.id, house })}
              />
            </div>
          ) : null}
          <PickForm
            label={m.fid_league_vote_label()}
            button={m.fid_league_vote()}
            options={names}
            busy={busy}
            part="league-vote"
            onPick={(house) => run({ action: "vote", leagueId: league.id, house })}
          />
          <div className="fid-house-actions">
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              data-part="league-leave"
              onClick={() => run({ action: "leave", leagueId: league.id })}
            >
              {m.fid_league_leave()}
            </button>
            {rep ? <span className="faction-muted">{m.fid_league_leave_rep_note()}</span> : null}
          </div>
        </>
      ) : null}
    </li>
  );
}

export function HouseLeagueBlock() {
  const { state, refresh } = useScreenQuery(loadHouseLeagues);
  const view = state.data;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const run = (body: LeagueRequest): void => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    void sendHouseLeague(body)
      .then((outcome) => {
        setStatus(
          outcome.ok
            ? { tone: "ok", text: okText(body, outcome.pending) }
            : { tone: "error", text: LEAGUE_ERROR_TEXT[outcome.code]() },
        );
        refresh();
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="fid-house-block" data-testid="house-leagues">
      <h3 className="fid-house-sub">{m.fid_league_title()}</h3>
      <p className="faction-muted">{m.fid_league_hint()}</p>
      {state.error && !view ? <p className="faction-muted">{m.fid_league_load_failed()}</p> : null}
      {view?.me?.leader ? (
        <div className="fid-house-actions">
          <button
            type="button"
            className="button-small"
            aria-disabled={busy}
            data-part="league-found"
            onClick={() => run({ action: "found" })}
          >
            {m.fid_league_found()}
          </button>
        </div>
      ) : null}
      {view && view.leagues.length === 0 ? <p className="faction-muted">{m.fid_league_empty()}</p> : null}
      {view && view.leagues.length > 0 ? (
        <ul className="fid-house-list">
          {view.leagues.map((league) => (
            <LeagueCard key={league.id} league={league} view={view} busy={busy} run={run} />
          ))}
        </ul>
      ) : null}
      {status ? (
        <p
          className={status.tone === "ok" ? "fid-house-status" : "fid-house-status fid-house-status-error"}
          role={status.tone === "ok" ? "status" : "alert"}
          data-part="league-status"
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
