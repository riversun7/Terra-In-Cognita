// 이름 목록 칸(도시 이름·사람 이름 조각) — 줄마다 글 칸 + 위·아래·빼기, [추가], [이름 만들기]. 번역하지 않는 한 글자 줄이다(D-476).
// 견주기 표지는 구역(FormSection paths)이 센다. 줄 글 칸은 이름표를 읽기 프로그램에만 준다.
import type { NameKind, NameStyleId } from "@terra/shared/nameGen";
import { m } from "../../paraglide/messages.js";
import { RemoveButton } from "../content/contentEditorFields.tsx";
import { NameGenerator } from "./NationNameGen.tsx";
import { appendUnique, moveItem } from "./nationModel.ts";

export function NameListField({
  title,
  names,
  max,
  maxLength,
  style,
  kind,
  seedKey,
  hint,
  problem,
  dataKey,
  onChange,
}: {
  title: string;
  names: readonly string[];
  max: number;
  maxLength: number;
  style: NameStyleId;
  kind: NameKind;
  seedKey: string;
  hint?: string | undefined;
  problem?: string | undefined;
  /** 시험이 고르는 이름(data-list) */
  dataKey: string;
  onChange: (next: string[]) => void;
}) {
  const full = names.length >= max;
  return (
    <fieldset className="ne-names" data-list={dataKey}>
      <legend className="field-label">
        {title}{" "}
        <span className="ne-names-count">{m.dev_nations_names_count({ count: names.length, max })}</span>
      </legend>
      {hint ? <p className="field-hint">{hint}</p> : null}
      <ol className="ne-names-rows">
        {names.map((name, index) => (
          // 차례가 곧 자리다(같은 이름은 검사가 막는다)
          // oxlint-disable-next-line react/no-array-index-key -- 줄을 옮겨도 칸의 초점이 자리에 남게 차례로 둔다
          <li key={index} className="ne-names-row">
            <input
              className="ne-names-input"
              type="text"
              value={name}
              maxLength={maxLength}
              aria-label={m.dev_nations_names_item({ title, index: index + 1 })}
              onChange={(event) =>
                onChange(names.map((item, i) => (i === index ? event.target.value : item)))
              }
            />
            <button
              type="button"
              className="ce-icon-button"
              aria-label={m.dev_nations_names_up({ name })}
              aria-disabled={index === 0}
              onClick={() => onChange(moveItem(names, index, -1))}
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              className="ce-icon-button"
              aria-label={m.dev_nations_names_down({ name })}
              aria-disabled={index === names.length - 1}
              onClick={() => onChange(moveItem(names, index, 1))}
            >
              <span aria-hidden="true">↓</span>
            </button>
            <RemoveButton name={name} onClick={() => onChange(names.filter((_, i) => i !== index))} />
          </li>
        ))}
      </ol>
      {problem ? <p className="field-error ce-problem">{problem}</p> : null}
      <div className="ce-inline-actions">
        <button
          type="button"
          className="button-small ne-names-add"
          aria-disabled={full}
          onClick={() => {
            if (!full) onChange([...names, ""]);
          }}
        >
          {m.dev_nations_names_add()}
        </button>
        <NameGenerator
          style={style}
          kind={kind}
          seedKey={seedKey}
          label={m.dev_nations_namegen_open()}
          count={6}
          many
          onPick={(picked) =>
            onChange(
              appendUnique(
                names,
                picked.map((name) => name.en),
                max,
              ),
            )
          }
        />
      </div>
    </fieldset>
  );
}
