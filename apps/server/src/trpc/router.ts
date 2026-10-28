// 앱 라우터 — 조회와 비실시간 기능 API. 게임 상태를 바꾸는 명령은 넣지 않는다(WebSocket으로만, PLAN 4.3).
// 게임 앱은 이 파일의 AppRouter 타입만 가져간다(`import type`). 값 import는 scripts/check-boundaries.mjs가 막는다.
import { accountRouter } from "./account.ts";
import { adminRouter } from "./admin.ts";
import { router } from "./init.ts";
import { settingsRouter } from "./settings.ts";
import { systemRouter } from "./system.ts";

export const appRouter = router({
  system: systemRouter,
  account: accountRouter,
  admin: adminRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
