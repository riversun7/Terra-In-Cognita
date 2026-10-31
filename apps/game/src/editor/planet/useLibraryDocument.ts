// 보관함 행성 하나의 편집 상태 — 저장한 정의(서버) + 작업 사본(이 기기) + [저장]·[다른 이름으로 저장]·이름 바꾸기·지우기·
// 저장 판 불러오기. ADR 38 "바뀜: 행성 보관함"(사용자 결정 2026-10-31 "팀 공용 목록").
// - 고친 값은 작업 사본(workingCopy.ts, localStorage)에만 남긴다. 저장한 정의와 같아지면 사본을 지운다(저장 안 한 변경 없음).
// - [저장]: 새 행성이면 만들기(판 1), 아니면 사본이 시작한 판을 기대 판으로 저장. 다른 사람이 먼저 저장했으면 "conflict"를
//   돌려준다 → 화면이 [덮어쓰기](지금 판을 다시 읽어 그 판으로 저장)·[다른 이름으로 저장]·[취소]를 묻는다.
// - [다른 이름으로 저장]: 사본을 새 행성으로 만들고 그 행성으로 옮긴다. 원래 행성의 사본은 지운다(고친 것은 새 행성에 남았다).
// - 저장 판 불러오기: 그 판의 정의를 작업 사본으로 둔다(서버는 바뀌지 않는다. [저장]해야 새 판이 된다).
import type { PlanetLibraryBase } from "@terra/shared";
import { useState } from "react";
import { type DraftEntry, sameEntry } from "./editorModel.ts";
import {
  type LibraryApi,
  type LibraryFailure,
  type LibraryPlanet,
  type LibrarySummary,
  type LibraryVersionInfo,
  libraryFailure,
} from "./libraryClient.ts";
import { NEW_PLANET_KEY, type WorkingCopyStore } from "./workingCopy.ts";

/** 연 행성: 보관함 행성(저장한 정의) 또는 아직 저장하지 않은 새 행성 */
export type OpenedPlanet =
  | { readonly kind: "library"; readonly planet: LibraryPlanet }
  | {
      readonly kind: "new";
      readonly name: string;
      readonly base: PlanetLibraryBase;
      readonly entry: DraftEntry;
    };

export interface LibraryDocState {
  /** 보관함 행성 ID 또는 NEW_PLANET_KEY */
  readonly key: string;
  readonly name: string;
  readonly base: PlanetLibraryBase;
  /** 저장한 행성(새 행성은 null) */
  readonly saved: LibraryPlanet | null;
  readonly working: DraftEntry;
  /** 작업 사본이 시작한 판(새 행성 0) */
  readonly fromRevision: number;
  /** 서버에 없는 변경이 있다(새 행성은 늘 true) */
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly failure: LibraryFailure | null;
}

export type SaveOutcome = "saved" | "conflict" | "failed";

/** 화면이 부르는 일(함수 칸: 떼어 넘겨도 된다) */
export interface LibraryDocActions {
  readonly setWorking: (entry: DraftEntry) => void;
  readonly save: () => Promise<SaveOutcome>;
  /** 충돌 뒤 [덮어쓰기]: 지금 판을 다시 읽어 그 판을 기대 판으로 저장한다 */
  readonly overwrite: () => Promise<SaveOutcome>;
  readonly saveAs: (name: string) => Promise<SaveOutcome>;
  readonly rename: (name: string) => Promise<boolean>;
  readonly remove: () => Promise<boolean>;
  readonly versions: () => Promise<readonly LibraryVersionInfo[]>;
  readonly loadVersion: (revision: number) => Promise<boolean>;
  readonly clearFailure: () => void;
}

export interface LibraryDocDeps {
  readonly api: LibraryApi;
  readonly store: WorkingCopyStore;
  /** 새 행성이 생겼다(첫 [저장]·[다른 이름으로 저장]) → 부모가 목록에 넣고 그 행성을 연다 */
  readonly onCreated: (planet: LibraryPlanet) => void;
  /** 목록 한 줄이 바뀌었다(저장·이름) */
  readonly onUpdated: (summary: LibrarySummary) => void;
  /** 지웠다(새 행성 사본을 버린 것도) */
  readonly onRemoved: (key: string) => void;
}

function initialState(opened: OpenedPlanet, store: WorkingCopyStore): LibraryDocState {
  if (opened.kind === "new") {
    return {
      key: NEW_PLANET_KEY,
      name: opened.name,
      base: opened.base,
      saved: null,
      working: opened.entry,
      fromRevision: 0,
      dirty: true,
      busy: false,
      failure: null,
    };
  }
  const { planet } = opened;
  const copy = store.read(planet.id);
  const working = copy?.entry ?? planet.definition;
  return {
    key: planet.id,
    name: planet.name,
    base: planet.base,
    saved: planet,
    working,
    fromRevision: copy?.fromRevision ?? planet.revision,
    dirty: !sameEntry(working, planet.definition),
    busy: false,
    failure: null,
  };
}

function summaryOf(planet: LibraryPlanet): LibrarySummary {
  const { definition: _definition, ...summary } = planet;
  return summary;
}

export function useLibraryDocument(
  opened: OpenedPlanet,
  deps: LibraryDocDeps,
): [LibraryDocState, LibraryDocActions] {
  const { api, store } = deps;
  const [state, setState] = useState<LibraryDocState>(() => initialState(opened, store));

  /** 작업 사본을 저장소에 맞춘다(저장한 정의와 같으면 지운다) */
  const persist = (next: LibraryDocState): void => {
    if (next.saved === null) {
      store.write({
        key: NEW_PLANET_KEY,
        fromRevision: 0,
        entry: next.working,
        name: next.name,
        base: next.base,
      });
    } else if (next.dirty || next.fromRevision !== next.saved.revision) {
      store.write({ key: next.key, fromRevision: next.fromRevision, entry: next.working });
    } else {
      store.clear(next.key);
    }
  };

  const fail = (error: unknown): void =>
    setState((current) => ({ ...current, busy: false, failure: libraryFailure(error) }));

  const create = async (name: string, current: LibraryDocState): Promise<SaveOutcome> => {
    setState({ ...current, busy: true, failure: null });
    try {
      const planet = await api.create({ name, base: current.base, definition: current.working });
      // 새 행성 사본·원래 행성 사본은 이제 필요 없다(고친 것은 새 행성에 저장됐다)
      store.clear(current.key);
      setState({ ...current, busy: false });
      deps.onCreated(planet);
      return "saved";
    } catch (error) {
      fail(error);
      return "failed";
    }
  };

  const saveAt = async (current: LibraryDocState, expectedRevision: number): Promise<SaveOutcome> => {
    const saved = current.saved;
    if (saved === null) return create(current.name, current);
    setState({ ...current, busy: true, failure: null });
    try {
      const result = await api.save({ id: saved.id, definition: current.working, expectedRevision });
      const planet: LibraryPlanet = {
        ...saved,
        revision: result.revision,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
        definition: current.working,
      };
      const next: LibraryDocState = {
        ...current,
        saved: planet,
        fromRevision: result.revision,
        dirty: false,
        busy: false,
      };
      store.clear(current.key);
      setState(next);
      deps.onUpdated(summaryOf(planet));
      return "saved";
    } catch (error) {
      const failure = libraryFailure(error);
      setState({ ...current, busy: false, failure: failure.kind === "conflict" ? null : failure });
      return failure.kind === "conflict" ? "conflict" : "failed";
    }
  };

  const actions: LibraryDocActions = {
    setWorking: (entry) => {
      setState((current) => {
        const next = {
          ...current,
          working: entry,
          dirty: current.saved === null || !sameEntry(entry, current.saved.definition),
        };
        persist(next);
        return next;
      });
    },
    save: () => saveAt(state, state.fromRevision),
    overwrite: async () => {
      const saved = state.saved;
      if (saved === null) return create(state.name, state);
      try {
        const latest = await api.get(saved.id);
        return await saveAt({ ...state, saved: { ...saved, revision: latest.revision } }, latest.revision);
      } catch (error) {
        fail(error);
        return "failed";
      }
    },
    saveAs: (name) => create(name, state),
    rename: async (name) => {
      if (state.saved === null) {
        const next = { ...state, name };
        persist(next);
        setState(next);
        return true;
      }
      setState({ ...state, busy: true, failure: null });
      try {
        const result = await api.rename(state.saved.id, name);
        const planet = { ...state.saved, name: result.name };
        setState({ ...state, name: result.name, saved: planet, busy: false });
        deps.onUpdated(summaryOf(planet));
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    remove: async () => {
      if (state.saved === null) {
        store.clear(NEW_PLANET_KEY);
        deps.onRemoved(NEW_PLANET_KEY);
        return true;
      }
      setState({ ...state, busy: true, failure: null });
      try {
        await api.remove(state.saved.id);
        store.clear(state.key);
        deps.onRemoved(state.key);
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    versions: () => (state.saved ? api.versions(state.saved.id) : Promise.resolve([])),
    loadVersion: async (revision) => {
      if (state.saved === null) return false;
      try {
        const version = await api.version(state.saved.id, revision);
        actions.setWorking(version.definition);
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    clearFailure: () => setState((current) => ({ ...current, failure: null })),
  };
  return [state, actions];
}
