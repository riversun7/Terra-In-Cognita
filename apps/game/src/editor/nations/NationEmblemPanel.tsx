// 국가 마크 칸 — 만든 마크(틀·나눔·상징·색 짜임 고르기, [다시 만들기])와 올린 그림(파일 고르기 → 자르기 → 올리기, [생성 마크로 되돌리기]).
// 만든 마크 사양은 다른 칸처럼 담아서 적용한다(팩 emblem 칸). 올린 그림은 담지 않고 바로 이 세계에 든다(그림은 팩에 넣지 못한다).
// docs/adr/2026-11-10-nation-editor.md 4절.
import type { NationEditorRow, NationPresetJson } from "@terra/shared/nationEditor";
import {
  EMBLEM_CHARGES,
  EMBLEM_DIVISIONS,
  EMBLEM_SCHEME_COUNT,
  EMBLEM_SHAPES,
  type NationEmblemSpec,
  emblemFromSeed,
  emblemSeedOf,
} from "@terra/shared/nationEmblem";
import { type ChangeEvent, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { loadImage } from "../../ui/emblemCanvas.ts";
import { SelectField } from "../content/contentEditorFields.tsx";
import { NationCropper } from "./NationCropper.tsx";
import { colorOf, emblemOf } from "./nationModel.ts";
import { CHARGE_TEXT, DIVISION_TEXT, SHAPE_TEXT } from "./nationText.ts";

const SCHEMES = Array.from({ length: EMBLEM_SCHEME_COUNT }, (_, index) => String(index));

export function NationEmblemPanel({
  entry,
  row,
  locked,
  canUpload,
  busy,
  onEdit,
  onUpload,
  onRemoveUpload,
}: {
  entry: NationPresetJson;
  row: NationEditorRow;
  /** 되돌리기를 담았다(만든 마크를 고치지 못한다) */
  locked: boolean;
  /** 이 서버에서 그림을 올릴 수 있나 */
  canUpload: boolean;
  busy: boolean;
  onEdit: (next: NationPresetJson) => void;
  onUpload: (pngBase64: string) => Promise<boolean>;
  onRemoveUpload: () => void;
}) {
  const spec = emblemOf(entry);
  const color = colorOf(entry);
  const [round, setRound] = useState(1);
  const [picked, setPicked] = useState<{ image: HTMLImageElement; url: string } | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const setSpec = (next: NationEmblemSpec): void => onEdit({ ...entry, emblem: next });

  const closeCropper = (): void => {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUnreadable(false);
    void loadImage(url).then((image) => {
      if (image) setPicked({ image, url });
      else {
        URL.revokeObjectURL(url);
        setUnreadable(true);
      }
    });
  };

  return (
    <div className="ne-emblem" data-uploaded={row.uploaded ? "" : undefined}>
      <div className="ne-emblem-show">
        <figure className="ne-emblem-figure">
          <NationEmblem
            spec={spec}
            color={color}
            size={96}
            label={m.dev_nations_emblem_made()}
            className="ne-emblem-made"
          />
          <figcaption>{m.dev_nations_emblem_made()}</figcaption>
        </figure>
        {row.uploaded ? (
          <figure className="ne-emblem-figure">
            <NationEmblem
              spec={spec}
              color={color}
              uploaded={row.uploaded.hash}
              size={96}
              label={m.dev_nations_emblem_uploaded()}
              className="ne-emblem-up"
            />
            <figcaption>{m.dev_nations_emblem_uploaded()}</figcaption>
          </figure>
        ) : null}
      </div>
      <div className="ne-emblem-fields">
        <SelectField
          label={m.dev_nations_emblem_shape()}
          value={spec.shape}
          options={EMBLEM_SHAPES.map((value) => ({ value, label: SHAPE_TEXT[value]() }))}
          onChange={(shape) => setSpec({ ...spec, shape })}
          path="emblem.shape"
        />
        <SelectField
          label={m.dev_nations_emblem_division()}
          value={spec.division}
          options={EMBLEM_DIVISIONS.map((value) => ({ value, label: DIVISION_TEXT[value]() }))}
          onChange={(division) => setSpec({ ...spec, division })}
          path="emblem.division"
        />
        <SelectField
          label={m.dev_nations_emblem_charge()}
          value={spec.charge}
          options={EMBLEM_CHARGES.map((value) => ({ value, label: CHARGE_TEXT[value]() }))}
          onChange={(charge) => setSpec({ ...spec, charge })}
          path="emblem.charge"
        />
        <SelectField
          label={m.dev_nations_emblem_scheme()}
          value={String(spec.scheme)}
          options={SCHEMES.map((value) => ({
            value,
            label: m.dev_nations_emblem_scheme_n({ n: Number(value) + 1 }),
          }))}
          onChange={(scheme) => setSpec({ ...spec, scheme: Number(scheme) })}
          path="emblem.scheme"
        />
      </div>
      <div className="ce-inline-actions">
        <button
          type="button"
          className="ne-emblem-reroll"
          aria-disabled={locked}
          onClick={() => {
            if (locked) return;
            setSpec(emblemFromSeed(emblemSeedOf(entry.id) + round));
            setRound(round + 1);
          }}
        >
          {m.dev_nations_emblem_reroll()}
        </button>
        {canUpload ? (
          <label className="button-small ne-emblem-file">
            <span>{m.dev_nations_emblem_upload()}</span>
            <input
              ref={fileRef}
              className="visually-hidden ne-emblem-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onFile}
            />
          </label>
        ) : null}
        {row.uploaded ? (
          <button
            type="button"
            className="button-small ne-emblem-remove"
            aria-disabled={busy}
            onClick={onRemoveUpload}
          >
            {m.dev_nations_emblem_remove()}
          </button>
        ) : null}
      </div>
      <p className="field-hint">
        {row.uploaded ? m.dev_nations_emblem_uploaded_note() : m.dev_nations_emblem_note()}
      </p>
      {unreadable ? (
        <p role="alert" className="field-error">
          {m.dev_nations_emblem_unreadable()}
        </p>
      ) : null}
      {picked ? (
        <NationCropper
          key={picked.url}
          image={picked.image}
          busy={busy}
          onCancel={closeCropper}
          onDone={async (png) => {
            if (await onUpload(png)) closeCropper();
          }}
        />
      ) : null}
    </div>
  );
}
