// 마크 칸 — [자동 생성](다시 만들기 + 틀·나눔·상징·색 짜임 고르기: NPC 국가와 같은 만들기·같은 그리기) 또는 [그림 올리기](파일 고르기 →
// 정사각으로 자르기 → 256 × 256 PNG). 자르기 도구는 지연 로딩 조각이다. 자른 그림은 초안에만 담고 저장할 때 함께 올린다.
// 그림을 올릴 수 없으면(세계 스위치 끔·이 계정 막힘) 까닭을 보이고 자동 생성만 쓴다.
import { FACTION_EMBLEM_UPLOAD, type FactionUploadBlock } from "@terra/shared/factionIdentity";
import {
  EMBLEM_CHARGES,
  EMBLEM_DIVISIONS,
  EMBLEM_SCHEME_COUNT,
  EMBLEM_SHAPES,
  type NationEmblemSpec,
} from "@terra/shared/nationEmblem";
import { type ChangeEvent, type ReactNode, Suspense, lazy, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { loadImage } from "../../ui/emblemCanvas.ts";
import { IdentityEmblem } from "./IdentityEmblem.tsx";
import { type IdentityDraft, rerollEmblem } from "./identityModel.ts";
import { CHARGE_TEXT, DIVISION_TEXT, SHAPE_TEXT } from "./identityText.ts";

const EmblemCropper = lazy(() => import("./EmblemCropper.tsx"));

const SCHEMES = Array.from({ length: EMBLEM_SCHEME_COUNT }, (_, index) => index);

function Pick<T extends string | number>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
  name: string;
}) {
  const id = useId();
  return (
    <div className="field fid-pick">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input fid-select"
        data-pick={name}
        value={String(value)}
        onChange={(event) => {
          const found = options.find((option) => String(option.value) === event.target.value);
          if (found) onChange(found.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function IdentityEmblemField({
  draft,
  seed,
  uploadBlock,
  error,
  onChange,
}: {
  draft: IdentityDraft;
  seed: number;
  uploadBlock: FactionUploadBlock | null;
  /** 서버가 그림·마크를 받지 않았을 때의 문장 */
  error: string | null;
  onChange: (next: IdentityDraft) => void;
}) {
  const [mode, setMode] = useState<"made" | "upload">(draft.upload.kind === "none" ? "made" : "upload");
  const [round, setRound] = useState(1);
  const [picked, setPicked] = useState<{ image: HTMLImageElement; url: string } | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const groupId = useId();
  const spec = draft.emblem;
  const setSpec = (next: NationEmblemSpec): void => onChange({ ...draft, emblem: next });

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
  const pickMode = (next: "made" | "upload"): void => {
    setMode(next);
    // 자동 생성으로 돌아가면 그림을 뺀다(저장하면 만든 마크가 보인다)
    if (next === "made" && draft.upload.kind !== "none") onChange({ ...draft, upload: { kind: "none" } });
    if (next === "made") closeCropper();
  };

  let uploadBody: ReactNode;
  if (uploadBlock !== null && draft.upload.kind === "none")
    uploadBody = (
      <p className="fid-upload-off" role="note" data-block={uploadBlock}>
        {uploadBlock === "switch_off" ? m.fid_upload_off() : m.fid_upload_blocked()}
      </p>
    );
  else
    uploadBody = (
      <>
        <p className="fid-upload-state" data-upload={draft.upload.kind}>
          {draft.upload.kind === "new"
            ? m.fid_upload_ready()
            : draft.upload.kind === "keep"
              ? m.fid_upload_current()
              : m.fid_upload_none()}
        </p>
        <div className="fid-actions">
          {uploadBlock === null ? (
            <>
              <button
                type="button"
                className="button-small fid-file"
                onClick={() => fileRef.current?.click()}
              >
                {draft.upload.kind === "none" ? m.fid_upload_pick() : m.fid_upload_change()}
              </button>
              <input
                ref={fileRef}
                className="visually-hidden fid-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onFile}
              />
            </>
          ) : null}
          {draft.upload.kind === "none" ? null : (
            <button
              type="button"
              className="button-small fid-upload-remove"
              onClick={() => onChange({ ...draft, upload: { kind: "none" } })}
            >
              {m.fid_upload_remove()}
            </button>
          )}
        </div>
        {uploadBlock === null ? (
          <>
            <p className="field-hint">{m.fid_upload_hint({ size: FACTION_EMBLEM_UPLOAD.size })}</p>
            <p className="field-hint">{m.fid_upload_rules()}</p>
          </>
        ) : (
          <p className="fid-upload-off" role="note" data-block={uploadBlock}>
            {uploadBlock === "switch_off" ? m.fid_upload_off() : m.fid_upload_blocked()}
          </p>
        )}
        {unreadable ? (
          <p role="alert" className="field-error">
            {m.fid_upload_unreadable()}
          </p>
        ) : null}
        {picked ? (
          <Suspense
            fallback={
              <p className="status" role="status">
                {m.fid_crop_loading()}
              </p>
            }
          >
            <EmblemCropper
              key={picked.url}
              image={picked.image}
              onCancel={closeCropper}
              onDone={(pngBase64) => {
                onChange({ ...draft, upload: { kind: "new", pngBase64 } });
                closeCropper();
              }}
            />
          </Suspense>
        ) : null}
      </>
    );

  return (
    <fieldset className="fid-group fid-emblem" data-mode={mode}>
      <legend className="fid-section-title">{m.fid_emblem_label()}</legend>
      <div className="fid-emblem-head">
        <IdentityEmblem
          spec={spec}
          color={draft.color}
          upload={mode === "made" ? { kind: "none" } : draft.upload}
          size={96}
          className="fid-emblem-big"
        />
        <div className="fid-modes" role="radiogroup" aria-label={m.fid_emblem_mode()}>
          {(["made", "upload"] as const).map((value) => (
            <label key={value} className="fid-mode" data-checked={mode === value ? "" : undefined}>
              <input
                type="radio"
                className="fid-mode-input"
                name={`${groupId}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => pickMode(value)}
              />
              <span>{value === "made" ? m.fid_emblem_mode_made() : m.fid_emblem_mode_upload()}</span>
            </label>
          ))}
        </div>
      </div>
      {mode === "made" ? (
        <div className="fid-made">
          <div className="fid-actions">
            <button
              type="button"
              className="button-small fid-reroll"
              onClick={() => {
                setSpec(rerollEmblem(seed, round));
                setRound(round + 1);
              }}
            >
              {m.fid_emblem_reroll()}
            </button>
          </div>
          <div className="fid-picks">
            <Pick
              label={m.dev_nations_emblem_shape()}
              name="shape"
              value={spec.shape}
              options={EMBLEM_SHAPES.map((value) => ({ value, label: SHAPE_TEXT[value]() }))}
              onChange={(shape) => setSpec({ ...spec, shape })}
            />
            <Pick
              label={m.dev_nations_emblem_division()}
              name="division"
              value={spec.division}
              options={EMBLEM_DIVISIONS.map((value) => ({ value, label: DIVISION_TEXT[value]() }))}
              onChange={(division) => setSpec({ ...spec, division })}
            />
            <Pick
              label={m.dev_nations_emblem_charge()}
              name="charge"
              value={spec.charge}
              options={EMBLEM_CHARGES.map((value) => ({ value, label: CHARGE_TEXT[value]() }))}
              onChange={(charge) => setSpec({ ...spec, charge })}
            />
            <Pick
              label={m.dev_nations_emblem_scheme()}
              name="scheme"
              value={spec.scheme}
              options={SCHEMES.map((value) => ({
                value,
                label: m.dev_nations_emblem_scheme_n({ n: value + 1 }),
              }))}
              onChange={(scheme) => setSpec({ ...spec, scheme })}
            />
          </div>
        </div>
      ) : (
        <div className="fid-upload">{uploadBody}</div>
      )}
      {error === null ? null : (
        <p role="alert" className="field-error fid-emblem-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
