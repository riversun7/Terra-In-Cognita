# /dev/npc-ai [작동 모니터] 탭: 서버에서 도는 NPC AI 상태를 한 장으로

- 일시: 2026-11-23 21:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-npc-needs-drives.md` "바뀜 (2026-11-23, 모니터 탭)", 작업 기록 `docs/worklog/2026/11/21-2145-npc-needs-drives.md`

## 한 일
- 사용자 요청: "ai작동을 모니터링할 수 있게 /dev/npc-ai에 탭 추가하라".
- 서버 조회 `npcAi.monitor`(읽기만): 스위치·세계 합계·도시 표·고른 도시의 가문 표·마지막 기록(하루 끝 가문세·돌봄, 일꾼 차례 바뀜, 비접속 유저 관리인).
- 화면 탭 [작동 모니터]: 10초마다 새로 읽는다. 도시를 누르면 그 도시 가문 표.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/aiMonitor.ts`, `aiMonitor.test.ts` | 모니터 보기 조립(순수 함수)과 시험(새 파일) |
| `apps/server/src/npc/aiBridge.ts` | `monitor()` — 마지막 하루 끝·일꾼 차례 바뀜 기록, 가문 표(이름·집계·깃발·금고) |
| `apps/server/src/npc/runtime.ts` | `NpcRuntime.aiMonitor`, 도시 이름 넘기기 |
| `apps/server/src/labor/offlineSteward.ts`, `apps/server/src/world/world.ts` | 관리인 마지막 기록 `stats()` → `World.offlineSteward()` |
| `apps/server/src/trpc/npcAi.ts`, `context.ts`, `createContext.ts`, `apps/server/src/app.ts` | tRPC `npcAi.monitor`와 맥락 연결 |
| `apps/game/src/editor/npcAi/NpcAiMonitorTab.tsx`(새 파일), `NpcAiEditorScreen.tsx`, `npcAiModel.ts`, `npcAiEditor.css` | 탭 화면 |
| `apps/game/messages/{ko,en}.json` | 문구 57개(ko·en) |

## 함께 바꿔야 하는 파일
- AI 고리를 더하면(예: NPC 국방 투자) `aiMonitor.ts`의 보기와 탭 표에 칸을 더한다.

## 건드리지 말 것
- `docs/design/` 미러.

## 미검증·TODO·알려진 문제
- 화면 확인(Verified: 실행): 빌드한 서버를 임시 로컬 PostgreSQL 15.14 + 새 DB로 띄우고(`NPC_DAY_MS=120000`, 봇 200) 시험 계정으로 들어가 탭을 열었다. 네온 다크·라이트 두 테마, 375px 폭(가로 넘침 없음 — 문서 폭 = 화면 폭)에서 확인. 값: 도시 15·휴먼 556·경비대 59, 하루 끝 뒤 "가문세 556명", 평균 만족도 60 → 69 → 76, 도시를 누르면 가문 4줄과 금고 잔고. 사진은 저장소에 두지 않았다.
- 그 확인에서 식사 몫이 모두 "모름"이었다: 하루를 2분으로 줄여 시간마다 도는 생필품 경계가 한 번도 돌지 않았기 때문으로 본다(Assumed). 실제 하루(24시간)에서 값이 차는지는 운영 서버에서 봐야 한다.
- 화면 시험(e2e)은 미실행 — 이 PC에 Playwright 브라우저(chromium-1243)가 없다. `e2e/dev.spec.ts`의 `/dev/npc-ai` 범위 줄 시험은 건드리지 않았다(경로 그대로).
- 지시 불복·깃발·돌봄 배당이 0보다 큰 상태의 화면은 보지 못했다(새 세계라 모두 0). 조립 함수 시험(`aiMonitor.test.ts`)이 그 값을 본다.

## 사용자 결정 대기
- 없음.
