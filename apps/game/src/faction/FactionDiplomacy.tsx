// 외교 탭 — 세 층(46 §4.1): 관계 점수(호감, 세력 쌍마다)와 띠, 세력 신뢰(세력마다 하나, 모두가 보는 값 — D-255·D-443),
// 공식 상태(동맹·중립·전쟁), 조약 카드. 정원사는 늘 적대이고 외교가 없어(D-321) 띠·점수 없이 글 한 줄만 보인다.
// 표다(빽빽해서 data-density="compact"). 좁은 화면에서는 줄마다 카드처럼 쌓는다(칸 이름을 앞에 보인다, faction.css).
// 표 아래 조약 제안: 카드마다 맺는 길(D-444 167, @terra/shared/faction treatyDecision). 독재가 아니면 투표 필요 카드만
// [안건 올리기](휴전·강화는 짧은 투표), 나머지는 지도자가 바로 [제안하기]. 둘 다 아직 곧 열림 단추다(명령은 WebSocket, R5).
import {
  type DiplomacyRow,
  type Regime,
  TREATY_KINDS,
  type TreatyCard,
  treatyDecision,
} from "@terra/shared/faction";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { SoonButton, StateChip } from "../sections/screenParts.tsx";
import { leftText } from "../sections/screenText.ts";
import { BAND_NAMES, STATE_NAMES, TREATY_DECISION_NOTES, TREATY_NAMES } from "./factionText.ts";
import { BAND_TONES, STATE_TONES, formatPermille } from "./factionView.ts";

/** 점수 글자(+64, −41). 빼기는 진짜 빼기표 */
function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return value < 0 ? `−${Math.abs(value)}` : "0";
}

/** 조약 카드 한 장의 조항 글(관세·자동 합류·남은 기한) */
function treatyTerms(treaty: TreatyCard, now: number): string[] {
  const terms: string[] = [];
  const from = treaty.terms.tariffFromPm;
  const to = treaty.terms.tariffToPm;
  if (from !== undefined && to !== undefined) {
    const locale = getLocale();
    terms.push(
      m.faction_treaty_tariff({ from: formatPermille(from, locale), to: formatPermille(to, locale) }),
    );
  }
  if (treaty.terms.autoJoin === 1) terms.push(m.faction_treaty_auto_join());
  if (treaty.expiresAt !== null) terms.push(m.faction_treaty_left({ time: leftText(treaty.expiresAt, now) }));
  return terms;
}

function Treaties({ treaties, now }: { treaties: readonly TreatyCard[]; now: number }) {
  if (treaties.length === 0) return <span className="faction-muted">{m.faction_none_value()}</span>;
  return (
    <ul className="faction-treaties">
      {treaties.map((treaty) => {
        const terms = treatyTerms(treaty, now);
        return (
          <li key={treaty.id} className="faction-treaty">
            <span className="faction-treaty-name">{TREATY_NAMES[treaty.kind]()}</span>
            {terms.length === 0 ? null : <span className="faction-treaty-terms">{terms.join(" · ")}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ row, now }: { row: DiplomacyRow; now: number }) {
  return (
    <tr>
      <th scope="row" data-label={m.faction_dip_col_faction()}>
        <span className="faction-stack">
          <span className="faction-row-name">
            {row.faction.name}
            {row.faction.tag === null ? null : (
              <span className="faction-tag" translate="no">
                {row.faction.tag}
              </span>
            )}
          </span>
          {row.fixed ? <span className="faction-muted">{m.faction_dip_fixed()}</span> : null}
        </span>
      </th>
      <td data-label={m.faction_dip_col_relation()}>
        <span className="faction-inline">
          <span className="faction-score">{signed(row.score)}</span>
          <StateChip tone={BAND_TONES[row.band]} label={BAND_NAMES[row.band]()} />
        </span>
      </td>
      <td data-label={m.faction_dip_col_trust()}>
        <span className="faction-score">{signed(row.trust)}</span>
      </td>
      <td data-label={m.faction_dip_col_state()}>
        <StateChip tone={STATE_TONES[row.state]} label={STATE_NAMES[row.state]()} />
      </td>
      <td data-label={m.faction_dip_col_treaties()}>
        <Treaties treaties={row.treaties} now={now} />
      </td>
    </tr>
  );
}

export function FactionDiplomacy({ rows, now }: { rows: readonly DiplomacyRow[]; now: number }) {
  return (
    <>
      <p className="faction-muted">{m.faction_dip_scores_hint()}</p>
      <div className="faction-table-wrap" data-density="compact">
        <table className="faction-table">
          <caption className="visually-hidden">{m.faction_diplomacy_title()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.faction_dip_col_faction()}</th>
              <th scope="col">{m.faction_dip_col_relation()}</th>
              <th scope="col">{m.faction_dip_col_trust()}</th>
              <th scope="col">{m.faction_dip_col_state()}</th>
              <th scope="col">{m.faction_dip_col_treaties()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.faction.id} row={row} now={now} />
            ))}
            <tr className="faction-gardener">
              <th scope="row" data-label={m.faction_dip_col_faction()}>
                <span className="faction-row-name">{m.faction_gardener_name()}</span>
              </th>
              <td colSpan={4}>
                <span className="faction-muted">{m.faction_gardener_note()}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 조약 제안 목록(D-444 167). regime = 내 세력 체제(모르면 null → 투표 쪽) */
export function FactionTreatyOffers({ regime }: { regime: Regime | null }) {
  const leaderOnly = regime === "dictatorship";
  return (
    <>
      <p className="faction-muted">
        {leaderOnly ? m.faction_treaty_offers_hint_leader() : m.faction_treaty_offers_hint_vote()}
      </p>
      <ul className="faction-treaty-offers">
        {TREATY_KINDS.map((kind) => {
          const decision = treatyDecision(kind, regime);
          const name = TREATY_NAMES[kind]();
          return (
            <li key={kind} className="faction-treaty-offer" data-decision={decision}>
              <span className="faction-stack">
                <span className="faction-treaty-offer-name">{name}</span>
                <span className="faction-muted">{TREATY_DECISION_NOTES[decision]()}</span>
              </span>
              <SoonButton
                context={name}
                label={
                  decision === "leader" ? m.faction_treaty_offer_direct() : m.faction_treaty_offer_vote()
                }
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
