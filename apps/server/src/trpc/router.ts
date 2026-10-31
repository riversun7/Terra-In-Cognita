// 앱 라우터 — 조회와 비실시간 기능 API. 게임 상태를 바꾸는 명령은 넣지 않는다(WebSocket으로만, PLAN 4.3).
// 게임 앱은 이 파일의 AppRouter 타입만 가져간다(`import type`). 값 import는 scripts/check-boundaries.mjs가 막는다.
import { accountRouter } from "./account.ts";
import { adminRouter } from "./admin.ts";
import { dashboardRouter } from "./dashboard.ts";
import { economyRouter } from "./economy.ts";
import { inboxRouter } from "./inbox.ts";
import { router } from "./init.ts";
import { planetEditorRouter } from "./planetEditor.ts";
import { cyborgRouter, unitsRouter } from "./roster.ts";
import { settingsRouter } from "./settings.ts";
import { summaryRouter } from "./summary.ts";
import { systemRouter } from "./system.ts";

export const appRouter = router({
  system: systemRouter,
  account: accountRouter,
  admin: adminRouter,
  settings: settingsRouter,
  planetEditor: planetEditorRouter,
  // 홈 자료(앱 뼈대 W3, ADR 2026-10-29-app-shell 6·7·8절)
  inbox: inboxRouter,
  summary: summaryRouter,
  dashboard: dashboardRouter,
  // 유닛·사이보그 화면 자료(ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)")
  units: unitsRouter,
  cyborg: cyborgRouter,
  // 경제 화면(창고·생산·거래창·환전) 조회(ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)")
  economy: economyRouter,
});

export type AppRouter = typeof appRouter;
