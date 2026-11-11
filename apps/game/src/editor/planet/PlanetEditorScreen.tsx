// 행성 편집기 화면(/dev/planet-editor, 틀 숨김) — ADR 38, "바뀜: 행성 보관함". 주소 → 화면 표(shell/routeViews.tsx)가 지연 로딩
// 조각으로 연다. 조각 이름은 이 파일 이름을 따른다(PlanetEditorScreen-*.js): 미리 캐시 규칙 DEV_ONLY_CHUNK의 [Pp]lanetEditor에
// 걸려 플레이어 설치 때 받지 않는다(ADR 38 1절). 파일 이름 앞머리를 바꾸지 않는다.
// 화면은 { onClose, monitor }만 받는다(ADR 37 주소 → 화면 표). 순서: 정의 조회(팩 행성·바이옴·확인 해시, 감사 기록)와 보관함 목록
// (팀 공용, 만든 사람 표시)을 같이 받는다 → 행성 고르기(마지막으로 연 것 → 저장하지 않은 새 행성 → 목록 첫째) → 편집 화면.
// 보관함이 비어 있으면 [새 행성]부터 묻는다. [새 행성]은 이름·시작점(팩 행성 또는 행성 표본: 태양계 암석 행성 등 정의만 있고
// 서버가 굽지 않는 것, ADR 38 "행성 표본")을 받아 이 기기에 작업 사본만 만든다: 서버에는 첫 [저장]에 쓴다(사용자 결정 2026-10-31).
// 화면 시험은 e2e/planet-editor.spec.ts.
import type { PlanetLibraryBase } from "@terra/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { apiErrorInfo } from "../../net/apiErrors.ts";
import { m } from "../../paraglide/messages.js";
import type { FrameMonitor } from "../../perf/frameMonitor.ts";
import { LiveMessage } from "../../ui/LiveMessage.tsx";
import { text } from "../../ui/text.ts";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { browserStorage } from "./crashSentinel.ts";
import { type EditorDefinitions, EditorWorkspace, startPlanetOf } from "./EditorWorkspace.tsx";
import ScopeBar from "../../scope/ScopeBar.tsx";
import { type PromptRequest, PromptDialog } from "./PromptDialog.tsx";
import { localName } from "./editorMessages.ts";
import { type LibraryPlanet, type LibrarySummary, libraryApi } from "./libraryClient.ts";
import type { OpenedPlanet } from "./useLibraryDocument.ts";
import { NEW_PLANET_KEY, createWorkingCopyStore } from "./workingCopy.ts";
import "./planetEditor.css";

/** [새 행성]의 처음 시작점: 편집 전용 행성(ADR 38 10절, 사용자 D2). 팩에 없으면 첫 행성 */
const DEFAULT_BASE_ID = "s2_editor_planet";

interface PlanetEditorScreenProps {
  onClose: () => void;
  /** 앱 프레임 측정기 — 지금은 쓰지 않는다(편집기는 성능 보고 화면이 아니다). 주소 → 화면 표와 모양을 맞춘다 */
  monitor: FrameMonitor;
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly definitions: EditorDefinitions;
      readonly list: readonly LibrarySummary[];
    };

/** 연 행성의 자료(보관함 행성은 정의를 받아야 한다) */
type Opened =
  | { readonly kind: "none" }
  | { readonly kind: "loading"; readonly key: string }
  | { readonly kind: "failed"; readonly key: string; readonly message: string }
  | { readonly kind: "ready"; readonly key: string; readonly opened: OpenedPlanet };

/** 시작점 하나: 고르기 값(종류:ID, 팩 행성과 표본의 ID가 겹쳐도 가른다), 이름, 묶음, 한 줄 특징 */
interface StartOption {
  readonly value: string;
  readonly base: PlanetLibraryBase;
  readonly label: string;
  readonly group: string;
  readonly note: string | null;
}

/** 시작점 하나를 만든다. 한 줄 특징은 표본만(팩 행성은 설명이 있어도 보이지 않는다) */
function startOption(
  kind: PlanetLibraryBase["kind"],
  planet: EditorDefinitions["planets"][number],
): StartOption {
  const note = localName(planet.entry.description, "");
  return {
    value: `${kind}:${planet.id}`,
    base: { kind, id: planet.id },
    label: localName(planet.entry.name, planet.id),
    group:
      kind === "template" ? m.planet_editor_library_group_template() : m.planet_editor_library_group_pack(),
    note: kind === "template" && note !== "" ? note : null,
  };
}

/** 시작점 목록: 팩 행성, 그다음 행성 표본(이름 + 한 줄 특징 = 표본 항목의 description) */
function startOptions(definitions: EditorDefinitions): StartOption[] {
  return [
    ...definitions.planets.map((planet) => startOption("pack", planet)),
    ...definitions.templates.map((planet) => startOption("template", planet)),
  ];
}

/** [다시 시도]는 안쪽을 새로 만든다(정의·목록을 다시 받는다) */
export default function PlanetEditorScreen({ onClose }: PlanetEditorScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return <EditorLoader key={attempt} onClose={onClose} onRetry={() => setAttempt((count) => count + 1)} />;
}

function errorText(error: unknown): string {
  const info = apiErrorInfo(error);
  if (info.sessionEnded) void refreshSession();
  return text({ key: info.key });
}

function EditorLoader({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const store = useMemo(() => createWorkingCopyStore(browserStorage()), []);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(() => store.lastPlanet());
  const [opened, setOpened] = useState<Opened>({ kind: "none" });
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  /** 새 행성 사본이 바뀐 차례(목록의 "새 행성" 줄을 다시 읽게) */
  const [newVersion, setNewVersion] = useState(0);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const selectId = useId();

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.planetEditor.definitions.query(), libraryApi.list()]).then(
      ([definitions, list]) => {
        if (!cancelled) setLoad({ kind: "ready", definitions, list });
      },
      (error: unknown) => {
        if (!cancelled) setLoad({ kind: "failed", message: errorText(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const definitions = load.kind === "ready" ? load.definitions : null;
  const list = load.kind === "ready" ? load.list : [];
  // newVersion이 바뀌면 다시 읽는다(새 행성 사본을 만들거나 버린 뒤)
  const newCopy = useMemo(() => (newVersion >= 0 ? store.read(NEW_PLANET_KEY) : null), [store, newVersion]);
  /** 고른 행성: 고른 것이 목록(또는 새 행성 사본)에 있으면 그것, 아니면 새 행성 사본 → 목록 첫째 */
  const current =
    (selected === NEW_PLANET_KEY && newCopy) || list.some((item) => item.id === selected)
      ? selected
      : newCopy
        ? NEW_PLANET_KEY
        : (list[0]?.id ?? null);

  // 고른 보관함 행성의 정의를 받는다(새 행성은 사본으로 바로 연다). 받은 자료는 열쇠로 맞춰 쓴다(다른 행성 것은 쓰지 않는다)
  const ready = definitions !== null;
  useEffect(() => {
    if (!ready || current === null || current === NEW_PLANET_KEY) return () => undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setOpened({ kind: "loading", key: current });
    });
    libraryApi.get(current).then(
      (planet) => {
        if (!cancelled) setOpened({ kind: "ready", key: current, opened: { kind: "library", planet } });
      },
      (error: unknown) => {
        if (!cancelled) setOpened({ kind: "failed", key: current, message: errorText(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, current]);

  const choose = (key: string | null): void => {
    setSelected(key);
    store.setLastPlanet(key);
    setOpened({ kind: "none" });
  };
  const updateList = (next: (items: readonly LibrarySummary[]) => readonly LibrarySummary[]): void =>
    setLoad((state) => (state.kind === "ready" ? { ...state, list: next(state.list) } : state));

  const newPlanet = (): void => {
    if (!definitions) return;
    const options = startOptions(definitions);
    const initial =
      options.find((option) => option.base.kind === "pack" && option.base.id === DEFAULT_BASE_ID) ??
      options[0];
    if (!initial) return;
    setPrompt({
      title: m.planet_editor_library_new(),
      initialName: m.planet_editor_library_default_name({ number: String(list.length + 1) }),
      confirmLabel: m.planet_editor_library_create(),
      choices: {
        options: options.map(({ value, label, group, note }) => ({ value, label, group, note })),
        initial: initial.value,
      },
      onConfirm: (name, choice) => {
        const option = options.find((item) => item.value === choice) ?? initial;
        const base = startPlanetOf(definitions, option.base);
        if (!base) return;
        store.write({ key: NEW_PLANET_KEY, fromRevision: 0, entry: base.entry, name, base: option.base });
        setNewVersion((count) => count + 1);
        choose(NEW_PLANET_KEY);
      },
    });
  };

  const library = {
    api: libraryApi,
    store,
    onCreated: (planet: LibraryPlanet) => {
      const { definition: _definition, ...summary } = planet;
      updateList((items) => [summary, ...items.filter((item) => item.id !== planet.id)]);
      setNewVersion((count) => count + 1);
      choose(planet.id);
    },
    onUpdated: (summary: LibrarySummary) =>
      updateList((items) => items.map((item) => (item.id === summary.id ? summary : item))),
    onRemoved: (key: string) => {
      updateList((items) => items.filter((item) => item.id !== key));
      setNewVersion((count) => count + 1);
      choose(null);
    },
  };

  const openedPlanet: OpenedPlanet | null =
    current === NEW_PLANET_KEY && newCopy?.name !== undefined && newCopy.base !== undefined
      ? { kind: "new", name: newCopy.name, base: newCopy.base, entry: newCopy.entry }
      : opened.kind === "ready" && opened.key === current
        ? opened.opened
        : null;
  // 기준 행성 = 시작점(팩 행성 또는 행성 표본)의 정의
  const basePlanet =
    openedPlanet && definitions
      ? startPlanetOf(definitions, openedPlanet.kind === "new" ? openedPlanet.base : openedPlanet.planet.base)
      : undefined;

  const heading = (
    <>
      <h1 id="planet-editor-title" className="pe-title" ref={headingRef} tabIndex={-1}>
        {m.shell_route_dev_planet_editor()}
      </h1>
      {definitions && (list.length > 0 || newCopy) ? (
        <>
          <label htmlFor={selectId} className="visually-hidden">
            {m.planet_editor_planet()}
          </label>
          <select
            id={selectId}
            className="pe-planet-select"
            value={current ?? ""}
            onChange={(event) => choose(event.target.value)}
          >
            {newCopy?.name !== undefined ? (
              <option value={NEW_PLANET_KEY}>
                {m.planet_editor_library_new_option({ name: newCopy.name })}
              </option>
            ) : null}
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {m.planet_editor_library_option({
                  name: item.name,
                  author: item.author?.name ?? m.planet_editor_library_unknown_person(),
                })}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <ScopeBar route="dev_planet_editor" inline />
    </>
  );

  const failure =
    load.kind === "failed"
      ? load.message
      : opened.kind === "failed" && opened.key === current
        ? opened.message
        : null;
  return (
    <section className="pe-screen" data-density="compact" aria-labelledby="planet-editor-title">
      {definitions && openedPlanet && basePlanet ? (
        <EditorWorkspace
          key={current ?? ""}
          opened={openedPlanet}
          basePlanet={basePlanet}
          definitions={definitions}
          library={library}
          onNewPlanet={newPlanet}
          onClose={onClose}
          heading={heading}
        />
      ) : (
        <>
          <header className="pe-header">
            <button type="button" className="button-small pe-back" onClick={onClose}>
              {m.planet_editor_back()}
            </button>
            {heading}
          </header>
          <div className="pe-center">
            {failure !== null ? (
              <>
                <LiveMessage tone="error" lines={[m.planet_editor_load_failed(), failure]} />
                <div className="form-actions">
                  <button type="button" onClick={onRetry}>
                    {m.retry()}
                  </button>
                </div>
              </>
            ) : definitions && current === null ? (
              <div className="pe-empty">
                <p className="pe-empty-title">{m.planet_editor_library_empty()}</p>
                <p className="field-hint">{m.planet_editor_library_empty_hint()}</p>
                <div className="form-actions">
                  <button type="button" className="button-primary pe-new-planet" onClick={newPlanet}>
                    {m.planet_editor_library_new()}
                  </button>
                </div>
              </div>
            ) : (
              <p className="status pe-loading" role="status">
                {m.planet_editor_loading()}
              </p>
            )}
          </div>
        </>
      )}
      <PromptDialog request={prompt} onClose={() => setPrompt(null)} />
    </section>
  );
}
