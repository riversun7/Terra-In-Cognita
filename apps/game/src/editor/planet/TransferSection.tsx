// JSON 내보내기·가져오기 — 반영(에이전트에게 주기)과 백업(ADR 38 9절). 보관함 행성 판(LibraryPanel)이 아래에 붙인다.
// - 내보내기: 열 때 확인이 "같음"일 때만(editorView exportBlock). 글 상자 + [복사] + [파일로 받기]. 작업 사본을 내보낸다.
// - 가져오기: 글 붙여 넣기 또는 파일 → parseDraftImport → 다른 행성이면 막음 → checkDraftForPack(서버와 같은 차례)
//   → 면 레벨·바이옴 표·생성기 판이 다르면 알림 → 확인 창 → 작업 사본을 바꾼다(서버에는 [저장]할 때 쓴다). 부모가 onImport로 한다.
import { type ChangeEvent, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  DRAFT_IMPORT_MAX_BYTES,
  type DraftImport,
  checkDraftForPack,
  parseDraftImport,
} from "./draftExport.ts";
import { reasonText } from "./editorMessages.ts";
import type { DraftEntry } from "./editorModel.ts";
import { stableJson } from "./stableJson.ts";

export interface TransferSectionProps {
  /** 정의 항목의 행성 ID(시작한 팩 행성) — 가져올 항목의 id와 견준다 */
  readonly planetId: string;
  /** 팩(정의 조회): 행성 ID들·바이옴 항목들 */
  readonly pack: { readonly planetIds: readonly string[]; readonly biomes: readonly unknown[] };
  /** 시작한 팩 행성 항목(면 레벨·바이옴 표 견주기) */
  readonly baseEntry: DraftEntry;
  readonly deviceGeneratorVersion: number;
  /** 내보내기를 막는 이유 문구(없으면 null) */
  readonly exportBlocked: string | null;
  readonly buildExport: () => { readonly text: string; readonly fileName: string } | null;
  readonly onImport: (draft: DraftImport, warnings: readonly string[]) => void;
}

/** 가져올 항목이 팩과 다른 점(알림만, 서버는 지금 팩으로 맞으면 받는다 — ADR 38 WP-B) */
function importWarnings(draft: DraftImport, baseEntry: DraftEntry, deviceGeneratorVersion: number): string[] {
  const warnings: string[] = [];
  if (draft.planet.faceLevel !== baseEntry.faceLevel) {
    warnings.push(
      m.planet_editor_import_face_level({
        entry: String(draft.planet.faceLevel),
        pack: String(baseEntry.faceLevel),
      }),
    );
  }
  if (stableJson(draft.planet.biomes) !== stableJson(baseEntry.biomes))
    warnings.push(m.planet_editor_import_biomes());
  if (draft.generatorVersion !== null && draft.generatorVersion !== deviceGeneratorVersion) {
    warnings.push(m.planet_editor_import_generator({ version: String(draft.generatorVersion) }));
  }
  return warnings;
}

export function TransferSection(props: TransferSectionProps) {
  const id = useId();
  const [exported, setExported] = useState<{ text: string; fileName: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const doExport = (): void => {
    const result = props.buildExport();
    setExported(result);
    setCopyState("idle");
  };

  const copy = (): void => {
    if (!exported) return;
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      setCopyState("failed");
      return;
    }
    clipboard.writeText(exported.text).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  };

  const download = (): void => {
    if (!exported) return;
    const url = URL.createObjectURL(new Blob([exported.text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const tryImport = (text: string): void => {
    const parsed = parseDraftImport(text);
    if (!parsed.ok) {
      setImportError(m.planet_editor_import_failed({ reason: reasonText(parsed.code) }));
      return;
    }
    const { draft } = parsed;
    // 다른 행성에서 내보낸 것은 따로 알린다(서버는 invalid_entry만 준다)
    if (typeof draft.planet.id === "string" && draft.planet.id !== props.planetId) {
      setImportError(m.planet_editor_import_other_planet({ id: draft.planet.id }));
      return;
    }
    const problem = checkDraftForPack(draft.planet, props.pack, props.planetId);
    if (problem) {
      setImportError(m.planet_editor_import_failed({ reason: reasonText(problem) }));
      return;
    }
    setImportError(null);
    props.onImport(draft, importWarnings(draft, props.baseEntry, props.deviceGeneratorVersion));
  };

  const readFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > DRAFT_IMPORT_MAX_BYTES) {
      setImportError(m.planet_editor_import_failed({ reason: reasonText("too_large") }));
      return;
    }
    file.text().then(
      (text) => {
        setImportText(text);
        tryImport(text);
      },
      () => setImportError(m.planet_editor_import_failed({ reason: reasonText("not_json") })),
    );
  };

  return (
    <>
      <section className="pe-section" aria-labelledby={`${id}-export`}>
        <h2 id={`${id}-export`} className="section-title">
          {m.planet_editor_export()}
        </h2>
        <p className="field-hint">{m.planet_editor_export_hint()}</p>
        {props.exportBlocked ? <p className="field-error pe-export-blocked">{props.exportBlocked}</p> : null}
        <button
          type="button"
          className="button-small pe-export"
          aria-disabled={props.exportBlocked !== null}
          onClick={() => {
            if (props.exportBlocked === null) doExport();
          }}
        >
          {m.planet_editor_export()}
        </button>
        {exported ? (
          <>
            <label className="field-label" htmlFor={`${id}-export-text`}>
              {m.planet_editor_export_text()}
            </label>
            <textarea
              id={`${id}-export-text`}
              className="input pe-textarea pe-export-text"
              name="export"
              translate="no"
              readOnly
              value={exported.text}
              rows={8}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="form-actions">
              <button type="button" className="button-small" onClick={copy}>
                {m.planet_editor_export_copy()}
              </button>
              <button type="button" className="button-small" onClick={download}>
                {m.planet_editor_export_download()}
              </button>
            </div>
            <p className="field-hint" role="status">
              {copyState === "copied"
                ? m.planet_editor_export_copied()
                : copyState === "failed"
                  ? m.planet_editor_export_copy_failed()
                  : ""}
            </p>
          </>
        ) : null}
      </section>

      <section className="pe-section" aria-labelledby={`${id}-import`}>
        <h2 id={`${id}-import`} className="section-title">
          {m.planet_editor_import()}
        </h2>
        <label className="field-label" htmlFor={`${id}-import-text`}>
          {m.planet_editor_import_text()}
        </label>
        <textarea
          id={`${id}-import-text`}
          className="input pe-textarea pe-import-text"
          name="import"
          autoComplete="off"
          translate="no"
          value={importText}
          rows={5}
          spellCheck={false}
          aria-invalid={importError !== null}
          aria-describedby={`${id}-import-error`}
          onChange={(event) => setImportText(event.target.value)}
        />
        <p id={`${id}-import-error`} className="field-error pe-import-error" role="alert">
          {importError ?? ""}
        </p>
        <div className="form-actions">
          <label className="button-small pe-file">
            {m.planet_editor_import_file()}
            <input
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={readFile}
            />
          </label>
          <button
            type="button"
            className="button-small pe-import"
            aria-disabled={importText.trim() === ""}
            onClick={() => {
              if (importText.trim() !== "") tryImport(importText);
            }}
          >
            {m.planet_editor_import_check()}
          </button>
        </div>
      </section>
    </>
  );
}
