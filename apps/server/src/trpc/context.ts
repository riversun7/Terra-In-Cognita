// tRPC 요청 맥락 — 프로시저가 읽는 값. 요청마다 새로 만든다(src/trpc/createContext.ts).
// 이 타입은 AppRouter 타입에 들어가 게임 앱의 타입 검사에도 쓰인다.
// 그래서 Node 전용 타입(fastify, pg, drizzle, better-auth 등)을 여기에 직접 넣지 않는다.
// 넣으면 기기 코드에서 Node 전역(process, Buffer)이 타입 오류 없이 보이게 된다 — scripts/check-boundaries.mjs가 잡는다.
import type { Role, UserSettings } from "@terra/shared";
import type {
  PlanetDraftRevisionInfo,
  PlanetDraftSaveInput,
  PlanetDraftSaved,
  PlanetDraftView,
  PlanetEditorDefinitions,
} from "../planetEditor/types.ts";

/** 로그인한 사용자 */
export interface Viewer {
  id: string;
  /** 입력한 모양의 로그인 아이디 */
  loginId: string;
  roles: Role[];
}

/** 관리자 화면의 사용자 한 줄(이메일 없음) */
export interface AdminUserRow {
  id: string;
  loginId: string;
  roles: Role[];
  banned: boolean;
  /** 만든 시각(ISO 8601, UTC) */
  createdAt: string;
}

export interface AdminUserList {
  users: AdminUserRow[];
  /** 검색 조건에 맞는 전체 수(쪽 나누기용) */
  total: number;
}

/** 관리자 기능 — 요청한 관리자의 세션 머리글로 Better Auth를 부른다(Better Auth도 권한을 한 번 더 본다) */
export interface AdminServices {
  listUsers(input: { search: string; limit: number; offset: number }): Promise<AdminUserList>;
  setRoles(input: { userId: string; roles: Role[] }): Promise<AdminUserRow>;
}

/** 화면 설정 중 바꿀 칸만. 없는 칸은 그대로 둔다 */
export type UserSettingsPatch = { [K in keyof UserSettings]?: UserSettings[K] | undefined };

/** 계정 화면 설정(user_settings) — 프로시저가 로그인한 본인 id로만 부른다 */
export interface SettingsServices {
  /** 저장한 설정. 아직 아무것도 저장하지 않았으면 null */
  get(userId: string): Promise<UserSettings | null>;
  /** 보낸 칸만 바꾼다(없으면 만든다). 저장한 뒤의 설정 */
  set(userId: string, patch: UserSettingsPatch): Promise<UserSettings>;
}

/** 행성 편집기 권한 동작(권한 문장 planetEditor, src/auth/permissions.ts) */
export type PlanetEditorAction = "read" | "write";

/**
 * 행성 편집기(ADR 2026-10-29-planet-editor-stage1 9·11절) — 프로시저가 권한 미들웨어(우리 권한 표)를 거친 뒤 부른다.
 * 실패는 tRPC 오류로 던진다: BAD_REQUEST(data.reason = 받지 않음 코드), CONFLICT(기대 판), NOT_FOUND(되돌릴 판·초안 없음)
 */
export interface PlanetEditorServices {
  /** 두 번째 권한 확인: Better Auth userHasPermission(요청한 사람의 세션). 아니면 FORBIDDEN·UNAUTHORIZED */
  ensurePermission(action: PlanetEditorAction): Promise<void>;
  /** 정의 조회. 감사 기록을 쓴 뒤에만 돌려준다(못 쓰면 실패) */
  definitions(viewer: Viewer): Promise<PlanetEditorDefinitions>;
  getDraft(viewer: Viewer, planetId: string): Promise<PlanetDraftView | null>;
  revisions(viewer: Viewer, planetId: string): Promise<PlanetDraftRevisionInfo[]>;
  save(viewer: Viewer, input: PlanetDraftSaveInput): Promise<PlanetDraftSaved>;
  restore(viewer: Viewer, input: { planetId: string; revision: number }): Promise<PlanetDraftView>;
  remove(viewer: Viewer, planetId: string): Promise<{ removed: boolean }>;
}

export interface TrpcContext {
  /** 콘텐츠 팩 버전 */
  contentVersion: string;
  /** 서버 시각(UTC ms). 시험에서는 고정값을 넣는다 */
  now: () => number;
  /** 로그인한 사용자. 처음 부를 때 한 번만 조회한다. 로그인하지 않았거나 인증이 꺼져 있으면 null */
  viewer: () => Promise<Viewer | null>;
  /** 관리자 기능. 인증이 꺼져 있으면(DB 없음) 없다. 권한 검사는 프로시저 미들웨어가 먼저 한다 */
  admin: AdminServices | undefined;
  /** 계정 화면 설정. 인증이 꺼져 있으면(DB 없음) 없다 */
  settings: SettingsServices | undefined;
  /** 행성 편집기. 인증이 꺼져 있거나 정의 조회 자료를 받지 않았으면 없다 */
  planetEditor: PlanetEditorServices | undefined;
}

export interface TrpcContextOptions {
  contentVersion: string;
  now: () => number;
}
