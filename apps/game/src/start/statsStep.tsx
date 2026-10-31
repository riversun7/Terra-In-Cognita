// 첫 접속 3단계 — 초기 스탯: 성향 고르기 → [굴리기](서버) → 여섯 스탯·합 → [다시 굴리기(남은 n번)]
// (D-6039·D-445 168·169: 성향 넷, 처음 1번 + 다시 굴리기 3번, 성향을 바꿔 굴려도 한 번, 늘 마지막 값). 굴림은 서버가 하고 센다.
import { PRIMARY_STATS } from "@terra/shared/roster";
import type { CyborgCreationResponse, CyborgRollView } from "@terra/shared/cyborg";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatNumber, primaryLabel } from "../roster/rosterText.ts";
import { temperamentText } from "./startText.ts";

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
          <dl className="start-stat-grid">
            {PRIMARY_STATS.map((stat) => (
              <div key={stat} className="start-stat" data-stat={stat}>
                <dt>{primaryLabel(stat)}</dt>
                <dd>
                  <span className="start-stat-value">{formatNumber(roll.stats[stat])}</span>
                  <span className="start-stat-bar" aria-hidden="true">
                    <span
                      className="start-stat-fill"
                      style={{
                        inlineSize: `${Math.round((roll.stats[stat] / Math.max(1, data.rules.statMax)) * 100)}%`,
                      }}
                    />
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="start-stat-sum">{m.start_stats_sum({ sum: formatNumber(sum) })}</p>
          {exhausted ? <p className="start-hint">{m.start_stats_exhausted()}</p> : null}
        </div>
      ) : (
        <p className="start-hint">{m.start_stats_need_roll()}</p>
      )}
    </div>
  );
}
