# NPC AI 작동 모니터 개편 — 필수요소 점검판

- 일시: 2026-11-24 14:10 KST
- 작업 도구: Claude Code
- 관련 ADR: `docs/adr/2026-11-21-npc-needs-drives.md` "바뀜 (2026-11-24, 모니터 개편)"

## 한 일

사용자 요청("너무 허접하다 개편하라 — 유닛들이 필수활동·생산·재화벌이·주거·회복이 제대로 되는지, 멈춰 있는 게 없는지, 도시·가문도 필수요소가 되고 있는지")으로 `/dev/npc-ai` [작동 모니터] 탭을 다시 만들었다.

- 유닛 → 가문 → 도시 → 세계를 같은 여섯 기둥(식사·벌이·주거·회복·움직임·질서)으로 세고 정상·주의·문제로 가른다. 도시·세계에는 생산·오늘 배급·생필품 재고를 더했다.
- 유닛마다 문제 일곱 가지(굶음·임금 못 받음·노숙·부상·지시 불복·오래 멈춤·지도에 없음)를 붙인다. 유닛 표는 문제 종류로 거른다.
- 도시를 고르면 생필품 재고(버티는 시간)·시설(생산 중·멈춤·일꾼 없음)·가문(같은 기둥 + 금고·깃발)·그 도시 유닛 모두를 본다.
- 지금 하는 일(일터 근무·운반·둘레 채집·장보기·휴식·순찰·대피·활동 불가·다른 곳·지도에 없음) 분포를 보인다.

## 바꾼 파일과 이유

- `apps/server/src/npc/aiMonitor.ts` — 집계를 여섯 기둥·유닛 문제·도시 생산·재고로 다시 썼다(순수 함수).
- `apps/server/src/npc/aiMonitorSource.ts`(새 파일) — 2차맵 몸(지금 하는 일·움직임·부상)과 도시 경제(쉼터 계획·시설·생필품 재고·국고)를 읽는다. 계정·사건을 만들지 않는다(`balanceOf`는 없는 계정을 만들지 않는다 — Verified: `ledgerBook.ts`).
- `apps/server/src/world/bots.ts` — `botActivity`(읽기 전용): 봇이 목적지를 고를 때와 같은 판단을 밖에서 읽게 했다.
- `apps/server/src/npc/aiBridge.ts`·`runtime.ts` — 모니터에 유닛 몸·가문·도시 경제를 넘긴다.
- `apps/game/src/editor/npcAi/NpcAiMonitorTab.tsx`·`NpcAiMonitorTables.tsx`(새 파일)·`npcAiMonitorModel.ts`(새 파일, 정상·주의·문제 문턱)·`npcAiEditor.css` — 화면.
- `apps/game/messages/{ko,en}.json` — `dev_npc_ai_mon_*` 문구를 새 화면에 맞춰 바꿨다(옛 합계 칸 문구는 지웠다).
- 시험: `aiMonitor.test.ts`(5건), `npcAiMonitorModel.test.ts`(5건).

## 확인

- **Verified** 로컬(임시 DB + 빌드한 서버, 시험 계정)에서 탭을 열어 실제 값을 봤다: 도시 15곳·휴먼 556명·경비대 59명, 일꾼 556/556, 숙소 556·집 59·노숙 0, 걷는 중·서 있음 합 615(오래 멈춤 0·지도에 없음 0), 시설 100/100곳 생산 중, 생필품 재고 48~72시간. 도시를 골라 재고·시설 7곳·가문 4곳·유닛 50명 표가 뜨는 것을 봤다.
- **Verified** 개발 화면 두 테마(네온 다크·라이트)와 375px 폭(가로 넘침 없음).
- **Verified** 문제·주의 색은 화면에서 칸 값을 손으로 바꿔 봤다(실제 문제 상황은 새 세계라 생기지 않았다).
- **미검증** 굶음·임금 못 받음·노숙·오래 멈춤·지도에 없음이 실제로 0보다 큰 화면(단위 시험으로만 확인).
- **미검증** 식사 기둥·오늘 배급: 로컬에서는 모두 "자료 없음"이었다. 하루를 2분으로 줄였고(`NPC_DAY_MS`) 배급은 실제 한 시간마다라 한 번도 돌지 않았다(Assumed). 운영 서버에서 값이 차는지는 배포 뒤에 본다.
- 화면 시험(e2e)은 이 PC에 Playwright 브라우저가 없어 돌리지 않았다.

## 함께 바꿔야 하는 파일

- 유닛 문제 종류를 더하면: `aiMonitor.ts`(`MonitorIssue`·`MONITOR_ISSUES`·`byIssue`) + `NpcAiMonitorTables.tsx`(`ISSUE_LABELS`·`ISSUES`) + 메시지 ko·en.
- 봇의 목적지 규칙(`bots.ts` `targetOf`)을 바꾸면 `botActivity`도 같이 본다.
- 일꾼 ↔ 휴먼 나눔 차례(`humanPlaces.assignHumanPlaces`)를 바꾸면 `aiMonitor.ts` `housingOf`의 차례도 맞춘다.

## 건드리지 말 것

- 모니터는 읽기만 한다. `aiMonitorSource.ts`에서 `ownerAccount`·`systemAccount`(계정을 만든다)를 쓰지 않는다.

## 미검증·TODO

- 멈춤 문턱(10분)·정상/주의/문제 문턱은 [임시] 상수다. 운영 값을 보고 다듬는다.
- 유닛별 길 찾기 실패 횟수는 세지 않는다(오래 멈춤으로만 잡힌다).
