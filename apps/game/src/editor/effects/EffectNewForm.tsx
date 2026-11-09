// 새 효과 칸(효과 사전 편집 판 자리) — 이름(한국어·영어)과 ID(영어 이름에서 제안, 고칠 수 있다). 만들면 꺼진 틀로 담고 그 효과를 연다.
// 주소 ?create=1(아이템·스킬 편집기의 [새 효과 만들기])이면 처음부터 이 칸이 열린다.
import { ITEM_LIMITS } from "@terra/shared/itemEditor";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { TextField } from "../content/contentEditorFields.tsx";
import { CONTENT_ID_PATTERN, suggestId } from "../content/contentEditorModel.ts";

export function EffectNewForm({
  taken,
  onCreate,
  onCancel,
}: {
  /** 쓸 수 없는 ID(그 세계의 효과·지운 ID·담은 새 효과) */
  taken: ReadonlySet<string>;
  onCreate: (id: string, name: { ko: string; en: string }) => void;
  onCancel: () => void;
}) {
  const [ko, setKo] = useState("");
  const [en, setEn] = useState("");
  const [typedId, setTypedId] = useState<string | null>(null);
  const id = typedId ?? suggestId(en, taken);
  const idProblem =
    id === ""
      ? undefined
      : !CONTENT_ID_PATTERN.test(id)
        ? m.dev_items_new_id_invalid()
        : taken.has(id)
          ? m.dev_items_new_id_taken()
          : undefined;
  const ok = id !== "" && idProblem === undefined && ko.trim() !== "" && en.trim() !== "";
  return (
    <section className="fx-new" aria-labelledby="fx-new-title" data-part="effect-new">
      <h2 id="fx-new-title" className="ce-entry-heading">
        {m.dev_effects_new_title()}
      </h2>
      <p className="field-hint">{m.dev_effects_new_lead()}</p>
      <div className="fx-grid">
        <TextField
          label={m.dev_items_field_name_ko()}
          value={ko}
          maxLength={ITEM_LIMITS.nameMax}
          onChange={setKo}
        />
        <TextField
          label={m.dev_items_field_name_en()}
          value={en}
          maxLength={ITEM_LIMITS.nameMax}
          onChange={setEn}
        />
        <TextField
          label={m.dev_items_field_id()}
          value={id}
          maxLength={48}
          problem={idProblem}
          onChange={setTypedId}
        />
      </div>
      <div className="ce-inline-actions">
        <button
          type="button"
          className="button-primary fx-new-create"
          aria-disabled={!ok}
          onClick={ok ? () => onCreate(id, { ko: ko.trim(), en: en.trim() }) : undefined}
        >
          {m.dev_items_create()}
        </button>
        <button type="button" onClick={onCancel}>
          {m.dev_effects_cancel()}
        </button>
      </div>
    </section>
  );
}
