# 공성 결과 다듬기(D-527): 약탈 = 정부가 무너져 재건 전까지 꺼내 감·재건되면 다시 전쟁, 점령 상태 = 정해진 끝 없이 저절로 회복·몰아냄

- 일시: 2026-11-08 21:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-war-outcomes.md` "바뀜 (D-527)"(상태 확정), 기획 D-527(미러 `1f57a02`, 45 §10.4), 질문 `docs/questions/2026-11-08-war-outcomes-2.md`(850~858), 가지 `work/war-outcomes-2`(main `8306207` + 묶음 `merge/integration`)

## 한 일
- 사용자 결정 D-527(원문 "1.약탈 : 해당 정부가 재건될때까지 창고 등의 자원을 약탈세력은 자유롭게 꺼내갈 수 있음. 해당 세력재건시 다시 전쟁. 2.귀속 : 재건시도. 3.점령 : 기존 세력이 체제는 유지하나 세금 등의 재정을 가져감.")을 시뮬·서버 같은 함수로 넣었다.
- 약탈: 한 번 가져가고 7일 쉬던 것을 지우고, 정부가 무너진 남은 상태 `looted`(소유 그대로)를 둔다. 하루 끝마다 약탈 세력이 금고 몫(10%)·공공 창고 몫(25%)을 꺼내 가고, 7일 뒤 첫 하루 끝에 옛 세력이 재건 비용(주거 × 200, 모자라면 있는 만큼)을 내고 재건 → 끝·다시 전쟁. 약탈 중인 도시는 그 약탈 세력이 다시 치지 않는다.
- 점령 상태: 정해진 끝을 없애고 하루마다 세금, 저절로 회복(7일)·옛 세력 힘 회복(유닛 수 ≥ 점령자 × 1.2)·주인 바뀜·한쪽이 사라짐으로 끝.
- 끝난 까닭 7가지를 시뮬이 알리고(`onWarStateEnd`) 서버가 `war_outcomes.end_reason`에 적는다. 세력 화면 점령 칸이 "가져간 값 · 지금 상태 또는 끝난 까닭"을 보인다.
- 시뮬 econ16·war16 180일을 기준(묶음 가지)과 견줘 ADR에 적었다. 처음 넣은 "재건 비용이 모자라면 다음 날 다시"는 war16에서 재건 0이라 "있는 만큼"으로 바꿨다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/warOutcomes.ts` | 계수(정부 재건 날·비용, 자율 회복, 몰아내는 비 더함·쉬는 날 뺌), 끝난 까닭 목록, 순수 함수 |
| `packages/sim/src/simulator/societyWar.ts` | 약탈 = 상태만, 하루 끝 꺼내 가기·재건·점령 끝 까닭, `resumeWar`·`onEnd` |
| `packages/sim/src/simulator/society.ts`·`societyTypes.ts` | 약탈 실행 바꿈, 재건 → 다시 전쟁(선포·교전), `onWarStateEnd` 옵션, 요약 칸 |
| `packages/sim/src/simulator/world.ts`·`npcRun.ts` | `SimOccupation.kind`에 `looted`, `SimFaction.raided` 지움, 칠 수 있는 도시 규칙 |
| `packages/sim/src/simulator/warEntry.ts` | 끝난 까닭·재건 비용 내보내기 |
| `packages/sim/src/npc/policy.ts` | 주석(결과 뜻) |
| `packages/sim/src/society/coefficients.ts`·`tuning.ts`·`tuningWar.ts` | `d186_loot_take` 뜻·값(하루 10%), 새 칸 3, 뺀 칸 1 |
| `packages/sim/src/version.ts`·`simulator/run.ts` | SIM 22, 출력 형식 14 |
| `packages/sim/src/simulator/societyWar.test.ts` | 약탈 꺼내 가기·재건·다시 전쟁, 점령 저절로 회복·몰아냄·주인 바뀜, 까닭 목록 = 공유 타입 |
| `content/core/tuning.json`·`id-changes.json` | 칸 더함 3·뺌 1(`d520_raid_cooldown_days`, removed since 57, 팩 core@57)·뜻 바꿈 4, 풀이·출처 |
| `apps/server/src/db/warSchema.ts`·`drizzle/20261108115417_war_outcomes_d527/` | `end_reason` 칸 더함(더하기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 칸에 `end_reason` |
| `apps/server/src/npc/warOutcomes.ts`·`runtime.ts` | 끝나지 않은 줄(약탈 포함)을 거울로, 쉬는 날 다시 만들기 지움, 까닭 쓰기 |
| `apps/server/src/npc/warOutcomes.db.test.ts` | 약탈 남은 상태·꺼내 가기·다시 켜기·재건(까닭·다시 전쟁) |
| `apps/server/src/factionScreen/occupations.ts`·`preview.ts` | `endReason` 읽기, 시안 자료(진행 중 약탈·3일 된 점령·재건된 약탈) |
| `packages/shared/src/faction.ts` | `OCCUPATION_END_REASONS`, `outcome.endReason`(선택) |
| `apps/game/src/faction/FactionShares.tsx`·`messages/{ko,en}.json` | 결과 한 줄 = 가져간 값 · 상태·까닭, 새 키 15·뺀 키 5 |
| `e2e/faction.spec.ts` | 단계 25개, 약탈 상태·점령 상태·재건 까닭 문구 |
| `docs/adr/2026-11-07-war-outcomes.md`·`docs/PLAN.md`·`docs/questions/2026-11-08-war-outcomes-2.md` | 바뀜 (D-527)·확정, 14장 한 줄, 질문 850~858 |

## 함께 바꿔야 하는 파일
- 끝난 까닭을 더하면: `packages/sim/src/society/warOutcomes.ts` `WAR_STATE_END_REASONS`, `packages/shared/src/faction.ts` `OCCUPATION_END_REASONS`(시험이 같은지 본다), `apps/server/src/db/warSchema.ts` 검사(새 마이그레이션), `FactionShares.tsx` 문구 표·메시지.

## 건드리지 말 것
- 끝난 까닭 이름·결과 이름(표에 저장된 값). 올라간 마이그레이션.

## 검사
- 작업 중: `@terra/sim` 전체 vitest 91 파일 722 통과(바꾸기 전 단계, 그 뒤 `societyWar.test.ts` 11 통과), 서버 `src/npc src/factionScreen src/tuning src/db` DB 포함 21 파일 105 통과(Verified).
- 끝 검사(합친 뒤): 아래에 적는다.

## 미검증·TODO·알려진 문제
- 다른 세력은 약탈·점령 중인 도시를 계속 칠 수 있어 상태 대부분이 7일 안에 덮인다(재건·저절로 회복이 드묾 — ADR 잰 값). 밸런싱 단계에서 본다(853).
- 유저 세력의 [꺼내 가기]·[재건] 명령 없음(유저 세력 층). 재건은 실제 행정 건물이 아니다(851).
- 정부가 무너진 동안 그 도시 세금·구인은 평소대로(852 확인 대기).

## 사용자 결정 대기
- 질문 850~858(확인 대기, 답이 없으면 지금 코드).
