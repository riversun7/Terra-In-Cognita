// 다시보기 끝 요약 — 이긴 편·까닭·걸린 시간, 편마다 남음·쓰러짐·퇴각·준 피해·회복, 유닛마다 준·받은 피해·회복·쓰러뜨림.
// 지도 위 카드(불투명 판: 세계 색은 테마와 상관없어 글자가 읽혀야 한다). 좁은 화면은 카드 안에서만 세로로 민다.
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { m } from "../paraglide/messages.js";
import { reasonText, roleName, sideName, unitLabel } from "./battleText.ts";
import { clockText } from "./replayClock.ts";
import type { ReplaySummary } from "./replayTimeline.ts";

export function BattleSummary({
  replay,
  summary,
  onClose,
  onRestart,
}: {
  readonly replay: BattleReplay;
  readonly summary: ReplaySummary;
  readonly onClose: () => void;
  readonly onRestart: () => void;
}) {
  return (
    <section className="br-summary" aria-labelledby="br-summary-title">
      <header className="br-summary-head">
        <h2 id="br-summary-title" className="br-summary-title">
          {m.battle_summary_winner({ side: sideName(replay, summary.winner) })}
        </h2>
        <p className="br-summary-sub">
          {reasonText(summary.reason)} · {m.battle_summary_duration({ time: clockText(summary.durationMs) })}
        </p>
      </header>
      <ul className="br-summary-sides">
        {summary.sides.map((side, index) => (
          <li key={side.side} className="br-summary-side" data-team={index}>
            <strong>{sideName(replay, side.side)}</strong>
            <span>
              {m.battle_summary_side({ alive: side.alive, down: side.down, retreated: side.retreated })}
            </span>
            <span>
              {m.battle_summary_dealt()} {side.dealt} · {m.battle_summary_healed()} {side.healed}
            </span>
          </li>
        ))}
      </ul>
      <div className="br-summary-table-wrap">
        <table className="br-summary-table">
          <thead>
            <tr>
              <th scope="col">{m.battle_units()}</th>
              <th scope="col">{m.battle_summary_dealt()}</th>
              <th scope="col">{m.battle_summary_taken()}</th>
              <th scope="col">{m.battle_summary_healed()}</th>
              <th scope="col">{m.battle_summary_kills()}</th>
            </tr>
          </thead>
          <tbody>
            {summary.units.map((row) => {
              const unit = replay.units[row.index];
              return (
                <tr key={row.index} data-status={row.status}>
                  <th scope="row">
                    <span
                      className="br-summary-name"
                      data-team={replay.sides.findIndex((side) => side.id === unit?.side)}
                    >
                      {unitLabel(replay, row.index)}
                    </span>{" "}
                    <span className="br-summary-role">{unit ? roleName(unit.kind) : ""}</span>
                  </th>
                  <td>{row.dealt}</td>
                  <td>{row.taken}</td>
                  <td>{row.healed}</td>
                  <td>{row.kills}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="br-summary-actions">
        <button type="button" className="button-small" onClick={onClose}>
          {m.battle_summary_close()}
        </button>
        <button type="button" className="button-small button-primary" onClick={onRestart}>
          {m.battle_restart()}
        </button>
      </div>
    </section>
  );
}
