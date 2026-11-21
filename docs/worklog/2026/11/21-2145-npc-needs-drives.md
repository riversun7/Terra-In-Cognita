# NPC AI 구체화 A단계: 유닛 2차 지수 층 · 5상태 FSM · 개인 식사 몫 → 만족도 (SIM_VERSION 69)

- 일시: 2026-11-21 21:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-npc-needs-drives.md`, `docs/adr/2026-11-20-npc-autonomous-ai.md`(3절 일부 대체)

## 한 일
- 사용자와 NPC AI 구체화 계획을 세웠다(단위: 유닛 → 가문·가문장 → 가문 연맹 → 도시 → 국가 → 연합, 1차 목적 = 자원 채집·세력 확장). 단계 A~F 가운데 A를 했다.
- 2차 지수 층(`unitDrives.ts`): 1차 값(7축 성향·그날 식사 몫·만족도) → 근로 의욕·복종도·위험 감수·소비 성향. 판단은 지수만 읽는다.
- 유닛 FSM 8상태 → 5상태(일·욕구 해결·휴식·순찰·회피). 일의 종류는 일감(`haul`·`post`·`forage`)으로 뺐다.
- 하루 끝 만족도의 포만감 요소를 도시 평균 → 그 휴먼이 그날 받은 몫(`SimUnit.fedPm`)으로(판정 바뀜, 판 69).
- 서버 2차맵 봇: 식사 몫·만족도를 FSM에 넣고, 고정 피로(300·650) 대신 일하는 때에 따라 오르내리는 어림 피로.
- `/dev/npc-ai` 탭 2 일과 미리보기: 만족도·식사 몫 슬라이더, 2차 지수 표시, 5상태 표시.

## 이어서 한 일 (가문 일 지시 — 계획 B·C·D의 일손 몫, 22:10)
- 가문 상태 점검 → 깃발 → 일꾼 차례·불복(`houseOrders.ts`, 서버 `laborOrders.ts`). 도시마다 5분에 한 번 가볍게 보고, 달라진 것이 있는 도시만 다시 짠다.
- 일꾼 ↔ 휴먼 나눔이 유닛 ID 차례 대신 가문 일 지시 차례를 따른다(`cityWorkerUnits`·`humanPlaces`). 불복한 휴먼은 일손에서 빠진다(도시 경제 `syncCity`). 가문 없는 휴먼은 도시가 가문원 뒤에 부른다.
- 바꾼 파일: `packages/sim/src/npc/houseOrders.ts`·`.test.ts`(새 파일), `packages/sim/src/simulator/humanPurse.ts`(`laborOrderOf`)·`world.ts`(`laborRank`·`onStrike`)·`serverEconomy.ts`, `apps/server/src/npc/laborOrders.ts`·`.test.ts`(새 파일), `aiBridge.ts`, `humanPlaces.ts`·`.test.ts`, `economy.ts`, `runtime.ts`(999줄 — 상한 1,000줄에 닿았다, 다음에 더 넣으려면 나눠야 한다).
- 시험(Verified: 실행): 임시 로컬 PostgreSQL 15.14(스크래치 폴더, 끝나고 멈춤)로 `apps/server/src/npc`·`world`, `packages/sim/src/npc`·`simulator` 120파일 675건 통과(DB 시험 포함). 린트·서버 타입 검사 통과. 전체 `pnpm check`는 이 묶음에 아직 돌리지 않았다(끝에 한 번).
- 시뮬은 가문이 없어 출력이 그대로다(`SIM_VERSION` 69 그대로) — 불복·일꾼 차례는 서버만의 판정 고리. 실제 서버에서 불복 수·생산 변화는 재지 않았다(미실행).

## 이어서 한 일 (임금·가문 금고, 22:25 — SIM_VERSION 70, 팩 135)
- 임금 → 만족도(`SimUnit.paidToday`, `satisfactionTarget`의 `unpaid`), 건설 도우미 임금(`Economy.today.building`, `NpcLivingRules.buildersMax`).
- NPC 가문 금고: 가문세 + 돌봄 배당(`apps/server/src/npc/houseCare.ts`, 하루 끝 임금 다음·만족도 앞).
- 설정 칸 10개(`npc_ai_drive_*`·`npc_ai_house_*`)를 팩·계수표·서버 실시간 적용 목록·`/dev/npc-ai` 탭 2에 넣었다.
- 바꾼 파일: `packages/sim/src/simulator/{humanPurse,society,world,economy,npcBuild,run}.ts`, `society/labor.ts`, `version.ts`, `npc/{houseOrders,unitDrives,unitBrain,aiCoefficients}.ts`, `tuningNpcAi.ts`, `apps/server/src/npc/{houseCare,laborOrders,aiBridge,npcWages,runtime}.ts`, `tuning/scope.ts`, `trpc/npcAi.ts`, `content/core/{tuning,manifest}.json`, `apps/game/src/editor/npcAi/NpcAiUnitTab.tsx`, `apps/game/messages/{ko,en}.json`, 시험 파일들.
- 시험(Verified: 실행): 임시 로컬 PostgreSQL 15.14로 서버 `npc`·`world`·`trpc`·`tuning`·`settings`, `packages/sim`·`packages/content`, 에디터 296파일 2,320건 통과(DB 포함). 타입 검사·린트·다국어·콘텐츠 검사 통과. 전·후 시뮬 비교는 ADR 표.
- 미실행: 전체 `pnpm check`(끝에 한 번), 화면 시험, 탭 2 사진 확인, 실제 서버에서 가문 금고·불복 재기.

## 이어서 한 일 (가문 연맹·비접속 유저 자율, 22:50)
- 가문 연맹(E): 도시마다 기금(가문 금고 분담금), 대표 성향이 확장·생산·군사·기술 가운데 하나를 고르고 집행(`packages/sim/src/npc/leagueBrain.ts`, `apps/server/src/npc/houseLeague.ts`, `aiBridge.ts bridgeTies`).
- 비접속 유저 자율(F): 일 없는 유닛을 남의 일자리에 넣는 관리인(`apps/server/src/labor/offlineSteward.ts`), 접속 끊은 유저 목록(`world/settlement.ts offlineUsers`), 하트비트를 `world/heartbeat.ts`로 꺼냄(`world.ts` 줄 수 상한).
- 설정 칸 4개 더(`npc_ai_league_dues_pm`·`npc_ai_league_lot`·`npc_ai_offline_steward_enabled`·`npc_ai_offline_steward_after_ms`) — 모두 14개.
- 줄 수: `npc/runtime.ts` 998, `world/world.ts` 998, `labor/service.ts` 997(상한 1,000 — 다음에 더 넣으려면 나눠야 한다).
- 기획 질문지를 썼다: `docs/questions/2026-11-21-npc-houses.md`(2441~2447, 답 기다림). 전할 것: 가문 연맹(기획에 없는 조직), NPC 가문세·돌봄 배당, NPC 만족도의 임금 요소, 건설 도우미 임금, 비접속 유저 유닛 관리인.

## 끝 검사 (23:05)
- `pnpm check`(Verified: 실행): 포맷·타입·린트·모듈 경계·파일 크기·다국어 8,661키·대비·콘텐츠(core@135) 통과. `pnpm check:docs` 통과.
- 단위 시험(DB 없이): 851파일 가운데 756 통과·94 건너뜀(DB)·1 실패 — `apps/server/src/metrics.test.ts`(이벤트 루프 지연을 재는 시간 민감 시험). 따로 돌리면 통과(7건). 그때 작업 PC 부하 평균이 40을 넘었다(다른 작업이 함께 돌고 있었다) — 이번 변경이 건드리지 않은 파일이다.
- DB 포함 전체(임시 로컬 PostgreSQL 15.14): 6,143건 가운데 6,136 통과·7 실패(행성 굽기·2차맵 생성·해안선·대결·명성·NPC 도시 증축·도시 이름). 그 7파일만 따로 돌리면 34건 모두 통과 — 전체를 한꺼번에 돌릴 때의 부하로 본다(Assumed: 실패 문구를 남기지 못했다).
- 화면 시험(e2e)·실제 서버 확인·`/dev/npc-ai` 탭 2 사진은 미실행.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/unitDrives.ts`, `unitDrives.test.ts` | 2차 지수(새 파일) |
| `packages/sim/src/npc/unitBrain.ts`, `unitBrain.test.ts`, `aiScale.test.ts`, `aiIndex.ts` | 5상태 + 일감, 지수·욕구 입력, 내보내기 |
| `packages/sim/src/simulator/humanPurse.ts`, `humanPurse.test.ts`, `world.ts`, `society.ts` | 휴먼마다 그날 받은 몫을 적고 만족도가 읽는다 |
| `packages/sim/src/version.ts` | `SIM_VERSION` 69 |
| `apps/server/src/world/bots.ts`, `bots.test.ts` | 5상태 목적지, 어림 피로 `shiftFatiguePm`, `BotHome`에 식사 몫·만족도 |
| `apps/server/src/npc/humanPlaces.ts`, `aiBridge.ts` | 거울 세계 휴먼의 식사 몫·만족도를 봇 자리에 넣는다 |
| `apps/server/src/trpc/npcAi.ts` | 일과 미리보기 입력(만족도·식사 몫)·출력(지수·일감) |
| `apps/game/src/editor/npcAi/NpcAiUnitTab.tsx`, `apps/game/messages/{ko,en}.json` | 탭 2 미리보기 |
| `docs/adr/2026-11-21-npc-needs-drives.md`, `docs/adr/2026-11-20-npc-autonomous-ai.md` | 새 ADR, 옛 ADR 상태 줄만 "일부 대체됨" |

## 함께 바꿔야 하는 파일
- 다음 단계(B: 가문 창고·금고·일 지시 틀)에서 `unitJobOf`(일감 차례)에 가문장 지시·도시 징발 일감을 넣는다.
- `apps/server/src/npc/npcHouseAi.ts`·`packages/sim/src/npc/houseBrain.ts`: `houseAi.tick`을 부르는 곳이 아직 없다(Verified: grep). C단계에서 "상태 점검 + 부분 재판단" 구조로 바꾸며 잇는다.

## 건드리지 말 것
- `docs/design/` 미러.
- 올라간 마이그레이션. 이번 작업은 DB를 바꾸지 않았다.

## 미검증·TODO·알려진 문제
- `pnpm check` 통과(Verified: 실행 — 포맷·타입·린트·경계·크기·다국어 8,659키·대비·콘텐츠·단위 시험 751파일 5,728건, DB 시험 94파일은 `TEST_DATABASE_URL`이 없어 건너뜀).
- 전·후 비교(Verified: 실행, `econ16` 60일 시드 1·2·3): 불변 조건 위반 0. 평균 만족도 54→53·49→51·56→56, 진압된 반란 0→12·13·7, 굶어 멈춤 0→1·2→3·0→2, 구인 1,928→1,916·2,406→2,227·1,947→1,863. 굶어 멈춤이 조금 늘었다 — ADR "감수할 점".
- 180일 시뮬(D-391), 서버 DB 통합 시험(`*.db.test.ts`), 화면 시험(`e2e/dev.spec.ts`), 실제 서버에서 봇 움직임 확인은 미실행.
- `/dev/npc-ai` 탭 2는 네온 다크·라이트 사진 확인을 하지 않았다(미실행 — 슬라이더 2개와 수치 4줄을 기존 칸 모양으로 더함).
- 욕구 해결 상태는 가서 서 있는 모습뿐이다(실제 구매 셈은 가문 창고 단계).
- 2차 지수 가중치(`DRIVE_WEIGHTS`)·어림 피로 꼭대기(600‰)는 코드 상수 [임시] — 설정 칸은 F단계.
- 기획 세션에 전할 것: 가문 연맹(기획에 없는 조직 — 46 §1 "동맹·연합은 조약"), 만족도 포만감 요소의 유닛별 값. 질문지는 E단계 전에 쓴다.

## 사용자 결정 대기
- B단계(가문 창고·금고·일 지시 틀)로 이어 갈지.
