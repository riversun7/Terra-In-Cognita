// 투표 탭 — 정권 체제와 의결 방식(46 §1.3), 투표 안건(D-5057): 찬성·반대 막대와 정족수 눈금, 마감, 내 표.
// 독재는 투표가 없다(지배 가문의 장이 정한다). 찬성·반대·안건 올리기는 명령이라 곧 열림.
import type { RegimeView, VoteRow } from "@terra/shared/faction";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { ActionRow, Fact, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { dateText, relativeText } from "../sections/screenText.ts";
import { AGENDA_NAMES, REGIME_NAMES, RULE_TEXT } from "./factionText.ts";
import { barWidth, formatPermille, voteBar } from "./factionView.ts";

/** 안건 값 → 한 줄(세율 바꾸기는 도시·전·후, 시장 임명은 도시·후보, 그 밖은 대상 세력·도시 이름). 모르는 값이면 null */
function agendaDetail(vote: VoteRow): string | null {
  const { params } = vote;
  const city = typeof params.city === "string" ? params.city : null;
  if (vote.agenda === "mayor_appointment" && city !== null && typeof params.candidate === "string") {
    return m.faction_vote_mayor_detail({ city, name: params.candidate });
  }
  if (
    vote.agenda === "tax_change" &&
    city !== null &&
    typeof params.fromPm === "number" &&
    typeof params.toPm === "number"
  ) {
    const locale = getLocale();
    return m.faction_vote_tax_detail({
      city,
      from: formatPermille(params.fromPm, locale),
      to: formatPermille(params.toPm, locale),
    });
  }
  if (typeof params.faction === "string") return params.faction;
  return city;
}

function myVoteText(vote: VoteRow): string {
  if (vote.myVote === "yes") return m.faction_vote_mine_yes();
  if (vote.myVote === "no") return m.faction_vote_mine_no();
  return m.faction_vote_mine_none();
}

function VoteCard({ vote, now }: { vote: VoteRow; now: number }) {
  const bar = voteBar(vote);
  const locale = getLocale();
  const detail = agendaDetail(vote);
  const closed = vote.result !== null;
  const titleId = `faction-vote-${vote.id}`;
  return (
    <li>
      <article className="faction-item" aria-labelledby={titleId} data-closed={closed}>
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {AGENDA_NAMES[vote.agenda]()}
          </h3>
          {vote.urgent && !closed ? <StateChip tone="warn" label={m.faction_vote_urgent()} /> : null}
          {vote.result === "passed" ? <StateChip tone="good" label={m.faction_vote_passed()} /> : null}
          {vote.result === "rejected" ? <StateChip tone="bad" label={m.faction_vote_rejected()} /> : null}
        </div>
        {detail === null ? null : <p className="faction-vote-detail">{detail}</p>}
        <div className="faction-vote-bar" aria-hidden="true">
          <span className="faction-vote-yes" style={{ inlineSize: barWidth(bar.yesPm) }} />
          <span className="faction-vote-no" style={{ inlineSize: barWidth(bar.noPm) }} />
          <span className="faction-meter-mark" style={{ insetInlineStart: barWidth(bar.quorumPm) }} />
        </div>
        <p className="faction-vote-numbers">
          <span>{m.faction_vote_yes({ value: formatPermille(bar.yesPm, locale) })}</span>
          <span>{m.faction_vote_no({ value: formatPermille(bar.noPm, locale) })}</span>
          <span>{m.faction_vote_quorum({ value: formatPermille(bar.quorumPm, locale) })}</span>
          <StateChip
            tone={bar.quorumMet ? "good" : "plain"}
            label={bar.quorumMet ? m.faction_vote_quorum_met() : m.faction_vote_quorum_short()}
          />
        </p>
        <p className="faction-vote-meta">
          <time dateTime={new Date(vote.closesAt).toISOString()} title={dateText(vote.closesAt)}>
            {closed
              ? m.faction_vote_closed_at({ time: relativeText(vote.closesAt, now) })
              : m.faction_vote_closes({ time: relativeText(vote.closesAt, now) })}
          </time>
          <span>{myVoteText(vote)}</span>
        </p>
        {closed ? null : (
          <ActionRow>
            <SoonButton label={m.faction_vote_cast_yes()} />
            <SoonButton label={m.faction_vote_cast_no()} />
          </ActionRow>
        )}
      </article>
    </li>
  );
}

export function FactionVotes({ regime, now }: { regime: RegimeView; now: number }) {
  const open = regime.votes.filter((vote) => vote.result === null).length;
  return (
    <>
      <dl className="facts faction-regime">
        <Fact label={m.faction_field_regime()}>{REGIME_NAMES[regime.regime]()}</Fact>
        <Fact label={m.faction_field_leader()}>{regime.leader}</Fact>
        <Fact label={m.faction_votes_rule()}>
          <span className="faction-rule">{RULE_TEXT[regime.rule]()}</span>
        </Fact>
      </dl>
      {regime.rule === "leader" ? null : (
        <>
          {open === 0 ? <p className="faction-muted">{m.faction_votes_empty()}</p> : null}
          {regime.votes.length === 0 ? null : (
            <ul className="faction-list">
              {regime.votes.map((vote) => (
                <VoteCard key={vote.id} vote={vote} now={now} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
