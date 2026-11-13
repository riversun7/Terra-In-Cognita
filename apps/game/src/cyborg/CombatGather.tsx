// 상세 전투 스펙 효율 묶음의 원자재별 채집 줄 — 사용자 요청 2026-11-12 "효율에 스탯에 따른 원자재별 티어구간이나 최적 작업을 보여줌".
// 서버가 판정과 같은 함수로 셈해 보낸 값(CyborgBody.gather: 유효 스탯·티어 구간 ‰·해금 티어·진행·수확량·성공 확률·최적 작업)을 보이기만 한다
// (apps/server/src/roster/gatherSheet.ts). 줄 모양은 2차 스탯 줄과 같다(SpecRow): 이름 = 원자재 · 시설, 값 = 확률이 있는 티어 폭,
// 막대 = 기대 티어 ÷ T9, 최적 작업은 값 옆 "최적" 표. 펼치면 유효 스탯 셈·구간의 티어별 확률·T9 확률·진행·수확량(·성공 확률).
import type { RosterGather } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { formatMilli, formatNumber, localName, primaryCode } from "../roster/rosterText.ts";
import { SpecRow } from "./CombatAttack.tsx";
import { expectedTierMilli, tierSpanText } from "./cyborgText.ts";

/** 가장 높은 티어(T9) */
const TOP_TIER = 9;

/** ‰ → "15%"·"0.5%" */
const pctText = (pm: number): string => `${formatMilli(pm * 100)}%`;

/** 부호 붙인 정수("+0"·"-5") */
const signedInt = (value: number): string => `${value < 0 ? "-" : "+"}${formatNumber(Math.abs(value))}`;

/** 원자재별 채집 줄(효율 묶음 끝). 줄이 없으면 아무것도 그리지 않는다 */
export function GatherRows({ rows }: { rows: readonly RosterGather[] }) {
  return (
    <>
      {rows.map((row) => (
        <GatherRow key={row.facility} row={row} />
      ))}
    </>
  );
}

function GatherRow({ row }: { row: RosterGather }) {
  const name = m.cyborg_gather_name({
    material: localName(row.material, row.subcategory),
    facility: localName(row.name, row.facility),
  });
  const tiers = row.tierPm.flatMap((pm, tier) => (pm > 0 ? [`T${String(tier)} ${pctText(pm)}`] : []));
  return (
    <SpecRow
      sec={`gather_${row.subcategory}`}
      real="gather"
      name={name}
      shown={tierSpanText(row.tierPm)}
      fill={Math.min(1, expectedTierMilli(row.tierPm) / (TOP_TIER * 1000))}
      badge={row.best ? <span className="combat-best">{m.cyborg_gather_best()}</span> : null}
    >
      <p className="combat-formula">
        <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
        {m.cyborg_gather_formula()}
      </p>
      <p className="combat-line" translate="no">
        {m.cyborg_gather_stat_line({
          primary: primaryCode(row.primary),
          primaryValue: formatNumber(row.primaryValue),
          secondary: primaryCode(row.secondary),
          secondaryValue: formatNumber(row.secondaryValue),
          condition: signedInt(row.condition),
          stat: formatNumber(row.stat),
        })}
      </p>
      {row.mode === "select" ? (
        <p className="combat-line combat-result" translate="no">
          {m.cyborg_gather_select({ tier: `T${String(row.selectTier)}` })}
        </p>
      ) : (
        <>
          <p className="combat-line combat-result" translate="no">
            {row.bandNext === null
              ? m.cyborg_gather_band_last({ from: formatNumber(row.bandFrom), tiers: tiers.join(" · ") })
              : m.cyborg_gather_band({
                  from: formatNumber(row.bandFrom),
                  to: formatNumber(row.bandNext - 1),
                  tiers: tiers.join(" · "),
                })}
          </p>
          <p className="combat-line" translate="no">
            {m.cyborg_gather_top({ pct: pctText(row.tierPm[TOP_TIER] ?? 0) })}
          </p>
        </>
      )}
      <p className="combat-line" translate="no">
        {m.cyborg_gather_work({ progress: formatNumber(row.progress), yield: formatNumber(row.yieldPerLot) })}
      </p>
      {row.catchPm === undefined ? null : (
        <p className="combat-line" translate="no">
          {m.cyborg_gather_catch({ pct: pctText(row.catchPm) })}
        </p>
      )}
      {row.best ? <p className="combat-line">{m.cyborg_gather_best_line()}</p> : null}
    </SpecRow>
  );
}
