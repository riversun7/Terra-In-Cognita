// 정부 판의 [나라 세금] 칸 — 기획 D-128("세율은 정부가 정한다", 시스템 상한 없음)·D-579(주민세 주기·세율은 나라가 정함), 질문 2322 나·2373 가(줄기 tax-2).
// - 모두에게: 소득세(사업장 수입·임금 원천징수 같은 율)·주민세(재산 ‰)·주기(날)·국세 몫(‰)과 정한 곳(지도자 / NPC 규칙식 / 기본값).
// - 정할 수 있는 사람(서버가 canSet으로 알려 준다 — 그 나라 지도자 = 독립 나라 가문장): 칸 넷(빈칸 = 기본값) → WebSocket nation_tax(프로토콜 57).
//   주민세 주기는 고르기 목록(하루·한 주 — @terra/shared/government RESIDENT_TAX_PERIOD_DAYS, 사용자 답 D-585 2)에서 고른다(빈 고르기 = 기본값).
//   판정은 서버가 다시 한다. 투표 체제의 안건 절차는 governance 줄기 몫이다(지금은 지도자가 바로 정한다).
import type { GovernmentTaxes } from "@terra/shared/government";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { taxText } from "./governmentData.ts";
import { sendNationTax } from "./nationTaxCommands.ts";
import {
  type NationTaxDraft,
  applySavedTaxes,
  draftsOf,
  nationTaxErrorText,
  parseNationTaxDraft,
  periodChoices,
  permilleText,
  taxSourceText,
} from "./nationTaxData.ts";

/** 값 줄 하나(정한 곳 덧말) */
function TaxRow(props: {
  readonly part: string;
  readonly label: string;
  readonly value: string;
  readonly note: string;
}) {
  return (
    <div className="gov-fact gov-entry-row" data-part={props.part}>
      <dt>{props.label}</dt>
      <dd>
        <span data-part="government-tax-value">{props.value}</span>
        <span className="gov-person-note">{props.note}</span>
      </dd>
    </div>
  );
}

/** 입력 칸 하나(빈칸 = 기본값) */
function TaxInput(props: {
  readonly label: string;
  readonly value: string;
  readonly busy: boolean;
  readonly part: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="gov-tax-input" htmlFor={id}>
      <span>{props.label}</span>
      <input
        id={id}
        className="gov-entry-input"
        inputMode="decimal"
        autoComplete="off"
        placeholder={m.government_tax_default_placeholder()}
        value={props.value}
        disabled={props.busy}
        onChange={(event) => props.onChange(event.target.value)}
        data-part={props.part}
      />
    </label>
  );
}

/** 주민세 주기 고르기(빈 값 = 기본값, 목록 + 지금 정해 둔 옛 값) */
function PeriodSelect(props: {
  readonly value: string;
  readonly busy: boolean;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="gov-tax-input" htmlFor={id}>
      <span>{m.government_tax_input_every()}</span>
      <select
        id={id}
        className="gov-entry-input"
        value={props.value}
        disabled={props.busy}
        onChange={(event) => props.onChange(event.target.value)}
        data-part="government-tax-input-every"
      >
        <option value="">{m.government_tax_period_default()}</option>
        {periodChoices(props.value).map((days) => (
          <option key={days} value={String(days)}>
            {m.government_tax_days({ days })}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NationTaxPolicy({ taxes }: { taxes: GovernmentTaxes }) {
  const titleId = useId();
  const [shown, setShown] = useState(taxes);
  const [draft, setDraft] = useState<NationTaxDraft>(() => draftsOf(taxes));
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const edit = (key: keyof NationTaxDraft) => (value: string) =>
    setDraft((before) => ({ ...before, [key]: value }));

  const save = async (next: NationTaxDraft): Promise<void> => {
    if (busy) return;
    notice.clear();
    problem.clear();
    const body = parseNationTaxDraft(next);
    if (!body) {
      problem.show([m.government_tax_invalid()]);
      return;
    }
    setBusy(true);
    try {
      const outcome = await sendNationTax(body);
      if (outcome.ok && outcome.agendaId !== undefined) {
        // 세율 안건을 열었다(질문 2407 가 — 가결되면 바뀐다)
        notice.show([m.government_tax_agenda_opened()]);
      } else if (outcome.ok) {
        const saved = applySavedTaxes(shown, body);
        notice.show([saved.stale ? m.government_tax_done_reopen() : m.government_tax_done()]);
        setShown(saved.taxes);
        setDraft(next);
      } else problem.show([nationTaxErrorText(outcome.code)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gov-section gov-band" aria-labelledby={titleId} data-part="government-nation-tax">
      <h3 id={titleId} className="gov-section-title">
        {m.government_tax_title()}
      </h3>
      <p className="gov-muted">{m.government_tax_hint()}</p>
      <dl className="gov-facts">
        <TaxRow
          part="government-tax-income"
          label={m.government_tax_income()}
          value={taxText(shown.incomeTaxBp.value)}
          note={taxSourceText(shown.incomeTaxBp.source)}
        />
        <TaxRow
          part="government-tax-resident"
          label={m.government_tax_resident()}
          value={permilleText(shown.residentTaxPm.value)}
          note={taxSourceText(shown.residentTaxPm.source)}
        />
        <TaxRow
          part="government-tax-every"
          label={m.government_tax_every()}
          value={m.government_tax_days({ days: shown.residentEveryDays.value })}
          note={taxSourceText(shown.residentEveryDays.source)}
        />
        <TaxRow
          part="government-tax-share"
          label={m.government_tax_share()}
          value={permilleText(shown.residentNationPm.value)}
          note={taxSourceText(shown.residentNationPm.source)}
        />
      </dl>
      {shown.canSet ? (
        <div className="gov-tax-edit" data-part="government-tax-edit">
          <TaxInput
            label={m.government_tax_input_income()}
            value={draft.income}
            busy={busy}
            part="government-tax-input-income"
            onChange={edit("income")}
          />
          <TaxInput
            label={m.government_tax_input_resident()}
            value={draft.resident}
            busy={busy}
            part="government-tax-input-resident"
            onChange={edit("resident")}
          />
          <PeriodSelect value={draft.every} busy={busy} onChange={edit("every")} />
          <TaxInput
            label={m.government_tax_input_share()}
            value={draft.share}
            busy={busy}
            part="government-tax-input-share"
            onChange={edit("share")}
          />
          <div className="gov-tax-actions">
            <button type="button" className="button-small" disabled={busy} onClick={() => void save(draft)}>
              {m.government_tax_save()}
            </button>
            <button
              type="button"
              className="button-small"
              disabled={busy}
              onClick={() => void save({ income: "", resident: "", every: "", share: "" })}
            >
              {m.government_tax_clear()}
            </button>
          </div>
        </div>
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
