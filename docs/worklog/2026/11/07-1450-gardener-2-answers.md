# 정원사 2: 기획 답 383~394 반영(동맹도 드물게 웨이브, 평화 몫 3일마다, 전선 도시 전쟁 오염)

- 일시: 2026-11-07 14:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-gardener-r5b.md` "바뀜 (2026-11-07, 정원사 2)" → "기획 답 (383~394)", 질문 `docs/questions/2026-11-07-gardener-2.md`(기획 커밋 `d06d17c`), 앞 작업 기록 `07-1430-gardener-2.md`, 가지 `work/gardener-2`

## 한 일
- 기획 답을 받아 질문 383~394에 상태 줄을 달았다. 383·384·386·387·388은 지금 코드 그대로, 390~394는 각 줄기에서.
- 385 ③ 나: 동맹도 드물게 도시 웨이브를 받는다 — 동맹 배율 0 → 100‰ [임시](D-499 "세력에 맞는 콘텐츠"). ① 관계도는 세기에 넣지 않음(그대로), ② 동맹 필수 NPC 도시 보호는 보호 레이드가 이미 덮어 코드 그대로(ADR에 적음).
- 관계도 오르는 속도(수치): 평화 몫을 매일 +2에서 "3일마다 한 번 +1"로(새 설정 칸 `n52_peace_every_days` 3, `n52_peace_daily` 1). 0에서 동맹 70까지 210일.
- 389 나: 전쟁 오염은 전선 도시에만 — 전쟁 상대 세력의 도시 칸이 `p15_front_radius`(3칸 [임시]) 안에 있는 도시의 칸에 하루 +100. "전쟁 중 모든 도시"는 지웠다. 해석은 ADR.
- econ16 180일 시드 1을 한 번 쟀다(아래).
- 팩·판은 그대로 core@40·SIM 14(아직 main에 올라가지 않은 판). 설정 칸 24 → 26개.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/gardener/coefficients.ts` | 평화 몫 간격·전선 거리 칸, 동맹 배율 100·평화 몫 1 |
| `packages/sim/src/gardener/relations.ts`(+시험) | `isPeaceDay`, 평화 몫 날에만 + |
| `packages/sim/src/simulator/gardenerFactions.ts` | `updateRelations`에 날, `frontCitiesOf`(전선 도시) |
| `packages/sim/src/simulator/gardenerRun.ts` | 전쟁 오염 = 전선 도시만, 관계도에 날 넘김 |
| `packages/sim/src/simulator/gardenerRelations.test.ts` | 평화 몫 날·동맹 100‰·전선 도시 시험 |
| `packages/sim/src/tuningGardener.ts`·`index.ts`·`version.ts` | 새 칸 2개, 내보내기, SIM 14 설명 |
| `content/core/tuning.json` | `n52_peace_every_days`·`p15_front_radius` 추가, `n52_peace_daily` 1·`n52_chance_allied` 100, 이름 고침 |
| `apps/server/src/tuning/scope.ts` | 새 칸 live |
| `docs/adr/2026-11-01-gardener-r5b.md`·`docs/questions/2026-11-07-gardener-2.md`·`docs/PLAN.md` | 기획 답·해석·잰 값, 상태 줄, 14장 줄 |

## 함께 바꿔야 하는 파일
- 영토·전선 층이 생기면 `gardenerFactions.ts frontCitiesOf`의 맞닿음 판정만 바꾼다(지금은 도시 칸 사이 이웃 걸음 거리).
- 앞 작업 기록의 "함께 바꿔야 하는 파일"(유전자 2 줄기의 `waveRewards.ts`, 마이그레이션 두 끝)은 그대로.

## 건드리지 말 것
- 웨이브 운영 스위치(N53)·콘텐츠 켬·끔 없음 원칙은 그대로.

## 미검증·TODO·알려진 문제
- 웨이브 폐허 복원(D-510 둘째)은 여전히 다음 줄기.
- 전선 거리는 시뮬 합성 격자에서 이웃 ID 도시끼리만 맞닿는다(실제 지형 거리가 아님). 서버는 2차맵 키(F9 칸) 이웃 걸음이다.
- 고정 국가 넷이 전쟁·점령으로 적대(−100까지)가 되어 웨이브가 1.5배 — [임시] 값(걸음 3만·평화 몫·하루 상한) 몫이다.

## 검사·잰 값
- 작업 중: `@terra/sim` 시험 79파일·632개 통과, 서버 정원사 시험 4파일(정원사 DB·보상·스위치·설정 칸 상태)·22개 통과.
- econ16 180일 시드 1(`11f9897f`, 247초, 위반 0, D-391 세 조건 통과): 도시 웨이브 597(고정 국가 514)·웨이브 승 25(폐허 22·피해 3)·보호 레이드 11(모두 이김, 건너뜀 7), 도시 끝 42·도시 몫 최대 21.3%. 고정 국가 관계도: 30일 2~10, 90일 −47~30(우호 4), 180일 −100~60(우호 9, **동맹 0**).
- 끝 검사(`TEST_DATABASE_URL=… pnpm check && pnpm check:docs`, flock, 한 번): 통과 — 시험 433파일·3,565개(DB 시험 포함), check:docs 통과. main은 `fa2cbbd`에서 그대로(다시 합칠 것 없음).

## 사용자 결정 대기
- 없음(383~394 답 받음).
