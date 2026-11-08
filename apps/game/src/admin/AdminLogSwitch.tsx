// 관리자 화면 · 로그 스위치(docs/adr/2026-11-08-operator-roles-log-switch.md) — 조회 감사 기록(2차맵 전체 보기·행성 정의 조회)을
// 켜고 끈다. 기본 꺼짐(개발 단계에 쓸모없는 줄이 쌓이지 않게, 사용자 요청 2026-11-08). 계정·통제·편집 저장 기록은 늘 남는다.
// 권한은 운영 권한 log_switch(관리자·개발자). 권한이 없거나 서버가 운영 기능을 안 켰으면 판을 숨긴다.
import { useCallback, useState } from "react";
import { api } from "../net/api.ts";
import { errorText, useOpsLoad } from "../ops/opsUi.tsx";
import { m } from "../paraglide/messages.js";

export function AdminLogSwitch() {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.switches.list.query(undefined, { signal }), []),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const viewAudit = loaded.data?.find((row) => row.id === "view_audit");
  if (!viewAudit) return null;
  const on = viewAudit.enabled;

  async function toggle(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.ops.switches.set.mutate({ id: "view_audit", enabled: !on });
      if (!result.ok) setMessage(m.ops_res_failed());
      loaded.reload();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-switches-section">
      <div className="admin-section-head">
        <div>
          <h2 className="admin-subtitle">{m.admin_log_title()}</h2>
          <p className="admin-section-sub">{m.admin_log_lead()}</p>
        </div>
      </div>
      <article
        className="admin-switch-card"
        data-switch-id="view_audit"
        data-state={on ? "active" : "paused"}
      >
        <div className="admin-switch-top">
          <div className="admin-switch-title-group">
            <div className="admin-switch-title-row">
              <h3 className="admin-switch-title">{m.admin_log_view_audit()}</h3>
              <span className="admin-state-pill" data-state={on ? "active" : "paused"}>
                {on ? m.admin_log_on() : m.admin_log_off()}
              </span>
            </div>
            <p className="admin-switch-sub">{m.admin_log_view_audit_sub()}</p>
          </div>
          <button
            type="button"
            className={on ? "button-small" : "button-small button-primary"}
            aria-pressed={on}
            aria-disabled={busy}
            onClick={() => void toggle()}
          >
            {on ? m.admin_log_turn_off() : m.admin_log_turn_on()}
          </button>
        </div>
        {message ? (
          <p role="alert" className="field-error">
            {message}
          </p>
        ) : null}
      </article>
    </div>
  );
}
