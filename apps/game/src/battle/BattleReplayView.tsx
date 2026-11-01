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
import { BattleLog } from "./BattleLog.tsx";
import { BattleSummary } from "./BattleSummary.tsx";
import { BattleUnits } from "./BattleUnits.tsx";
import { BattleScene, type SceneUi } from "./battleScene.ts";
import { type Locale, reasonText, sideName } from "./battleText.ts";
import { REPLAY_SPEEDS, type ReplaySpeed, clockText } from "./replayClock.ts";
import type { ReplayGround } from "./replayTerrain.ts";
import { createReplayTimeline } from "./replayTimeline.ts";
import "./battleReplay.css";

export interface BattleReplayViewProps {
  readonly replay: BattleReplay;
  readonly ground: ReplayGround;
  /** 열자마자 재생(기본 true) */
  readonly autoPlay?: boolean | undefined;
}

const SEEK_STEP_MS = 100;

export default function BattleReplayView({ replay, ground, autoPlay = true }: BattleReplayViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const timeline = useMemo(() => createReplayTimeline(replay), [replay]);
  const [ui, setUi] = useState<SceneUi | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  const [perf, setPerf] = useState<{ p95: number; fps: number; calls: number } | null>(null);
  const [vision, setVision] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const locale: Locale = getLocale() === "en" ? "en" : "ko";

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const scene = new BattleScene({ host, replay, timeline, ground, onUi: setUi, onStatus: setStatus });
    sceneRef.current = scene;
    if (autoPlay) scene.play();
    else scene.seek(0);
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
  }, [replay, timeline, ground, autoPlay]);

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
          <button type="button" className="button-small" onClick={() => scene()?.restart()}>
            {m.battle_restart()}
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
