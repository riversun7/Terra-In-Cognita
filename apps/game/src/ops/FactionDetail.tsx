// 운영자 콘솔 · 세력 상세 — 체제·기술·성향·연구, 도시, 전쟁·불가침, 자산(+ 지급·회수), 소속 유저, 유닛.
import type { OpsPermission } from "@terra/shared/ops";
import { useCallback } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { BalanceTable, GrantForm } from "./DetailParts.tsx";
import { CityTable } from "./NpcTabs.tsx";
import type { OpenDetail } from "./OpsConsole.tsx";
import { KeyValues, LoadState, formatInt, formatTime, useOpsLoad } from "./opsUi.tsx";
import { UnitTable } from "./UnitTable.tsx";

interface FactionDetailProps {
  factionId: number;
  can: (permission: OpsPermission) => boolean;
  open: OpenDetail;
}

export function FactionDetail({ factionId, can, open }: FactionDetailProps) {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.npcs.faction.query({ factionId }, { signal }), [factionId]),
  );
  const data = loaded.data;
  const factionLink = (id: number | null) =>
    id === null ? (
      m.ops_none()
    ) : (
      <button key={id} type="button" className="button-text" onClick={() => open({ kind: "faction", id })}>
        #{id}
      </button>
    );
  return (
    <div className="ops-stack">
      <h2 className="ops-h">{m.ops_detail_faction()}</h2>
      <LoadState loaded={loaded} />
      {data ? (
        <>
          <KeyValues
            rows={[
              [m.ops_col_name(), `${data.faction.name} (#${data.faction.id})`],
              [m.ops_col_kind(), data.faction.kind === "npc" ? m.ops_kind_npc() : m.ops_kind_player()],
              [m.ops_col_regime(), data.faction.regime],
              [m.ops_col_tech(), data.faction.techLevel],
              [m.ops_f_research(), formatInt(data.researchProgress)],
              [m.ops_f_ai_step(), formatInt(data.aiStep)],
              [m.ops_f_fixed(), data.faction.fixed ? m.ops_yes() : m.ops_no()],
              [m.ops_f_parent(), factionLink(data.faction.parentId)],
              [m.ops_f_born_of(), factionLink(data.bornOf)],
              [m.ops_f_rebel_of(), factionLink(data.rebelOf)],
              [m.ops_sec_traits(), data.traits ? data.traits.join(" · ") : m.ops_none()],
              [m.ops_f_owner_id(), data.faction.ownerId ?? m.ops_none()],
            ]}
          />
          <section>
            <h3 className="ops-h3">{m.ops_sec_cities()}</h3>
            {data.cities.length === 0 ? (
              <p className="dev-muted">{m.ops_empty()}</p>
            ) : (
              <CityTable rows={data.cities} open={open} />
            )}
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_wars()}</h3>
            {data.wars.length === 0 ? (
              <p className="dev-muted">{m.ops_empty()}</p>
            ) : (
              <ul className="ops-list">
                {data.wars.map((war) => (
                  <li key={war.otherId}>
                    <span className={war.state === "war" ? "dev-badge ops-bad" : "dev-badge"}>
                      {war.state === "war" ? m.ops_war() : m.ops_truce()}
                    </span>{" "}
                    <button
                      type="button"
                      className="button-text"
                      onClick={() => open({ kind: "faction", id: war.otherId })}
                    >
                      {war.otherName}
                    </button>{" "}
                    <span className="dev-muted">{formatTime(war.atMs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_balances()}</h3>
            <BalanceTable rows={data.balances} />
            {can("ledger_grant") && data.faction.ownerId !== null ? (
              <details className="ops-details">
                <summary>{m.ops_sec_grant()}</summary>
                <GrantForm ownerId={data.faction.ownerId} target={data.faction.name} onDone={loaded.reload} />
              </details>
            ) : null}
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_members()}</h3>
            {data.members.length === 0 ? (
              <p className="dev-muted">{m.ops_empty()}</p>
            ) : (
              <ul className="ops-list">
                {data.members.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="button-text dev-code"
                      translate="no"
                      onClick={() => open({ kind: "user", id: member.id })}
                    >
                      {member.loginId}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_units()}</h3>
            {data.units.length === 0 ? (
              <p className="dev-muted">{m.ops_empty()}</p>
            ) : (
              <UnitTable rows={data.units} open={open} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
