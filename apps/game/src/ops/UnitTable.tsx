// 운영자 콘솔 · 유닛 표(유닛 탭·유저 상세·세력 상세가 같이 쓴다). ID·이름 → 유닛 상세, 주인 → 유저·세력 상세,
// 위치는 짧게 보이고 누르면 전체 위치와 [이 2차맵의 유닛]을 펼친다. 칸은 좁게 둔다(자세한 것은 유닛 상세).
// 유닛 탭에서는 칸 머리(ID·레벨·피로)를 눌러 정렬하고, 작업·상태 표지를 눌러 그 상태로 거른다(onSort·onState가 있을 때만).
import type { OpsUnitRow, OpsUnitSort, OpsUnitState } from "@terra/shared/ops";
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { injuryStageName } from "../roster/InjuryBadge.tsx";
import type { OpenDetail } from "./OpsConsole.tsx";
import { WhereCell, formatInt, jobLabel, phaseLabel, unitKindLabel } from "./opsUi.tsx";

export interface UnitSort {
  key: OpsUnitSort;
  desc: boolean;
}

interface UnitTableProps {
  rows: readonly OpsUnitRow[];
  open: OpenDetail;
  /** 지금 정렬(유닛 탭만) */
  sort?: UnitSort | undefined;
  /** 칸 머리를 눌렀다(없으면 칸 머리는 글자만) */
  onSort?: ((key: OpsUnitSort) => void) | undefined;
  /** 작업·상태 표지를 눌렀다(없으면 표지는 글자만) */
  onState?: ((state: OpsUnitState) => void) | undefined;
}

function OwnerCell({ row, open }: { row: OpsUnitRow; open: OpenDetail }) {
  const { ownerUserId, ownerFactionId } = row;
  if (ownerUserId)
    return (
      <>
        <span className="dev-badge">{m.ops_owner_user()}</span>{" "}
        <button type="button" className="button-text" onClick={() => open({ kind: "user", id: ownerUserId })}>
          {row.ownerLabel}
        </button>
      </>
    );
  if (typeof ownerFactionId === "number")
    return (
      <button
        type="button"
        className="button-text"
        title={m.ops_owner_faction()}
        onClick={() => open({ kind: "faction", id: ownerFactionId })}
      >
        {row.ownerLabel}
      </button>
    );
  return <>{row.ownerLabel}</>;
}

/** 칸 머리: 정렬할 수 있으면 누르는 단추(지금 정렬 칸은 ▲·▼) */
function SortHead({
  label,
  column,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  column: OpsUnitSort;
  sort: UnitSort | undefined;
  onSort: ((key: OpsUnitSort) => void) | undefined;
  numeric?: boolean | undefined;
}) {
  const active = sort?.key === column;
  return (
    <th
      scope="col"
      className={numeric ? "dev-num" : undefined}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
    >
      {onSort ? (
        <button
          type="button"
          className="button-text ops-sort"
          title={m.ops_sort_by({ column: label })}
          onClick={() => onSort(column)}
        >
          {label}
          {active ? (sort.desc ? " ▼" : " ▲") : ""}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

/** 상태 표지: 거를 수 있으면 누르는 단추 */
function StateBadge({
  state,
  bad,
  onState,
  children,
}: {
  state: OpsUnitState;
  bad?: boolean | undefined;
  onState: ((state: OpsUnitState) => void) | undefined;
  children: ReactNode;
}) {
  const className = bad ? "dev-badge ops-bad" : "dev-badge";
  if (!onState) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      className={`${className} ops-badge-button`}
      data-ops-state={state}
      onClick={() => onState(state)}
    >
      {children}
    </button>
  );
}

export function UnitTable({ rows, open, sort, onSort, onState }: UnitTableProps) {
  return (
    <div className="dev-table-wrap">
      <table className="dev-table ops-nowrap">
        <thead>
          <tr>
            <SortHead label={m.ops_col_num()} column="id" sort={sort} onSort={onSort} numeric />
            <th scope="col">{m.ops_col_name()}</th>
            <th scope="col">{m.ops_col_kind()}</th>
            <th scope="col">{m.ops_col_owner()}</th>
            <th scope="col">{m.ops_col_where()}</th>
            <SortHead label={m.ops_col_level_exp()} column="level" sort={sort} onSort={onSort} />
            <th scope="col" title={m.ops_stats_order()}>
              {m.ops_col_stats()}
            </th>
            <th scope="col">{m.ops_col_work()}</th>
            <SortHead label={m.ops_col_fatigue()} column="fatigue" sort={sort} onSort={onSort} numeric />
            <th scope="col">{m.ops_col_status()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const working = row.job && row.job.kind !== 0 ? row.job.phase === 0 : row.npcWork === "work";
            const hasWork = (row.job && row.job.kind !== 0) || Boolean(row.npcWork);
            return (
              <tr key={row.id}>
                <td className="dev-num">
                  <button
                    type="button"
                    className="button-text"
                    onClick={() => open({ kind: "unit", id: row.id })}
                  >
                    {row.id}
                  </button>
                </td>
                <td translate="no">
                  {row.name ? (
                    <button
                      type="button"
                      className="button-text"
                      onClick={() => open({ kind: "unit", id: row.id })}
                    >
                      {row.name}
                    </button>
                  ) : (
                    m.ops_none()
                  )}
                </td>
                <td>{unitKindLabel(row.kind)}</td>
                <td translate="no">
                  <OwnerCell row={row} open={open} />
                </td>
                <td>
                  <WhereCell where={row} open={open} />
                </td>
                <td className="dev-code">
                  {row.growth ? (
                    <>
                      {row.growth.level}{" "}
                      <span className="dev-muted">
                        {row.growth.source === "baseline"
                          ? m.ops_none()
                          : row.growth.expSpan > 0
                            ? m.ops_f_of({ a: formatInt(row.growth.exp), b: formatInt(row.growth.expSpan) })
                            : m.ops_exp_max()}
                      </span>
                    </>
                  ) : (
                    m.ops_none()
                  )}
                </td>
                <td className="dev-code" title={m.ops_stats_order()}>
                  {row.growth ? row.growth.stats.join("·") : m.ops_none()}
                </td>
                <td>
                  {hasWork ? (
                    <StateBadge state={working ? "working" : "resting"} onState={onState}>
                      {row.job && row.job.kind !== 0 ? jobLabel(row.job.kind) : m.ops_npc_worker()} ·{" "}
                      {phaseLabel(working ? 0 : 1)}
                    </StateBadge>
                  ) : null}
                  {typeof row.workplace === "number" ? (
                    <span className="dev-muted"> {m.ops_work_building_short({ id: row.workplace })}</span>
                  ) : null}
                </td>
                <td className="dev-num">{row.job ? formatInt(row.job.fatigue) : m.ops_none()}</td>
                <td>
                  {row.moving ? (
                    <StateBadge state="moving" onState={onState}>
                      {m.ops_status_moving()}
                    </StateBadge>
                  ) : null}
                  {row.injury > 0 ? (
                    <StateBadge state="injured" bad onState={onState}>
                      {m.ops_injury({ stage: injuryStageName(row.injury) })}
                    </StateBadge>
                  ) : null}
                  {row.captive ? (
                    <StateBadge state="captive" bad onState={onState}>
                      {m.ops_status_captive()}
                    </StateBadge>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
