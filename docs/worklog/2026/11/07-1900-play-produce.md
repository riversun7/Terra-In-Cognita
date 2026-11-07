# 플레이어 생산(플레이 흐름 WP3): 시작 재료·진짜 채집 물자·직무 배치·지도에서 짓기 자리·구인 칸

- 일시: 2026-11-07 19:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP3 플레이어 생산"(새, 상태 제안), 질문 520~525 `docs/questions/2026-11-07-play-produce.md`(새), 기획 90 §2.1·60 §7.1 ③(D-6045)·D-469·D-479·D-506·D-507·D-515·D-121, 가지 `work/play-produce`(시작점 main `cd2ceda`)

## 한 일
- 사용자 지시(2026-11-07) "풀레이 흐름대로 가능하게 제작해라 … 도시경제 돌아가게 하자"의 WP3(새 플레이어가 내려간 뒤 모으고·짓고·만드는 고리). D-515: 수치는 설정 칸 [임시], 모양이 빈 것은 기본안 + 질문 520~525(모양만). 콘텐츠 켬·끔 스위치는 만들지 않았다.
- **1 시작 재료**: 사이보그 만들기와 같은 동기 처리(같은 커밋)에서 소나무 원목 20·석재 10(설정 칸 `start_goods_pine_log`·`start_goods_stone`, 팩 core@48)을 시작 도시의 내 도시 창고로(생산원 → 원장 위치 = 도시, 거래 `start_goods`, 중복 방지 키 `start_goods:<사용자>`). 시작 화폐는 지원금 그대로.
- **2 진짜 채집 물자**: 시뮬 `OutputSegment.goods`(일한 주기 → 물건 줄, 같은 산출 거래) + 서버 `labor/gatherWork.ts`(시뮬과 같은 `workerEffects`·`rollGatherOutputs`·`tierRequiredProgress`, 유닛마다 진행을 쌓고 (유닛, 차례) 해시 추첨 → 나눠 정산해도 같음). 채집 시설(팩 `gather` — farm·lumber_camp·mine)의 노동 계약 work 구간·직무 배치 구간이 시험 광석 대신 진짜 물건을 낸다: 임금형·배치 = 그 건물이 선 도시의 도시 창고, 임대형 = 그 건물 창고. 플레이어 유닛은 계약·배치 구간에서만 산출(정산 기본 산출 = 개발 시험 일꾼만). 사다리·확률표·묶음 크기 = 실효 콘텐츠(`facilities/catalog.ts`).
- **3 내 유닛이 일하기**: 직무 배치(내 유닛 → 내 다 지은 채집 시설, 돈 없음, 자리 = 레벨 × 레벨당 자리, 표 `unit_work`, 프로토콜 14 `labor_assign`·`labor_unassign`). 일을 시작하면(배치·계약·구인 받기) 유닛 직무를 채집으로 켜고 끝나면(풀기·해지·정산 안 자동 끝) 끈다(피로·단계 그대로). 화면 = 채집 시설 카드 일꾼 칸(`WorkerParts.tsx`: 일꾼 n/자리·스탯 짝·산출 자리·목록·[빼기]·쉬는 유닛 고르기·[직무 배치]).
- **4 지도에서 짓기 자리**: 짓기 폼 [지도에서 고르기] → 2차맵 땅 누르기 → 그 칸으로 돌아옴(`economy/buildPick.ts` 연결점, 2차맵 화면은 `onGroundTap` 앞 두 줄 + 안내 글만). 서버가 띄운 2차맵이 여럿이면 폼에 2차맵 고르기.
- **5 처음 고용**: 경제 → 생산 구인 칸(`RecruitPanel.tsx`, `recruit.board` + `recruit_hire`). 고용 명령·순수 셈을 개발자 폴더 밖(`src/recruit/`)으로 옮겨 개발자 구인 화면과 같이 쓴다. 유닛 화면 직무 이름 "시험 채집" → "채집"(진짜 물건을 내므로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/settle/owner.ts`·`owner.test.ts`(1개 더)·`index.ts` | 산출 구간 물건 줄(`goods`·`GoodsLine`) — 시뮬은 쓰지 않음 |
| `packages/sim/src/society/coefficients.ts`, `tuningCyborg.ts`, `content/core/tuning.json`·`manifest.json` | 시작 재료 설정 칸 2개, core@48 |
| `packages/protocol/src/labor.ts`·`index.ts`·`version.ts`, 시험 `labor`·`cyborg`·`facilities`·`ruins` | 직무 배치 메시지·결과 코드 3개, 판 14(최소 13) |
| `packages/shared/src/facilities.ts` | 시설 `gather`·`slots`·`workers`, 유닛 `stats`·`assignedTo` |
| `apps/server/src/db/laborSchema.ts`·`schema.ts`, `drizzle/20261107092330_unit_work/`(새), `world/persist/tables.ts` | `unit_work` 표(새 표만) |
| `apps/server/src/labor/gatherWork.ts`(새)·`gatherWork.test.ts`(새, 4개)·`work.ts`(새)·`workBook.ts`(새)·`service.ts`·`store.ts`·`gateway.ts`·`gateway.test.ts`·`produce.db.test.ts`(새, DB 3개) | 채집 산출·직무 배치·직무 켜고 끄기·명령 |
| `apps/server/src/world/settlement.ts` | 기본 산출 = 개발 시험 일꾼만, 멈춤 겹치기가 물건·덤 칸을 잇음 |
| `apps/server/src/facilities/catalog.ts`·`world.ts`·`views.ts`·`appSource.ts` | 채집 정의·사다리·확률표, 산출 자료 잇기(`attachLabor` 안), 화면 자료 |
| `apps/server/src/cyborg/service.ts`·`cyborg.db.test.ts` | 시작 재료 |
| `apps/server/src/session.ts` | 판 14 메시지 길 |
| `apps/game/src/economy/WorkerParts.tsx`(새)·`RecruitPanel.tsx`(새)·`recruit.css`(새)·`buildPick.ts`(새)·`buildPick.test.ts`(새)·`FacilityPanel.tsx`·`FacilityCards.tsx`·`ProductionView.tsx`·`facilities.css`·`laborCommands.ts`·`laborText.ts`·`queries.ts` | 화면 |
| `apps/game/src/recruit/recruitCommands.ts`·`recruitModel.ts`·`.test.ts`(옮김), `editor/recruit/RecruitLabScreen.tsx`, `units/fusionCommands.ts`(주석) | 구인 명령을 경제·개발자 화면이 같이 씀 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 짓기 자리 고르기 두 줄 + 안내(최소, WP2 영역) |
| `apps/game/messages/{ko,en}.json`, `roster/rosterText.test.ts` | 문구 38개 더함·1개 고침(유닛 직무 "시험 채집" → "채집") |
| `e2e/produce.spec.ts`(새) | 시작 재료·구인 칸·직무 배치·지도 고르기 |
| `docs/adr/2026-11-07-play-flow.md`(새), `docs/questions/2026-11-07-play-produce.md`(새), `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 작업 중(Verified): 시뮬 정산 15개, 프로토콜 98개, 서버 채집·게이트웨이·정산 순수 시험, DB(`TEST_DATABASE_URL`) 사이보그·노동 계약·플레이어 생산·정산·건물·영토·구인 16파일 66개 통과, `pnpm check:content`(core@48, 기준 cd2ceda) 통과, 게임 타입·경제·구인 단위 통과.
- 시뮬: 시뮬 정산 호출(`simulator/world.ts settleFaction`)은 `outputs`를 넘기지 않아 바뀐 길을 타지 않는다(Verified: 코드) → `SIM_VERSION` 16 그대로. econ16 시드 1 3일이 위반 0으로 돈다(hash `5c132ff1`, 팩 판·해시가 바뀌어 머리 값은 다르다). 바꾸기 전 줄과의 비교는 하지 않았다(Unknown, 같은 작업 트리에 옛 코드가 없음).
- 화면 시험(Verified, `pnpm e2e`, 빌드한 앱·서버, 헤드리스 Chromium): `produce`(새)·`facilities`·`labor`·`economy`·`recruit` 42개 중 41개 통과, 1개 실패 = 새 시험의 기대 글이 틀림(팩 이름은 "소나무 원목"이 아니라 "소나무") → 고친 뒤 `produce.spec.ts` 3개 다시 통과. 확인한 것: player 시작 도시 창고 "소나무 20 · 석재 10"(시작 재료가 실제 사이보그 만들기 프로토콜로 들어감), 구인 칸 카드 3장·[고용], admin 벌목장 짓기 → 사이보그 본체 직무 배치 → 일꾼 1/10 → [빼기] → 0/10, [지도에서 고르기] → `/map` + 안내 글, economy 배치 시험(390·1440 × 파스텔·다크 × 한국어·영어: 가로 넘침·작은 누르는 곳 없음 — 새 구인·일꾼 칸 포함). 사진(390): 일꾼 칸 파스텔 한국어, 구인 칸 파스텔 한국어·다크 영어 — 넘침·잘림 없음, 스탯 묶음 색은 테마 토큰(`--color-stat-*`).
- 끝 검사(Verified, 무거운 잠금 안): `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어·대비·콘텐츠 core@48·시험 454개 파일 3,658개, DB 시험 포함). 파일 크기 경고에 `labor/service.ts` 671줄이 더해졌다(실패 아님). `pnpm check:docs`는 커밋 뒤에 돌린다(아래 보고).

## 함께 바꿔야 하는 파일
- 프로토콜 14: WP4도 14를 쓴다 → 합칠 때 `version.ts` 판 설명 14를 한 줄로 묶고 각 시험의 판 기대값을 맞춘다.
- 채집 규칙: 서버 `labor/gatherWork.ts gatherSettingsOf`는 시뮬 `simulator/run.ts attachEconomy`의 채집 손잡이 대응과 같아야 한다(한쪽만 바꾸지 않는다). 사다리는 `facilities/catalog.ts gatherLadder` ↔ 시뮬 `prepareCatalog`.
- `packages/sim/src/index.ts`가 987줄이다(1,000줄 실패 문턱 가까움) — 다른 줄기가 내보내기를 더하면 나눌 것.

## 건드리지 말 것
- WP1(`world/world.ts`·`cities.ts`·`nations.ts`·config·npcSeed), WP2(map·start·engine·routes·`trpc/world.ts` — 2차맵 화면은 두 줄만), WP4(`npc/runtime.ts`·market·거래소 화면) 파일. `world.ts`는 건드리지 않았다(산출 자료는 `facilities/world.ts attachLabor` 안에서 잇는다).
- 올라간 마이그레이션은 고치지 않았다.

## 미검증·TODO·알려진 문제
- 휴먼 유닛의 채집 스탯은 구인 카드 스탯이 아니라 기본 몸 + 장비(`holdings primariesOf`, 공방 장인 실력과 같은 셈).
- 직무 배치에 거리 조건 없음(질문 522), 직무를 풀면 피로가 멈춤(질문 525).
- 생산 시설 건물 창고 용량·가득 차면 가까운 창고로(414 답 D-121)는 아직 없다(질문 523).
- 가공·완성 레시피 서버 생산은 없다(채집만).
- 2차맵 칸 누르기 → 폼 칸 채움은 화면 시험에서 보지 않았다(WebGL 칸 좌표). 연결점 단위 셈은 `buildPick.test.ts`.
- `apps/server/src/labor/service.ts` 671줄(600줄 경고).

## 사용자 결정 대기
- 질문 520~525(모양만, 답이 없으면 지금 코드).
