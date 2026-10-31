// 지분 탭 — 도시 지분(46 §3, D-130 도시마다 1000주): 내 지분, 최대 주주, 독립하는 길(체제마다, §3.2)과 열린 독립 투표.
// 그 아래 점령 처리(46 §5.1 다섯 가지): 우리가 점령한 도시, 내 자산이 있는 도시에 온 편입 제안. 고르기·답·모금은 곧 열림.
import {
  type CityShareRow,
  OCCUPATION_STEPS,
  type OccupationRow,
  SHARES_PER_CITY,
} from "@terra/shared/faction";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { ActionRow, Fact, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { amountText, dateText, relativeText } from "../sections/screenText.ts";
import { OFFER_NAMES, PATH_TEXT, STEP_NAMES, STEP_STATE_NAMES } from "./factionText.ts";
import { barWidth, formatPermille, sharePermille } from "./factionView.ts";

function sharesText(shares: number): string {
  return m.faction_share_value({
    shares: formatCount(shares),
    percent: formatPermille(sharePermille(shares, SHARES_PER_CITY), getLocale()),
  });
}

function ShareCard({ row, now }: { row: CityShareRow; now: number }) {
  const titleId = `faction-share-${row.cityId}`;
  const vote = row.independenceVote;
  const locale = getLocale();
  return (
    <li>
      <article className="faction-item" aria-labelledby={titleId}>
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {row.cityName}
          </h3>
          {row.listed ? null : <StateChip tone="warn" label={m.faction_share_delisted()} />}
        </div>
        {row.listed ? (
          <dl className="facts">
            <Fact label={m.faction_share_mine()}>{sharesText(row.myShares)}</Fact>
            <Fact label={m.faction_share_top()}>
              {row.top === null ? (
                m.faction_none_value()
              ) : (
                <span className="faction-stack">
                  <span>{row.top.holder}</span>
                  <span className="faction-muted">{sharesText(row.top.shares)}</span>
                </span>
              )}
            </Fact>
          </dl>
        ) : null}
        <div className="faction-path">
          <span className="fact-label">{m.faction_share_path()}</span>
          <span className="faction-rule">{PATH_TEXT[row.path]()}</span>
        </div>
        {vote === null ? null : (
          <div className="faction-indep">
            <p className="faction-indep-title">{m.faction_share_vote({ opener: vote.openedBy })}</p>
            <div className="faction-vote-bar" aria-hidden="true">
              <span className="faction-vote-yes" style={{ inlineSize: barWidth(vote.yesPm) }} />
              <span className="faction-meter-mark" style={{ insetInlineStart: barWidth(vote.thresholdPm) }} />
            </div>
            <p className="faction-vote-meta">
              <span>
                {m.faction_share_vote_progress({
                  yes: formatPermille(vote.yesPm, locale),
                  need: formatPermille(vote.thresholdPm, locale),
                })}
              </span>
              <time dateTime={new Date(vote.closesAt).toISOString()} title={dateText(vote.closesAt)}>
                {m.faction_vote_closes({ time: relativeText(vote.closesAt, now) })}
              </time>
            </p>
          </div>
        )}
        <ActionRow>
          {vote === null ? null : <SoonButton label={m.faction_share_vote_join()} />}
          {row.listed ? <SoonButton label={m.faction_share_trade()} /> : null}
        </ActionRow>
      </article>
    </li>
  );
}

const STEP_TONES = { done: "good", pending: "warn", skipped: "plain" } as const;

/** 처리 하나의 덧붙임 글(① 고른 것, ② 체제, ③ 주식, ④ 제안 수·기한, ⑤ 모금) */
function stepDetail(row: OccupationRow, step: (typeof OCCUPATION_STEPS)[number], now: number): string | null {
  switch (step) {
    case "loot_or_integrate":
      if (row.lootChoice === null) return null;
      return row.lootChoice === "loot" ? m.faction_occ_loot() : m.faction_occ_integrate();
    case "regime":
      return m.faction_occ_regime_follow();
    case "shares":
      if (row.shareChoice === null) return m.faction_occ_share_pending();
      return row.shareChoice === "delist" ? m.faction_occ_share_delist() : m.faction_occ_share_keep();
    case "incorporation": {
      const deadline = m.faction_occ_deadline({ time: relativeText(row.offers.deadlineAt, now) });
      if (row.side === "offer_to_me") return deadline;
      const counts = m.faction_occ_offers({
        accepted: formatCount(row.offers.accepted),
        refused: formatCount(row.offers.refused),
        pending: formatCount(row.offers.pending),
      });
      return `${counts} · ${deadline}`;
    }
    case "restoration":
      return row.restoration === null
        ? null
        : m.faction_occ_restoration({
            raised: amountText(row.restoration.raised),
            goal: amountText(row.restoration.goal),
            currency: row.restoration.currency,
          });
    default: {
      const unhandled: never = step;
      return unhandled;
    }
  }
}

/** 모금 막대(낸 돈 / 목표) */
function restorationPm(row: OccupationRow): number {
  if (row.restoration === null) return 0;
  const goal = BigInt(row.restoration.goal);
  if (goal <= 0n) return 0;
  return Number((BigInt(row.restoration.raised) * 1000n) / goal);
}

function OccupationCard({ row, now }: { row: OccupationRow; now: number }) {
  const titleId = `faction-occ-${row.id}`;
  const mine = row.offers.mine;
  return (
    <li>
      <article className="faction-item" aria-labelledby={titleId}>
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {row.cityName}
          </h3>
          <span className="faction-muted">{relativeText(row.occurredAt, now)}</span>
        </div>
        <p className="faction-vote-detail">
          {row.side === "as_occupier"
            ? m.faction_occ_as_occupier({ name: row.other.name })
            : m.faction_occ_offer_to_me({ name: row.other.name, count: formatCount(row.offers.myBuildings) })}
        </p>
        <ol className="faction-steps">
          {OCCUPATION_STEPS.map((step) => {
            const state = row.steps[step];
            const detail = stepDetail(row, step, now);
            return (
              <li key={step} className="faction-step" data-state={state}>
                <span className="faction-step-name">{STEP_NAMES[step]()}</span>
                <StateChip tone={STEP_TONES[state]} label={STEP_STATE_NAMES[state]()} />
                {detail === null ? null : <span className="faction-step-detail">{detail}</span>}
                {step === "restoration" && row.restoration !== null ? (
                  <span className="faction-vote-bar faction-step-bar" aria-hidden="true">
                    <span className="faction-vote-yes" style={{ inlineSize: barWidth(restorationPm(row)) }} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {row.side === "offer_to_me" && mine !== null ? (
          <div className="faction-offer">
            <p>
              <span className="fact-label">{m.faction_occ_offer_mine()}</span>{" "}
              <strong>{OFFER_NAMES[mine]()}</strong>
            </p>
            <p className="faction-muted">{m.faction_occ_offer_hint()}</p>
          </div>
        ) : null}
        <ActionRow>
          {row.side === "as_occupier" && row.shareChoice === null ? (
            <>
              <SoonButton label={m.faction_occ_choose_keep()} />
              <SoonButton label={m.faction_occ_choose_delist()} />
            </>
          ) : null}
          {row.side === "offer_to_me" && mine === "pending" ? (
            <>
              <SoonButton label={m.faction_occ_accept()} primary />
              <SoonButton label={m.faction_occ_refuse()} />
            </>
          ) : null}
          {row.restoration === null ? null : <SoonButton label={m.faction_occ_donate()} />}
        </ActionRow>
      </article>
    </li>
  );
}

export function FactionShares({ shares, now }: { shares: readonly CityShareRow[]; now: number }) {
  if (shares.length === 0) return <p className="faction-muted">{m.faction_shares_empty()}</p>;
  return (
    <>
      <p className="faction-muted">{m.faction_shares_hint({ count: formatCount(SHARES_PER_CITY) })}</p>
      <ul className="faction-grid">
        {shares.map((row) => (
          <ShareCard key={row.cityId} row={row} now={now} />
        ))}
      </ul>
    </>
  );
}

export function FactionOccupations({ rows, now }: { rows: readonly OccupationRow[]; now: number }) {
  if (rows.length === 0) return <p className="faction-muted">{m.faction_occupations_empty()}</p>;
  return (
    <ul className="faction-list">
      {rows.map((row) => (
        <OccupationCard key={row.id} row={row} now={now} />
      ))}
    </ul>
  );
}
