# 공성 결과 셋(약탈·점령·귀속·점령 상태)·약탈 폐허 뺌·휴먼 환생 어드밴티지, 기획 답 620·621

- 일시: 2026-11-08 00:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-war-outcomes.md`(새), `2026-11-07-ruins-restoration.md` "바뀜 (D-520 — 486 가로 되돌림)", 질문 `docs/questions/2026-11-07-war-outcomes.md`(680~689), 기획 D-520(미러 `2413b54`), 가지 `work/war-outcomes`(main `d7c13f8` + `work/play-econ4` 합침)

## 한 일
- 기획 D-520 공성 결과 셋을 시뮬·서버 같은 함수로 넣었다: 약탈(금고 몫 + 공공 창고 몫, 소유 그대로, 폐허 없음)·점령·귀속(옛 통합 + 재건 비용 소각 + 만족도 회복 불이익)·점령 상태(소유 그대로, 기간마다 그 도시 몫 세금, 기간·주인 바뀜·사라짐에 끝). NPC는 성향 가중 굴림으로 고른다.
- 약탈한 세력은 7일(설정 칸 `d520_raid_cooldown_days` [임시]) 동안 그 도시를 다시 치지 않는다(685 나 — 추천을 지금 코드로). 쉬는 날 없이 넣은 판은 NPC 치기가 판단마다 되풀이됐다(ADR 잰 값 ①).
- 486을 가로 되돌렸다: `raze`·`razeAggression`·설정 칸 `d510_raze_aggression`을 지우고 팩 `id-changes.json`에 기록(core@51). 545는 없어졌다.
- 휴먼 환생 어드밴티지: 확률로 초기 스탯 하나 +2 또는 K 하나 +50‰(설정 칸 넷 [임시]), 서버 신전 환생이 굴리고 K는 새 칸 `world_humans.k_pm`.
- 서버: 표 `war_outcomes`(결과 기록·남은 상태, 다시 켜면 복원), 세력 화면 점령 칸 실제 자료(우리 도시가 당한 줄·결과 값), 복귀 요약 "습격·방어" 칸.
- 조정자 추가 범위(기획 답 620 나·621 나): 세력 행 `factions.born_of`(태어날 때 부모 — 화폐·나라 성격·도시 이름 고리가 다시 켜도 같음), `economy.cityNames`는 그 유저가 아는 도시만(1차맵 도시 안개와 같은 규칙). 두 답이 `work/play-econ4` 코드 위라 그 가지를 합쳤다.
- 화면: 세력 화면 점령 카드(① 공성 결과, 결과 값 한 줄, 넘긴 처리는 글 없음), 신전 규칙 줄(어드밴티지 확률·양). 문구 ko·en 새 8·바꿈 3.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/warOutcomes.ts`(새) | 결과 셋 계수(war.*)·수 규칙 |
| `packages/sim/src/simulator/societyWar.ts`(새)·`societyWar.test.ts`(새) | 약탈·점령 상태·점령·귀속 실행, 하루 끝 세금·끝, 불변 조건 W1~W3 |
| `packages/sim/src/simulator/society.ts` | occupy가 결과 셋을 부름, raze 지움, 회복 불이익을 하루 만족도에, 새 세력 bornOf |
| `packages/sim/src/simulator/world.ts` | `SimOccupation`·`world.occupations`, `SimFaction.bornOf` |
| `packages/sim/src/npc/policy.ts`·`coefficients.ts`·`simulator/npcRun.ts` | 성향 가중 고르기(셋째 굴림), 옛 약탈·폐허 문턱 지움, 칠 수 있는 도시(`targetable` — 점령 상태로 둔 도시·약탈 뒤 쉬는 날)를 판단 상대 보기와 치기가 같이 씀 |
| `packages/sim/src/society/temple.ts`·`tuningTemple.ts` | 환생 어드밴티지 규칙·설정 칸 넷 |
| `packages/sim/src/tuningWar.ts`(새)·`tuning.ts`·`tuningRestoration.ts`·`society/coefficients.ts` | war 설정 칸 아홉, raze 칸 뺌 |
| `packages/sim/src/simulator/societyTypes.ts`·`run.ts`·`version.ts`·`warEntry.ts`(새)·`index.ts` | 요약 칸·`onWarOutcome` 고리, 출력 형식 13, SIM 20, 진입점(index.ts 줄 수 그대로) |
| `content/core/tuning.json`·`id-changes.json`·`manifest.json` | 설정 칸 14 더함·1 뺌(기록), core@51 |
| `apps/server/src/db/warSchema.ts`(새)·`schema.ts`·`populationSchema.ts`·`drizzle/20261107151720_war_outcomes/` | 새 표·`born_of`·`k_pm`, 마이그레이션(더하기만). schema.ts는 주석을 줄여 줄 수를 늘리지 않음 |
| `apps/server/src/npc/warOutcomes.ts`(새)·`warOutcomes.db.test.ts`(새)·`runtime.ts` | 결과 저장·남은 상태 복원, 런타임 연결 |
| `apps/server/src/npc/persist.ts`·`state.ts`·`currency.ts`·`nations.ts` | 620 나: born_of 저장·읽기, 화폐·이름 고리 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 몫 `warOutcomes`·`warOutcomeState`·`warOutcomeEnds`·`humanGrowth`, `factionState.born_of` |
| `apps/server/src/temple/service.ts`·`rows.ts`·`overview.ts`·`temple.db.test.ts`·`tuning/scope.ts` | 환생 어드밴티지(스탯 → 휴먼 행, K → humanGrowth), 조회 규칙 값 |
| `apps/server/src/factionScreen/occupations.ts`(새)·`source.ts`·`overview.ts`·`preview.ts`·`factionScreen.db.test.ts` | 세력 화면 점령 칸 실제 자료·시안 줄 |
| `apps/server/src/world/summarySources.ts` | 복귀 요약 습격·방어 칸 |
| `apps/server/src/economyView/*`·`trpc/context.ts`·`trpc/economy.ts`·`worldMap/reads.ts`·`app.ts` | 621 나: 아는 도시만 이름 |
| `packages/shared/src/faction.ts`·`temple.ts` | 점령 줄 `as_target`·`occupy`·`outcome`, 신전 규칙 값(선택 칸) |
| `apps/game/src/faction/FactionShares.tsx`·`economy/TemplePanel.tsx`·`messages/{ko,en}.json` | 화면·문구 |
| `e2e/faction.spec.ts`·`e2e/temple.spec.ts` | 시안 점령 줄 넷(처리 20칸)·결과 줄·환생 규칙 줄 |
| `docs/questions/2026-11-07-war-outcomes.md`(새)·`ruins.md`·`temple.md`·`play-nations.md`·`docs/PLAN.md`·ADR 둘 | 기록 |

## 함께 바꿔야 하는 파일
- 결과 이름(`loot`·`integrate`·`occupy`)을 바꾸면 `war_outcomes.outcome` 검사(마이그레이션)·`@terra/shared/faction` `lootChoice`·`factionScreen/occupations.ts`를 함께.
- 휴먼 행을 쓰는 곳을 더하면 `k_pm`은 `humanGrowth`로만 쓴다(`humans` 행 열 목록에 넣지 않는다).
- 휴먼 레벨업이 생기면 `roster/unitBody.ts` 바탕 "stats"에 `k_pm`을 읽어 `kPm`으로 넘긴다.

## 건드리지 말 것
- 복귀 요약 칸 ID `raid`(D-6014 칸, 한 번 쓴 ID). 올라간 마이그레이션(`20261107151720_war_outcomes`)은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 검사(끝에 한 번, 2026-11-08 02:00 KST 무렵): `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 477·시험 3,782 모두 통과, DB 시험 포함), `pnpm check:docs origin/main` 통과, `pnpm check:content origin/main` 통과(core@51, 호환 단계 4b까지). 화면 시험: `pnpm e2e e2e/faction.spec.ts e2e/temple.spec.ts` 33 통과(첫 판), 문구 고친 뒤 `e2e/faction.spec.ts` 28 통과. 사진(390·1440 × 파스텔·다크 × 한국어·영어, 세력 지분 탭 점령 줄·신전 칸)은 개발 기계 scratchpad에만 있다(저장소에 넣지 않음). 빌드·check-pwa·check:bundle은 돌리지 않았다(조정자 지시 — 화면 시험의 전역 준비가 빌드를 한다).
- 잰 값(econ16·war16 시드 1 180일): ADR "잰 값". **D-391 기술 조건이 두 시나리오 모두 실패**(기준 통과) — 약탈·점령 상태가 도시를 옮기지 않은 채 만족도를 깎아 반란·새 세력이 늘어난 것으로 본다(Assumed). 수치는 밸런싱 단계(D-515)에서 맞춘다. war16 걸린 시간 43 → 69초.
- 거래소 도시 목록은 아직 모든 도시(621 나 괄호 몫, 거래소 시야와 함께 다음 줄기). 서버 편입 제안 저장 전이라 세력 화면 점령·귀속의 ④가 넘김으로 보인다. 실시간 공성은 다음 줄기.
- 이 판 전에 태어난 세력은 `born_of`가 비어 있어 모른다.

## 사용자 결정 대기
- 확인 대기 680~689(`docs/questions/2026-11-07-war-outcomes.md`).
