// 3D 전투 관람·리플레이 공용 상태 — [전투 테스트]·[3D 전투 · 리플레이]·[보고서 기록] 탭이 함께 쓴다.
// WebGL 엔진은 한 번에 하나만 띄운다: 전체 화면 창(modalOpen)이 열려 있으면 탭 안 인라인 엔진은 내린다.
import type { LabBattleInput } from "@terra/shared/battleLab";
import { decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
import { useCallback, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import type { BattleCommandIssue } from "../../../battle/battleCommands.ts";
import { loadReplayGround } from "../../../battle/replayTerrain.ts";
import { api } from "../../../net/api.ts";
import type { WatchedBattle } from "./ReplayOverlay.tsx";
import { labErrorOf } from "./labModel.ts";
import { labErrorText } from "./labMessages.ts";

export interface WatchBattleController {
  readonly watched: WatchedBattle | null;
  readonly watchedKey: string | null;
  readonly modalOpen: boolean;
  readonly busy: boolean;
  readonly commandBusy: boolean;
  readonly issued: readonly BattleCommandIssue[];
  readonly error: string | null;
  readonly record: (
    input: LabBattleInput,
    key: string,
    options?: { readonly openModal?: boolean; readonly onError?: (message: string) => void },
  ) => Promise<boolean>;
  readonly issueCommand: (
    issue: BattleCommandIssue,
    nextInput: LabBattleInput,
    nextKey: string,
    onError?: (message: string) => void,
  ) => void;
  readonly openModal: () => void;
  readonly closeModal: () => void;
  readonly clearError: () => void;
}

export function useWatchBattle(): WatchBattleController {
  const [watched, setWatched] = useState<WatchedBattle | null>(null);
  const [watchedKey, setWatchedKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commandBusy, setCommandBusy] = useState(false);
  const [issued, setIssued] = useState<readonly BattleCommandIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFailure = useCallback((cause: unknown, onError?: (message: string) => void) => {
    const info = labErrorOf(cause);
    if (info.sessionEnded) void refreshSession();
    const message = labErrorText(info.key);
    setError(message);
    onError?.(message);
  }, []);

  const record = useCallback(
    async (
      input: LabBattleInput,
      key: string,
      options?: { readonly openModal?: boolean; readonly onError?: (message: string) => void },
    ): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      try {
        const result = await api.battleLab.replay.mutate(input);
        const replay = decodeBattleReplay(replayFromBase64(result.replay));
        const ground = await loadReplayGround(replay.arena);
        setIssued([]);
        setWatched({ replay, ground });
        setWatchedKey(key);
        if (options?.openModal) setModalOpen(true);
        return true;
      } catch (cause: unknown) {
        handleFailure(cause, options?.onError);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, handleFailure],
  );

  const issueCommand = useCallback(
    (
      issue: BattleCommandIssue,
      nextInput: LabBattleInput,
      nextKey: string,
      onError?: (message: string) => void,
    ): void => {
      if (!watched || commandBusy) return;
      setIssued((current) => [...current, issue]);
      setCommandBusy(true);
      setError(null);
      api.battleLab.replay
        .mutate(nextInput)
        .then(async (result) => {
          const replay = decodeBattleReplay(replayFromBase64(result.replay));
          const ground = await loadReplayGround(replay.arena);
          setWatched({ replay, ground, startAtMs: issue.atMs });
          setWatchedKey(nextKey);
        })
        .catch((cause: unknown) => handleFailure(cause, onError))
        .finally(() => setCommandBusy(false));
    },
    [watched, commandBusy, handleFailure],
  );

  const openModal = useCallback(() => {
    if (watched) setModalOpen(true);
  }, [watched]);

  const closeModal = useCallback(() => setModalOpen(false), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    watched,
    watchedKey,
    modalOpen,
    busy,
    commandBusy,
    issued,
    error,
    record,
    issueCommand,
    openModal,
    closeModal,
    clearError,
  };
}
