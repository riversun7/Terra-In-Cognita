// 행성 판 — 보관함 행성 정보, [다른 이름으로 저장]·[이름 바꾸기]·[새 행성]·[지우기], 저장 기록(판 불러오기),
// JSON 내보내기·가져오기(ADR 38 "바뀜: 행성 보관함", 사용자 결정 2026-10-31 "팀 공용 목록").
// - [저장]은 머리 줄에 있다(늘 보이게). 이 판은 덜 자주 쓰는 일을 모은다.
// - 저장 기록은 [저장]마다 한 판(자동 저장 없음). [불러오기]는 그 판의 정의를 작업 사본으로 둔다(서버는 그대로, [저장]해야 새 판).
// - [지우기]는 만든 사람·admin만 보인다(서버도 본다: not_author). 지우기는 표시만 한다(같은 ID를 다시 쓰지 않는다).
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { TransferSection, type TransferSectionProps } from "./TransferSection.tsx";
import { formatBytes, formatTime, libraryFailureText } from "./editorMessages.ts";
import type { LibraryVersionInfo } from "./libraryClient.ts";
import type { LibraryDocState } from "./useLibraryDocument.ts";

export interface LibraryPanelProps {
  readonly doc: LibraryDocState;
  /** 시작한 팩 행성 이름 */
  readonly baseName: string;
  readonly canRemove: boolean;
  readonly loadVersions: () => Promise<readonly LibraryVersionInfo[]>;
  readonly onLoadVersion: (revision: number) => void;
  readonly onSaveAs: () => void;
  readonly onRename: () => void;
  readonly onNewPlanet: () => void;
  readonly onRemove: () => void;
  readonly transfer: TransferSectionProps;
}

type VersionsState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly list: readonly LibraryVersionInfo[] };

export function LibraryPanel(props: LibraryPanelProps) {
  const { doc } = props;
  const id = useId();
  const [versions, setVersions] = useState<VersionsState>({ kind: "idle" });
  const saved = doc.saved;
  const loadVersions = (): void => {
    setVersions({ kind: "loading" });
    props.loadVersions().then(
      (list) => setVersions({ kind: "ready", list }),
      () => setVersions({ kind: "failed" }),
    );
  };
  return (
    <div className="pe-stack">
      <section className="pe-section pe-library-info" aria-labelledby={`${id}-name`}>
        <h2 id={`${id}-name`} className="pe-library-name">
          {doc.name}
        </h2>
        <p className="field-hint">
          {saved
            ? m.planet_editor_library_meta({
                author: saved.author?.name ?? m.planet_editor_library_unknown_person(),
                base: props.baseName,
              })
            : m.planet_editor_library_meta_new({ base: props.baseName })}
        </p>
        {saved ? (
          <p className="field-hint" data-revision={saved.revision}>
            {m.planet_editor_library_saved_meta({
              revision: String(saved.revision),
              time: formatTime(saved.updatedAt),
              person: saved.updatedBy?.name ?? m.planet_editor_library_unknown_person(),
            })}
          </p>
        ) : null}
        {doc.failure ? (
          <p className="field-error pe-library-error" role="alert">
            {libraryFailureText(doc.failure)}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="button-small pe-save-as"
            onClick={props.onSaveAs}
            aria-disabled={doc.busy}
          >
            {m.planet_editor_library_save_as()}
          </button>
          <button
            type="button"
            className="button-small pe-rename"
            onClick={props.onRename}
            aria-disabled={doc.busy}
          >
            {m.planet_editor_library_rename()}
          </button>
          <button type="button" className="button-small pe-new-planet" onClick={props.onNewPlanet}>
            {m.planet_editor_library_new()}
          </button>
        </div>
      </section>

      {saved ? (
        <section className="pe-section" aria-labelledby={`${id}-versions`}>
          <h2 id={`${id}-versions`} className="section-title">
            {m.planet_editor_library_versions()}
          </h2>
          <p className="field-hint">{m.planet_editor_library_versions_hint()}</p>
          <button type="button" className="button-small pe-versions-load" onClick={loadVersions}>
            {m.planet_editor_library_versions_load()}
          </button>
          {versions.kind === "failed" ? (
            <p className="field-error">{m.planet_editor_library_versions_failed()}</p>
          ) : null}
          {versions.kind === "ready" ? (
            <ul className="pe-revisions">
              {versions.list.map((version) => (
                <li key={version.revision} className="pe-revision" data-revision={version.revision}>
                  <span>
                    {m.planet_editor_library_version_row({
                      revision: String(version.revision),
                      time: formatTime(version.savedAt),
                      person: version.savedBy?.name ?? m.planet_editor_library_unknown_person(),
                      size: formatBytes(version.bytes),
                    })}
                  </span>
                  <button
                    type="button"
                    className="button-small"
                    aria-label={m.planet_editor_library_load_version_label({
                      revision: String(version.revision),
                    })}
                    onClick={() => props.onLoadVersion(version.revision)}
                  >
                    {m.planet_editor_library_load_version()}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <TransferSection {...props.transfer} />

      {props.canRemove ? (
        <section className="pe-section">
          <button
            type="button"
            className="pe-button-danger pe-remove"
            onClick={props.onRemove}
            aria-disabled={doc.busy}
          >
            {saved ? m.planet_editor_library_remove() : m.planet_editor_library_discard_new()}
          </button>
        </section>
      ) : null}
    </div>
  );
}
