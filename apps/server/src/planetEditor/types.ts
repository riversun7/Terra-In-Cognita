// 행성 편집기 서버 API의 모양 — tRPC planetEditor.*(src/trpc/planetEditor.ts)가 주고받는 값(ADR 2026-10-29-planet-editor-stage1 9·11절).
// AppRouter 타입에 들어가 게임 앱 타입 검사에도 쓰인다: Node 전용 타입(fastify, pg, drizzle 등)을 넣지 않는다(context.ts와 같은 규칙).
// 받지 않음 코드·항목 상한은 기기와 같이 쓰는 @terra/shared planetDraftApi.ts에 있다. 보관함 이름·시작점 규칙은 planetLibraryApi.ts.
import type { MapPreset, PlanetCellValues } from "@terra/planet/secondMap";
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
  /**
   * 행성 표본(planet_templates, 팩 순서): [새 행성]의 시작점. 모양은 행성과 같다(정의 해시는 생성기 입력에서 만든 값이고, 서버가
   * 굽지 않아 목록 정보·타일은 없다. 확인 해시는 행성처럼 켤 때 확인 레벨로 한 번 만든다)
   */
  templates: PlanetEditorPlanet[];
  /** biomes.json 항목 전부(팩 순서, JSON 그대로) */
  biomes: JsonObject[];
  /**
   * map_props.json 항목 전부(팩 순서 = 흩기 우선순위, JSON 그대로): 편집기 2차맵 미리보기가 서버 지형 워커와 같은 소품 규칙으로
   * 2차맵을 만든다(ADR 2026-10-31-second-map-from-planet 9절)
   */
  mapProps: JsonObject[];
  /**
   * gather_objects.json 항목 전부(팩 순서, JSON 그대로): 개발자 지형 오브젝트 편집기(/dev/terrain-objects, 기획 D-536)가 지형마다 채집
   * 오브젝트 종류·양을 보이고 고친다
   */
  gatherObjects: JsonObject[];
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

// ── 개발자 2차맵 시험(planetEditor.secondMap, ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)") ──

/** 보고 싶은 2차맵: 월드 시험 2차맵, 2차맵 키, 시험 자리 종류(@terra/planet/secondMap MAP_PRESETS) */
export type SecondMapLabTarget =
  | { kind: "test" }
  | { kind: "key"; mapKey: number }
  | { kind: "preset"; preset: MapPreset };

/**
 * 답: server = 월드 행성이라 서버 지형 서비스가 지형 파일을 준다(주소는 지형 경로, 전체 보기 권한으로 받는다).
 * device = 월드 행성이 아니라 서버가 행성 값을 들고 있지 않다 → 기기 워커가 만든다(편집기 2차맵 미리보기와 같은 길).
 * none = 그 종류에 맞는 자리가 없다(예: 바다 없는 행성의 바닷가)
 */
export type SecondMapLabAnswer =
  | {
      kind: "server";
      planetId: string;
      faceLevel: number;
      mapKey: number;
      /** 지형 주소(/api/maps/<키>/terrain?v=<판 표지>) */
      terrainUrl: string;
      cell: PlanetCellValues;
      /** 월드 시험 2차맵 키(유닛이 있는 곳) */
      testMapKey: number;
    }
  | { kind: "device" }
  | { kind: "none" };
