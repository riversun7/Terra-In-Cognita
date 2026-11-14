# 전투 보고서: 실제 세계 도시 공성·웨이브 팀 수비·군단(파티 여럿)

- 일시: 2026-11-15 07:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-543(1383 나·1384 나)·D-545, ADR `docs/adr/2026-11-14-battle-report.md` "바뀜 (2026-11-14, 실제 도시·웨이브 수비·군단)",
  질문 `docs/questions/2026-11-14-battle-report-2.md`(1461~1470), 줄기 `work/battle-report-2`

## 한 일
- 전투 보고서 공성이 **실제 세계 도시**를 고를 수 있다(1383): 그 도시 2차맵의 지금 배치(넥서스 = 행정 건물, 성벽·성문, 지형)를 읽기만 하고,
  수비를 팀 B 군단 또는 **그 도시의 세계 수비**(휴먼 앞 10명 + 수호신, 세계 전투 시작 길과 같은 몸·비활성·생명 수치·물약)로 고른다.
  결과에 어느 도시·어느 때의 스냅숏인지(`city`) 적고, 기록을 열면 지금 도시와 견줘 바뀐 곳을 알린다. 다시 돌리기는 지금 도시로 돈다.
- **웨이브 팀 수비**(1384): 웨이브 공성 수비를 시뮬 휴먼·팀 B 군단·실제 도시 수비 가운데 고른다(서버 정원사와 같은 `waveBattleInit`·멈춤 규칙).
- **군단**(D-545 원문 "파티가 유닛6개 기본단위이고 파티가 모여 군단 단위로 명령"): 팀 = 파티(최대 6명) 1~4개 [임시]. 파티 명령 = 퇴각 기준선,
  군단 명령 = 정한 시각에 군단 모든 파티 퇴각(판정 파티 퇴각). 판정에 다른 파티·군단 명령이 없어 질문 1461로 냈다. 옛 기록(파티 하나)은 같은 결과.
- 화면(`/dev/balance`, 개발 화면 층): 공성 맵 "실제 세계 도시" + 도시 찾기 목록, 수비 고르기, 군단 명령 칸, 팀 판 위 파티 탭(더하기·빼기),
  보고서의 도시 칸(지금과 같음·바뀜)·군단 모양.
- main 71d47558(D-545 미러)을 합쳤다. `/dev/battle-replay`·`battleLab.monteCarlo`는 그대로(D-545).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/battleReport.ts` | 도시 `world`+`cityId`, 수비 `defense`, 웨이브 `b`, 군단 `ReportLegion`·`legionOf`, 결과 `city`·`legion`, 검사(`unknown_city` 포함) |
| `packages/shared/src/battleReportCity.ts`(새), `packages/shared/package.json` | 실제 도시 스냅숏 정보·목록 모양, `reportCityChanges`(바뀐 곳) |
| `apps/server/src/battleReport/worldCity.ts`(새) | 세계에서 도시 읽기(목록·스냅숏·세계 수비 길), 스냅숏 지문 |
| `apps/server/src/battleReport/setup.ts` | 군단 배치·줄·군단 퇴각 입력, 실제 도시·세계 수비·웨이브 팀 수비, 시작 자리 한 번만·덩이 사이 양보(비동기가 됨) |
| `apps/server/src/battleReport/play.ts`, `aggregate.ts` | 판정 입력(군단 명령)을 틱에 넣음, 결과에 군단 모양 |
| `apps/server/src/battleReport/services.ts`, `schema.ts`, `trpc/battleReport.ts` | 스냅숏(요청마다 도시당 하나), `cities`·`city` 조회, 한 대 풀이 `same`에 도시, 감사 기록 `cityId` |
| `apps/server/src/battleLab/arena.ts` | `arenaLegionInit`(파티 여럿), `arenaInit`는 그 한 파티판 |
| `apps/server/src/battleLab/services.ts`, `app.ts` | 도시 읽기 잇기(`app.ts` 999줄 — 1,000줄 상한 바로 아래) |
| `packages/sim/src/simulator/waveBattle.ts` | 선택 칸 `prepared`(미리 만든 전투맵·시작 자리). 주지 않으면 같은 결과, SIM_VERSION 그대로 |
| `apps/game/src/editor/balance/report/*`, `lab/BattleLab.tsx`, `BalancePanelScreen.tsx`, `report.css`, `messages/{ko,en}.json` | 도시 고르기(`CityPicker.tsx`), 수비·군단 명령, 파티 탭, 도시 칸(`CityNote.tsx`), 줄 이름 `A2·3` |
| `apps/server/src/battleReport/battleReport.test.ts`, `battleReportWorld.test.ts`(새), `battleReportWorld.db.test.ts`(새), `apps/game/.../reportModel.test.ts`, `e2e/battleReport.spec.ts` | 시험 |

## 함께 바꿔야 하는 파일
- 판정에 파티·군단 명령이 생기면(질문 1461) `battleReport/setup.ts` `legionInputs`와 `ReportLegion` 칸.
- 세계 전투 시작 길(`world/battleStart.ts`)에 단계가 더해지면 `battleReport/worldCity.ts` `prepare`도 같은 차례로.
- 정원사 수비 상한(`npc/gardener.ts` `WAVE_DEFENDERS`)을 바꾸면 `@terra/shared/battleReportCity` `REPORT_WORLD_DEFENDERS`.

## 건드리지 말 것
- 옛 기록 호환: 파티 하나 팀은 유닛 ID 1~·101~, 파티 ID 1·2, 같은 자리(시험 `arenaLegionInit = arenaInit`). 세계 수비가 아닐 때 크리쳐 ID 1,000,000부터.
- 실제 도시 읽기는 세계를 바꾸지 않는다(DB 시험이 세계 표·메모리 지문을 앞뒤로 견준다).

## 검사·측정 (Verified, 개발 컨테이너)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 706개·시험 5,288개(DB 시험 포함).
- 새·바뀐 시험: 서버 `battleReportWorld.test.ts` 10개, `battleReportWorld.db.test.ts` 1개(실제 월드: 목록 → 스냅숏 → 실제 도시 파티 공성·웨이브 팀 수비
  20판씩 워커 → 저장·견주기 → 세계 그대로), 게임 `reportModel.test.ts` +2개, 기존 `battleReport.test.ts` 그대로 통과.
- `pnpm build`, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 109,623 B / 상한 131,416 B.
- e2e `e2e/battleReport.spec.ts` 13개 통과(실제 도시 파티 공성 4판·웨이브 팀 수비 4판 새로, 사진 시험 4개 새로).
- 주 스레드 루프 지연(워커 일, 20판·600초, 부하 평균 5~7, 3번): p99 시뮬 도시 3.5~6.2ms / 실제 도시 파티 공성 4.0~9.1ms / 웨이브 팀 수비 4.3~9.7ms,
  최대 7~89ms(공유 CPU에서 흔들림 — 시뮬 도시도 72ms 한 번). 시작 자리를 한 번만 만들기 전에는 실제 도시 최대 34~89ms·p99 2.9~9.1ms.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/battle-report-2-shots/battle-report-city-{neon,light}-{390,1440}.png`,
  `battle-report-legion-{neon,light}-{390,1440}.png`(네온 390·라이트 1440을 눈으로 봄).

## 미검증·TODO·알려진 문제
- NAS 루프 지연·일 시간은 재지 않음(Unknown). 공성 재료는 아직 주 스레드에서 만든다(워커로 옮기기는 하지 않음).
- 실험실 유닛은 지휘 정원 0이라 군단 모양에서 모든 파티가 "지휘 없음"으로 나온다(판정 행동은 같다, 질문 1463).
- 군단 2번부터 파티는 이 기기에 남기지 않는다(새로 고치면 사라짐, 다시 돌리기·기록에는 남는다).
- 한 판·3D 관람은 1번 파티끼리(질문 1469).

## 리셋 필요 여부
- **필요 없음.** DB 표·마이그레이션·팩·SIM_VERSION·프로토콜 판 바뀜 없음. 옛 `battle_reports` 기록은 그대로 열리고 다시 돌면 같은 결과다.

## 사용자 결정 대기
- 질문 1461~1470(`docs/questions/2026-11-14-battle-report-2.md`).
