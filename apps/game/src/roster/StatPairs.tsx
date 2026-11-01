// 1차 스탯 묶음 — 두 칸씩(STR·VIT, INT·WIS, DEX·AGI), 스탯마다 고유 색(--color-stat-*). D-448(질문 181 가),
// ADR 2026-11-01-ui-visibility. 첫 접속 초기 스탯·사이보그 화면 핵심 사양·유닛 상세가 같이 쓴다(지연 조각끼리 공용, 첫 화면 밖).
// - 칸 = 약자(색) + 이름 + 값(색, 큰 글자) + 막대. 막대는 평소 두 칸: 몸 값(처음 값 + 레벨 성장)과 보너스(장비·인공장기·부품, 빗금).
// - K가 보이는 곳(D-449: 만렙 등, 서버가 처음 값·K를 보낼 때)만 몸 값을 처음 값·레벨 성장으로 나누고 K를 보인다.
// - 색만으로 구분하지 않는다: 약자·이름을 늘 함께 쓴다. 막대는 꾸밈(aria-hidden), 값은 글자로 읽힌다.
import { PRIMARY_STAT_PAIRS, type PrimaryStat, type RosterStats } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { formatK, formatNumber, primaryCode, primaryLabel } from "./rosterText.ts";
import "./statPairs.css";

export interface StatPairValue {
  /** 몸 값(처음 값 + 레벨 성장) */
  readonly body: number;
  /** 장비·인공장기·부품 보너스(D-423) */
  readonly bonus: number;
  /** 처음 값과 K(‰) — K가 보이는 곳에서만(D-449) */
  readonly initial?: number | undefined;
  readonly kPm?: number | undefined;
}

type Growth = {
  readonly initial: Readonly<Record<PrimaryStat, number>>;
  readonly kPm: Readonly<Record<PrimaryStat, number>>;
} | null;

/** 서버 스탯(성장값 base + 보너스) → 묶음 칸 값. growth가 있으면(만렙 등) 처음 값·K도 */
export function pairValuesOf(
  primaries: RosterStats["primaries"],
  growth: Growth = null,
): Record<PrimaryStat, StatPairValue> {
  const value = (stat: PrimaryStat): StatPairValue => ({
    body: primaries[stat].base,
    bonus: primaries[stat].bonus,
    initial: growth?.initial[stat],
    kPm: growth?.kPm[stat],
  });
  return {
    str: value("str"),
    vit: value("vit"),
    int: value("int"),
    wis: value("wis"),
    dex: value("dex"),
    agi: value("agi"),
  };
}

/** 막대 끝 값: 가장 큰 값의 1.2배(작으면 floor). 막대 길이는 꾸밈이라 화면이 정한다 */
export function statScale(values: Readonly<Record<PrimaryStat, StatPairValue>>, floor: number): number {
  const top = Math.max(...Object.values(values).map((value) => value.body + Math.max(0, value.bonus)));
  return Math.max(floor, Math.ceil(top * 1.2));
}

const percent = (value: number, max: number): string =>
  `${String(Math.round((Math.min(Math.max(0, value), max) / Math.max(1, max)) * 1000) / 10)}%`;

function Bar({ value, max }: { value: StatPairValue; max: number }) {
  const { body, bonus, initial } = value;
  return (
    <span className="stat-bar" aria-hidden="true">
      {/* 처음 값이 있으면 몸 값을 처음 값·레벨 성장 두 칸으로(K가 보이는 곳만) */}
      {initial === undefined ? (
        <span className="stat-bar-body" style={{ inlineSize: percent(body, max) }} />
      ) : (
        <>
          <span className="stat-bar-body" data-part="initial" style={{ inlineSize: percent(initial, max) }} />
          <span
            className="stat-bar-body"
            data-part="growth"
            style={{ inlineSize: percent(Math.max(0, body - initial), max) }}
          />
        </>
      )}
      {bonus > 0 ? <span className="stat-bar-bonus" style={{ inlineSize: percent(bonus, max) }} /> : null}
    </span>
  );
}

export function StatPairs({
  values,
  max,
  label,
  size = "md",
}: {
  values: Readonly<Record<PrimaryStat, StatPairValue>>;
  /** 막대 끝 값 */
  max: number;
  /** 묶음 전체의 읽는 이름 */
  label: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="stat-pairs-box">
      <div className="stat-pairs" data-size={size} role="group" aria-label={label}>
        {PRIMARY_STAT_PAIRS.map((pair) => (
          <ul
            key={pair.join("-")}
            className="stat-pair"
            data-pair={pair.join("-")}
            aria-label={pair.map((stat) => primaryLabel(stat)).join("·")}
          >
            {pair.map((stat) => {
              const value = values[stat];
              return (
                <li key={stat} className="stat-cell" data-stat={stat}>
                  <span className="stat-code" translate="no">
                    {primaryCode(stat)}
                  </span>
                  <span className="stat-name" title={primaryLabel(stat)}>
                    {primaryLabel(stat)}
                  </span>
                  {value.kPm === undefined ? null : (
                    <span className="stat-k">{m.roster_stat_k({ value: formatK(value.kPm) })}</span>
                  )}
                  {value.bonus === 0 ? null : (
                    <span className="stat-bonus">
                      {m.roster_primary_bonus({
                        value: `${value.bonus > 0 ? "+" : ""}${formatNumber(value.bonus)}`,
                      })}
                    </span>
                  )}
                  <span className="stat-value">{formatNumber(value.body + value.bonus)}</span>
                  <Bar value={value} max={max} />
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </div>
  );
}
