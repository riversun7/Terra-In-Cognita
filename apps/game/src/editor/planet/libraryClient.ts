// 행성 보관함 호출(tRPC planetEditor.library.*) — ADR 38 "바뀜: 행성 보관함"(팀 공용 목록). 화면은 이 모양으로만 부른다(가짜로 바꿀 수 있게).
// 오류 약속(서버 src/trpc/planetEditor.ts): error.data.code와 data.reason. 화면은 이유 코드를 메시지 키로 바꾼다(editorMessages.ts).
// - CONFLICT(revision_conflict): 다른 사람이 먼저 저장했다 → 화면이 [덮어쓰기]·[다른 이름으로 저장]·[취소]를 묻는다.
// - BAD_REQUEST: 정의 받지 않음 코드(초안과 같음)·invalid_name·unknown_base. NOT_FOUND: planet_not_found·version_not_found.
// - FORBIDDEN: not_author(지우기) 또는 권한 없음. UNAUTHORIZED: 로그인 끝남.
import type { PlanetLibraryBase } from "@terra/shared";
import { api } from "../../net/api.ts";
import { field } from "../../net/json.ts";
import type { DraftEntry } from "./editorModel.ts";

export interface LibraryPerson {
  readonly id: string;
  readonly name: string;
}

/** 목록 한 줄(서버 PlanetLibrarySummary) */
export interface LibrarySummary {
  readonly id: string;
  readonly name: string;
  readonly base: PlanetLibraryBase;
  readonly revision: number;
  readonly author: LibraryPerson | null;
  readonly updatedBy: LibraryPerson | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 행성 하나(정의 포함) */
export interface LibraryPlanet extends LibrarySummary {
  readonly definition: DraftEntry;
}

export interface LibraryVersionInfo {
  readonly revision: number;
  readonly savedAt: string;
  readonly savedBy: LibraryPerson | null;
  readonly bytes: number;
}

export interface LibraryApi {
  list(): Promise<readonly LibrarySummary[]>;
  get(id: string): Promise<LibraryPlanet>;
  versions(id: string): Promise<readonly LibraryVersionInfo[]>;
  version(id: string, revision: number): Promise<{ readonly definition: DraftEntry }>;
  create(input: { name: string; base: PlanetLibraryBase; definition: DraftEntry }): Promise<LibraryPlanet>;
  save(input: { id: string; definition: DraftEntry; expectedRevision: number }): Promise<{
    readonly revision: number;
    readonly updatedAt: string;
    readonly updatedBy: LibraryPerson | null;
  }>;
  rename(id: string, name: string): Promise<{ readonly name: string }>;
  remove(id: string): Promise<void>;
}

/** 실제 서버 호출 */
export const libraryApi: LibraryApi = {
  list: () => api.planetEditor.library.list.query(),
  get: (id) => api.planetEditor.library.get.query({ id }),
  versions: (id) => api.planetEditor.library.versions.query({ id }),
  version: (id, revision) => api.planetEditor.library.version.query({ id, revision }),
  create: (input) => api.planetEditor.library.create.mutate(input),
  save: (input) => api.planetEditor.library.save.mutate(input),
  rename: (id, name) => api.planetEditor.library.rename.mutate({ id, name }),
  async remove(id) {
    await api.planetEditor.library.remove.mutate({ id });
  },
};

/** 오류의 tRPC 코드와 이유 코드(tRPC 응답이 아니면 null) */
export function trpcErrorOf(error: unknown): { code: string | null; reason: string | null } {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  return {
    code: typeof code === "string" ? code : null,
    reason: typeof reason === "string" ? reason : null,
  };
}

/** 저장 실패의 뜻: 충돌 / 이유 코드가 있는 받지 않음·없음·권한 / 닿지 못함 등(그 밖) */
export type LibraryFailure =
  | { readonly kind: "conflict" }
  | { readonly kind: "reason"; readonly reason: string }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "network" };

export function libraryFailure(error: unknown): LibraryFailure {
  const { code, reason } = trpcErrorOf(error);
  if (code === "CONFLICT") return { kind: "conflict" };
  if (reason !== null) return { kind: "reason", reason };
  if (code === "UNAUTHORIZED") return { kind: "unauthorized" };
  if (code === "FORBIDDEN") return { kind: "forbidden" };
  if (code === "BAD_REQUEST") return { kind: "reason", reason: "invalid_entry" };
  return { kind: "network" };
}
