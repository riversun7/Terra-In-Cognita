# 정원사 2: 정원 세력 관계도·세력 오염·목표 순위·보호 레이드·웨이브 보상

- 일시: 2026-11-07 14:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-gardener-r5b.md` "바뀜 (2026-11-07, 정원사 2)", 기획 49 N52·D-499·D-500·D-509·D-510·D-511·D-515, 질문 `docs/questions/2026-11-07-gardener-2.md`(383~394), 가지 `work/gardener-2`(main `0faf14c`에서 시작, `fa2cbbd` 합침)

## 한 일
- 기획 미러에서 D-499·D-500·D-509·D-510과 49 N52 원문을 읽고, R5b 코드와의 차이 목록을 ADR "바뀜" 절에 적었다.
- 시뮬·서버 공용 정원사(`@terra/sim attachGardener`)에 넣음:
  - 정원 세력 관계도(세력마다 −100~+100, 시작 0, 단계 동맹 70·우호 30·중립 −20·경계 −50 = 옛 `NpcDiplomacyAI.js`). 하루 끝에 세력 오염 걸음마다 −1(하루 상한), 전쟁이 없는 날 +, 정화 한 번 +. 필수 NPC 세력(고정 국가)만 양수.
  - 세력 오염 = 그 세력 도시들의 영향권 칸 합. 관계도 단계 배율이 도시 웨이브 확률에 곱해지고(동맹 = 웨이브 없음), 굴림에 걸린 웨이브는 세력 오염이 높은 세력부터 모함 몫을 받는다(목표 순위). 세기 로그 안에 세력 오염 항.
  - 전쟁 중인 세력의 도시 칸 하루 오염.
  - 보호 레이드: NPC 판단이 필수 NPC 세력의 도시를 치려 하면 공격자의 가장 오래된 도시로 더 센 레이드(보상·쉬는 시간 없음).
  - 막아 낸 도시 웨이브 보상: 명성(세력마다 쌓임)·유전자 조각(팩 `gene.drops`에 새 얻는 길 `wave`)·크리쳐 재료(중분류 `creature_material`) 양.
- 서버: 관계도·명성을 `npc_society.gardener`에 저장, `gardener_waves`에 `kind`·`reward` 열(마이그레이션), 웨이브 끔 스위치는 레이드도 끔, 보상 아이템을 그 세력 장부에 시스템 발행.
- 설정 칸 24개 [임시](팩 core@40), `SIM_VERSION` 14, 시뮬 출력 형식 10. 프로토콜은 그대로(새 메시지 없음).
- main `fa2cbbd`(건물 런타임·사이보그 판 버프·미러 D-516)를 합쳤다(충돌은 팩 판 하나: 40으로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/gardener/relations.ts`(새)·`relations.test.ts`(새) | 관계도 단계·상한·하루 바뀜·확률 배율(49 N52, D-510), 보상 시험 함께 |
| `packages/sim/src/gardener/rewards.ts`(새) | 막아 낸 웨이브 보상 양(D-499), 보호 레이드는 없음(D-500) |
| `packages/sim/src/gardener/coefficients.ts` | 관계도·세력 오염 세기·전쟁 오염·레이드·보상 계수 [임시] |
| `packages/sim/src/gardener/pollution.ts` | `unionInfluenceSum`(세력 오염) |
| `packages/sim/src/gardener/waves.ts` | 세기의 세력 오염 항, `raidStrength` |
| `packages/sim/src/simulator/gardenerRun.ts` | 하루 끝 차례(전쟁 오염 → 세력 오염 → 관계도 → 굴림·목표 순위), `protect`·`purify`·보상·요약 |
| `packages/sim/src/simulator/gardenerTypes.ts`(새) | 정원사 실행 모양을 나눔(파일 크기) |
| `packages/sim/src/simulator/gardenerFactions.ts`(새) | 세력 오염·관계도 장부·단계별 수 |
| `packages/sim/src/simulator/gardenerRelations.test.ts`(새) | 보호 레이드·관계도·목표 순위·전쟁 오염·보상 시험 |
| `packages/sim/src/simulator/npcRun.ts` | `NpcContext.onAttack`(치기 → 보호 레이드) |
| `packages/sim/src/simulator/run.ts` | `onAttack` 연결, 출력 형식 10 |
| `packages/sim/src/tuningGardener.ts` | 설정 칸 24개 |
| `packages/sim/src/version.ts` | `SIM_VERSION` 14 |
| `packages/sim/src/society/fusion.ts`·`index.ts` | `waveGeneDrops`, 내보내기 |
| `packages/content/src/schema/items.ts`·`packages/shared/src/itemEditor.ts` | 유전자 얻는 길 `wave` |
| `content/core/tuning.json`·`items.json`·`manifest.json` | 설정 칸 24개, 크리쳐 스탯 조각 얻는 길에 wave, core@40 |
| `apps/server/src/npc/gardener.ts` | 관계도·명성 저장·복원, 웨이브 종류, 보상 기록 |
| `apps/server/src/npc/waveRewards.ts`(새)·`waveRewards.test.ts`(새) | 보상 아이템 고르기·장부 발행·기록, 저장 모양·스위치 시험 |
| `apps/server/src/npc/runtime.ts` | 보호 레이드 연결, 끔 스위치 = 레이드 세기 0, 보상 아이템 |
| `apps/server/src/npc/state.ts`·`persist.ts`·`world/persist/tables.ts` | `gardener_waves.kind`·`reward` 읽기·쓰기 |
| `apps/server/src/db/gardenerSchema.ts`·`drizzle/20261107051643_gardener_two/` | `kind`(city·protection)·`reward` 열(추가만) |
| `apps/server/src/world/world.ts` | 웨이브 보상 아이템을 보유 물건 콘텐츠에서 넘김 |
| `apps/server/src/tuning/scope.ts` | 새 칸 서버 반영 범위 live |
| `apps/server/src/npc/gardener.db.test.ts` | 관계도 저장·웨이브 종류·보상 기록, 보호 레이드 저장·복원 |
| `docs/adr/2026-11-01-gardener-r5b.md` | "바뀜 (2026-11-07, 정원사 2)": 차이 목록·결정·확인 대기·잰 값 |
| `docs/questions/2026-11-07-gardener-2.md`(새) | 질문 383~394(모양만) |
| `docs/PLAN.md` | 14장 줄 |

## 함께 바꿔야 하는 파일
- 유전자 2 줄기(D-516 스탯 유전자 = 인스턴스)가 사망 조각 길(`apps/server/src/fusion/genes.ts dropGenesOnDeath`)을 바꾸면 `apps/server/src/npc/waveRewards.ts grantWaveReward`의 유전자 몫도 같은 길로.
- 설정 칸 계수를 더하면 `gardener/coefficients.ts`(TEST 값) = `content/core/tuning.json`(팩 값) = `tuningGardener.ts`(경로) = `apps/server/src/tuning/scope.ts`(live)를 함께.
- 다음 마이그레이션은 `prevIds`에 두 끝(`20261107034038_facilities_runtime`·`20261107051643_gardener_two`)을 모두 적는다(같은 부모 `cyborg_units`에서 갈래, 합친 뒤 `db:generate` = No schema changes 확인).

## 건드리지 말 것
- 웨이브 운영 스위치(N53 `n53_gardener_waves`·`GARDENER_WAVES`, NAS 끔)는 그대로. 콘텐츠 켬·끔 스위치를 새로 두지 않았다.
- 도시마다 굴림 하나(굴림 수 고정)는 그대로다 — 목표 순위는 걸린 웨이브의 처리 차례만 바꾼다.

## 미검증·TODO·알려진 문제
- **웨이브 폐허 복원(D-510 둘째)은 하지 않았다**: 폐허를 남기는 층·정부 짓기(건물 런타임)·복원 모금(지분)이 함께 필요해 따로 줄기(ADR "남은 것").
- 서버에서 NPC 판단이 실제로 보호 레이드를 일으키는 길은 DB 시험에 없다(시험 국가는 시작 도시만 있어 칠 도시가 없음). `protect`를 직접 불러 저장·복원을 봤다.
- 세력 화면 외교 탭의 정원사 줄 글("늘 적대 · 외교 없음")은 바꾸지 않았다(외교 칸은 시안 자료). 화면은 바꾸지 않았다(e2e 해당 없음).
- 웨이브 맞춤(C16a `gardener:cal`)은 다시 돌리지 않았다(새 항은 맞추기 도구 입력에 없음 = 결과 그대로).
- 잰 값·검사 결과는 아래.

## 검사·잰 값
- (아래 "결과"에 채움)

## 사용자 결정 대기
- 질문 383~394(관계도 상한·쓰임·협력, 세기, 목표 순위, 보호 레이드 범위·목표, 전쟁 오염, 보상 받는 쪽·장비·포획·재료·유전자 내용, 명성).
