// 한 판 보기 판(파티 대 파티만) — 보고서 설정의 지형·제한 시간·시드로 (가) 3D 관람(같은 시드의 한 판을 리플레이로 받아 3D 관람 창에,
// 서버 목록 `replay`가 거짓이면 꺼 두고 "준비 중"), (나) 한 판(사건 기록·유닛 요약). N회 반복은 보고서 판([보고서 돌리기])이 한다
// (docs/adr/2026-11-14-battle-report.md — 옛 몬테카를로 단추는 보고서로 바뀌었다). 결과가 지금 입력과 다르면 "지난 입력의 결과"를 알린다.
import { type LabBattleResponse, type LabCatalogResponse, labSettingsProblem } from "@terra/shared/battleLab";
import { useId } from "react";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, type LiveLines } from "../../../ui/LiveMessage.tsx";
import type { Teams } from "./labModel.ts";
import { BattleResult, type LegionParties } from "./LabResults.tsx";

export function ArenaPanel(props: {
  readonly catalog: LabCatalogResponse;
  readonly limitSec: number;
  readonly busy: "battle" | "watch" | null;
  readonly onBattle: () => void;
  readonly onWatch: () => void;
  readonly battle: { readonly result: LabBattleResponse; readonly stale: boolean } | null;
  readonly problem: LiveLines;
  readonly teams: Teams;
  /** 군단 전체 한 판의 팀마다 파티 목록(사용자 1469) */
  readonly legion?: LegionParties | undefined;
  readonly locale: string;
}) {
  const { catalog } = props;
  const id = useId();
  const battleIssue = labSettingsProblem({ limitSec: props.limitSec });
  const running = props.busy !== null;
  return (
    <section className="bp-panel bl-arena" aria-labelledby={`${id}-title`}>
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title">
          {m.dev_report_single_title()}
        </h2>
      </div>
      <p className="field-hint">{m.dev_report_single_hint()}</p>
      <div className="bl-modes">
        <button
          type="button"
          className="button-small bl-watch"
          aria-disabled={!catalog.replay || running || battleIssue !== null}
          aria-describedby={`${id}-watch-hint`}
          onClick={!catalog.replay || running || battleIssue !== null ? undefined : props.onWatch}
        >
          {props.busy === "watch" ? m.dev_lab_watch_loading() : m.dev_lab_watch()}
        </button>
        <button
          type="button"
          className="button-primary button-small bl-battle"
          aria-disabled={running || battleIssue !== null}
          onClick={running || battleIssue !== null ? undefined : props.onBattle}
        >
          {props.busy === "battle" ? m.dev_lab_running() : m.dev_lab_battle()}
        </button>
      </div>
      <p id={`${id}-watch-hint`} className="field-hint bl-watch-hint">
        {catalog.replay ? m.dev_lab_watch_hint() : m.dev_lab_watch_pending()}
      </p>
      <LiveMessage tone="error" lines={props.problem.lines} version={props.problem.version} />
      {props.battle ? (
        <section
          className="bl-result-block"
          aria-label={m.dev_lab_battle_result()}
          data-stale={props.battle.stale ? "" : undefined}
        >
          <h3 className="bl-subtitle">{m.dev_lab_battle_result()}</h3>
          {props.battle.stale ? <p className="field-hint bp-stale">{m.dev_lab_stale()}</p> : null}
          <BattleResult
            result={props.battle.result}
            teams={props.teams}
            legion={props.legion}
            catalog={catalog}
            locale={props.locale}
          />
        </section>
      ) : null}
    </section>
  );
}
