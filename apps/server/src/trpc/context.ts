// tRPC 요청 맥락 — 프로시저가 읽는 값. 요청마다 새로 만든다(src/trpc/createContext.ts).
// 이 타입은 AppRouter 타입에 들어가 게임 앱의 타입 검사에도 쓰인다.
// 그래서 Node 전용 타입(fastify, pg, drizzle, better-auth 등)을 여기에 직접 넣지 않는다.
// 넣으면 기기 코드에서 Node 전역(process, Buffer)이 타입 오류 없이 보이게 된다 — scripts/check-boundaries.mjs가 잡는다.
import type { Role } from "@terra/shared";

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

export interface TrpcContext {
  /** 콘텐츠 팩 버전 */
  contentVersion: string;
  /** 서버 시각(UTC ms). 시험에서는 고정값을 넣는다 */
  now: () => number;
  /** 로그인한 사용자. 처음 부를 때 한 번만 조회한다. 로그인하지 않았거나 인증이 꺼져 있으면 null */
  viewer: () => Promise<Viewer | null>;
  /** 관리자 기능. 인증이 꺼져 있으면(DB 없음) 없다. 권한 검사는 프로시저 미들웨어가 먼저 한다 */
  admin: AdminServices | undefined;
}

export interface TrpcContextOptions {
  contentVersion: string;
  now: () => number;
}
