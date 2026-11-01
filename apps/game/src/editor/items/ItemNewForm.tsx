// 새 아이템 판(설계안 3.4 기본) — 대분류, 이름 ko·en(필수), ID(영어 이름에서 제안, 규칙·겹침·은퇴 ID를 바로 확인). [만들기]는 꺼진 채
// 담은 변경에 넣고(덜 만든 항목이 세계에 나오지 않게) 그 항목을 연다. 칸마다의 규칙은 [적용] 때 서버가 다시 본다.
import { ITEM_CATEGORY_IDS, ITEM_LIMITS, type ItemCategoryId } from "@terra/shared/itemEditor";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CONTENT_ID_PATTERN, suggestId } from "../content/contentEditorModel.ts";
import { CATEGORY_TEXT } from "./itemMessages.ts";

export function ItemNewForm({
  taken,
  onCreate,
  onCancel,
}: {
  /** 쓸 수 없는 ID(있는 항목 + 은퇴 ID + 담은 새 항목) */
  taken: ReadonlySet<string>;
  onCreate: (id: string, category: ItemCategoryId, name: { ko: string; en: string }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<ItemCategoryId>("raw");
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
    <section className="ie-panel ie-new" aria-labelledby="ie-new-title">
      <h2 id="ie-new-title" className="ie-heading">
        {m.dev_items_new_title()}
      </h2>
      <div className="ie-grid">
        <SelectField
          label={m.dev_items_field_category()}
          value={category}
          options={ITEM_CATEGORY_IDS.map((value) => ({ value, label: CATEGORY_TEXT[value]() }))}
          onChange={setCategory}
        />
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
      <p className="field-hint">{m.dev_items_new_hint()}</p>
      <div className="ie-inline-actions">
        <button
          type="button"
          className="button-small button-primary ie-create"
          aria-disabled={!ok}
          onClick={ok ? () => onCreate(id, category, { ko: ko.trim(), en: en.trim() }) : undefined}
        >
          {m.dev_items_create()}
        </button>
        <button type="button" className="button-small" onClick={onCancel}>
          {m.dev_items_cancel()}
        </button>
      </div>
    </section>
  );
}
