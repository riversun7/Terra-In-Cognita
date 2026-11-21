// 물류센터 자동 맡기기 스위치(설정 화면 한 줄) — 기획 D-576("설정으로 자동 맡기기를 켤 수 있다"), 기획 대조 2272(계정 설정 — 모든 기기에서 같게,
// D-6012 계정별 설정 선례), docs/adr/2026-11-16-logistics-center.md "바뀜 (haul-2)".
// - 서버 판정(via 없는 운반 명령)이 읽는 계정 설정이라 기기에 저장하지 않고 tRPC facilities.autoHaul(읽기)·setAutoHaul(쓰기)로 바로 서버에 둔다.
// - 서버가 아직 준비되지 않았으면(not_ready) 스위치를 막고 한 줄 알린다. 바꾸기에 실패하면 원래 값으로 두고 알린다.
import type { AutoHaulResponse } from "@terra/shared/logistics";
import { useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../sections/queryStore.ts";
import { useScreenQuery } from "../sections/useScreenQuery.ts";

async function loadAutoHaul(): Promise<QueryResult<AutoHaulResponse>> {
  try {
    const data = await api.facilities.autoHaul.query(undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}

export function AutoHaulSetting() {
  const inputId = useId();
  const nameId = useId();
  const hintId = useId();
  const { state } = useScreenQuery(loadAutoHaul);
  const [saved, setSaved] = useState<AutoHaulResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = saved ?? state.data;
  const ready = current?.status === "ready";
  const change = async (on: boolean): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      setSaved(
        await api.facilities.setAutoHaul.mutate(
          { on },
          { signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS) },
        ),
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="setting-row" htmlFor={inputId} data-part="settings-auto-haul">
      <span className="setting-text">
        <span className="setting-name" id={nameId}>
          {m.settings_auto_haul()}
        </span>
        <span className="setting-hint" id={hintId}>
          {m.settings_auto_haul_hint()}
        </span>
        {current?.status === "not_ready" ? (
          <span className="setting-hint" data-part="settings-auto-haul-unavailable">
            {m.settings_auto_haul_unavailable()}
          </span>
        ) : null}
        {failed ? (
          <span className="setting-hint" role="alert" data-part="settings-auto-haul-failed">
            {m.settings_auto_haul_failed()}
          </span>
        ) : null}
      </span>
      <input
        id={inputId}
        type="checkbox"
        name="auto-haul"
        role="switch"
        className="switch-input visually-hidden"
        checked={current?.on === true}
        disabled={!ready || busy}
        onChange={(event) => void change(event.target.checked)}
        aria-labelledby={nameId}
        aria-describedby={hintId}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
