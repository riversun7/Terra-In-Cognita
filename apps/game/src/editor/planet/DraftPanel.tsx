// 초안 판 — 서버 초안 저장 상태·충돌, 판 기록(되돌리기), JSON 내보내기·가져오기, 초안 지우기(ADR 38 9절, 사용자 D3)
// - 저장은 자동이다(draftSync.ts: 바꾼 뒤 2초). 이 판은 상태를 보이고 충돌·다시 시도 버튼을 둔다.
// - 판 기록은 [판 기록 보기]를 누를 때 받는다(새 판부터 최근 50개). 되돌리기는 확인 창 뒤(부모).
// - 내보내기: 열 때 확인이 "같음"일 때만(editorView exportBlock). 글 상자 + [복사] + [파일로 받기].
// - 가져오기: 글 붙여 넣기 또는 파일 → parseDraftImport → 다른 행성이면 막음 → checkDraftForPack(서버와 같은 차례)
//   → 면 레벨·바이옴 표·생성기 판이 다르면 알림 → 확인 창 → 초안을 바꾸고 바로 저장(새 판). 부모가 onImport로 한다.
import { type ChangeEvent, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  DRAFT_IMPORT_MAX_BYTES,
  type DraftImport,
  checkDraftForPack,
  parseDraftImport,
} from "./draftExport.ts";
import type { DraftRevisionInfo, DraftSyncSnapshot } from "./draftSync.ts";
import { formatBytes, formatTime, reasonText, saveStatusText } from "./editorMessages.ts";
import type { DraftEntry } from "./editorModel.ts";
import { stableJson } from "./stableJson.ts";

export interface DraftPanelProps {
  readonly planetId: string;
  readonly sync: DraftSyncSnapshot;
  /** 팩(정의 조회): 행성 ID들·바이옴 항목들 + 이 행성의 공개본 항목(면 레벨·바이옴 표 견주기) */
  readonly pack: { readonly planetIds: readonly string[]; readonly biomes: readonly unknown[] };
  readonly baseEntry: DraftEntry;
  readonly deviceGeneratorVersion: number;
  /** 내보내기를 막는 이유 문구(없으면 null) */
  readonly exportBlocked: string | null;
  readonly buildExport: () => { readonly text: string; readonly fileName: string } | null;
  readonly loadRevisions: () => Promise<readonly DraftRevisionInfo[]>;
  readonly onRestore: (revision: number) => void;
  readonly onImport: (draft: DraftImport, warnings: readonly string[]) => void;
  readonly onRemove: () => void;
  readonly onLoadTheirs: () => void;
  readonly onOverwrite: () => void;
  readonly onRetry: () => void;
}

type RevisionState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly list: readonly DraftRevisionInfo[] };

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

export function DraftPanel(props: DraftPanelProps) {
  const { sync } = props;
  const id = useId();
  const [revisions, setRevisions] = useState<RevisionState>({ kind: "idle" });
  const [exported, setExported] = useState<{ text: string; fileName: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const loadRevisions = (): void => {
    setRevisions({ kind: "loading" });
    props.loadRevisions().then(
      (list) => setRevisions({ kind: "ready", list }),
      () => setRevisions({ kind: "failed" }),
    );
  };

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

  const ready = sync.document !== null;
  return (
    <div className="pe-stack">
      <section className="pe-section" aria-labelledby={`${id}-save`}>
        <h2 id={`${id}-save`} className="visually-hidden">
          {m.planet_editor_tab_draft()}
        </h2>
        <p
          className="pe-save-line"
          role="status"
          data-save-status={sync.status}
          data-revision={sync.revision}
        >
          {saveStatusText(sync)}
        </p>
        {sync.updatedAt ? (
          <p className="field-hint">{m.planet_editor_save_updated({ time: formatTime(sync.updatedAt) })}</p>
        ) : null}
        {sync.status === "conflict" ? (
          <div className="form-actions">
            <button type="button" onClick={props.onLoadTheirs}>
              {m.planet_editor_load_theirs()}
            </button>
            <button type="button" className="button-primary" onClick={props.onOverwrite}>
              {m.planet_editor_overwrite()}
            </button>
          </div>
        ) : null}
        {sync.status === "retrying" || sync.status === "denied" || sync.status === "load_failed" ? (
          <div className="form-actions">
            <button type="button" onClick={props.onRetry}>
              {m.retry()}
            </button>
          </div>
        ) : null}
      </section>

      <section className="pe-section" aria-labelledby={`${id}-revisions`}>
        <h2 id={`${id}-revisions`} className="section-title">
          {m.planet_editor_revisions()}
        </h2>
        <button
          type="button"
          className="button-small pe-revisions-load"
          onClick={loadRevisions}
          aria-disabled={!ready}
        >
          {m.planet_editor_revisions_load()}
        </button>
        {revisions.kind === "failed" ? (
          <p className="field-error">{m.planet_editor_revisions_failed()}</p>
        ) : null}
        {revisions.kind === "ready" && revisions.list.length === 0 ? (
          <p className="field-hint">{m.planet_editor_revisions_empty()}</p>
        ) : null}
        {revisions.kind === "ready" && revisions.list.length > 0 ? (
          <ul className="pe-revisions">
            {revisions.list.map((revision) => (
              <li key={revision.revision} className="pe-revision" data-revision={revision.revision}>
                <span>
                  {m.planet_editor_revision_row({
                    revision: String(revision.revision),
                    time: formatTime(revision.savedAt),
                    size: formatBytes(revision.bytes),
                  })}
                </span>
                {revision.revision === sync.revision ? null : (
                  <button
                    type="button"
                    className="button-small"
                    aria-label={m.planet_editor_restore_label({ revision: String(revision.revision) })}
                    onClick={() => props.onRestore(revision.revision)}
                  >
                    {m.planet_editor_restore()}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
            aria-disabled={!ready || importText.trim() === ""}
            onClick={() => {
              if (ready && importText.trim() !== "") tryImport(importText);
            }}
          >
            {m.planet_editor_import_check()}
          </button>
        </div>
      </section>

      <section className="pe-section">
        <button
          type="button"
          className="pe-button-danger pe-remove"
          aria-disabled={!ready}
          onClick={props.onRemove}
        >
          {m.planet_editor_remove()}
        </button>
      </section>
    </div>
  );
}
