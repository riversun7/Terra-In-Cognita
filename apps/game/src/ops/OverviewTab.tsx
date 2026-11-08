// 운영자 콘솔 · 현황 탭 — 서버(가동·메모리·연결)·월드(상태·위반·유닛)·사람과 세력 수·최근 24시간, 자동 경보(기획 D-7025 "자동 경보").
// 경보 기준은 S3 규모 시험 기준(RSS 900MB, ADR 2026-10-31-s3-server-stage)과 불변 조건 위반·월드 준비를 쓴다[임시: 기획 기준이 생기면 바꾼다].
import type { OpsServerOverview } from "@terra/shared/ops";
import { useCallback } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { KeyValues, LoadState, formatInt, formatTime, useOpsLoad } from "./opsUi.tsx";

/** 경보: 메모리 기준(MB) */
const MEMORY_ALERT_MB = 900;
/** 경보: 24시간 기기 오류 수 기준 */
const CLIENT_ERROR_ALERT = 50;

function stateText(state: OpsServerOverview["world"]["state"]): string {
  switch (state) {
    case "ready":
      return m.ops_state_ready();
    case "recovering":
      return m.ops_state_recovering();
    case "failed":
      return m.ops_state_failed();
    default:
      return m.ops_state_none();
  }
}

export function alertsOf(view: OpsServerOverview): string[] {
  const alerts: string[] = [];
  if (view.world.state !== "ready") alerts.push(m.ops_alert_world());
  if (view.world.issues > 0) alerts.push(m.ops_alert_issues({ count: view.world.issues }));
  if (view.recent.clientErrors24h >= CLIENT_ERROR_ALERT)
    alerts.push(m.ops_alert_errors({ count: view.recent.clientErrors24h }));
  if (view.memory.rssMb >= MEMORY_ALERT_MB) alerts.push(m.ops_alert_memory({ rss: view.memory.rssMb }));
  return alerts;
}

export function OverviewTab() {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.overview.query(undefined, { signal }), []),
  );
  const view = loaded.data;
  const alerts = view ? alertsOf(view) : [];
  return (
    <div className="ops-stack">
      <div className="ops-toolbar">
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
        {view ? <span className="dev-muted">{formatTime(view.nowMs)}</span> : null}
      </div>
      <LoadState loaded={loaded} />
      {view ? (
        <>
          <section className="ops-card" aria-label={m.ops_ov_alerts()}>
            <h2 className="ops-h">{m.ops_ov_alerts()}</h2>
            {alerts.length === 0 ? (
              <p className="dev-muted">{m.ops_alert_none()}</p>
            ) : (
              <ul className="ops-alerts">
                {alerts.map((alert) => (
                  <li key={alert}>{alert}</li>
                ))}
              </ul>
            )}
          </section>
          <div className="ops-grid">
            <section className="ops-card">
              <h2 className="ops-h">{m.ops_ov_server()}</h2>
              <KeyValues
                rows={[
                  [
                    m.ops_ov_uptime(),
                    m.ops_ov_uptime_value({
                      hours: Math.floor(view.uptimeSec / 3600),
                      minutes: Math.floor((view.uptimeSec % 3600) / 60),
                    }),
                  ],
                  [
                    m.ops_ov_memory(),
                    m.ops_ov_memory_value({ rss: view.memory.rssMb, heap: view.memory.heapUsedMb }),
                  ],
                  [m.ops_ov_ws(), formatInt(view.wsConnections)],
                ]}
              />
            </section>
            <section className="ops-card">
              <h2 className="ops-h">{m.ops_ov_world()}</h2>
              <KeyValues
                rows={[
                  [m.ops_ov_world(), stateText(view.world.state)],
                  [m.ops_ov_world_issues(), formatInt(view.world.issues)],
                  [m.ops_ov_maps(), formatInt(view.world.maps)],
                  [
                    m.ops_ov_units(),
                    m.ops_ov_pair({ a: formatInt(view.world.units), b: formatInt(view.world.moving) }),
                  ],
                  [m.ops_ov_npc_runtime(), view.world.npcRuntime ? m.ops_yes() : m.ops_no()],
                ]}
              />
            </section>
            <section className="ops-card">
              <h2 className="ops-h">{m.ops_ov_people()}</h2>
              <KeyValues
                rows={[
                  [
                    m.ops_ov_users(),
                    m.ops_ov_pair({ a: formatInt(view.counts.users), b: formatInt(view.counts.bannedUsers) }),
                  ],
                  [m.ops_ov_online(), formatInt(view.counts.online)],
                  [m.ops_ov_cyborgs(), formatInt(view.counts.cyborgs)],
                  [
                    m.ops_ov_factions(),
                    m.ops_f_of({
                      a: formatInt(view.counts.factionsNpc),
                      b: formatInt(view.counts.factionsPlayer),
                    }),
                  ],
                  [m.ops_ov_cities(), formatInt(view.counts.cities)],
                  [m.ops_ov_humans(), formatInt(view.counts.humans)],
                  [m.ops_ov_buildings(), formatInt(view.counts.buildings)],
                  [m.ops_ov_wars(), formatInt(view.counts.wars)],
                ]}
              />
            </section>
            <section className="ops-card">
              <h2 className="ops-h">{m.ops_ov_recent()}</h2>
              <KeyValues
                rows={[
                  [m.ops_ov_errors(), formatInt(view.recent.clientErrors24h)],
                  [m.ops_ov_audit(), formatInt(view.recent.audit24h)],
                  [m.ops_ov_signups(), formatInt(view.recent.signups24h)],
                ]}
              />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
