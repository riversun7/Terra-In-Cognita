// 항성계 편집기 화면(/dev/star-system, 틀 숨김) — ADR 2026-10-31-star-system-editor. dev·admin만(주소 표 access, 서버도 본다).
// 주소 → 화면 표(shell/routeViews.tsx)가 지연 로딩 조각으로 연다. 조각 이름은 이 파일 이름을 따른다(StarSystemScreen-*.js):
// 미리 캐시 규칙 DEV_ONLY_CHUNK의 [Ss]tarSystem에 걸려 플레이어 설치 때 받지 않는다. 파일 이름 앞머리를 바꾸지 않는다.
// - 항성계 보관함은 팀 공용 목록이다(행성 보관함과 같은 규칙): [저장]할 때만 서버에 쓰고, 판으로 충돌을 보고, 지우기는 만든 사람·admin.
//   고치는 중인 항성계는 이 화면(메모리)에만 있다: 저장하지 않고 나가면 묻는다. [새 항성계]는 첫 [저장]에 만든다.
// - 그림(space/StarSystemView)과 배치·제안 계산(space/starSystemLayout, @terra/shared starSystem)은 나중 게임 항성계 화면이 같이 쓴다.
//   이 화면은 그 위의 편집 껍데기다. 게임 규칙(공전·이동·건물)은 넣지 않는다(기획 질문 100~103).
// - [제안 적용]은 행성 편집기와 같은 작업 사본(이 기기 localStorage)에만 쓴다. 서버의 행성은 바꾸지 않는다.
// 화면 시험은 e2e/star-system.spec.ts.
import {
  type RouteTarget,
  type StarSystemBody,
  type StarTypeId,
  emptyStarSystem,
  starType,
} from "@terra/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { useSession } from "../../auth/session.ts";
import { m } from "../../paraglide/messages.js";
import { StarSystemView } from "../../space/StarSystemView.tsx";
import { LiveMessage } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { type ConfirmRequest, ConfirmDialog } from "../planet/ConfirmDialog.tsx";
import { type PromptRequest, PromptDialog } from "../planet/PromptDialog.tsx";
import { browserStorage } from "../planet/crashSentinel.ts";
import {
  type LibraryPlanet,
  type LibrarySummary,
  libraryApi,
  libraryFailure,
} from "../planet/libraryClient.ts";
import { createWorkingCopyStore } from "../planet/workingCopy.ts";
import { OrbitCard } from "./OrbitCard.tsx";
import { SystemPanel } from "./SystemPanel.tsx";
import { type Temperatures, applySuggestion } from "./applySuggestion.ts";
import {
  formatAu,
  sameDefinition,
  withOrbitAdded,
  withOrbitBody,
  withOrbitDistance,
  withOrbitRemoved,
  withStarType,
} from "./systemEdit.ts";
import { bodyKindText, failureText, starTypeName } from "./systemMessages.ts";
import { type SystemRecord, type SystemSummary, systemsApi } from "./systemsClient.ts";
import "../planet/planetEditor.css";
import "./starSystem.css";

/** 마지막으로 연 항성계(이 기기의 편의. 못 쓰면 기억하지 않는다) */
const LAST_SYSTEM_KEY = "terra.starSystem.last";
/** 아직 저장하지 않은 새 항성계 */
const NEW_KEY = "new";

interface StarSystemScreenProps {
  readonly onClose: () => void;
  readonly onNavigate: (target: RouteTarget) => void;
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly systems: readonly SystemSummary[];
      readonly library: readonly LibrarySummary[];
    };

/** 고치는 항성계(화면 메모리) */
interface SystemDoc {
  /** 서버 ID 또는 NEW_KEY */
  readonly key: string;
  readonly name: string;
  /** 서버 판(새 항성계는 0) */
  readonly revision: number;
  readonly author: SystemSummary["author"];
  /** 마지막으로 저장한 정의(새 항성계는 null) */
  readonly saved: SystemRecord["definition"] | null;
  readonly definition: SystemRecord["definition"];
}

function docOf(record: SystemRecord): SystemDoc {
  return {
    key: record.id,
    name: record.name,
    revision: record.revision,
    author: record.author,
    saved: record.definition,
    definition: record.definition,
  };
}

function readLast(): string | null {
  try {
    return browserStorage()?.getItem(LAST_SYSTEM_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeLast(key: string | null): void {
  try {
    const storage = browserStorage();
    if (!storage) return;
    if (key === null || key === NEW_KEY) storage.removeItem(LAST_SYSTEM_KEY);
    else storage.setItem(LAST_SYSTEM_KEY, key);
  } catch {
    // 막힌 저장소: 기억하지 않는다
  }
}

const isDirty = (doc: SystemDoc | null): boolean =>
  doc !== null && (doc.saved === null || !sameDefinition(doc.saved, doc.definition));

/** [다시 시도]는 안쪽을 새로 만든다(목록을 다시 받는다) */
export default function StarSystemScreen(props: StarSystemScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return <SystemLoader key={attempt} {...props} onRetry={() => setAttempt((count) => count + 1)} />;
}

function SystemLoader({ onClose, onNavigate, onRetry }: StarSystemScreenProps & { onRetry: () => void }) {
  const store = useMemo(() => createWorkingCopyStore(browserStorage()), []);
  const session = useSession();
  const viewer = session.kind === "signed_in" ? session.user : null;
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const selectId = useId();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(readLast);
  const [doc, setDoc] = useState<SystemDoc | null>(null);
  const [openFailure, setOpenFailure] = useState<{ key: string; message: string } | null>(null);
  const [orbit, setOrbit] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string; version: number } | null>(
    null,
  );
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([systemsApi.list(), libraryApi.list()]).then(
      ([systems, library]) => {
        if (!cancelled) setLoad({ kind: "ready", systems, library });
      },
      (error: unknown) => {
        if (!cancelled) setLoad({ kind: "failed", message: failureText(libraryFailure(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = load.kind === "ready";
  const systems = load.kind === "ready" ? load.systems : [];
  const library = load.kind === "ready" ? load.library : [];
  /** 열 항성계: 고른 것(새 항성계·목록에 있는 것) → 목록 첫째 */
  const wanted =
    selected === NEW_KEY && doc?.key === NEW_KEY
      ? NEW_KEY
      : systems.some((item) => item.id === selected)
        ? selected
        : (systems[0]?.id ?? null);
  const shown = doc !== null && doc.key === wanted ? doc : null;
  const docKey = doc?.key ?? null;

  // 고른 항성계를 받는다(새 항성계는 받을 것이 없다). 받은 자료는 열쇠로 맞춰 쓴다
  useEffect(() => {
    if (!ready || wanted === null || wanted === NEW_KEY || docKey === wanted) return () => undefined;
    let cancelled = false;
    systemsApi.get(wanted).then(
      (record) => {
        if (cancelled) return;
        setDoc(docOf(record));
        setOrbit(null);
      },
      (error: unknown) => {
        if (!cancelled) setOpenFailure({ key: wanted, message: failureText(libraryFailure(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, wanted, docKey]);

  const dirty = isDirty(shown);
  const say = (tone: "error" | "success", text: string): void =>
    setNotice((current) => ({ tone, text, version: (current?.version ?? 0) + 1 }));
  /** 저장하지 않은 바뀜이 있으면 묻고 나서 한다(확인 창 안에서 불러도 되게 다음 차례에 연다) */
  const guard = (action: () => void): void => {
    if (!dirty) {
      action();
      return;
    }
    queueMicrotask(() =>
      setConfirm({
        title: m.star_system_leave_title(),
        body: [m.star_system_leave_body()],
        confirmLabel: m.star_system_leave_confirm(),
        danger: true,
        onConfirm: action,
      }),
    );
  };
  const choose = (key: string): void =>
    guard(() => {
      setSelected(key);
      writeLast(key);
      setDoc(null);
      setOpenFailure(null);
      setOrbit(null);
      setNotice(null);
    });
  const updateSystems = (next: (items: readonly SystemSummary[]) => readonly SystemSummary[]): void =>
    setLoad((state) => (state.kind === "ready" ? { ...state, systems: next(state.systems) } : state));
  const edit = (next: (current: SystemDoc) => SystemDoc): void =>
    setDoc((current) => (current ? next(current) : current));

  const newSystem = (): void =>
    guard(() =>
      setPrompt({
        title: m.star_system_new(),
        initialName: m.star_system_default_name({ number: String(systems.length + 1) }),
        confirmLabel: m.star_system_create(),
        onConfirm: (name) => {
          setDoc({
            key: NEW_KEY,
            name,
            revision: 0,
            author: null,
            saved: null,
            definition: emptyStarSystem(),
          });
          setSelected(NEW_KEY);
          setOrbit(null);
          setNotice(null);
        },
      }),
    );

  const saveDoc = async (current: SystemDoc, expectedRevision: number): Promise<void> => {
    setSaving(true);
    try {
      if (current.key === NEW_KEY) {
        const record = await systemsApi.create({ name: current.name, definition: current.definition });
        const { definition: _definition, ...summary } = record;
        updateSystems((items) => [summary, ...items]);
        setDoc(docOf(record));
        setSelected(record.id);
        writeLast(record.id);
      } else {
        const result = await systemsApi.save({
          id: current.key,
          definition: current.definition,
          expectedRevision,
        });
        edit((open) =>
          open.key === current.key ? { ...open, revision: result.revision, saved: current.definition } : open,
        );
        updateSystems((items) =>
          items.map((item) =>
            item.id === current.key
              ? {
                  ...item,
                  revision: result.revision,
                  updatedAt: result.updatedAt,
                  updatedBy: result.updatedBy,
                }
              : item,
          ),
        );
      }
      say("success", m.star_system_status_saved({ revision: String(Math.max(1, expectedRevision + 1)) }));
    } catch (error) {
      const failure = libraryFailure(error);
      if (failure.kind === "conflict") {
        setConfirm({
          title: m.star_system_conflict_title(),
          body: [m.star_system_conflict_body()],
          confirmLabel: m.star_system_conflict_overwrite(),
          onConfirm: () => void overwrite(current),
        });
      } else say("error", m.star_system_save_failed({ reason: failureText(failure) }));
    } finally {
      setSaving(false);
    }
  };
  /** 충돌 뒤 [덮어쓰기]: 지금 판을 다시 읽고 그 판으로 저장한다 */
  const overwrite = async (current: SystemDoc): Promise<void> => {
    try {
      const fresh = await systemsApi.get(current.key);
      await saveDoc(current, fresh.revision);
    } catch (error) {
      say("error", m.star_system_save_failed({ reason: failureText(libraryFailure(error)) }));
    }
  };

  const rename = (current: SystemDoc): void =>
    setPrompt({
      title: m.star_system_rename(),
      initialName: current.name,
      confirmLabel: m.star_system_rename_confirm(),
      onConfirm: (name) => {
        if (current.key === NEW_KEY) {
          edit((open) => ({ ...open, name }));
          return;
        }
        systemsApi.rename(current.key, name).then(
          (result) => {
            edit((open) => (open.key === current.key ? { ...open, name: result.name } : open));
            updateSystems((items) =>
              items.map((item) => (item.id === current.key ? { ...item, name: result.name } : item)),
            );
          },
          (error: unknown) =>
            say("error", m.star_system_save_failed({ reason: failureText(libraryFailure(error)) })),
        );
      },
    });

  const remove = (current: SystemDoc): void =>
    setConfirm({
      title: m.star_system_remove_title({ name: current.name }),
      body: [m.star_system_remove_body()],
      confirmLabel: m.star_system_remove(),
      danger: true,
      onConfirm: () => {
        systemsApi.remove(current.key).then(
          () => {
            updateSystems((items) => items.filter((item) => item.id !== current.key));
            setDoc(null);
            setSelected(null);
            writeLast(null);
            setOrbit(null);
          },
          (error: unknown) =>
            say("error", m.star_system_save_failed({ reason: failureText(libraryFailure(error)) })),
        );
      },
    });

  const openPlanet = (planetId: string): void =>
    guard(() => {
      store.setLastPlanet(planetId);
      onNavigate({ route: "dev_planet_editor" });
    });
  const applyToPlanet = (planet: LibraryPlanet, target: Temperatures): void => {
    applySuggestion(store, planet, target);
    setConfirm({
      title: m.star_system_applied_title(),
      body: [m.star_system_applied_body()],
      confirmLabel: m.star_system_card_open(),
      cancelLabel: m.star_system_applied_stay(),
      onConfirm: () => openPlanet(planet.id),
    });
  };

  const planetName = (id: string): string | null => library.find((item) => item.id === id)?.name ?? null;
  const orbitLabel = (current: SystemDoc, index: number): string => {
    const item = current.definition.orbits[index];
    if (!item) return "";
    const body =
      item.body.kind === "planet"
        ? (planetName(item.body.planetId) ?? m.star_system_planet_missing())
        : bodyKindText(item.body.kind);
    return m.star_system_orbit_label({
      number: String(index + 1),
      distance: formatAu(item.distanceMilliAu),
      body,
    });
  };
  const canRemove =
    shown !== null &&
    shown.key !== NEW_KEY &&
    viewer !== null &&
    (viewer.roles.includes("admin") || shown.author?.id === viewer.id);
  const selectedOrbit = shown && orbit !== null ? shown.definition.orbits[orbit] : undefined;
  const failure =
    load.kind === "failed"
      ? load.message
      : openFailure !== null && openFailure.key === wanted
        ? openFailure.message
        : null;

  const status = shown
    ? shown.key === NEW_KEY
      ? m.star_system_status_new()
      : dirty
        ? m.star_system_status_dirty()
        : m.star_system_status_saved({ revision: String(shown.revision) })
    : null;

  return (
    <section className="pe-screen ss-screen" data-density="compact" aria-labelledby="star-system-title">
      <header className="pe-header">
        <button type="button" className="button-small pe-back" onClick={() => guard(onClose)}>
          {m.planet_editor_back()}
        </button>
        <h1 id="star-system-title" className="pe-title" ref={headingRef} tabIndex={-1}>
          {m.shell_route_dev_star_system()}
        </h1>
        {ready && (systems.length > 0 || doc?.key === NEW_KEY) ? (
          <>
            <label htmlFor={selectId} className="visually-hidden">
              {m.star_system_select()}
            </label>
            <select
              id={selectId}
              className="pe-planet-select ss-system-select"
              value={wanted ?? ""}
              onChange={(event) => choose(event.target.value)}
            >
              {doc?.key === NEW_KEY ? (
                <option value={NEW_KEY}>{m.star_system_new_option({ name: doc.name })}</option>
              ) : null}
              {systems.map((item) => (
                <option key={item.id} value={item.id}>
                  {m.star_system_option({
                    name: item.name,
                    author: item.author?.name ?? m.planet_editor_library_unknown_person(),
                  })}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {ready ? (
          <button type="button" className="button-small ss-new" onClick={newSystem}>
            {m.star_system_new()}
          </button>
        ) : null}
      </header>
      {shown ? (
        <>
          <div className="ss-toolbar">
            <div className="ss-toolbar-name">
              <p className="ss-name">{shown.name}</p>
              <p className="ss-meta">
                {shown.author
                  ? `${m.star_system_meta({ author: shown.author.name })} · ${status ?? ""}`
                  : status}
              </p>
            </div>
            <div className="ss-toolbar-actions">
              <button type="button" className="button-small" onClick={() => rename(shown)}>
                {m.star_system_rename()}
              </button>
              {canRemove ? (
                <button type="button" className="button-small ss-remove" onClick={() => remove(shown)}>
                  {m.star_system_remove()}
                </button>
              ) : null}
              <button
                type="button"
                className="button-small button-primary ss-save"
                disabled={saving || !dirty}
                onClick={() => void saveDoc(shown, shown.revision)}
              >
                {saving ? m.star_system_saving() : m.star_system_save()}
              </button>
            </div>
            {notice ? (
              <LiveMessage
                className="ss-notice"
                tone={notice.tone}
                lines={[notice.text]}
                version={notice.version}
              />
            ) : null}
          </div>
          <div className="ss-main">
            <div className="ss-stage">
              <StarSystemView
                definition={shown.definition}
                label={m.star_system_view_label({
                  star: starTypeName(starType(shown.definition.star.type)?.id ?? "g2v"),
                  count: String(shown.definition.orbits.length),
                })}
                bodyLabel={(index) => orbitLabel(shown, index)}
                selected={orbit}
                onSelect={setOrbit}
              />
            </div>
            <div className="ss-side">
              {selectedOrbit && orbit !== null ? (
                <OrbitCard
                  key={`${orbit}-${selectedOrbit.distanceMilliAu}`}
                  orbit={selectedOrbit}
                  index={orbit}
                  starTypeId={shown.definition.star.type}
                  planetName={
                    selectedOrbit.body.kind === "planet" ? planetName(selectedOrbit.body.planetId) : null
                  }
                  store={store}
                  onApply={applyToPlanet}
                  onOpenPlanet={openPlanet}
                  onClose={() => setOrbit(null)}
                />
              ) : null}
              <SystemPanel
                definition={shown.definition}
                library={library}
                selected={orbit}
                orbitLabel={(index) => orbitLabel(shown, index)}
                onSelect={setOrbit}
                onStarType={(type: StarTypeId) =>
                  edit((current) => ({ ...current, definition: withStarType(current.definition, type) }))
                }
                onAddOrbit={() => {
                  const next = withOrbitAdded(shown.definition);
                  if (!next) return;
                  edit((current) => ({ ...current, definition: next }));
                  setOrbit(next.orbits.length - 1);
                }}
                onDistance={(index, distance) => {
                  const moved = withOrbitDistance(shown.definition, index, distance);
                  if (!moved) return false;
                  edit((current) => ({ ...current, definition: moved.definition }));
                  setOrbit(moved.index);
                  return true;
                }}
                onBody={(index, body: StarSystemBody) =>
                  edit((current) => ({
                    ...current,
                    definition: withOrbitBody(current.definition, index, body),
                  }))
                }
                onRemoveOrbit={(index) => {
                  edit((current) => ({
                    ...current,
                    definition: withOrbitRemoved(current.definition, index),
                  }));
                  setOrbit(null);
                }}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="pe-center">
          {failure !== null ? (
            <>
              <LiveMessage tone="error" lines={[m.star_system_load_failed(), failure]} />
              <div className="form-actions">
                <button type="button" onClick={onRetry}>
                  {m.retry()}
                </button>
              </div>
            </>
          ) : ready && wanted === null ? (
            <div className="pe-empty">
              <p className="pe-empty-title">{m.star_system_empty()}</p>
              <p className="field-hint">{m.star_system_empty_hint()}</p>
              <div className="form-actions">
                <button type="button" className="button-primary ss-new-empty" onClick={newSystem}>
                  {m.star_system_new()}
                </button>
              </div>
            </div>
          ) : (
            <p className="status pe-loading" role="status">
              {m.star_system_loading()}
            </p>
          )}
        </div>
      )}
      <PromptDialog request={prompt} onClose={() => setPrompt(null)} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}
