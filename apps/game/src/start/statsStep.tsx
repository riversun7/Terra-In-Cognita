// 첫 접속 3단계 — 초기 스탯: 성향 고르기 → [굴리기](서버) → 여섯 스탯·합 → [다시 굴리기(남은 n번)]
// (D-6039·D-445 168·169: 성향 넷, 처음 1번 + 다시 굴리기 3번, 성향을 바꿔 굴려도 한 번, 늘 마지막 값). 굴림은 서버가 하고 센다.
// 여섯 스탯은 두 칸씩 묶어 스탯 색으로 보인다(STR·VIT, INT·WIS, DEX·AGI — 질문 181 가, roster/StatPairs.tsx).
import type { CyborgCreationResponse, CyborgRollView, CyborgStats } from "@terra/shared/cyborg";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { type StatPairValue, StatPairs } from "../roster/StatPairs.tsx";
import { formatNumber, primaryCode, primaryLabel } from "../roster/rosterText.ts";
import { temperamentText } from "./startText.ts";

/** 굴린 값 → 묶음 칸 값(만들 때는 보너스가 없다) */
function rolled(stats: CyborgStats): Record<PrimaryStat, StatPairValue> {
  const value = (stat: PrimaryStat): StatPairValue => ({ body: stats[stat], bonus: 0 });
  return {
    str: value("str"),
    vit: value("vit"),
    int: value("int"),
    wis: value("wis"),
    dex: value("dex"),
    agi: value("agi"),
  };
}

export function StatsStep({
  data,
  roll,
  temperament,
  onTemperament,
  onRoll,
}: {
  data: CyborgCreationResponse;
  roll: CyborgRollView | null;
  temperament: string;
  onTemperament: (id: string) => void;
  onRoll: () => Promise<void>;
}) {
  const id = useId();
  const [rolling, setRolling] = useState(false);
  const left = roll ? roll.rollsLeft : data.rules.rollsMax;
  const exhausted = roll !== null && roll.rollsLeft <= 0;
  const sum = roll ? PRIMARY_STATS.reduce((total, stat) => total + roll.stats[stat], 0) : 0;

  const press = async (): Promise<void> => {
    if (rolling || exhausted) return;
    setRolling(true);
    try {
      await onRoll();
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="start-stats">
      <fieldset className="start-group">
        <legend className="start-group-title">{m.start_stats_temperament()}</legend>
        <div className="start-choices">
          {data.temperaments.map((entry) => (
            <label key={entry.id} className="start-choice" data-temperament={entry.id}>
              <input
                type="radio"
                name={`${id}-temperament`}
                checked={temperament === entry.id}
                onChange={() => onTemperament(entry.id)}
                disabled={exhausted}
              />
              <span className="start-choice-body">
                <span className="start-choice-name">{temperamentText(entry.id)}</span>
                <span className="start-choice-meta">
                  {entry.favored.map((stat) => (
                    <span key={stat} className="stat-chip" translate="no" data-stat={stat}>
                      {primaryCode(stat)}
                    </span>
                  ))}
                  {entry.favored.length === 0
                    ? m.start_temperament_even()
                    : m.start_temperament_favors({
                        stats: entry.favored.map((stat) => primaryLabel(stat)).join("·"),
                      })}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="start-roll">
        <button
          type="button"
          className="button-primary start-roll-button"
          onClick={() => void press()}
          aria-disabled={rolling || exhausted}
          disabled={exhausted}
        >
          {rolling
            ? m.start_stats_rolling()
            : roll === null
              ? m.start_stats_roll()
              : m.start_stats_reroll({ left: formatNumber(left) })}
        </button>
        <p className="start-hint">{m.start_stats_note()}</p>
      </div>
      {roll ? (
        <div className="start-roll-result" data-rolls-left={roll.rollsLeft} aria-live="polite">
          {roll.temperament !== temperament && !exhausted ? (
            <p className="start-hint">
              {m.start_stats_other_temperament({ name: temperamentText(roll.temperament) })}
            </p>
          ) : null}
          <StatPairs values={rolled(roll.stats)} max={data.rules.statMax} label={m.roster_primary_title()} />
          <p className="start-stat-sum">{m.start_stats_sum({ sum: formatNumber(sum) })}</p>
          {exhausted ? <p className="start-hint">{m.start_stats_exhausted()}</p> : null}
        </div>
      ) : (
        <p className="start-hint">{m.start_stats_need_roll()}</p>
      )}
    </div>
  );
}
