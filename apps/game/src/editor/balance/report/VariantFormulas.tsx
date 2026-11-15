// 전투 보고서 A/B의 B 계산식 바꿈 — 기획 D-560 1381 "A/B에 계산식도"(docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-15, D-560)").
// 줄마다 식 칸(2차 스탯 화면과 같은 칸 — tRPC formulas.list)과 식 글. 칸을 고르면 지금 세계 식을 글에 채운다(고칠 출발점). 이 보고서 안에서만 쓰고
// 세계 식은 바꾸지 않는다. 식이 그 칸 변수로 읽히는지는 서버가 본다(안 읽히면 시작이 invalid_formula로 거절 — 화면은 까닭 글을 보인다).
// 식 칸 목록은 [식 바꿈 더하기]를 처음 누르거나 칸 고르기에 초점이 갈 때 한 번 받는다.
import { REPORT_LIMITS, type ReportFormulaChange } from "@terra/shared/battleReport";
import type { FormulaSlotView } from "@terra/shared/formula";
import { useState } from "react";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";

type SlotsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly slots: readonly FormulaSlotView[] }
  | { readonly status: "failed" };

export function VariantFormulas({
  formulas,
  locale,
  onChange,
}: {
  readonly formulas: readonly ReportFormulaChange[];
  readonly locale: string;
  readonly onChange: (formulas: readonly ReportFormulaChange[]) => void;
}) {
  const [slots, setSlots] = useState<SlotsState>({ status: "idle" });
  const load = (): void => {
    if (slots.status === "loading" || slots.status === "ready") return;
    setSlots({ status: "loading" });
    api.formulas.list.query().then(
      (list) => setSlots({ status: "ready", slots: list.slots }),
      () => setSlots({ status: "failed" }),
    );
  };
  const list = slots.status === "ready" ? slots.slots : [];
  const nameOf = (slot: FormulaSlotView): string => (locale === "en" ? slot.name.en : slot.name.ko);
  const set = (index: number, next: ReportFormulaChange): void =>
    onChange(formulas.map((entry, at) => (at === index ? next : entry)));

  return (
    <div className="rp-tuning rp-formulas">
      <span className="field-label">{m.dev_report_variant_formulas()}</span>
      <p className="field-hint">{m.dev_report_variant_formulas_hint()}</p>
      {slots.status === "failed" ? (
        <p className="field-hint" role="alert">
          {m.dev_report_variant_formulas_failed()}
        </p>
      ) : null}
      {formulas.map((change, index) => (
        <div key={index} className="rp-formula-row" data-key={change.key}>
          <select
            className="input rp-formula-key"
            aria-label={m.dev_report_variant_formula_key()}
            value={change.key}
            // 다시 돌리기로 실은 폼은 줄이 이미 있다 — 칸을 고르려 할 때 목록을 받는다
            onFocus={load}
            onChange={(event) => {
              const key = event.target.value;
              const slot = list.find((entry) => entry.key === key);
              set(index, { key, source: slot?.source ?? change.source });
            }}
          >
            <option value="">{m.dev_report_variant_formula_pick()}</option>
            {list.map((slot) => (
              <option key={slot.key} value={slot.key}>
                {nameOf(slot)} ({slot.key})
              </option>
            ))}
            {change.key !== "" && !list.some((slot) => slot.key === change.key) ? (
              <option value={change.key}>{change.key}</option>
            ) : null}
          </select>
          <textarea
            className="input rp-formula-source"
            aria-label={m.dev_report_variant_formula_source()}
            rows={2}
            spellCheck={false}
            value={change.source}
            onChange={(event) => set(index, { ...change, source: event.target.value })}
          />
          <button
            type="button"
            className="button-small"
            onClick={() => onChange(formulas.filter((_, at) => at !== index))}
          >
            {m.dev_report_remove()}
          </button>
        </div>
      ))}
      {formulas.length < REPORT_LIMITS.variantFormulasMax ? (
        <button
          type="button"
          className="button-small rp-formula-add"
          onClick={() => {
            load();
            onChange([...formulas, { key: "", source: "" }]);
          }}
        >
          {m.dev_report_variant_formula_add()}
        </button>
      ) : null}
    </div>
  );
}
