// [이 세계의 NPC 국가에 반영] 판 — 이미 정해진 세력 정체성·화폐 표시(운영자 콘솔의 세력·화폐 탭 값)에 지금 프리셋 값을 다시 넣는다.
// 먼저 미리 보기(바꾸지 않음)로 줄마다 무엇이 바뀌는지 보이고, [반영]을 눌러야 쓴다. 운영자가 손으로 고친 줄은 건너뛴다.
// 유닛·도시·잔고는 바꾸지 않는다. docs/adr/2026-11-10-nation-editor.md 6절
import type { NationApplyResponse, NationApplyRow } from "@terra/shared/nationEditor";
import { m } from "../../paraglide/messages.js";
import { APPLY_ACTION_TEXT } from "./nationText.ts";

const before = (row: NationApplyRow): string =>
  row.kind === "faction"
    ? `${row.before.name} · ${row.before.shortName} · ${row.before.color}`
    : `${row.before.name} · ${row.before.symbol} · ${row.before.ticker}`;
const after = (row: NationApplyRow): string =>
  row.kind === "faction"
    ? `${row.after.name} · ${row.after.shortName} · ${row.after.color}`
    : `${row.after.name} · ${row.after.symbol} · ${row.after.ticker}`;

export function NationApplyWorld({
  result,
  busy,
  dirty,
  onApply,
  onClose,
}: {
  /** 미리 보기 또는 반영 결과 */
  result: NationApplyResponse;
  busy: boolean;
  /** 담은 변경이 남아 있다(먼저 적용해야 반영된다) */
  dirty: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="ce-panel ne-apply"
      aria-labelledby="ne-apply-title"
      data-dry={result.dryRun ? "yes" : "no"}
      data-updated={result.updated}
      data-skipped={result.skipped}
    >
      <h2 id="ne-apply-title" className="ce-panel-title">
        {m.dev_nations_apply_title()}
      </h2>
      <p className="field-hint">{m.dev_nations_apply_lead()}</p>
      {dirty ? (
        <p className="field-hint ne-future" role="note">
          {m.dev_nations_apply_dirty()}
        </p>
      ) : null}
      <p className="ne-apply-summary" role="status">
        {result.dryRun
          ? m.dev_nations_apply_plan({ updated: result.updated, skipped: result.skipped })
          : m.dev_nations_apply_done({ updated: result.updated, skipped: result.skipped })}
      </p>
      {result.rows.length === 0 ? (
        <p className="field-hint">{m.dev_nations_apply_empty()}</p>
      ) : (
        <div className="dev-table-wrap">
          <table className="dev-table ne-apply-table">
            <thead>
              <tr>
                <th scope="col">{m.dev_nations_apply_col_kind()}</th>
                <th scope="col">{m.dev_nations_apply_col_preset()}</th>
                <th scope="col">{m.dev_nations_apply_col_before()}</th>
                <th scope="col">{m.dev_nations_apply_col_after()}</th>
                <th scope="col">{m.dev_nations_apply_col_action()}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={row.kind === "faction" ? `f:${row.factionId}` : `c:${row.asset}`}
                  data-action={row.action}
                  data-kind={row.kind}
                >
                  <td>
                    {row.kind === "faction"
                      ? m.dev_nations_apply_kind_faction()
                      : m.dev_nations_apply_kind_currency()}
                  </td>
                  <td>
                    <code className="dev-code" translate="no">
                      {row.preset}
                    </code>
                  </td>
                  <td>{before(row)}</td>
                  <td>{row.action === "same" ? "—" : after(row)}</td>
                  <td>
                    <span className="dev-badge">{APPLY_ACTION_TEXT[row.action]()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="ce-inline-actions">
        {result.dryRun ? (
          <button
            type="button"
            className="ne-apply-run"
            aria-disabled={busy || result.updated === 0}
            onClick={() => {
              if (!busy && result.updated > 0) onApply();
            }}
          >
            {m.dev_nations_apply_run({ count: result.updated })}
          </button>
        ) : null}
        <button type="button" className="button-small ne-apply-close" onClick={onClose}>
          {m.dev_nations_apply_close()}
        </button>
      </div>
    </section>
  );
}
