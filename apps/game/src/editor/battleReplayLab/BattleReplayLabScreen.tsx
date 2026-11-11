// 개발자 전투 다시보기(/dev/battle-replay) — docs/adr/2026-11-01-battle-replay.md 7절. dev·admin, 틀 숨김(화면 전체).
// 시드를 넣고 [새 전투] → 서버가 시범 6 대 6을 기록(tRPC battleReplay.demo, 워커) → 경기장 지형(시험 2차맵 지형 파일, 없으면 평지) →
// BattleReplayView가 재생한다. 보기 전용: 게임 상태를 바꾸지 않는다.
// 조각 이름 BattleReplayLabScreen-*(미리 캐시 규칙 [Bb]attleReplayLab). 보기 화면(src/battle/)은 개발자 소스가 아니다(나중에 결과 화면이 쓴다).
// 시험·측정용 data-*: data-status(loading·ready·failed), data-seed, data-bytes, data-events, data-arena, data-error.
import type { BattleReplayDemoResponse } from "@terra/shared/battleReplay";
import { BATTLE_REPLAY_SEED_MAX } from "@terra/shared/battleReplay";
import { type BattleReplay, decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef, useState } from "react";
import BattleReplayView from "../../battle/BattleReplayView.tsx";
import { type ReplayGround, loadReplayGround } from "../../battle/replayTerrain.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import ScopeBar from "../../scope/ScopeBar.tsx";
import "./battleReplayLab.css";

type Loaded = {
  readonly replay: BattleReplay;
  readonly ground: ReplayGround;
  readonly response: BattleReplayDemoResponse;
};

type Status =
  | { readonly kind: "loading"; readonly stage: "record" | "terrain" }
  | { readonly kind: "ready"; readonly loaded: Loaded }
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

/** 서버 기록(tRPC battleReplay.demo) → 리플레이 읽기 → 경기장 지형. onTerrain = 지형을 받기 시작할 때 */
async function fetchBattle(seed: number, onTerrain: () => void): Promise<Loaded> {
  const response = await api.battleReplay.demo.query({ seed });
  const replay = decodeBattleReplay(replayFromBase64(response.replay));
  onTerrain();
  const ground = await loadReplayGround(replay.arena);
  return { replay, ground, response };
}

function failedText(reason: string): string {
  switch (reason) {
    case "rate_limited":
      return m.battle_replay_lab_rate_limited();
    case "busy":
      return m.battle_replay_lab_busy();
    default:
      return m.battle_replay_lab_failed();
  }
}

export default function BattleReplayLabScreen({ onClose }: { onClose: () => void }) {
  const [seedText, setSeedText] = useState("1");
  const [status, setStatus] = useState<Status>({ kind: "loading", stage: "record" });
  const requestRef = useRef(0);

  /** [새 전투]·처음: 낡은 부탁(새 전투를 또 누름·화면을 닫음)의 결과는 버린다 */
  const start = useCallback((seed: number, request: number): void => {
    const live = () => request === requestRef.current;
    fetchBattle(seed, () => {
      if (live()) setStatus({ kind: "loading", stage: "terrain" });
    }).then(
      (loaded) => {
        if (live()) setStatus({ kind: "ready", loaded });
      },
      (error: unknown) => {
        if (live()) setStatus({ kind: "failed", reason: reasonOf(error) });
      },
    );
  }, []);

  useEffect(() => {
    // 처음 상태가 이미 "기록 중"이라 여기서는 상태를 바꾸지 않는다
    start(1, ++requestRef.current);
    return () => {
      requestRef.current += 1;
    };
  }, [start]);

  const load = (seed: number): void => {
    setStatus({ kind: "loading", stage: "record" });
    start(seed, ++requestRef.current);
  };

  const seed = Number(seedText);
  const seedValid = /^\d{1,10}$/.test(seedText) && seed >= 0 && seed <= BATTLE_REPLAY_SEED_MAX;
  const loaded = status.kind === "ready" ? status.loaded : null;

  return (
    <section
      className="brl-screen"
      aria-labelledby="brl-title"
      data-density="compact"
      data-status={status.kind}
      data-seed={loaded?.response.seed ?? ""}
      data-bytes={loaded?.response.bytes ?? ""}
      data-events={loaded?.replay.events.length ?? ""}
      data-arena={loaded?.response.arena ?? ""}
      data-error={status.kind === "failed" ? status.reason : ""}
    >
      <header className="brl-header">
        <button type="button" className="button-small" onClick={onClose}>
          {m.map_back()}
        </button>
        <h1 id="brl-title" className="brl-title" tabIndex={-1}>
          {m.shell_route_dev_battle_replay()}
        </h1>
        <form
          className="brl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (seedValid) load(seed);
          }}
        >
          <label className="brl-seed">
            <span>{m.battle_replay_lab_seed()}</span>
            <input
              className="input"
              inputMode="numeric"
              value={seedText}
              aria-invalid={!seedValid}
              onChange={(event) => setSeedText(event.currentTarget.value.trim())}
            />
          </label>
          <button type="submit" className="button-small button-primary" aria-disabled={!seedValid}>
            {m.battle_replay_lab_new()}
          </button>
        </form>
        <ScopeBar route="dev_battle_replay" inline />
      </header>
      {loaded ? (
        <p className="brl-stats">
          {m.battle_replay_lab_stats({
            bytes: loaded.response.bytes,
            events: loaded.replay.events.length,
            ms: loaded.response.ms,
            arena:
              loaded.response.arena === "second_map"
                ? m.battle_replay_lab_arena_map()
                : m.battle_replay_lab_arena_plain(),
          })}
        </p>
      ) : null}
      {loaded ? (
        <BattleReplayView
          key={`${loaded.response.seed}:${loaded.response.replay.length}`}
          replay={loaded.replay}
          ground={loaded.ground}
        />
      ) : (
        <p className="status brl-center" role={status.kind === "failed" ? "alert" : "status"}>
          {status.kind === "failed"
            ? failedText(status.reason)
            : status.kind === "loading" && status.stage === "terrain"
              ? m.battle_loading_terrain()
              : m.battle_replay_lab_loading()}
        </p>
      )}
    </section>
  );
}
