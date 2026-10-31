// 외교 탭 — 세 층(46 §4.1): 관계 점수(호감)와 띠·신뢰, 공식 상태(동맹·중립·전쟁), 조약 카드. 정원사는 늘 적대(외교 없음, §8).
// 표다(빽빽해서 data-density="compact"). 좁은 화면에서는 줄마다 카드처럼 쌓는다(칸 이름을 앞에 보인다, faction.css).
import type { DiplomacyRow, TreatyCard } from "@terra/shared/faction";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { StateChip } from "../sections/screenParts.tsx";
import { leftText } from "../sections/screenText.ts";
import { BAND_NAMES, STATE_NAMES, TREATY_NAMES } from "./factionText.ts";
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
            <td data-label={m.faction_dip_col_relation()}>
              <StateChip tone="bad" label={BAND_NAMES.hostile()} />
            </td>
            <td data-label={m.faction_dip_col_trust()}>
              <span className="faction-muted">—</span>
            </td>
            <td data-label={m.faction_dip_col_state()} colSpan={2}>
              <span className="faction-muted">{m.faction_gardener_note()}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
