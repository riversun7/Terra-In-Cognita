// [3D 전투 · 리플레이] 통합 탭 — /dev/balance 안에서 곧바로 실제 3D 전투와 리플레이를 본다.
// 1) 현재 세팅(팀 A vs 팀 B — 1:1·파티전·군단전)을 서버에서 리플레이로 녹화해 바로 재생 + 전투맵 명령 내리기
// 2) 시범 6 대 6 리플레이(기존 /dev/battle-replay 기능 통합 — 시드 입력 → 바로 재생, /dev/battle-replay 주소로 들어오면 자동 재생)
// WebGL 엔진은 한 번에 하나만 띄운다(active가 거짓이거나 전체 화면 창이 열려 있으면 BattleReplayView를 내린다).
// 시험·측정용 data-*: data-source(setup·demo), data-status(idle·loading·ready·failed), data-seed, data-bytes, data-events, data-arena, data-error.
import type { BattleReplayDemoResponse } from "@terra/shared/battleReplay";
import { BATTLE_REPLAY_SEED_MAX } from "@terra/shared/battleReplay";
import { decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
import { TRPCClientError } from "@trpc/client";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { loadReplayGround } from "../../../battle/replayTerrain.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import type { WatchCommand, WatchedBattle } from "./ReplayOverlay.tsx";

const BattleReplayView = lazy(() => import("../../../battle/BattleReplayView.tsx"));

export type ReplaySource = "setup" | "demo";

interface DemoLoaded {
  readonly watched: WatchedBattle;
  readonly response: BattleReplayDemoResponse;
}

type DemoStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly stage: "record" | "terrain" }
  | { readonly kind: "ready"; readonly loaded: DemoLoaded }
  | { readonly kind: "failed"; readonly reason: string };

/** tRPC 오류 → 이유 코드(data.reason, 없으면 code) */
function reasonOf(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const data: unknown = error.data;
    const reason = typeof data === "object" && data !== null ? Reflect.get(data, "reason") : undefined;
    if (typeof reason === "string") return reason;
    const code = typeof data === "object" && data !== null ? Reflect.get(data, "code") : undefined;
    if (typeof code === "string") return code;
  }
  return "failed";
}

function demoFailedText(reason: string): string {
  switch (reason) {
    case "rate_limited":
      return m.battle_replay_lab_rate_limited();
    case "busy":
      return m.battle_replay_lab_busy();
    default:
      return m.battle_replay_lab_failed();
  }
}

/** 서버 기록(tRPC battleReplay.demo) → 리플레이 읽기 → 경기장 지형 */
async function fetchDemoBattle(seed: number, onTerrain: () => void): Promise<DemoLoaded> {
  const response = await api.battleReplay.demo.query({ seed });
  const replay = decodeBattleReplay(replayFromBase64(response.replay));
  onTerrain();
  const ground = await loadReplayGround(replay.arena);
  return { watched: { replay, ground }, response };
}

export function BattleReplayTab(props: {
  /** 이 탭이 지금 보이는가(숨겨지면 WebGL 엔진을 내려 메모리를 비운다) */
  readonly active: boolean;
  /** 처음 열 때 고를 출처("demo"면 시범 6 대 6 시드 1을 바로 불러온다) */
  readonly initialSource?: ReplaySource;
  /** 전체 화면 창이 열려 있으면 인라인 엔진은 잠깐 내린다(엔진 하나 규칙) */
  readonly modalOpen: boolean;
  readonly watched: WatchedBattle | null;
  readonly watchedKey: string | null;
  readonly currentBattleKey: string;
  readonly matchupSummary: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly command: WatchCommand;
  readonly onRecordSetup: () => void;
  readonly onOpenFullscreen: () => void;
}) {
  const autoLoadDemo = props.initialSource === "demo";
  const [source, setSource] = useState<ReplaySource>(props.initialSource ?? "setup");
  const [seedText, setSeedText] = useState("1");
  const [demoStatus, setDemoStatus] = useState<DemoStatus>(() =>
    autoLoadDemo ? { kind: "loading", stage: "record" } : { kind: "idle" },
  );
  const requestRef = useRef(0);

  /** 낡은 요청(새 시드를 또 누름·화면을 닫음)의 결과는 버린다 */
  const startDemo = useCallback((targetSeed: number, request: number): void => {
    const live = () => request === requestRef.current;
    fetchDemoBattle(targetSeed, () => {
      if (live()) setDemoStatus({ kind: "loading", stage: "terrain" });
    }).then(
      (loaded) => {
        if (live()) setDemoStatus({ kind: "ready", loaded });
      },
      (error: unknown) => {
        if (live()) setDemoStatus({ kind: "failed", reason: reasonOf(error) });
      },
    );
  }, []);

  useEffect(() => {
    if (autoLoadDemo) {
      // 처음 상태가 이미 "기록 중"이라 여기서는 상태를 바꾸지 않는다
      startDemo(1, ++requestRef.current);
    }
    return () => {
      requestRef.current += 1;
    };
  }, [autoLoadDemo, startDemo]);

  const seed = Number(seedText);
  const seedValid = /^\d{1,10}$/.test(seedText) && seed >= 0 && seed <= BATTLE_REPLAY_SEED_MAX;
  const demoBusy = demoStatus.kind === "loading";
  const demoLoaded = demoStatus.kind === "ready" ? demoStatus.loaded : null;

  const loadDemo = (targetSeed: number = seed): void => {
    if (!seedValid || demoBusy) return;
    setDemoStatus({ kind: "loading", stage: "record" });
    startDemo(targetSeed, ++requestRef.current);
  };

  const selectSource = (next: ReplaySource): void => {
    setSource(next);
    if (next === "demo" && demoStatus.kind === "idle" && seedValid) {
      setDemoStatus({ kind: "loading", stage: "record" });
      startDemo(seed, ++requestRef.current);
    }
  };

  const stale = source === "setup" && props.watched !== null && props.watchedKey !== props.currentBattleKey;
  const activeWatched = source === "setup" ? props.watched : (demoLoaded?.watched ?? null);
  const showEngine = props.active && !props.modalOpen && activeWatched !== null;

  const statusAttr =
    source === "demo"
      ? demoStatus.kind
      : props.busy
        ? "loading"
        : props.error
          ? "failed"
          : props.watched
            ? "ready"
            : "idle";

  return (
    <div
      className="bl-replay-tab"
      data-source={source}
      data-status={statusAttr}
      data-seed={source === "demo" ? (demoLoaded?.response.seed ?? "") : (props.watched?.replay.seed ?? "")}
      data-bytes={source === "demo" ? (demoLoaded?.response.bytes ?? "") : ""}
      data-events={activeWatched?.replay.events.length ?? ""}
      data-arena={source === "demo" ? (demoLoaded?.response.arena ?? "") : ""}
      data-error={
        source === "demo" ? (demoStatus.kind === "failed" ? demoStatus.reason : "") : (props.error ?? "")
      }
    >
      <div className="bp-panel bl-replay-toolbar">
        <div className="bl-replay-sources" role="radiogroup" aria-label={m.dev_lab_replay_source_label()}>
          <button
            type="button"
            role="radio"
            className="rp-mode"
            aria-checked={source === "setup"}
            onClick={() => selectSource("setup")}
          >
            {m.dev_lab_replay_source_setup()}
          </button>
          <button
            type="button"
            role="radio"
            className="rp-mode"
            aria-checked={source === "demo"}
            onClick={() => selectSource("demo")}
          >
            {m.dev_lab_replay_source_demo()}
          </button>
        </div>

        {source === "setup" ? (
          <div className="bl-replay-bar">
            <span className="bl-replay-summary">{props.matchupSummary}</span>
            <div className="bl-replay-actions">
              <button
                type="button"
                className="button-primary button-small bl-replay-start"
                aria-disabled={props.busy}
                onClick={props.busy ? undefined : props.onRecordSetup}
              >
                {props.busy
                  ? m.dev_lab_watch_loading()
                  : props.watched
                    ? m.dev_lab_replay_reload()
                    : m.dev_lab_replay_start()}
              </button>
              {props.watched ? (
                <button
                  type="button"
                  className="button-small bl-replay-fullscreen"
                  onClick={props.onOpenFullscreen}
                >
                  {m.dev_lab_replay_fullscreen()}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <form
            className="bl-replay-bar bl-replay-demo-form"
            onSubmit={(event) => {
              event.preventDefault();
              loadDemo();
            }}
          >
            <label className="bl-quick-field bl-replay-demo-seed">
              <span>{m.battle_replay_lab_seed()}</span>
              <input
                className="input bl-quick-seed"
                inputMode="numeric"
                value={seedText}
                aria-invalid={!seedValid}
                onChange={(event) => setSeedText(event.currentTarget.value.trim())}
              />
            </label>
            <button
              type="submit"
              className="button-primary button-small"
              aria-disabled={!seedValid || demoBusy}
            >
              {demoBusy ? m.battle_replay_lab_loading() : m.battle_replay_lab_new()}
            </button>
            {demoLoaded ? (
              <span className="field-hint">
                {m.battle_replay_lab_stats({
                  bytes: demoLoaded.response.bytes,
                  events: demoLoaded.watched.replay.events.length,
                  ms: demoLoaded.response.ms,
                  arena:
                    demoLoaded.response.arena === "second_map"
                      ? m.battle_replay_lab_arena_map()
                      : m.battle_replay_lab_arena_plain(),
                })}
              </span>
            ) : null}
          </form>
        )}

        {stale ? <p className="field-hint bp-stale">{m.dev_lab_replay_stale()}</p> : null}
        {source === "setup" && props.error ? (
          <p role="alert" className="field-error">
            {props.error}
          </p>
        ) : null}
        {source === "demo" && demoStatus.kind === "failed" ? (
          <p role="alert" className="field-error">
            {demoFailedText(demoStatus.reason)}
          </p>
        ) : null}
      </div>

      {showEngine ? (
        <div className="bl-replay-stage">
          <Suspense fallback={<p className="field-hint bl-watch-loading">{m.dev_lab_watch_loading()}</p>}>
            <BattleReplayView
              key={`${source}:${activeWatched.replay.seed}:${activeWatched.replay.events.length}:${activeWatched.startAtMs ?? "start"}`}
              replay={activeWatched.replay}
              ground={activeWatched.ground}
              autoPlay={activeWatched.startAtMs === undefined}
              startAtMs={activeWatched.startAtMs}
              command={source === "setup" ? props.command : undefined}
            />
          </Suspense>
        </div>
      ) : (
        <div className="bp-panel bl-replay-empty">
          <p
            className="field-hint"
            role={source === "demo" && demoStatus.kind === "failed" ? "alert" : "status"}
          >
            {source === "setup"
              ? props.busy
                ? m.dev_lab_watch_loading()
                : m.dev_lab_replay_empty()
              : demoStatus.kind === "failed"
                ? demoFailedText(demoStatus.reason)
                : demoStatus.kind === "loading" && demoStatus.stage === "terrain"
                  ? m.battle_loading_terrain()
                  : m.battle_replay_lab_loading()}
          </p>
          <button
            type="button"
            className="button-primary button-small"
            aria-disabled={source === "setup" ? props.busy : demoBusy}
            onClick={source === "setup" ? props.onRecordSetup : () => loadDemo()}
          >
            {source === "setup" ? m.dev_lab_replay_start() : m.battle_replay_lab_new()}
          </button>
        </div>
      )}
    </div>
  );
}
