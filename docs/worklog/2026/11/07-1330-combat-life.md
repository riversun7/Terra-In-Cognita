# 생명 수치 회복(HP·아머 전투 중에도, 쓰러진 유닛 자동 회복·부상 느림·불이익, 병원 치료 고리)과 전투 중 물건 쓰기(자동 물약·탄약)

- 일시: 2026-11-07 13:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-514(질문 343~345 사용자 답, 346·352 기획 정리, 원본 b8f9ab8)·D-515(수치는 [임시], 빈 모양은 기본안 + 확인 대기)·D-509·D-510·D-497·D-190·D-145·D-099·49 N49·N54, 287(전투 중 사용), ADR `docs/adr/2026-10-31-combat-core.md` "바뀜 (2026-11-07, D-514·287 …)"·`docs/adr/2026-11-03-item-holdings.md` "바뀜 (2026-11-07, D-514·287 …)", 질문 `docs/questions/2026-11-07-vitals.md`(343~346 답함), 가지 `work/combat-life`

- 합칠 때(2026-11-07, 조정자): 정원사 웨이브 결과 맞추기(D-468, 목표 333‰)를 HP 회복 뒤 표로 다시 보면 C17 물리형 나눗수 200 = 500‰, 250 = 375‰라 가장 가까운 250을 팩 설정 칸 `c17_physical_divisor`에 [임시]로 넣었다(100 → 250, 같은 core@38). 정확한 값은 밸런싱 단계(D-515). 웨이브는 운영 스위치(N53)로 꺼져 있다.

## 한 일
- **옛 규칙 대조(D-507, 옛 저장소 AntiGravt01 읽기만)**: HP 재생 식은 옛 문서 `docs/GDD/Character/Consolidated_Character.md:1270`(초당 1 + VIT × 0.08 + WIS × 0.04, 옛 엔진 0). 부상은 같은 문서 9.3 "경상 능력치 10~20% 감소·중상 30~50%·중태 활동 불가, 치료 = 야전치료 소모품·NPC 병원·유닛 의사", 9.2 기아 "기본 전술 능력치(6스탯) −10%"(= 능력치는 1차 스탯 6개). 병원 치료는 부상을 지우고 HP를 최대로(작업 기록 `07-0945-vitals.md`의 대조 `terra-server/game/LifeEngine.js:362~366`).
- **343 HP 회복(전투 중에도)**: 2차 스탯 18번째 행 `hp_regen`(팩·`TEST_STAT_TABLE`, 분당, 기본 60·VIT 4800‰·WIS 2400‰ = 옛 식 × 60 [임시]). 판정 사양 `hpRegen`, 틱마다 `regenOnTick`로 쉴드처럼(산 유닛만). 전투 밖은 생명 수치가 분 단위로 같은 값.
- **344 아머 회복**: 설정 칸 `n54_armor_regen`(분당 최대 아머 × 100‰ [임시], 전투 계수표 `armorRegenPm`, `armorRegenOf`) — 사양 `armorRegen`, 전투 중에도 쉴드처럼, 전투 밖 분 단위. D-514가 2차 스탯을 18개로 정해 행이 아니라 칸으로 뒀다(확인 대기).
- **345 쓰러진 유닛 자동 회복**: 생명 수치에 회복 구간(`@terra/shared/vitals` `phases`, `apps/server/src/vitals/phases.ts`) — 부상 나을 때까지 HP 회복 × 단계 ‰(N54 `n54_injury_regen_1~3` 500·250·100 [임시]). 부상 불이익: 몸의 1차 스탯 6개에서 (성장값 + 버프) × ‰(N54 `n54_injury_penalty_1~3` 150·400·500 [임시])를 효과 출처 `injury`로 뺀다(`UnitGear.injuryPm` → `BodySpec.injuryPm`). 병원 치료: 시설이 없어 규칙 고리(`vitals.service.treat` + 보유 물건 월드 `access.treat` = 부상 지움 + HP 가득)와 개발 시험 명령 `dev_treat_unit`(dev·admin, 프로토콜 9) + 화면 버튼(보유 물건 개발 판).
- **346 전투 밖 주기 회복**: 보유 물건 `use`가 주기 회복 줄을 받아 분당 양(⌈합 ÷ 분 수⌉)의 걸린 효과로 두고, 생명 수치가 회복 구간으로 더한다(`HoldingVitals.touch`로 그 전 분에 소급하지 않음).
- **352 퇴각**: `battleWearAmount("retreated")` = 0(전투 기본 닳음도 없음).
- **287 전투 중 물건**: 판정 `consumables.ts` — 자동 물약(HP < 문턱 + 쿨 끝 → `pickPotion`, 스태미나·행동 시각 없음, 주기 줄은 걸린 heal 효과), 탄약(기본 공격마다 1, 0이면 기본 공격 안 함), 결과 `shots`·`potions`·`potionReadyMs`. 서버 `world/battleItems.ts`(NPC 런타임 `startBattle` 차례 몸 → 생명 수치 → 물약·탄 → 전투 서비스)와 보유 물건 `battleKit`·`applyBattleUse`(결과와 같은 커밋으로 수량·물약 쿨·탄약 내구도).
- **화면**: 생명 수치 판(사이보그 머리 판·유닛 상세)에 모자란 칸마다 "HP는 1분마다 N씩"·"아머는 …"·"쉴드는 …"(지금 구간의 회복), 부상 중이면 "부상(중상): 나을 때까지 HP 회복이 느리고 능력치가 낮습니다". 기기 셈이 회복 구간을 따른다. 개발 판 아래 [병원 치료(개발 시험)].
- **origin/main 합침**: `064fd98`(시험 기반·D-515 미러) 위. 충돌 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/battleTypes.ts`·`battle.ts`·`battleState.ts`·`consumables.ts`(새)·`outcome.ts`·`unitSpec.ts`·`coefficients.ts`·`stats.ts`, `combatLife.test.ts`(새)·`stats.test.ts` | HP·아머 회복, 자동 물약·탄약, 결과 칸, 시험 11개 |
| `packages/sim/src/items/holding.ts`·`holding.test.ts` | 퇴각 닳음 0(352) |
| `packages/sim/src/tuningVitals.ts`(새)·`tuning.ts`·`society/coefficients.ts`·`version.ts`·`index.ts` | N54 칸 일곱, 계수표 `vitals`, SIM_VERSION 13 |
| `content/core/stat_rows.json`·`tuning.json`·`manifest.json` | `hp_regen` 행, N54 칸, core@38 |
| `packages/shared/src/vitals.ts`·`vitals.test.ts` | 회복 구간(`phases`)·`vitalsRegenNow`·조회 `injury` |
| `packages/protocol/src/items.ts`·`version.ts`·`index.ts`, 시험 3개 | `dev_treat_unit`, 프로토콜 9(최소 8) |
| `apps/server/src/vitals/phases.ts`(새)·`service.ts`·`config.ts`·`world.ts`, `regen.test.ts`(새) | 분 단위 HP·아머 회복, 부상 느림·주기 회복 구간, 병원 치료·touch, 시험 6개 |
| `apps/server/src/roster/body.ts`·`unitBody.ts`, `unitBody.test.ts`·`roster.test.ts` | 부상 불이익(1차 ‰, 출처 injury), 시험 |
| `apps/server/src/holdings/battleKit.ts`(새)·`service.ts`·`serviceTypes.ts`·`rules.ts`·`world.ts`·`gateway.ts`·`testContent.ts`, `battleKit.test.ts`(새)·`gateway.test.ts`·`service.test.ts` | 전투 물약·탄 사양, 전투 끝 빼기, 전투 밖 주기 회복, 불이익 ‰ 싣기, 병원 치료 명령, 시험 활·연고 |
| `apps/server/src/world/battleItems.ts`(새)·`world.ts`, `battleItems.db.test.ts`(새) | 세계 전투 잇기, DB 시험 2개 |
| `apps/server/src/session.ts`·`app.ts`·`tuning/scope.ts`, `tuning/formulaState.test.ts`·`balance/balance.db.test.ts`·`formulas/formulas.db.test.ts` | 메시지 배달, 설정 칸 반영 범위(live 7칸), 행 수 17 |
| `apps/game/src/roster/VitalsMeters.tsx`·`useVitals.ts`, `cyborg/CyborgScreen.tsx`, `units/UnitDetail.tsx`·`UnitList.tsx`, `holdings/DevGrant.tsx`·`useHoldings.ts`·`itemCommands.ts`·`holdings.css`, `messages/{ko,en}.json` | 회복·부상 안내, 병원 치료 버튼, 문구 6개(+1 고침) ko·en |
| `e2e/combat-life.spec.ts`(새) | 화면 시험 10개 |
| `docs/adr/2026-10-31-combat-core.md`·`2026-11-03-item-holdings.md`, `docs/questions/2026-11-07-vitals.md`, `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·상태·기록 |

## 검사·시험 (Verified, 개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 시뮬 비교(시드 1, 앞 = main `a1fa83f` core@37·SIM 12, 뒤 = 이 가지 core@38·SIM 13): war16 30일 236 → 236줄, 해시 be74f1f5 → 662d0666, 조우 129 → 129, 공격 쪽 승 66 → 64, 쓰러짐 463 → 455, 틱 24,559 → 25,725(평균 19.0 → 19.9초), 시간 초과 0 → 0. econ16 60일 817 → 814줄, 해시 38524eb6 → 99c76208, 웨이브 예고 112 → 112, 웨이브 공성 21 → 20, 웨이브 승 14 → 16. 위반 0.
- 정원사 맞추기(`gardener:cal --seeds 1,2,3,4,5,6 --grid base:5/divisor:100,150,200,250`, 설정 칸 그대로): 목표 구간 승률 앞 → 뒤 — 나눗수 100: 792‰ → 875‰, 150: 625‰ → 667‰, 200: 333‰ → 500‰, 250: 125‰ → 375‰(합마다는 ADR 표). HP 회복으로 웨이브 크리쳐가 더 버틴다 → 다시 맞추기는 조정자.
- `TEST_DATABASE_URL=… pnpm check` 통과(합친 뒤, 아래 마지막 검사). 새 시험: sim `combatLife.test.ts` 11개·`stats.test.ts` 1개, shared `vitals.test.ts` 3개, 서버 `vitals/regen.test.ts` 6개·`holdings/battleKit.test.ts` 6개·`gateway.test.ts` 1개·`unitBody.test.ts` 1개, DB `world/battleItems.db.test.ts` 2개(물약 자동·탄 3발·끝에 수량·쿨·내구도 한 번만, 병원 치료).
- 화면 시험 `pnpm e2e combat-life.spec.ts vitals.spec.ts inventory.spec.ts equip-stats.spec.ts` 50개 통과(3.0분): combat-life 10(다친 본체 — HP 33·아머 2·쉴드 안내, 부상(중상) 안내, "저절로 차지 않음" 없음, 다음 분 경계에 HP 0 → 33(기기 구간 셈, vitals.list 한 번); admin [병원 치료] → 알림·생명 수치 다시 받음; 사진 8), vitals 19, inventory 11, equip-stats 10.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/life-shots/` — `life-cyborg-{pastel,dark}-{ko,en}-{390,1440}.png`(다친 본체 머리 판), `life-dev-…png`(개발 판 병원 치료 줄) 16장. 눈으로 확인: 390 파스텔 한국어 머리 판, 390 다크 영어 머리 판, 1440 다크 영어 개발 판.

## [임시] 값
- `hp_regen` 기본 60·VIT 4800‰·WIS 2400‰(옛 문서 초당 식 × 60), `n54_armor_regen` 100‰/분, `n54_injury_regen_1~3` 500·250·100‰, `n54_injury_penalty_1~3` 150·400·500‰, 전투 밖 주기 회복 분당 양 = ⌈합 ÷ 분 수⌉.

## 함께 바꿔야 하는 파일
- 판정 사양 칸(`potions`·`ammo`·`hpRegen`·`armorRegen`)을 바꾸면 `apps/server/src/holdings/battleKit.ts`·`world/battleItems.ts`·`vitals/service.ts` `bodyOfSpec`.
- 세계가 여는 전투가 늘면(습격·조우) 시작 자료를 몸 → 생명 수치 → 물약·탄 차례로, 끝을 `items.apply`로 거친다(지금은 NPC 런타임 `startBattle` 하나).
- 부상 단계 규칙(`world/unitCondition.ts`)이 바뀌면 `vitals/world.ts` `modifiersOf`·`holdings/world.ts` `injuryPmOf`.

## 건드리지 말 것
- 회복 구간은 저장하지 않는다(읽을 때 세계에서 다시 만든다). `unit_effects`의 heal 효과는 전투 밖 주기 회복뿐이다(값 = 분당 양).

## 미검증·TODO·알려진 문제
- 확인 대기 6개(ADR 전투 "바뀜 (2026-11-07, D-514·287)" 5절, D-515로 기본안 진행): 아머 회복 = 설정 칸, 불이익 범위(1차 6개·장비 제외·NPC 휴먼 시뮬 사양엔 없음, 회복 느림은 HP만), 전투 안 쓰러진 유닛은 안 일어남, 탄 0이면 기본 공격 안 함·스킬은 탄 안 씀·전투 중 예비 교체 없음, 자동 물약은 회복 줄만·기절 중 안 마심, 병원 = 부상 지움 + HP 가득(시설·비용·시간은 시설 줄기).
- 정원사 웨이브 승률이 올랐다(위). 설정 칸은 바꾸지 않았다.
- 밸런스 화면 대결·전투 실험실은 물약·탄 칸을 아직 고르지 않는다. 실제 휴대폰·NAS에서 재지 않았다.

## 사용자 결정 대기
- 없음(확인 대기는 기획 확인).
