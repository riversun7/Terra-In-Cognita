// 작업 사본 — 고치는 중인 값은 이 기기(localStorage)에만 둔다. 서버에 쓰는 것은 [저장]·[다른 이름으로 저장]뿐이다
// (ADR 38 "바뀜: 행성 보관함", 사용자 결정 2026-10-31). 다시 열면 이어서 고친다.
// - 열쇠: 보관함 행성마다 `terra.planetEditor.work.<행성 ID>`, 아직 저장하지 않은 새 행성은 `…work.new`(한 번에 하나).
// - 사본은 시작한 판(fromRevision, 새 행성은 0)을 기억한다: [저장]의 기대 판이다. 그 사이 다른 사람이 저장했으면 서버가 충돌을 준다.
// - 새 행성 사본은 이름과 시작점도 기억한다(첫 [저장]이 만들 때 쓴다).
// - 저장소를 못 쓰면(사생활 보호 창 등) 이번 실행 동안만 기억한다: 읽기·쓰기는 모두 try/catch.
// - 마지막으로 연 행성(`terra.planetEditor.last`)도 여기서 다룬다(다시 열 때 그 행성부터).
import { type PlanetLibraryBase, isPlanetLibraryBase, normalizePlanetLibraryName } from "@terra/shared";
import type { StorageLike } from "./crashSentinel.ts";
import { type DraftEntry, isDraftEntry } from "./editorModel.ts";

export const WORKING_COPY_PREFIX = "terra.planetEditor.work.";
export const LAST_PLANET_KEY = "terra.planetEditor.last";
/** 새 행성 사본의 열쇠 끝 */
export const NEW_PLANET_KEY = "new";
export const WORKING_COPY_FORMAT_VERSION = 1;

export interface WorkingCopy {
  /** 보관함 행성 ID, 또는 NEW_PLANET_KEY */
  readonly key: string;
  /** 시작한 판(새 행성은 0) */
  readonly fromRevision: number;
  readonly entry: DraftEntry;
  /** 새 행성만: 첫 [저장]에 쓸 이름·시작점 */
  readonly name?: string;
  readonly base?: PlanetLibraryBase;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** 저장한 글 → 사본(틀리거나 다른 판 형식이면 null) */
export function parseWorkingCopy(raw: string | null, key: string): WorkingCopy | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isDraftEntry(data) || data.v !== WORKING_COPY_FORMAT_VERSION) return null;
  const { fromRevision, entry } = data;
  if (!isRevision(fromRevision) || !isDraftEntry(entry)) return null;
  if (key !== NEW_PLANET_KEY) return { key, fromRevision, entry };
  const name = normalizePlanetLibraryName(data.name);
  if (name === null || !isPlanetLibraryBase(data.base)) return null;
  return { key, fromRevision: 0, entry, name, base: data.base };
}

export function serializeWorkingCopy(copy: WorkingCopy): string {
  return JSON.stringify({
    v: WORKING_COPY_FORMAT_VERSION,
    fromRevision: copy.fromRevision,
    entry: copy.entry,
    ...(copy.name === undefined ? {} : { name: copy.name }),
    ...(copy.base === undefined ? {} : { base: copy.base }),
  });
}

/** 사본 저장소(저장소를 못 쓰면 메모리) */
export interface WorkingCopyStore {
  read(key: string): WorkingCopy | null;
  write(copy: WorkingCopy): void;
  clear(key: string): void;
  lastPlanet(): string | null;
  setLastPlanet(id: string | null): void;
}

export function createWorkingCopyStore(storage: StorageLike | null): WorkingCopyStore {
  const memory = new Map<string, string>();
  const get = (name: string): string | null => {
    try {
      if (storage) return storage.getItem(name);
    } catch {
      // 못 읽으면 메모리 값
    }
    return memory.get(name) ?? null;
  };
  const set = (name: string, value: string | null): void => {
    if (value === null) memory.delete(name);
    else memory.set(name, value);
    try {
      if (!storage) return;
      if (value === null) storage.removeItem(name);
      else storage.setItem(name, value);
    } catch {
      // 가득 참·막힘: 이번 실행 동안 메모리에만 남는다
    }
  };
  return {
    read: (key) => parseWorkingCopy(get(`${WORKING_COPY_PREFIX}${key}`), key),
    write: (copy) => set(`${WORKING_COPY_PREFIX}${copy.key}`, serializeWorkingCopy(copy)),
    clear: (key) => set(`${WORKING_COPY_PREFIX}${key}`, null),
    lastPlanet: () => get(LAST_PLANET_KEY),
    setLastPlanet: (id) => set(LAST_PLANET_KEY, id),
  };
}
