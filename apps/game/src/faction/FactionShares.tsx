// 지분 탭 — 도시 지분(46 §3, D-130 도시마다 1000주): 내 지분, 최대 주주, 최근 배당(D-304·D-338: 이자 소각 → 운영비 → 남은 이익을
// 체제대로, 민주주의 = 국고라 배당 없음), 독립하는 길(체제마다, §3.2)과 열린 독립 투표.
// 그 아래 점령 처리(46 §5.1 다섯 가지): 우리가 점령한 도시, 내 자산이 있는 도시에 온 편입 제안(거부 = 빼앗김·쫓겨남·적대, D-342·D-348),
// 복원 모금(낸 돈만큼 지분, D-339·D-343). 공성 결과 셋(D-520·D-527): 약탈(정부가 무너져 재건 전까지 꺼내 감, 소유 그대로)·점령 상태(체제
// 그대로, 재정은 점령 세력, 정해진 끝 없음)는 ①만 하고 나머지는 넘김, 결과 값(가져간 값 · 지금 상태나 끝난 까닭) 한 줄. 우리 도시가 당한 결과도
// 보인다. 고르기·답·모금은 곧 열림.
import {
  type CityShareRow,
  OCCUPATION_STEPS,
  type OccupationEndReason,
  type OccupationRow,
  SHARES_PER_CITY,
} from "@terra/shared/faction";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { ActionRow, Fact, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { amountText, dateText, durationText, relativeText } from "../sections/screenText.ts";
import { OFFER_NAMES, PATH_TEXT, STEP_NAMES, STEP_STATE_NAMES } from "./factionText.ts";
import { barWidth, formatPermille, sharePermille } from "./factionView.ts";

function sharesText(shares: number): string {
  return m.faction_share_value({
    shares: formatCount(shares),
    percent: formatPermille(sharePermille(shares, SHARES_PER_CITY), getLocale()),
  });
}

/** 최근 배당 글: 민주주의는 배당 없음(국고), 그 밖은 내 몫·전체·시각(없으면 "아직 없음") */
function dividendText(row: CityShareRow, now: number): string {
  if (row.dividend.to === "treasury") return m.faction_share_dividend_treasury();
  const last = row.dividend.last;
  if (last === null) return m.faction_share_dividend_none_yet();
  return m.faction_share_dividend_value({
    mine: amountText(last.mine),
    currency: last.currency,
    total: amountText(last.total),
    time: relativeText(last.paidAt, now),
  });
}

/** 독재 도시: 지분대로 나누되 국고 몫은 지배 가문 금고로(D-338) — 값 아래 덧붙임 */
function DividendNote({ row }: { row: CityShareRow }) {
  if (row.dividend.to !== "ruling_family") return null;
  return <span className="faction-muted">{m.faction_share_dividend_ruling()}</span>;
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
          <span className="faction-muted">{m.faction_share_owner({ name: row.owner.name })}</span>
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
            <Fact label={m.faction_share_dividend()}>
              <span className="faction-stack">
                <span>{dividendText(row, now)}</span>
                <DividendNote row={row} />
              </span>
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

/** ① 고른 것(D-520 공성 결과 셋) */
const OUTCOME_NAMES = {
  loot: m.faction_occ_loot,
  integrate: m.faction_occ_integrate,
  occupy: m.faction_occ_occupy,
} as const satisfies Record<NonNullable<OccupationRow["lootChoice"]>, () => string>;

/** 처리 하나의 덧붙임 글(① 고른 것, ② 체제, ③ 주식, ④ 제안 수·기한, ⑤ 모금). 넘긴 처리는 글이 없다 */
function stepDetail(row: OccupationRow, step: (typeof OCCUPATION_STEPS)[number], now: number): string | null {
  if (row.steps[step] === "skipped") return null;
  switch (step) {
    case "loot_or_integrate":
      if (row.lootChoice === null) return null;
      return OUTCOME_NAMES[row.lootChoice]();
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

/** 남은 상태가 끝난 까닭 문구(D-527). 옛 줄(까닭 없음)은 "끝났습니다" */
const END_REASON_TEXT: Readonly<Record<OccupationEndReason, () => string>> = {
  rebuilt: m.faction_occ_end_rebuilt,
  recovered: m.faction_occ_end_recovered,
  expelled: m.faction_occ_end_expelled,
  owner_changed: m.faction_occ_end_owner_changed,
  gone: m.faction_occ_end_gone,
  replaced: m.faction_occ_end_replaced,
  expired: m.faction_occ_end_expired,
};

/**
 * 결과 값 한 줄(D-520·D-527): 가져간 값(약탈 = 꺼내 간 금고 몫, 점령 상태 = 거둔 세금, 점령·귀속 = 재건 비용) · 지금 상태(약탈 = 정부가 무너져
 * 재건 전까지 꺼내 감·재건 가능 시각, 점령 상태 = 체제 그대로·재정은 점령 세력·저절로 회복 시각, 점령·귀속 = 회복 불이익 끝) 또는 끝난 까닭
 */
function outcomeText(row: OccupationRow, now: number): string | null {
  const outcome = row.outcome;
  if (outcome === undefined || row.lootChoice === null) return null;
  const amount = amountText(outcome.taken);
  const currency = outcome.currency ?? "";
  const ended = outcome.endedAt !== null || outcome.untilAt === null;
  const until = outcome.untilAt ?? now;
  let taken: string;
  let state: string;
  switch (row.lootChoice) {
    case "loot":
      taken = m.faction_occ_amount_loot({ amount, currency });
      state =
        until > now
          ? m.faction_occ_state_loot({ time: relativeText(until, now) })
          : m.faction_occ_state_loot_waiting();
      break;
    case "occupy":
      taken = m.faction_occ_amount_occupy({ amount, currency });
      state = m.faction_occ_state_occupy({ time: relativeText(until, now) });
      break;
    case "integrate":
      taken = m.faction_occ_amount_integrate({ amount, currency });
      state = m.faction_occ_state_integrate({ time: relativeText(until, now) });
      break;
    default: {
      const unhandled: never = row.lootChoice;
      return unhandled;
    }
  }
  if (ended) {
    const reason = outcome.endReason ?? null;
    state = reason === null ? m.faction_occ_end_unknown() : END_REASON_TEXT[reason]();
  }
  return `${taken} · ${state}`;
}

/** 카드 머리 아래 한 줄: 누가 누구에게 */
function sideText(row: OccupationRow): string {
  switch (row.side) {
    case "as_occupier":
      // 약탈·점령 상태는 도시를 가져오지 않는다(소유 그대로) → "옛 주인"이 아니라 "상대"
      return row.lootChoice === "loot" || row.lootChoice === "occupy"
        ? m.faction_occ_as_winner({ name: row.other.name })
        : m.faction_occ_as_occupier({ name: row.other.name });
    case "as_target":
      return m.faction_occ_as_target({ name: row.other.name });
    case "offer_to_me":
      return m.faction_occ_offer_to_me({ name: row.other.name, count: formatCount(row.offers.myBuildings) });
    default: {
      const unhandled: never = row.side;
      return unhandled;
    }
  }
}

function OccupationCard({ row, now }: { row: OccupationRow; now: number }) {
  const titleId = `faction-occ-${row.id}`;
  const mine = row.offers.mine;
  const result = outcomeText(row, now);
  return (
    <li>
      <article className="faction-item" aria-labelledby={titleId}>
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {row.cityName}
          </h3>
          <span className="faction-muted">{relativeText(row.occurredAt, now)}</span>
        </div>
        <p className="faction-vote-detail">{sideText(row)}</p>
        {result === null ? null : <p className="faction-muted">{result}</p>}
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
                  <>
                    <span className="faction-vote-bar faction-step-bar" aria-hidden="true">
                      <span
                        className="faction-vote-yes"
                        style={{ inlineSize: barWidth(restorationPm(row)) }}
                      />
                    </span>
                    <span className="faction-step-detail faction-step-note">
                      {m.faction_occ_restoration_mine({
                        amount: amountText(row.restoration.mine),
                        currency: row.restoration.currency,
                        shares: formatCount(row.restoration.expectedShares),
                      })}
                    </span>
                    <span className="faction-muted faction-step-note">
                      {m.faction_occ_restoration_hint({ count: formatCount(SHARES_PER_CITY) })}
                    </span>
                  </>
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
          {row.side === "as_occupier" &&
          row.shareChoice === null &&
          (row.lootChoice === null || row.lootChoice === "integrate") ? (
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

export function FactionShares({
  shares,
  now,
  dividendEveryMs,
}: {
  shares: readonly CityShareRow[];
  now: number;
  dividendEveryMs: number;
}) {
  if (shares.length === 0) return <p className="faction-muted">{m.faction_shares_empty()}</p>;
  return (
    <>
      <p className="faction-muted">{m.faction_shares_hint({ count: formatCount(SHARES_PER_CITY) })}</p>
      <p className="faction-muted">{m.faction_dividend_rule({ period: durationText(dividendEveryMs) })}</p>
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
