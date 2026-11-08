// 운영자 콘솔 · 유닛 표(유닛 탭·유저 상세·세력 상세가 같이 쓴다)
import type { OpsUnitRow } from "@terra/shared/ops";
import { m } from "../paraglide/messages.js";
import type { OpenDetail } from "./OpsConsole.tsx";
import { unitKindLabel, whereText } from "./opsUi.tsx";

export function UnitTable({ rows, open }: { rows: readonly OpsUnitRow[]; open: OpenDetail }) {
  return (
    <div className="dev-table-wrap">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col" className="dev-num">
              {m.ops_col_num()}
            </th>
            <th scope="col">{m.ops_col_kind()}</th>
            <th scope="col">{m.ops_col_owner()}</th>
            <th scope="col">{m.ops_col_where()}</th>
            <th scope="col">{m.ops_col_status()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
              <td>{unitKindLabel(row.kind)}</td>
              <td translate="no">
                {row.ownerKind === "user" ? (
                  <span className="dev-badge">{m.ops_owner_user()}</span>
                ) : row.ownerKind === "faction" ? (
                  <span className="dev-badge">{m.ops_owner_faction()}</span>
                ) : null}{" "}
                {row.ownerLabel}
              </td>
              <td className="dev-code">{whereText(row)}</td>
              <td>
                {row.moving ? <span className="dev-badge">{m.ops_status_moving()}</span> : null}
                {row.injury > 0 ? (
                  <span className="dev-badge ops-bad">{m.ops_injury({ stage: row.injury })}</span>
                ) : null}
                {row.captive ? <span className="dev-badge ops-bad">{m.ops_status_captive()}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
