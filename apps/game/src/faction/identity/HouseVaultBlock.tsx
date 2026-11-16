// "내 가문" 칸의 가문 금고 부분 — 기획 D-574 2150(사용자 답 "나 — 기부 + 가문원 수입의 일부를 가문세로", 세율은 가문장이 정한다 — 기획 해석).
// docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)".
// - 모두에게: 금고 잔고(국고와 따로 — D-338·D-213)와 지금 가문세율, [기부](가문원 지갑 → 가문 금고, WebSocket house_donate, 프로토콜 64).
// - 가문장: 가문세율 칸(%, 0.1% 단위 → ‰, 상한 = 설정 칸 house_tax_max_pm) + [정하기](house_tax). 판정은 서버가 다시 한다.
// - 바뀜(사용자 D-576): 가문장은 [꺼내기](금고 → 가문장 지갑, house_vault_take). 넣기·꺼내기 모두 금고 장부로 가문원 모두에게 보인다(최근 줄).
import type { HouseVaultLogRow } from "@terra/shared/house";
import { useId, useState } from "react";
import { dateText } from "../../sections/screenText.ts";
import { m } from "../../paraglide/messages.js";
import { formatAmount } from "../../roster/rosterText.ts";

/** ‰ → "2.5" 같은 % 글자 */
export const pmPercent = (pm: number): string => (Math.max(0, Math.trunc(pm)) / 10).toString();

/** 넣은 %(소수 한 자리까지) → ‰. 틀리거나 상한을 넘으면 null */
export function parseTaxPercent(input: string, maxPm: number): number | null {
  const text = input.trim();
  if (!/^[0-9]{1,3}(\.[0-9])?$/.test(text)) return null;
  const [whole, tenth] = text.split(".");
  const pm = Number(whole) * 10 + Number(tenth ?? "0");
  return Number.isSafeInteger(pm) && pm >= 0 && pm <= maxPm ? pm : null;
}

/** 장부 거래 종류 → 문구(oxlint: 메시지 이름을 계산해 읽지 않는다 — 표) */
const LOG_KIND_TEXT: Readonly<Record<string, () => string>> = {
  house_donate: m.fid_house_vault_log_donate,
  house_vault_take: m.fid_house_vault_log_take,
  house_vault_dissolve: m.fid_house_vault_log_take,
  business_settle: m.fid_house_vault_log_tax,
  labor_wage: m.fid_house_vault_log_tax,
  house_entry: m.fid_house_vault_log_entry,
};

/** 장부 한 줄의 종류 문구(모르는 종류는 "그 밖") */
export const vaultLogKindText = (kind: string): string =>
  (LOG_KIND_TEXT[kind] ?? m.fid_house_vault_log_other)();

/** 장부 한 줄의 양(+ 들어옴 / − 나감, 자리 나눔) */
export const vaultLogAmountText = (amount: string): string =>
  amount.startsWith("-") ? `−${formatAmount(amount.slice(1))}` : `+${formatAmount(amount)}`;

/** 넣은 기부 양(양의 정수, 15자리까지 — 프로토콜과 같은 꼴). 틀리면 null */
export function parseDonation(input: string): string | null {
  const text = input.trim().replace(/^0+(?=[0-9])/, "");
  return /^[1-9][0-9]{0,14}$/.test(text) ? text : null;
}

export function HouseVaultBlock({
  vault,
  tax,
  log,
  leader,
  busy,
  onDonate,
  onTake,
  onTax,
  onInvalid,
}: {
  vault: string;
  log: readonly HouseVaultLogRow[] | undefined;
  tax: { readonly ratePm: number; readonly maxPm: number } | undefined;
  leader: boolean;
  busy: boolean;
  onDonate: (amount: string) => void;
  onTake: (amount: string) => void;
  onTax: (ratePm: number) => void;
  onInvalid: (text: string) => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [take, setTake] = useState("");
  return (
    <div className="fid-house-block" data-testid="house-vault">
      <p data-part="house-vault">{m.fid_house_vault({ amount: formatAmount(vault) })}</p>
      <p className="faction-muted">{m.fid_house_vault_hint()}</p>
      {tax ? <p data-part="house-tax">{m.fid_house_tax_line({ rate: pmPercent(tax.ratePm) })}</p> : null}
      <form
        className="fid-house-home-form"
        data-part="house-donate"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const value = parseDonation(amount);
          if (value === null) onInvalid(m.fid_house_donate_invalid());
          else {
            onDonate(value);
            setAmount("");
          }
        }}
      >
        <label className="fid-house-sub" htmlFor={`${id}-donate`}>
          {m.fid_house_donate_label()}
        </label>
        <span className="fid-house-invite-row">
          <input
            id={`${id}-donate`}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button
            type="submit"
            className="button-small button-primary"
            aria-disabled={busy || amount.trim() === ""}
          >
            {m.fid_house_donate()}
          </button>
        </span>
        <span className="faction-muted">{m.fid_house_donate_hint()}</span>
      </form>
      {leader && tax ? (
        <form
          className="fid-house-home-form"
          data-part="house-tax-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const pm = parseTaxPercent(rate, tax.maxPm);
            if (pm === null) onInvalid(m.fid_house_tax_invalid({ max: pmPercent(tax.maxPm) }));
            else onTax(pm);
          }}
        >
          <label className="fid-house-sub" htmlFor={`${id}-tax`}>
            {m.fid_house_tax_label()}
          </label>
          <span className="fid-house-invite-row">
            <input
              id={`${id}-tax`}
              className="input"
              inputMode="decimal"
              autoComplete="off"
              placeholder={pmPercent(tax.ratePm)}
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
            <button type="submit" className="button-small" aria-disabled={busy || rate.trim() === ""}>
              {m.fid_house_tax_set()}
            </button>
          </span>
          <span className="faction-muted">{m.fid_house_tax_hint({ max: pmPercent(tax.maxPm) })}</span>
        </form>
      ) : null}
      {leader ? (
        <form
          className="fid-house-home-form"
          data-part="house-take"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const value = parseDonation(take);
            if (value === null) onInvalid(m.fid_house_donate_invalid());
            else {
              onTake(value);
              setTake("");
            }
          }}
        >
          <label className="fid-house-sub" htmlFor={`${id}-take`}>
            {m.fid_house_take_label()}
          </label>
          <span className="fid-house-invite-row">
            <input
              id={`${id}-take`}
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={take}
              onChange={(event) => setTake(event.target.value)}
            />
            <button type="submit" className="button-small" aria-disabled={busy || take.trim() === ""}>
              {m.fid_house_take()}
            </button>
          </span>
          <span className="faction-muted">{m.fid_house_take_hint()}</span>
        </form>
      ) : null}
      {log === undefined ? null : (
        <div className="fid-house-block" data-part="house-vault-log">
          <h3 className="fid-house-sub">{m.fid_house_vault_log_title()}</h3>
          {log.length === 0 ? (
            <p className="faction-muted">{m.fid_house_vault_log_empty()}</p>
          ) : (
            <ul className="fid-house-list">
              {log.map((row, index) => (
                <li
                  key={`${String(row.atMs)}-${String(index)}`}
                  className="fid-house-row"
                  data-kind={row.kind}
                >
                  <span className="fid-house-row-main">
                    <span className="fid-house-row-name">
                      {vaultLogKindText(row.kind)} {vaultLogAmountText(row.amount)}
                    </span>
                    <span className="faction-muted">
                      {row.who === null ? dateText(row.atMs) : `${row.who} · ${dateText(row.atMs)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
