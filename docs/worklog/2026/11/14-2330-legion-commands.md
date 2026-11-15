# 파티·군단 명령(판정·전투 보고서)·지휘관 정원·공격 변·수비 군단·전투맵 걸음 AGI

- 일시: 2026-11-14 23:30 ~ 2026-11-15 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-179·D-180·D-545·D-549, 사용자 결정 1464~1469(2026-11-15, 기획 커밋 b6107b5 — 미러 전 조정자 전달)·1264·1265(D-553, 기획 커밋
  ae888e9), ADR `docs/adr/2026-10-31-combat-core.md` "바뀜 (2026-11-14, 파티·군단 명령 …)"·"바뀜 (2026-11-15, 전투맵 걸음도 AGI …)",
  `docs/adr/2026-11-14-battle-report.md` "바뀜 (2026-11-14, 파티·군단 명령·공격 변 …)", `docs/adr/2026-11-14-segment-speed.md` "바뀜 (2026-11-15 …)",
  질문 `docs/questions/2026-11-14-legion-commands.md`(1541~1548), 줄기 `work/legion-commands`

## 사용자 결정(이 줄기에서 반영)
- D-549: 1461 파티·군단 명령 추가, 1462 유닛 명령 위층(D-180 그대로), 1463 지휘 정원 밖 파티는 군단 명령 안 받음.
- 1464·1466(원문 "수비도 군단 가능. 군단은 왜 마음대로 4개 분대제한했냐? 3개에서 20개정도로하고 지휘관 능력이나 스킬에 따라 결정되게하자. 수비군도 동일하게 군단가능허다"):
  군단 4파티 상한을 없애고 3~20(지휘관 능력·스킬), 보고서의 실제 도시 수비도 군단(정해진 10명 대신).
- 1465(원문 "실제 웨이브처럼, 위치는 매번설정가능하고 다회반복실험시 랜덤으로 알아서"): 공격 변을 고르고, 여러 판이면 판 시드로 무작위.
- 1467: 다시 돌리기는 지금 도시·바뀐 곳 보임(지금 그대로). 1468·1469: A/B·한 판·3D 관람 모두 군단 전체. 1470은 묻는 중(그대로).
- 1265(D-553 "전투맵 걸음도 AGI"): D-223 "1칸 1초"를 대체 — 2차맵과 같은 걷기 식. 1264("2차맵에도 버프 적용"): 이동 속도 버프를 2차맵 걷기에.

## 한 일
- **판정**(`packages/sim/src/combat/orders.ts`, `battle.ts`): 입력 `order`(파티)·`legion`(편) — 진형 전진(칸 또는 적 쪽, 진형 지키기 간격 2칸 [임시])·
  자리 지키기·목표 공격·퇴각·거두기. 파티 명령이 그 유닛들의 대기 명령을 비우고, 그 뒤 유닛 명령이 먼저. 군단 명령은 정원 안 파티만, 지휘관이 없으면 거절.
  파티·편마다 다시 넣기 막기(C5). 명령을 받은 적 없는 전투는 상태 모양·결과가 옛 판정 그대로(바꾸기 전 코드 지문과 견주는 시험).
- **지휘관 정원**(`combat/command.ts`, 설정 칸 C7 여섯 `c7_command_*` [임시], 팩 core@97): clamp(2 + ⌊(INT×500 + WIS×500)‰ ÷ 10⌋, 3, 20).
  사양에 정원이 없으면 이 식(세계 몸 다시 만들기도 다시 센다).
- **전투맵 걸음 AGI**(`combat/formulas.ts battleMoveIntervalMs`): 한 칸 간격 = ⌊1000 × walk_speed(10) ÷ walk_speed(실효 AGI)⌋. 다시 만드는 서버 길은
  기본 간격을 넘긴다(두 번 줄지 않게).
- **2차맵 이동 속도 버프**(`apps/server/src/world/walkSpeed.ts`): 걸린 효과의 move_speed ‰를 전투와 같은 합·하한으로 걷기 빠르기에 곱한다.
- **SIM_VERSION 44**(43은 boats-impl).
- **전투 보고서**: 군단 명령 목록(`ReportLegion.orders`, 판정 입력 `battleReport/orderInputs.ts`), 군단 20파티, 공격 변(random = 네 변 재료, 판 시드로
  `reportRunEdge`), 실제 도시 수비 군단(휴먼 120명까지 → 지휘관 정원만큼 앞 파티), 결과 칸 `orders`(넣은 수·거절 수)·`edges`(변마다 판 수).
  팀 A 17~20번 파티 유닛 ID는 1001~(팀 B와 겹치지 않게). 전투장 파티 자리를 세 줄씩 일반화(옛 0~3번 자리는 같음).
- **실험실 한 판·3D 관람**: 입력 `legion`(선택)이 있으면 군단 전체·명령으로(`ArenaJob.legion`, 리플레이 입력 포함). 몬테카를로는 그대로.
- **화면**(`/dev/balance`): 명령 칸 `OrdersEditor.tsx`(시각·받는 쪽·명령·목표), 공격 변 고르기, B 팀 따로 = B 군단 전체(`variantLegion`), 한 판 결과의
  2번 파티 이름표(A2·1), 보고서의 공격 변 판 수·명령 거절 칩. 메시지 ko·en.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/orders.ts`(새), `battle.ts`, `battleTypes.ts`, `index.ts` | 파티·군단 명령 판정 |
| `packages/sim/src/combat/command.ts`(새), `coefficients.ts`, `unitSpec.ts`, `tuningCommand.ts`(새), `tuning.ts`, `content/core/tuning.json`·`manifest.json`(97) | 지휘관 정원 식·설정 칸 |
| `packages/sim/src/combat/formulas.ts`, `walkSpeed.test.ts` | 전투맵 걸음 AGI |
| `packages/sim/src/version.ts` | SIM_VERSION 44 |
| `packages/sim/src/combat/orders.test.ts`·`command.test.ts`·`testOrdersBaseline.ts`(새) | 시험(옛 판정 지문 포함) |
| `packages/shared/src/battleReport.ts`, `battleReportCity.ts`, `battleLab.ts` | 명령·공격 변·결과 칸·군단 20·한 판 군단 입력 |
| `apps/server/src/battleReport/orderInputs.ts`(새), `setup.ts`, `play.ts`, `aggregate.ts`, `schema.ts`, `worldCity.ts` | 보고서 명령·공격 변·수비 군단 |
| `apps/server/src/battleLab/arena.ts`, `services.ts`, `balance/jobs.ts`, `trpc/battleLab.ts` | 군단 한 판·3D, 20파티 자리·ID |
| `apps/server/src/world/battleBodies.ts`, `travel/raid.ts`, `temple/cityDefense.ts`, `roster/unitBody.ts` | 정원·걸음을 다시 만든 몸으로 |
| `apps/server/src/world/walkSpeed.ts`(+시험) | 2차맵 이동 속도 버프 |
| `apps/server/src/battleReport/battleReportOrders.test.ts`(새), `battleReportWorld.test.ts` | 시험 |
| `apps/game/src/editor/balance/report/OrdersEditor.tsx`(새), `ReportPanel.tsx`, `reportModel.ts`(+시험), `reportMessages.ts`, `CityNote.tsx`, `report.css`, `lab/BattleLab.tsx`, `lab/ArenaPanel.tsx`, `lab/LabResults.tsx`, `lab/labMessages.ts`, `messages/{ko,en}.json` | 화면 |
| `e2e/battleReport.spec.ts` | 명령 20판·군단 한 판·공격 변 시험, 명령 칸·공격 변 사진 |

## 함께 바꿔야 하는 파일
- 판정에 명령 종류를 더하면 `@terra/shared` `REPORT_ORDER_KINDS`, `battleReport/orderInputs.ts orderOf`, 서버 zod(`schema.ts` order), 화면 `reportMessages.ts ORDER_TEXT`.
- 지휘관 정원 식을 바꾸면 `combat/command.ts`와 설정 칸 C7(팩·`tuningCommand.ts`), 보고서 상한 `REPORT_LIMITS.legionPartiesMax`(= 위 끝 출발값)와
  `REPORT_WORLD_DEFENDERS_MAX`(= 위 끝 × 6).
- 실제 웨이브 수비를 군단으로 바꾸면(질문 1547) 서버 `npc/gardener.ts WAVE_DEFENDERS`·sim 웨이브와 보고서 `setup.ts worldDefenderLegion`을 맞춘다.

## 건드리지 말 것
- 명령 없는 전투는 상태에 `order`·`orderMs` 칸을 두지 않는다(옛 스냅숏·지문 그대로 — `orders.test.ts` 첫 시험).
- 사양을 다시 만드는 길은 `BATTLE_BASE_MOVE_MS`(기본 간격)를 넘긴다. 줄어든 간격을 넘기면 걸음이 두 번 준다.
- 팀 A 파티 0~15의 유닛 ID·파티 0~3의 자리는 옛 기록과 같다.

## 검사·측정
- (Verified) sim 시험 전체 통과(108 파일·873개 — `orders.test.ts` 14, `command.test.ts` 2, 걷기 1 더함). 옛 판정 지문 넷은 바꾸기 전 코드(12aee9b)와 같다.
- (Verified) 서버 단위 시험: 바뀐 곳 통과(`battleReportOrders.test.ts` 7, `battleReportWorld.test.ts` 11, `walkSpeed.test.ts` 6). `apps/server`에서 vitest를
  바로 돌리면 빌드 도장 시험 3개(`app.test.ts`·`trpc/system.test.ts`)가 실패하는데, 바꾸기 전 코드에서도 같다(작업 트리 git 도장 — 루트 `pnpm check`에서는 아래 결과).

## 마지막 검사 (Verified, 개발 컨테이너, main 05012e5 합친 뒤)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 712개·시험 5,342개(DB 시험 포함), 포맷·린트·타입·경계·크기·다국어(7,383키)·대비·콘텐츠(core@97).
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 109,687 B / 상한 131,416 B.
- e2e `e2e/battleReport.spec.ts` 14개 통과(새: 명령 20판·군단 한 판 1개, 공격 변 칩 확인, 명령 칸·공격 변 사진). 명령 칸 넓은 화면 빼기 단추 자리를
  고친 뒤 사진 시험 4개 다시 통과.
- 사진(눈으로 봄: 네온 390·1440, 라이트 390·1440): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/legion-commands-shots/`
  `battle-report-orders-{neon,light}-{390,1440}.png`, `battle-report-edge-{neon,light}-{390,1440}.png`(그 밖 옛 사진도 같은 폴더).

## 미검증·TODO·알려진 문제
- 실제 게임에서 플레이어가 전투에 명령을 넣는 길(WS·화면)은 없다 — 유닛 명령도 없다(질문 1546). 프로토콜은 그대로(29).
- 공격 변 random은 공성 재료를 네 벌 만든다(주 스레드 시간 약 4배). NAS 루프 지연은 재지 않음(Unknown).
- 지휘관 정원의 스킬·작위 몫은 0(질문 1543). 지휘관이 쓰러지면 다음 군단 명령 때 다시 고른다(질문 1545).
- 실제 웨이브(정원사)의 수비는 아직 10명(질문 1547).
- 전투 판정에 지형 비용으로 느려지는 걸음은 없다(그대로 — 흐름장은 길만 고른다).

## 리셋 필요 여부
- **필요 없음.** DB 표·마이그레이션 바뀜 없음. 팩 core@97(설정 칸 C7 여섯 더함 — 세계 값 그대로), SIM_VERSION 44.
- 진행 중인 세계 전투는 저장된 시작 자료로 다시 계산하므로 그대로 이어진다. 다만 SIM_VERSION 44부터 새로 시작하는 세계 전투는 AGI가 10이 아닌 유닛의
  걸음이 빨라져(1265) 옛 판과 결과가 다르다. 옛 `battle_reports` 기록은 열리지만 다시 돌리면 판정 판 차이(군단 퇴각은 정원 안 파티만, 걸음 AGI)로 결과가
  달라질 수 있다(화면이 판정 판 차이를 알린다).

## 사용자 결정 대기
- 질문 1541~1548(`docs/questions/2026-11-14-legion-commands.md`), 1470(`docs/questions/2026-11-14-battle-report-2.md`).
