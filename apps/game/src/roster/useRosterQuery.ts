// 유닛·사이보그 화면 자료 받기(tRPC units.list·cyborg.get) — 화면을 열 때, 시안 자료 스위치가 바뀔 때, [다시 시도],
// 다시 보일 때 마지막으로 받은 지 60초가 넘었으면 다시 받는다(홈과 같은 규칙, ADR 37 6절. 주기 타이머는 두지 않는다).
// 실패는 값으로 둔다(문구 키는 net/apiErrors.ts). 로그인이 끝났으면 세션을 다시 확인한다(틀이 로그인 화면으로 보낸다).
// 지연 조각 안에서만 쓴다(tRPC 클라이언트 net/api.ts는 첫 화면 묶음에 들어가지 않는다).
import type { CyborgGetResponse, UnitsListResponse } from "@terra/shared/roster";
import { useCallback, useEffect, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

/** 응답이 오지 않으면 끊는 시간 */
const REQUEST_TIMEOUT_MS = 10_000;
/** 다시 보일 때 다시 받는 기준(홈 INBOX_STALE_MS와 같은 값) */
export const ROSTER_STALE_MS = 60_000;

export type RosterState<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "error"; readonly error: PlainMessageKey };

type Loader<T> = (preview: boolean, signal: AbortSignal) => Promise<T>;

export const loadUnits: Loader<UnitsListResponse> = (preview, signal) =>
  api.units.list.query(preview ? { preview: true } : undefined, { signal });

export const loadCyborg: Loader<CyborgGetResponse> = (preview, signal) =>
  api.cyborg.get.query(preview ? { preview: true } : undefined, { signal });

interface Held<T> {
  /** 어느 요청(시안 여부·차례)의 결과인지. 지금 요청과 다르면 받는 중으로 본다 */
  readonly key: string;
  readonly state: RosterState<T>;
}

export interface RosterQuery<T> {
  readonly state: RosterState<T>;
  /** 다시 받기([다시 시도]) */
  readonly reload: () => void;
}

export function useRosterQuery<T>(load: Loader<T>, preview: boolean): RosterQuery<T> {
  const [version, setVersion] = useState(0);
  const key = `${preview ? "preview" : "own"}:${version}`;
  const [held, setHeld] = useState<Held<T> | null>(null);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    // 이 효과가 끝나면(다른 요청·화면 떠남) 늦게 온 답은 버린다. 시간 초과로 끊은 것은 실패로 보인다
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    load(preview, controller.signal).then(
      (data) => {
        if (active) setHeld({ key, state: { status: "ready", data } });
      },
      (error: unknown) => {
        if (!active) return;
        const info = apiErrorInfo(error);
        if (info.sessionEnded) void refreshSession();
        setHeld({ key, state: { status: "error", error: info.key } });
      },
    );
    const receivedAt = Date.now();
    const onVisible = (): void => {
      if (document.visibilityState === "visible" && Date.now() - receivedAt > ROSTER_STALE_MS) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, preview, key, reload]);

  // 다시 받는 동안에는 앞 결과를 그대로 그린다(같은 시안 여부일 때만). 처음·시안 여부가 바뀌면 받는 중
  const samePreview = held !== null && held.key.split(":")[0] === key.split(":")[0];
  const state: RosterState<T> =
    held?.key === key || (samePreview && held.state.status === "ready") ? held.state : { status: "loading" };
  return { state, reload };
}
