// 앱 라우터 — 조회와 비실시간 기능 API. 게임 상태를 바꾸는 명령은 넣지 않는다(WebSocket으로만, PLAN 4.3).
// 게임 앱은 이 파일의 AppRouter 타입만 가져간다(`import type`). 값 import는 scripts/check-boundaries.mjs가 막는다.
import { accountRouter } from "./account.ts";
import { adminRouter } from "./admin.ts";
import { balanceRouter } from "./balance.ts";
import { battleLabRouter } from "./battleLab.ts";
import { battleReplayRouter } from "./battleReplay.ts";
import { buildingsRouter } from "./buildings.ts";
import { formulasRouter } from "./formulas.ts";
import { holdingsRouter } from "./holdings.ts";
import { vitalsRouter } from "./vitals.ts";
import { dashboardRouter } from "./dashboard.ts";
import { economyRouter } from "./economy.ts";
import { factionRouter } from "./faction.ts";
import { inboxRouter } from "./inbox.ts";
import { router } from "./init.ts";
import { mailRouter } from "./mail.ts";
import { planetEditorRouter } from "./planetEditor.ts";
import { recruitRouter } from "./recruit.ts";
import { cyborgRouter, unitsRouter } from "./roster.ts";
import { settingsRouter } from "./settings.ts";
import { itemsRouter } from "./items.ts";
import { laborRouter } from "./labor.ts";
import { facilitiesRouter } from "./facilities.ts";
import { skillsRouter } from "./skills.ts";
import { summaryRouter } from "./summary.ts";
import { systemRouter } from "./system.ts";
import { territoryRouter } from "./territory.ts";
import { tuningRouter } from "./tuning.ts";

export const appRouter = router({
  system: systemRouter,
  account: accountRouter,
  admin: adminRouter,
  settings: settingsRouter,
  planetEditor: planetEditorRouter,
  // 개발자 설정 칸 패널(docs/adr/2026-11-01-dev-settings-panel.md 8절)
  tuning: tuningRouter,
  // 개발자 밸런스 화면(docs/adr/2026-11-01-balance-screen.md 3절)
  balance: balanceRouter,
  // 개발자 스킬 편집기·행동별 소모 화면(docs/adr/2026-11-01-skill-editor.md 6절)
  skills: skillsRouter,
  items: itemsRouter,
  // 개발자 건물 편집기(docs/adr/2026-11-02-building-editor.md)
  buildings: buildingsRouter,
  // 개발자 전투 실험실(같은 화면의 [전투 실험실] 탭, 같은 ADR "바뀜 (2026-11-01, 전투 실험실)")
  battleLab: battleLabRouter,
  // 개발자 전투 다시보기(docs/adr/2026-11-01-battle-replay.md 5절)
  battleReplay: battleReplayRouter,
  // 개발자 계산식 탭(docs/adr/2026-11-01-formula-editor.md)
  formulas: formulasRouter,
  // 홈 자료(앱 뼈대 W3, ADR 2026-10-29-app-shell 6·7·8절)
  inbox: inboxRouter,
  summary: summaryRouter,
  dashboard: dashboardRouter,
  // 유닛·사이보그 화면 자료(ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)")
  units: unitsRouter,
  cyborg: cyborgRouter,
  // 구인 카드(D-469, 조회만 — 고용은 WebSocket recruit_hire)
  recruit: recruitRouter,
  // 경제 화면(창고·생산·거래창·환전) 조회(ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)")
  economy: economyRouter,
  // 세력·우편 화면(조회만, D-439·D-270)
  faction: factionRouter,
  mail: mailRouter,
  // 영토 층 조회(docs/adr/2026-11-03-territory-layer.md 5절). 비콘 놓기·치우기는 WebSocket
  territory: territoryRouter,
  // 보유 물건(아이템 인스턴스) 조회(docs/adr/2026-11-03-item-holdings.md 4절)
  holdings: holdingsRouter,
  // 유닛 생명 수치(HP·아머·쉴드) 조회(D-512). 회복 물약은 WebSocket item_use
  vitals: vitalsRouter,
  // 노동 계약(임금형·임대형) 조회(docs/adr/2026-11-03-labor-contracts.md)
  labor: laborRouter,
  // 건물 짓기·레벨업·노화·수리 조회(docs/adr/2026-11-07-buildings-runtime.md). 바꾸는 명령은 WebSocket facility_*
  facilities: facilitiesRouter,
});

export type AppRouter = typeof appRouter;
