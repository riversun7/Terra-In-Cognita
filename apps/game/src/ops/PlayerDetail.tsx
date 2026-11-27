// 운영자 콘솔 · 유저 상세 — 계정(역할·세션·정지), 사이보그(스탯·성장·속성·신앙), 자산, 유닛, 보유 물건, 스킬, 최근 감사 기록.
// 통제: 강제 로그아웃(account_kick), 정지·해제(account_ban, 사유·기간), 자원 지급·회수(ledger_grant). 자기 계정은 서버가 막는다.
import type { OpsPermission } from "@terra/shared/ops";
import { useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { BalanceTable, GrantForm, ItemTable, SkillTable, StatLine } from "./DetailParts.tsx";
import type { OpenDetail } from "./OpsConsole.tsx";
import {
  ActionButton,
  KeyValues,
  LoadState,
  formatInt,
  formatTime,
  resultText,
  useOpsLoad,
} from "./opsUi.tsx";
import { UnitTable } from "./UnitTable.tsx";
import { AuditTable } from "./AuditTab.tsx";

interface PlayerDetailProps {
  userId: string;
  viewerId: string;
  can: (permission: OpsPermission) => boolean;
  open: OpenDetail;
}

export function PlayerDetail({ userId, viewerId, can, open }: PlayerDetailProps) {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.players.get.query({ userId }, { signal }), [userId]),
  );
  const reasonId = useId();
  const hoursId = useId();
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("");
  const data = loaded.data;
  const self = userId === viewerId;
  return (
    <div className="ops-stack">
      <h2 className="ops-h">{m.ops_detail_player()}</h2>
      <LoadState loaded={loaded} />
      {data ? (
        <>
          <section>
            <h3 className="ops-h3">{m.ops_sec_account()}</h3>
            <KeyValues
              rows={[
                [
                  m.ops_f_login(),
                  <span key="id" className="dev-code" translate="no">
                    {data.player.loginId}
                  </span>,
                ],
                [m.ops_f_roles(), data.player.roles.join(", ")],
                [m.ops_col_status(), data.player.online ? m.ops_status_online() : m.ops_status_offline()],
                [m.ops_f_created(), formatTime(data.player.createdAt)],
                [m.ops_f_sessions(), formatInt(data.sessions.count)],
                [m.ops_f_last_seen(), formatTime(data.sessions.lastSeen ?? data.player.offlineSinceMs)],
                [
                  m.ops_f_ban(),
                  data.player.banned
                    ? m.ops_f_ban_value({
                        reason: data.player.banReason ?? m.ops_none(),
                        until: data.player.banExpires
                          ? formatTime(data.player.banExpires)
                          : m.ops_f_ban_forever(),
                      })
                    : m.ops_no(),
                ],
                [
                  m.ops_col_faction(),
                  data.player.factionId === null ? (
                    m.ops_none()
                  ) : (
                    <button
                      key="f"
                      type="button"
                      className="button-text"
                      onClick={() =>
                        data.player.factionId === null
                          ? undefined
                          : open({ kind: "faction", id: data.player.factionId })
                      }
                    >
                      {data.player.factionName}
                    </button>
                  ),
                ],
                [m.ops_f_owner_id(), data.player.ownerId ?? m.ops_none()],
              ]}
            />
          </section>
          {!self && (can("account_kick") || can("account_ban")) ? (
            <section className="ops-controls">
              <h3 className="ops-h3">{m.ops_sec_controls()}</h3>
              <div className="ops-form">
                <label htmlFor={reasonId}>{m.ops_reason()}</label>
                <input
                  id={reasonId}
                  className="input"
                  maxLength={200}
                  value={reason}
                  aria-describedby={`${reasonId}-hint`}
                  onChange={(event) => setReason(event.target.value)}
                />
                <span id={`${reasonId}-hint`} className="dev-muted">
                  {m.ops_reason_hint()}
                </span>
                {can("account_ban") ? (
                  <>
                    <label htmlFor={hoursId}>{m.ops_act_ban_hours()}</label>
                    <input
                      id={hoursId}
                      className="input ops-narrow"
                      inputMode="numeric"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                    />
                  </>
                ) : null}
              </div>
              <div className="ops-actions">
                {can("account_kick") ? (
                  <ActionButton
                    label={m.ops_act_kick()}
                    target={data.player.loginId}
                    run={async () => {
                      const result = await api.ops.accounts.kick.mutate({ userId });
                      return result.ok ? null : resultText(result.code);
                    }}
                    onDone={loaded.reload}
                  />
                ) : null}
                {can("account_ban") ? (
                  <ActionButton
                    danger={!data.player.banned}
                    label={data.player.banned ? m.ops_act_unban() : m.ops_act_ban()}
                    target={data.player.loginId}
                    run={async () => {
                      const parsed = /^[1-9][0-9]{0,4}$/.test(hours.trim()) ? Number(hours.trim()) : null;
                      const result = await api.ops.accounts.ban.mutate({
                        userId,
                        banned: !data.player.banned,
                        reason,
                        hours: parsed,
                      });
                      return result.ok ? null : resultText(result.code);
                    }}
                    onDone={loaded.reload}
                  />
                ) : null}
              </div>
            </section>
          ) : null}
          {data.cyborg ? (
            <section>
              <h3 className="ops-h3">{m.ops_sec_cyborg()}</h3>
              <KeyValues
                rows={[
                  [
                    m.ops_col_name(),
                    data.cyborg.unitId === null ? (
                      <span key="n" translate="no">
                        {data.cyborg.name}
                      </span>
                    ) : (
                      <button
                        key="n"
                        type="button"
                        className="button-text"
                        translate="no"
                        onClick={() =>
                          data.cyborg?.unitId === null || data.cyborg?.unitId === undefined
                            ? undefined
                            : open({ kind: "unit", id: data.cyborg.unitId })
                        }
                      >
                        {data.cyborg.name}
                      </button>
                    ),
                  ],
                  [m.ops_f_temperament(), data.cyborg.temperament],
                  [m.ops_f_level_exp(), m.ops_f_of({ a: data.cyborg.level, b: formatInt(data.cyborg.exp) })],
                  [m.ops_f_rebirths(), data.cyborg.rebirths],
                  [
                    m.ops_f_faith(),
                    m.ops_f_of({ a: data.cyborg.faith, b: formatInt(data.cyborg.faithPoints) }),
                  ],
                  [m.ops_f_religion(), data.cyborg.religion ?? m.ops_none()],
                  [m.ops_f_start_city(), data.cyborg.startCityId],
                  [
                    m.ops_sec_stats(),
                    <StatLine key="s" values={data.cyborg.initial} extra={data.cyborg.kPm} />,
                  ],
                  [
                    m.ops_sec_elements(),
                    data.cyborg.elements ? data.cyborg.elements.join(" · ") : m.ops_none(),
                  ],
                ]}
              />
            </section>
          ) : null}
          <section>
            <h3 className="ops-h3">{m.ops_sec_balances()}</h3>
            <BalanceTable rows={data.balances} />
            {can("ledger_grant") && data.player.ownerId !== null ? (
              <details className="ops-details">
                <summary>{m.ops_sec_grant()}</summary>
                <GrantForm
                  ownerId={data.player.ownerId}
                  target={data.player.loginId}
                  onDone={loaded.reload}
                />
              </details>
            ) : null}
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_units()}</h3>
            {data.units.length === 0 ? (
              <p className="dev-muted">{m.ops_empty()}</p>
            ) : (
              <UnitTable rows={data.units} open={open} />
            )}
            {data.player.ownerId !== null && data.units.length > 0 ? (
              <button
                type="button"
                className="button-small"
                onClick={() =>
                  data.player.ownerId === null
                    ? undefined
                    : open({
                        kind: "units",
                        ownerId: data.player.ownerId,
                        ownerKind: "user",
                        label: data.player.loginId,
                      })
                }
              >
                {m.ops_link_units_all()}
              </button>
            ) : null}
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_items()}</h3>
            <ItemTable rows={data.items} />
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_skills()}</h3>
            <SkillTable rows={data.skills} />
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_audit()}</h3>
            <AuditTable rows={data.audit} open={open} />
          </section>
        </>
      ) : null}
    </div>
  );
}
