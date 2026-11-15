# 군단 명령 2단계 — 지휘 계급·승계, 집결·따라가기·대형, AI 전개 방식 8가지, 전투맵 명령 화면, 웨이브 편성, 이동 속도 출처

- 일시: 2026-11-16 06:30 ~ 08:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-558(사용자 1541~1548 — 1차·2차 답), D-549·D-326·D-557, 45 §3.1·§4.1, ADR `docs/adr/2026-10-31-combat-core.md` "바뀜 (D-558 — 군단
  명령 2단계)"·"바뀜 (D-558 — 2차맵 이동 속도 출처)", `docs/adr/2026-11-14-battle-report.md` "바뀜 (D-558 …)", `docs/adr/2026-11-01-gardener-r5b.md`
  "바뀜 (D-558 …)", 질문 `docs/questions/2026-11-16-legion-commands-2.md`(1961~1974), 앞 줄기 `docs/worklog/2026/11/14-2330-legion-commands.md`,
  줄기 `work/legion-commands-2`
- 판 번호: 줄기에서는 SIM 57·core@115로 적었으나 묶음 1116h에서 처음 main에 오르는 판이라 합칠 때 SIM 56·core@114로 고쳤다(`docs/worklog/2026/11/16-HHMM-batch-1116h-merge.md`).

## D-558 원문과 대조
| 원문 | 한 것 |
|---|---|
| 1543·1544 "군단은 3~10개 분대 … 스탯이 아니라, 환생시 +1까지만, 전투계열 랭킹이나 해당국가 작위로 … 군단 지휘관도 하나의 분대에 속함" | 정원 = max(작위 표, 전투 랭킹 등급 표) + 환생 덤 1, 3~10. INT·WIS 식·칸 넷 지움. 지휘관 분대가 정원 첫 자리 |
| 1545 "국가 작위가 순서대로 이어받음. 없거나 예외경우 전투랭킹순. 자동 승계" | 승계 순서 작위 → 등급 → 정원 → ID, 군단 명령 받은 편은 쓰러진 틱에 바로 승계 |
| 1541·1542 "집결·따라가기 추가" + "대형 고르기 추가" | 명령 rally·follow·formation(횡대·종대·쐐기·방진) |
| 2차 AI 전개 방식 8가지 모두 채택 | 명령 tactic — 돌격·수비 집중·중앙 돌파·측면 우회·후방 침투·집중 사격·견제·지연전 |
| 1546 "전투맵 명령 화면 (기술 추천)" | 전투 다시보기 화면의 명령 줄(분대 탭 + 군단 단추, 전장 누르기로 칸·적, 다시 넣기 링), 3D 관람에 붙임. 실제 세계 전투 잇기는 질문 1969 |
| 1547 "군단이 존재하면 군단 … 파티도 없으면 유닛들 개별 참전" | 웨이브 수비 편성 입력, 세계 휴먼 = 개별. 고정 10명 → 설정 칸 60 |
| 1548 "아이템 버프 + 장비 옵션 + 지속형 스킬 + 신전 축복 모두" | 걸린 효과(앞 줄기) + 장비 옵션 moveSpeedPm + 지속형 스킬. 신전 축복은 기능이 없어 질문 1968 |
| 1차 단계에서 된 것(진형 전진·자리 지키기·목표 공격·퇴각·거두기, 1463 정원 밖) | 그대로 둠 |

## 한 일
- **판정**(SIM_VERSION 56): `combat/command.ts`(정원 표·`commanderOrder`·`combatTierIndex`), `battleState.ts electCommander`(승계 순서, 지휘관
  분대 먼저), `orders.ts`(집결·따라가기·대형·전개 방식, `succeedCommanders`, `standGoal`), `formation.ts`(새 — 대형 자리, 사거리 짧은 유닛 앞),
  `tactics.ts`(새 — `planTactic` 8가지), `battle.ts`(서서 싸우는 명령 하나로, `tacticAct`), `unitSpec.ts`(계급·환생으로 정원, 장비 이동 속도로
  걸음 간격), `equipment.ts`·`packCatalog.ts`(장비 `moveSpeedPm` 합), `waveBattle.ts`(수비 편성 `defenderPartyOf`, 개별 분대),
  `gardener/coefficients.ts`(`waveDefendersMax` 60·`waveDefendersMaxOf`), `simulator/run.ts`.
- **팩 core@114**: C7 칸 넷 지움(id-changes `removed` since 114) + 작위 여섯·등급 넷·환생 덤 더함, 위 끝 20 → 10, `d558_wave_defenders_max` 60,
  아이템 장비 칸 스키마 `combat.moveSpeedPm`(팩 값은 없음).
- **서버**: `world/commandRanks.ts`(새 — 사이보그 본체의 전투 계열(force) 랭킹 등급, 10분 메모리 표), `battleBodies.ts`(계급을 몸에),
  `roster/unitBody.ts`(`commandRank`·`commandRebirths`·`moveSpeedPm`, `walkBodyOf`), `walkSpeed.ts`(장비·지속형 스킬 이동 속도 합),
  `npc/gardener.ts`(수비 상한 설정 칸), `battleReport/setup.ts`(실제 도시 수비 = 개별·설정 칸 상한, 명령 칸 한 변), `orderInputs.ts`(새 명령),
  `schema.ts`·`battleLab/schema.ts`·`build.ts`(실험 유닛 `rank`), `battleLab/services.ts`(칸 한 변), `world.ts`·`app.ts`(전투 계열 경로 잇기).
- **공용**: `battleReport.ts`(명령 종류·대형·전개 방식 목록, `leader`·`shape`·`tactic`·`cell`, 검사, `legionPartiesEditMax` 10),
  `battleReportCity.ts`(주석), `battleLab.ts`(`rank`, `LAB_TITLE_MAX`·`LAB_TIER_MAX`).
- **화면**: `battle/BattleCommandBar.tsx`·`battleCommands.ts`·`battleCommandText.ts`(새 — 전투맵 명령 줄), `BattleReplayView.tsx`(`command`·
  `startAtMs`, 땅·유닛 누르기), `battleScene.ts`(`onGroundTap`·`onUnitTap`), `battleReplay.css`, 3D 관람(`ReplayOverlay.tsx`, `BattleLab.tsx` —
  명령을 내리면 팀 A 명령 줄에 더하고 같은 시드 판을 다시 기록해 그 시각부터, `watchOrders.ts` 새), 명령 칸(`OrdersEditor.tsx` — 새 종류·앞 분대·
  대형·전개 방식 고르기, 칸 보이기), `reportModel.ts`(분대 빼기 때 따라가기도), 유닛 계급 칸(`RankFields.tsx` 새), 메시지 ko·en.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/{command,formation,tactics,orders,battle,battleState,battleTypes,unitSpec,equipment,packCatalog,coefficients}.ts` | 판정 |
| `packages/sim/src/combat/{command,legionTactics}.test.ts` | 시험(legionTactics 새 15개) |
| `packages/sim/src/{tuningCommand,tuningGardener,index,version}.ts`, `gardener/coefficients.ts`, `simulator/{waveBattle,run}.ts` | 설정 칸·내보내기·SIM 56·웨이브 |
| `packages/content/src/schema/combat.ts`, `content/core/{tuning,id-changes,manifest}.json` | 팩 core@114 |
| `packages/shared/src/{battleReport,battleReportCity,battleLab}.ts` | 명령·계급 모양 |
| `apps/server/src/world/{commandRanks,battleBodies,walkSpeed,world}.ts`, `app.ts`, `roster/unitBody.ts` | 계급·이동 속도 |
| `apps/server/src/battleReport/{setup,orderInputs,schema}.ts`, `battleLab/{schema,build,services}.ts`, `npc/gardener.ts` | 보고서·실험실·웨이브 |
| `apps/server/src/battleReport/{legionCommands2,battleReportWorld}.test.ts` | 시험(새 5개, 세계 수비 시험 D-558로) |
| `apps/game/src/battle/*`(명령 줄·장면·보기), `editor/balance/lab/{BattleLab,ReplayOverlay,RankFields,UnitEditor,watchOrders}.tsx·ts`, `report/{OrdersEditor,reportModel,reportMessages}`, `report.css`, `messages/{ko,en}.json` | 화면 |
| `e2e/battleLab.spec.ts` | 3D 관람 명령(전개 방식·집결) → 명령 줄, 명령 줄 사진 |
| `docs/adr/…`(바뀜 절 셋), `docs/questions/2026-11-16-legion-commands-2.md` | 결정 기록·질문 |

## 함께 바꿔야 하는 파일
- 판정 명령 종류를 더하면: `@terra/shared` `REPORT_ORDER_KINDS`·검사, `orderInputs.ts orderOf`, 서버 zod `schema.ts`, 화면 `reportMessages.ts`·
  `battleCommandText.ts`·`BattleCommandBar.tsx ORDER_KINDS`, 3D 관람 `watchOrders.ts`.
- 대형·전개 방식 목록: sim `FORMATION_SHAPES`·`TACTICS` = shared `REPORT_FORMATIONS`·`REPORT_TACTICS`(서버 시험이 견준다).
- 작위·등급 단계 수: sim `COMMAND_TITLE_STEPS`·`COMMAND_TIER_STEPS` = shared `LAB_TITLE_MAX + 1`·`LAB_TIER_MAX + 1`, 설정 칸 `c7_command_title_*`·
  `tier_*`, 랭킹 등급 문턱 수(`ranking_tier_1~4`).
- 작위가 생기면(질문 1961) `world/commandRanks.ts rankOf`의 `title`을 채운다.

## 건드리지 말 것
- 명령 없는 전투는 상태 모양·결과가 옛 판정 그대로다(`orders.test.ts` 옛 지문 넷). 승계 즉시 다시 고르기는 군단 명령을 받은 편만 한다.
- 사양 칸 `commandRank`는 있을 때만 둔다(옛 시작 자료·스냅숏 그대로).
- 보고서 입력 상한 `legionPartiesMax` 20은 옛 기록을 읽으려는 값이다(새로 짜는 상한은 `legionPartiesEditMax` 10).

## 검사·측정
- (Verified) sim 시험 전체 113파일·941개 통과(바꾸기 뒤). 옛 판정 지문 넷 그대로.
- (Verified) 서버: `legionCommands2.test.ts` 5, `battleReportWorld.test.ts` 11, `battleReportOrders.test.ts`, `walkSpeed.test.ts`, `src/npc`·`src/battleLab` 통과.

## 마지막 검사 (Verified, 개발 컨테이너, 바탕 main abe00de)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 747개·시험 5,622개(DB 시험 포함), 포맷·린트·타입·경계·크기·다국어(7,964키)·대비·콘텐츠.
  첫 실행은 파일 크기 상한(`battleReport.ts` 1,056줄·sim `index.ts` 1,009줄)에서 실패 → 명령 모양을 `battleReportOrders.ts`로, D-558 내보내기를
  `combat/legionExports.ts`로 나눈 뒤 다시 돌려 통과.
- `pnpm check:content abe00de` 통과(core@114, 호환 단계 포함).
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 110,088 B / 상한 131,416 B.
- e2e `e2e/battleLab.spec.ts` + `e2e/battleReport.spec.ts` 33개 통과(3.5분). 새: 3D 관람 명령 줄 — 군단 전개 방식(집중 사격) → 다시 기록 → 다시 넣기 링 →
  1분대 집결(그 자리) → 팀 A 명령 줄에 두 줄(tactic·rally), 명령 줄 사진.
- 사진(눈으로 봄: 네온·라이트 × 390·1440): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/legion-shots/`
  `battle-lab-commands-{neon-ko-390,light-en-390,neon-en-1440,light-ko-1440}.png`, `battle-lab-watch-*.png`, 보고서 사진(`battle-report-*`).
  넓은 화면에서 전개 방식 고르기 칸이 줄 끝까지 늘어난다(동작에는 문제 없음).

## 미검증·TODO·알려진 문제
- 실제 세계 전투에 플레이어가 명령을 넣는 길(WS)은 없다 — 실시간 전투 화면이 없다(질문 1969). 프로토콜은 그대로(46).
- 작위가 서버에 없어 정원은 랭킹 등급·환생으로만 오른다(질문 1961). 신전 축복 없음(질문 1968).
- 웨이브 수비 상한 60(옛 10)으로 정원사 웨이브 결과·판정 비용이 달라진다 — C16a 목표 재맞춤 전(질문 1970). NAS는 웨이브 끔(`GARDENER_WAVES=0`).
- 전개 방식 수치는 코드 상수 [임시](질문 1963). 3D 관람 명령 줄의 목표 공격은 3D 장면에서 적을 눌러야 해 e2e로는 보지 않았다(전개 방식·집결만).
- 장비 옵션 이동 속도를 가진 팩 장비가 없어 실제 아이템으로는 보지 않았다. 걷기 몸 계산(`walkBodyOf`)은 기존 걷기 시험 경로에서 돌지만(값 0)
  0이 아닌 장비·지속형 스킬 값은 시험하지 않았다(Assumed).

## 리셋 필요 여부
- **필요 없음.** DB 표·마이그레이션 바뀜 없음(`db:generate` 할 일 없음). 팩 core@114(설정 칸 넷 지움 — id-changes 기록, 세계 덮어쓰기에 남은 옛 칸은
  모르는 칸으로 무시된다 Assumed), SIM_VERSION 56.
- 진행 중인 세계 전투는 저장된 시작 자료·입력으로 다시 계산하므로 이어진다. 명령 없는 전투는 결과가 같다. 다만 SIM 56부터 새로 여는 웨이브는 수비가
  최대 60명(옛 10명)이다. 옛 `battle_reports` 기록은 열리지만 다시 돌리면 정원(계급 없는 유닛 3)·실제 도시 수비(개별·60명)가 달라 결과가 다를 수 있다.

## 사용자 결정 대기
- 질문 1961~1974(`docs/questions/2026-11-16-legion-commands-2.md`).
