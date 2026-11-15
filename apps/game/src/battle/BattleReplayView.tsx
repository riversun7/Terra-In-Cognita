// 전투 다시보기 화면 — 2차맵 엔진 위에 리플레이를 그린다. docs/adr/2026-11-01-battle-replay.md 7절.
// 나중에 결과 화면 "다시 보기"(D-6028)·실시간 전투 화면이 같은 화면을 쓴다(전투 실험실 work/battle-lab도 끼운다):
//   <BattleReplayView replay={decodeBattleReplay(…)} ground={await loadReplayGround(replay.arena)} />
// 화면 하나가 엔진 하나를 든다(렌더러는 앱에 하나: 다른 지도 화면과 같이 열지 않는다).
// 장면(battleScene.ts)이 프레임을 그리고, 이 화면은 조작·기록 판·끝 요약만 그린다(상태는 10Hz로 받는다).
// 시험·측정용 data-*: data-status(loading·ready·failed), data-playing, data-time, data-ended, data-speed, data-fx·data-numbers(그 시각
// 효과·숫자 수), data-render-p95·data-fps·data-draw-calls(엔진 요약, 1초마다).
import type { EngineStatus } from "@terra/engine";
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { BattleCommandBar } from "./BattleCommandBar.tsx";
import { BattleLog } from "./BattleLog.tsx";
import { BattleSummary } from "./BattleSummary.tsx";
import { BattleUnits } from "./BattleUnits.tsx";
import { BattleScene, type SceneUi } from "./battleScene.ts";
import { type Locale, reasonText, sideName } from "./battleText.ts";
import { REPLAY_SPEEDS, type ReplaySpeed, clockText } from "./replayClock.ts";
import type { ReplayGround } from "./replayTerrain.ts";
import { createReplayTimeline } from "./replayTimeline.ts";
import {
  type BattleCommandIssue,
  type BattleOrderDraft,
  type BattlePick,
  sideParties,
} from "./battleCommands.ts";
import "./battleReplay.css";

export interface BattleReplayViewProps {
  readonly replay: BattleReplay;
  readonly ground: ReplayGround;
  /** 열자마자 재생(기본 true) */
  readonly autoPlay?: boolean | undefined;
  /** 처음 볼 시각(ms, 명령을 넣고 다시 계산한 리플레이를 그 시각부터 — 없으면 처음) */
  readonly startAtMs?: number | undefined;
  /**
   * 전투맵 명령 화면(D-558 1546): 이 편에 군단·분대 명령을 내린다. 명령을 내리면 그 시각에 멈추고 onIssue를 부른다(판정은 서버 —
   * 부르는 쪽이 명령을 넣어 다시 계산한 리플레이를 넘긴다). 없으면 보기만
   */
  readonly command?:
    | {
        readonly side: number;
        readonly issued: readonly BattleCommandIssue[];
        readonly busy: boolean;
        readonly onIssue: (issue: BattleCommandIssue) => void;
      }
    | undefined;
}

const SEEK_STEP_MS = 100;

/** 처음부터(되감는 둥근 화살표). 꾸밈이라 읽기 프로그램에는 숨긴다(옆 숨긴 글자가 알린다). 크기는 CSS(.icon) */
function RestartIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4h4" />
    </svg>
  );
}

export default function BattleReplayView({
  replay,
  ground,
  autoPlay = true,
  startAtMs,
  command,
}: BattleReplayViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const timeline = useMemo(() => createReplayTimeline(replay), [replay]);
  const [ui, setUi] = useState<SceneUi | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  const [perf, setPerf] = useState<{ p95: number; fps: number; calls: number } | null>(null);
  const [vision, setVision] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const locale: Locale = getLocale() === "en" ? "en" : "ko";
  // 전투맵 명령: 칸·목표를 고르는 중인 명령(장면 누르기 처리가 읽으므로 ref에도 둔다)
  const [pick, setPickState] = useState<BattlePick>(null);
  const pickRef = useRef<BattlePick>(null);
  const commandRef = useRef(command);
  useEffect(() => {
    commandRef.current = command;
  }, [command]);
  const setPick = (next: BattlePick): void => {
    pickRef.current = next;
    setPickState(next);
    // 칸·목표를 고르는 동안은 멈춘다(그 시각에 내린다)
    if (next) sceneRef.current?.pause();
  };
  const issueRef = useRef((party: number | null, order: BattleOrderDraft): void => {
    const scene = sceneRef.current;
    const handler = commandRef.current;
    if (!scene || !handler) return;
    scene.pause();
    handler.onIssue({ atMs: scene.clock.timeMs, party, order });
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const issue = issueRef.current;
    const finish = (): void => {
      pickRef.current = null;
      setPickState(null);
    };
    const scene = new BattleScene({
      host,
      replay,
      timeline,
      ground,
      onUi: setUi,
      onStatus: setStatus,
      onGroundTap: (cell) => {
        const picking = pickRef.current;
        if (!picking || picking.kind === "attack") return;
        finish();
        issue(picking.party, { kind: picking.kind, cell });
      },
      onUnitTap: (index) => {
        const picking = pickRef.current;
        const target = replay.units[index];
        const side = commandRef.current?.side;
        if (picking?.kind !== "attack" || !target || target.side === side) return;
        finish();
        issue(picking.party, { kind: "attack", target: index });
      },
    });
    sceneRef.current = scene;
    if (autoPlay) scene.play();
    else scene.seek(startAtMs ?? 0);
    // 엔진 요약(측정·시험): 1초마다
    const timer = setInterval(() => {
      const stats = scene.stats();
      setPerf({ p95: stats.renderP95Ms, fps: stats.framesLastSecond, calls: stats.drawCalls });
    }, 1000);
    return () => {
      clearInterval(timer);
      sceneRef.current = null;
      scene.dispose();
    };
  }, [replay, timeline, ground, autoPlay, startAtMs]);

  const timeMs = ui?.timeMs ?? 0;
  const ended = timeMs >= timeline.durationMs && timeline.durationMs > 0;
  const playing = ui?.playing ?? false;
  const speed = ui?.speed ?? 1;
  const alive = replay.sides.map(
    (side) =>
      (ui?.frames ?? []).filter(
        (frame) => frame.status === "alive" && replay.units[frame.index]?.side === side.id,
      ).length,
  );
  const summary = useMemo(() => timeline.summary(), [timeline]);
  const condition = replay.kind === "siege" ? m.battle_condition_siege() : m.battle_condition_normal();
  const scene = (): BattleScene | null => sceneRef.current;

  return (
    <section
      className="br-view"
      aria-label={m.battle_view_label()}
      data-status={status.kind === "ready" ? "ready" : status.kind === "loading" ? "loading" : "failed"}
      data-playing={playing ? "true" : "false"}
      data-ended={ended ? "true" : "false"}
      data-time={Math.round(timeMs)}
      data-speed={speed}
      data-fx={ui?.fx ?? 0}
      data-fx-kinds={ui?.fxKinds ?? ""}
      data-numbers={ui?.numbers ?? 0}
      data-render-p95={perf ? perf.p95.toFixed(2) : ""}
      data-fps={perf?.fps ?? ""}
      data-draw-calls={perf?.calls ?? ""}
    >
      <div className="br-top">
        <span className="br-time" aria-live="off">
          {m.battle_time({ now: clockText(timeMs), end: clockText(timeline.durationMs) })}
        </span>
        <span className="br-condition">{condition}</span>
        <span className="br-score">
          {replay.sides.map((side, index) => (
            <span key={side.id} className="br-score-side" data-team={timeline.team(side.id)}>
              {m.battle_score({ side: sideName(replay, side.id), alive: alive[index] ?? 0 })}
            </span>
          ))}
        </span>
      </div>

      <div className="br-stage">
        <div className="br-canvas" ref={hostRef} />
        {status.kind === "unsupported" || status.kind === "error" ? (
          <p className="br-notice" role="alert">
            {m.battle_engine_failed()}
          </p>
        ) : null}
        {status.kind === "loading" ? (
          <p className="br-notice" role="status">
            {m.battle_loading_terrain()}
          </p>
        ) : null}
        {ended && summaryOpen ? (
          <BattleSummary
            replay={replay}
            summary={summary}
            onClose={() => setSummaryOpen(false)}
            onRestart={() => {
              setSummaryOpen(true);
              scene()?.restart();
            }}
          />
        ) : null}
        {ended && !summaryOpen ? (
          <button type="button" className="button-small br-show-summary" onClick={() => setSummaryOpen(true)}>
            {m.battle_summary_show()}
          </button>
        ) : null}
      </div>

      <div className="br-controls">
        <div className="br-buttons">
          <button
            type="button"
            className="button-small br-restart"
            title={m.battle_restart()}
            onClick={() => scene()?.restart()}
          >
            <RestartIcon />
            <span className="visually-hidden">{m.battle_restart()}</span>
          </button>
          <button
            type="button"
            className="button-small button-primary br-play"
            aria-pressed={playing}
            onClick={() => scene()?.toggle()}
          >
            {playing ? m.battle_pause() : m.battle_play()}
          </button>
          <div className="br-speed" role="group" aria-label={m.battle_speed()}>
            {REPLAY_SPEEDS.map((value: ReplaySpeed) => (
              <button
                key={value}
                type="button"
                className="button-small"
                aria-pressed={speed === value}
                onClick={() => scene()?.setSpeed(value)}
              >
                {m.battle_speed_value({ speed: value })}
              </button>
            ))}
          </div>
        </div>
        <input
          className="br-seek"
          type="range"
          min={0}
          max={timeline.durationMs}
          step={SEEK_STEP_MS}
          value={Math.round(timeMs / SEEK_STEP_MS) * SEEK_STEP_MS}
          aria-label={m.battle_seek()}
          aria-valuetext={m.battle_time({ now: clockText(timeMs), end: clockText(timeline.durationMs) })}
          onChange={(event) => scene()?.seek(Number(event.currentTarget.value))}
        />
      </div>

      {command ? (
        <BattleCommandBar
          parties={sideParties(replay, command.side)}
          timeMs={timeMs}
          pick={pick}
          issued={command.issued}
          busy={command.busy}
          onPick={setPick}
          onIssue={(party, order) => issueRef.current(party, order)}
        />
      ) : null}

      <BattleUnits
        replay={replay}
        timeline={timeline}
        frames={ui?.frames ?? []}
        selected={ui?.selected ?? -1}
        follow={ui?.follow ?? false}
        vision={vision}
        locale={locale}
        onSelect={(index) => scene()?.select(index)}
        onFollow={(follow) => scene()?.setFollow(follow)}
        onVision={(side) => {
          setVision(side);
          scene()?.setVision(side);
        }}
      />

      <BattleLog
        replay={replay}
        timeline={timeline}
        timeMs={timeMs}
        locale={locale}
        endText={
          ended ? `${sideName(replay, replay.result.winner)} · ${reasonText(replay.result.reason)}` : null
        }
      />
    </section>
  );
}
