// 항성계 보관함 호출(tRPC planetEditor.systems.*) — ADR 2026-10-31-star-system-editor. 화면은 이 모양으로만 부른다(가짜로 바꿀 수 있게).
// 오류 약속은 행성 보관함과 같다(서버 src/trpc/planetEditor.ts): CONFLICT(revision_conflict), BAD_REQUEST(invalid_name·
// invalid_definition), NOT_FOUND(system_not_found), FORBIDDEN(not_author 또는 권한 없음). 뜻 가르기는 libraryFailure를 같이 쓴다.
import type { StarSystemDefinition } from "@terra/shared";
import { api } from "../../net/api.ts";
import type { LibraryPerson } from "../planet/libraryClient.ts";

/** 목록 한 줄(서버 StarSystemSummary) */
export interface SystemSummary {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly author: LibraryPerson | null;
  readonly updatedBy: LibraryPerson | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 항성계 하나(정의 포함) */
export interface SystemRecord extends SystemSummary {
  readonly definition: StarSystemDefinition;
}

export interface SystemsApi {
  list(): Promise<readonly SystemSummary[]>;
  get(id: string): Promise<SystemRecord>;
  create(input: { name: string; definition: StarSystemDefinition }): Promise<SystemRecord>;
  save(input: { id: string; definition: StarSystemDefinition; expectedRevision: number }): Promise<{
    readonly revision: number;
    readonly updatedAt: string;
    readonly updatedBy: LibraryPerson | null;
  }>;
  rename(id: string, name: string): Promise<{ readonly name: string }>;
  remove(id: string): Promise<void>;
}

/** 실제 서버 호출 */
export const systemsApi: SystemsApi = {
  list: () => api.planetEditor.systems.list.query(),
  get: (id) => api.planetEditor.systems.get.query({ id }),
  create: (input) => api.planetEditor.systems.create.mutate(input),
  save: (input) => api.planetEditor.systems.save.mutate(input),
  rename: (id, name) => api.planetEditor.systems.rename.mutate({ id, name }),
  async remove(id) {
    await api.planetEditor.systems.remove.mutate({ id });
  },
};
