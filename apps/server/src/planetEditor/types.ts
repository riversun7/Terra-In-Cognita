// 행성 편집기 서버 API의 모양 — tRPC planetEditor.*(src/trpc/planetEditor.ts)가 주고받는 값(ADR 2026-10-29-planet-editor-stage1 9·11절).
// AppRouter 타입에 들어가 게임 앱 타입 검사에도 쓰인다: Node 전용 타입(fastify, pg, drizzle 등)을 넣지 않는다(context.ts와 같은 규칙).
// 받지 않음 코드·항목 상한은 기기와 같이 쓰는 @terra/shared planetDraftApi.ts에 있다. 보관함 이름·시작점 규칙은 planetLibraryApi.ts.
import type { PlanetLibraryBase, StarSystemDefinition } from "@terra/shared";

/** JSON 객체(콘텐츠 팩 항목 모양). 키 순서는 지키지 않는다(DB jsonb) */
export type JsonObject = Record<string, unknown>;

/** 초안을 시작한 공개본 — 기기 편집기 DraftBase(apps/game/src/editor/planet/editorModel.ts)와 같은 모양 */
export interface PlanetDraftBase {
  /** 콘텐츠 버전 "<팩 ID>@<팩 버전>" */
  contentVersion: string;
  /** 공개본 정의 해시(정의 조회·목록 정보의 definitionHash, 소문자 16진수 64자) */
  definitionHash: string;
  generatorVersion: number;
}

/** 서버가 켤 때 만든 확인 결과: 이 면 레벨로 생성한 결과 해시(생성기 meta.hash) */
export interface PlanetEditorCheck {
  faceLevel: number;
  hash: string;
}

/** 정의 조회의 행성 하나 */
export interface PlanetEditorPlanet {
  id: string;
  /** planets.json 항목 그대로(시드 포함, 팩 파일의 JSON) */
  entry: JsonObject;
  /** 정의 해시 = 목록 정보(GET /api/planets/<ID>)의 definitionHash */
  definitionHash: string;
  /** 빠른 미리보기 레벨(min(5, 행성 면 레벨))의 결과 해시. 기기는 열 때 공개본을 이 레벨로 만들어 견준다(ADR 38 6절) */
  check: PlanetEditorCheck;
}

/** planetEditor.definitions — 서버가 켤 때 한 번 만든다 */
export interface PlanetEditorDefinitions {
  /** "<팩 ID>@<팩 버전>" */
  contentVersion: string;
  /** 팩 전체의 임시 표시(manifest placeholder) */
  placeholder: boolean;
  /** 서버 생성기 판(GENERATOR_VERSION). 기기 판과 다르면 기기는 내보내기를 막는다 */
  generatorVersion: number;
  /** 팩 순서 */
  planets: PlanetEditorPlanet[];
  /** biomes.json 항목 전부(팩 순서, JSON 그대로) */
  biomes: JsonObject[];
}

/** planetEditor.drafts.get·restore의 초안 */
export interface PlanetDraftView {
  planetId: string;
  /** 지금 판(1부터) */
  revision: number;
  entry: JsonObject;
  base: PlanetDraftBase | null;
  /** 처음 만든 시각(ISO 8601, UTC) */
  createdAt: string;
  /** 마지막 저장 시각(ISO 8601, UTC) */
  updatedAt: string;
}

/** planetEditor.drafts.revisions의 한 줄(새 판부터) */
export interface PlanetDraftRevisionInfo {
  revision: number;
  /** 저장한 시각(ISO 8601, UTC) */
  savedAt: string;
  /** 항목 크기(바이트, @terra/shared planetDraftEntryBytes) */
  bytes: number;
}

/** planetEditor.drafts.save 입력 */
export interface PlanetDraftSaveInput {
  planetId: string;
  /** 검사 전 항목(검사 차례는 @terra/shared PLANET_DRAFT_REJECT_CODES) */
  entry: unknown;
  base: PlanetDraftBase | null;
  /** 이 기기가 마지막으로 본 판(0 = 서버에 초안 없음). 서버의 지금 판과 다르면 CONFLICT */
  expectedRevision: number;
}

/** planetEditor.drafts.save 결과 */
export interface PlanetDraftSaved {
  revision: number;
  /** 저장 시각(ISO 8601, UTC) */
  updatedAt: string;
}

// ── 행성 보관함(planetEditor.library.*, ADR 38 "바뀜: 행성 보관함") ──

/** 사람 표시(로그인 아이디. 계정을 지웠으면 null) */
export interface PlanetLibraryPerson {
  id: string;
  name: string;
}

/** 목록 한 줄(정의는 싣지 않는다) */
export interface PlanetLibrarySummary {
  /** uuid, 바뀌지 않는다 */
  id: string;
  name: string;
  base: PlanetLibraryBase;
  revision: number;
  author: PlanetLibraryPerson | null;
  updatedBy: PlanetLibraryPerson | null;
  /** ISO 8601, UTC */
  createdAt: string;
  updatedAt: string;
}

/** 행성 하나(정의 포함) */
export interface PlanetLibraryPlanet extends PlanetLibrarySummary {
  definition: JsonObject;
}

/** 저장 판 목록 한 줄(새 판부터) */
export interface PlanetLibraryVersionInfo {
  revision: number;
  savedAt: string;
  savedBy: PlanetLibraryPerson | null;
  bytes: number;
}

/** 저장 판 하나(정의 포함) */
export interface PlanetLibraryVersion extends PlanetLibraryVersionInfo {
  definition: JsonObject;
}

/** library.save 결과 */
export interface PlanetLibrarySaved {
  revision: number;
  updatedAt: string;
  /** 저장한 사람(기기가 목록·판 정보를 다시 읽지 않고 맞춘다) */
  updatedBy: PlanetLibraryPerson | null;
}

// ── 항성계 보관함(planetEditor.systems.*, ADR 2026-10-31-star-system-editor) ──

/** 항성계 목록 한 줄(정의는 싣지 않는다) */
export interface StarSystemSummary {
  /** uuid, 바뀌지 않는다 */
  id: string;
  name: string;
  revision: number;
  author: PlanetLibraryPerson | null;
  updatedBy: PlanetLibraryPerson | null;
  /** ISO 8601, UTC */
  createdAt: string;
  updatedAt: string;
}

/** 항성계 하나(정의 포함) */
export interface StarSystemRecord extends StarSystemSummary {
  definition: StarSystemDefinition;
}

/** systems.save 결과 */
export interface StarSystemSaved {
  revision: number;
  updatedAt: string;
  updatedBy: PlanetLibraryPerson | null;
}
