// 운영자 콘솔 · 상세 판 공용 조각 — 잔고 표, 보유 물건 표, 스킬 표, 스탯 줄, 자원 지급·회수 양식.
import type { OpsBalance, OpsItemRow, OpsSkillRow } from "@terra/shared/ops";
import { type FormEvent, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { errorText, formatBig, formatInt, resultText } from "./opsUi.tsx";

/** STR·DEX·AGI·VIT·INT·WIS 차례(서버 저장 차례) */
const STAT_CODES = [
  m.roster_stat_str_code,
  m.roster_stat_dex_code,
  m.roster_stat_agi_code,
  m.roster_stat_vit_code,
  m.roster_stat_int_code,
  m.roster_stat_wis_code,
];

export function StatLine({
  values,
  extra,
}: {
  values: readonly number[];
  extra?: readonly number[] | undefined;
}) {
  return (
    <span className="ops-stats">
      {STAT_CODES.map((code, index) => (
        <span key={code()} className="ops-stat">
          <b>{code()}</b> {values[index] ?? m.ops_none()}
          {extra ? <span className="dev-muted"> / {extra[index] ?? m.ops_none()}</span> : null}
        </span>
      ))}
    </span>
  );
}

export function BalanceTable({ rows }: { rows: readonly OpsBalance[] }) {
  if (rows.length === 0) return <p className="dev-muted">{m.ops_empty()}</p>;
  return (
    <div className="dev-table-wrap">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col">{m.ops_col_asset()}</th>
            <th scope="col" className="dev-num">
              {m.ops_col_where()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_balance()}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.asset}|${row.location ?? ""}`}>
              <td className="dev-code">{row.asset}</td>
              <td className="dev-num">{row.location ?? m.ops_none()}</td>
              <td className="dev-num">{formatBig(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemTable({ rows }: { rows: readonly OpsItemRow[] }) {
  if (rows.length === 0) return <p className="dev-muted">{m.ops_empty()}</p>;
  return (
    <div className="dev-table-wrap ops-scroll">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col" className="dev-num">
              {m.ops_col_num()}
            </th>
            <th scope="col">{m.ops_col_item()}</th>
            <th scope="col" className="dev-num">
              {m.ops_col_qty()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_where()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_durability()}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="dev-num">{row.id}</td>
              <td className="dev-code">{row.itemId}</td>
              <td className="dev-num">{formatInt(row.quantity)}</td>
              <td className="dev-num">
                {row.location}
                {row.slot === null ? "" : `#${row.slot}`}
              </td>
              <td className="dev-num">
                {row.durability === null
                  ? m.ops_none()
                  : m.ops_f_of({ a: row.durability, b: row.maxDurability ?? m.ops_none() })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkillTable({ rows }: { rows: readonly OpsSkillRow[] }) {
  if (rows.length === 0) return <p className="dev-muted">{m.ops_empty()}</p>;
  return (
    <div className="dev-table-wrap ops-scroll">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col" className="dev-num">
              {m.ops_col_unit()}
            </th>
            <th scope="col">{m.ops_col_skill()}</th>
            <th scope="col" className="dev-num">
              {m.ops_col_grade()}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.unitId}|${row.skillId}`}>
              <td className="dev-num">{row.unitId}</td>
              <td className="dev-code">{row.skillId}</td>
              <td className="dev-num">{row.grade}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 자원 지급(+)·회수(−) 양식. 사유 필수, 확인 창 뒤 보낸다 */
export function GrantForm({
  ownerId,
  target,
  onDone,
}: {
  ownerId: number;
  target: string;
  onDone: () => void;
}) {
  const assetId = useId();
  const amountId = useId();
  const reasonId = useId();
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    if (!window.confirm(m.ops_act_confirm({ action: `${m.ops_act_grant()} ${asset} ${amount}`, target })))
      return;
    setPending(true);
    try {
      const result = await api.ops.economy.grant.mutate({
        ownerId,
        asset: asset.trim(),
        amount: amount.trim(),
        reason,
      });
      if (result.ok) {
        setMessage({
          tone: "success",
          text: m.ops_grant_done({ tx: result.txId, balance: formatBig(result.balance) }),
        });
        onDone();
      } else setMessage({ tone: "error", text: resultText(result.code) });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="ops-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor={assetId}>{m.ops_col_asset()}</label>
      <input
        id={assetId}
        className="input"
        required
        maxLength={96}
        spellCheck={false}
        autoComplete="off"
        value={asset}
        onChange={(event) => setAsset(event.target.value)}
      />
      <label htmlFor={amountId}>{m.ops_grant_amount()}</label>
      <input
        id={amountId}
        className="input"
        required
        inputMode="numeric"
        pattern="-?[1-9][0-9]{0,17}"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <label htmlFor={reasonId}>{m.ops_reason()}</label>
      <input
        id={reasonId}
        className="input"
        required
        minLength={2}
        maxLength={200}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div>
        <button type="submit" className="button-small ops-danger" aria-disabled={pending}>
          {m.ops_act_grant()}
        </button>
        {message ? (
          <span className={message.tone === "error" ? "ops-msg ops-msg-error" : "ops-msg"} role="status">
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
