// account 라우터 — 내 계정 정보 조회. 로그인·가입·로그아웃은 tRPC가 아니라 일반 HTTP(쿠키 때문에)
// 들어가기: POST /api/account/enter, 로그아웃: POST /api/auth/sign-out (packages/shared/src/accountApi.ts)
import { publicProcedure, router } from "./init.ts";

export const accountRouter = router({
  /** 로그인한 사용자(아이디·역할). 로그인하지 않았으면 null. 이메일은 주지 않는다 */
  me: publicProcedure.query(({ ctx }) => ctx.viewer()),
});
