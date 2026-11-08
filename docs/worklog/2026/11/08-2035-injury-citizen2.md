# 부상 이름·회복 시간 표시(D-525)와 귀화 지원금/입회비·우호도(D-526)

- 일시: 2026-11-08 20:35 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-injury.md` "바뀜 (D-525)"·`docs/adr/2026-11-08-citizenship.md` "바뀜 (D-526)"(둘 다 확정), 기획 D-525·D-526(미러 `2900a13`), 질문 `docs/questions/2026-11-08-injury-citizen2.md`(845~849), 가지 `work/injury-citizen2`(main `2355fdd`에서)

## 한 일
- D-525 부상: 단계 이름 정상·경상·중상·중태(영어 Normal·Light·Serious·Critical), 색 점은 그대로. 남은 자연 회복 시간을 "N시간 M분"(영어 "Nh Mm", 분 올림, 날로 묶지 않음)으로 — 부상 표(유닛 목록·상세·[부상·병원] 칸), 정상까지·병원 견적·치료 결과, 자연 치유 규칙 줄, 포로 목록, 생명 수치 부상 안내, 2차맵 내 유닛 목록 상태, 개발 운영 화면 부상 칸(번호 → 이름). 서버 `world.mapUnits`에 `injuryUntilMs`(선택 칸)를 더했다.
- D-526 귀화: 받는 나라 조건 = 부호 있는 값 하나(+ 입회비 / − 지원금, 나라 칸 `factions.naturalize_fee`, 없으면 설정 칸 `citizenship_fee` 기본값 — NPC 국가는 늘 기본값). 지원금은 받는 나라 국고에 있는 만큼. 옛 나라 반환을 없앴다. 사람 × 나라 우호도 표 `user_nation_standings`를 새로 두고 귀화하면 옛 나라 점수가 20(받는 나라가 옛 나라와 전쟁 중이면 60) 떨어진다. 귀화 칸에 조건·주고받는 값·옛 나라 우호도(지금 → 뒤, 호감 띠 이름)·이 나라 우호도·적대 세력 줄, 확인 줄에 낼/받을 값과 우호도 하락, 결과에 받은 지원금.
- 프로토콜 19(최소 18): `nationality_change.cost` 부호 있음, `nationality_result` 성공에 `granted`·`standingDrop`·`hostile`(선택), `returned`는 늘 "0".
- 팩 core@56: `citizenship_fee` 이름·범위(−10억~+10억, 값 100 그대로), 새 칸 `citizenship_standing_drop`(20)·`citizenship_standing_drop_hostile`(60).
- 마이그레이션 `20261108112036_naturalize_terms_standing`(더하기만): 새 표 `user_nation_standings`, `factions.naturalize_fee`, `nationality_changes.grant_paid`·`standing_drop`·`hostile`(기본값 있음).
- 두 ADR 상태를 "확정 (2026-11-08, 사용자 결정 — D-525/D-526 반영)"으로, PLAN 14장 한 줄, 질문 845~849.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/messages/{ko,en}.json` | D-525 단계 이름·시간·분 문구, D-526 귀화 칸 문구(옛 반환·합 문구는 지움) |
| `apps/game/src/roster/rosterText.ts`(+시험) | `formatHoursMinutes`·`recoveryLeft`(시간·분), 부상 이름 시험 |
| `apps/game/src/roster/InjuryBadge.tsx`·`VitalsMeters.tsx`, `apps/game/src/units/HospitalCare.tsx`·`UnitPanels.tsx`, `apps/game/src/ops/UnitDetail.tsx`·`UnitTable.tsx` | 남은 시간을 시간·분으로, 이름 |
| `apps/game/src/map/mapUnits.ts`(+시험)·`useMapUnits.ts`·`UnitControlPanels.tsx`·`SecondaryMapScreen.tsx` | 2차맵 내 유닛 목록 상태에 남은 시간 |
| `packages/shared/src/mapUnits.ts`, `apps/server/src/worldMap/mapUnits.ts` | `injuryUntilMs` |
| `packages/sim/src/society/coefficients.ts`·`tuningCyborg.ts`, `content/core/tuning.json`·`manifest.json` | 귀화 조건(부호)·우호도 하락 설정 칸, 팩 56 |
| `apps/server/src/db/schema.ts`·`citizenshipSchema.ts`, `apps/server/drizzle/20261108112036_naturalize_terms_standing/` | 우호도 표·나라 조건 칸·기록 칸 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표·칸 |
| `apps/server/src/cyborg/state.ts`·`service.ts`(+`gateway.test.ts`, `roster/*.test.ts`) | 부팅 읽기(우호도·나라 조건), `naturalizationRules(nation)`·`standingOf`, `changeNation`이 우호도·새 기록 칸을 씀, 반환 합 지움 |
| `apps/server/src/citizenship/service.ts`·`gateway.ts`(+DB 시험) | 입회비/지원금·반환 없음·적대 판정(전쟁 중)·우호도 하락·결과 칸 |
| `packages/protocol/src/citizenship.ts`·`version.ts`·`index.ts`(+시험) | 프로토콜 19 |
| `packages/shared/src/citizenship.ts` | 조회 칸 `grant`·`cost`·`standing`·`targetStanding` |
| `apps/game/src/government/NaturalizePanel.tsx`·`naturalizeData.ts`(+시험)·`naturalizeCommands.ts` | 귀화 칸 화면 |
| `e2e/injury.spec.ts`·`citizenship.spec.ts`·`combat-life.spec.ts` | 이름·시간·분, 귀화 칸 새 꼴 |
| `docs/adr/2026-11-08-injury.md`·`2026-11-08-citizenship.md`, `docs/PLAN.md`, `docs/questions/2026-11-08-injury-citizen2.md` | 기록 |

## 함께 바꿔야 하는 파일
- 프로토콜·팩 판: `merge/integration`(07e08fa — 설정 칸 페이지 core@56, 식품 포장 프로토콜 19)을 합치며 같은 판에 묶었다(`version.ts` 19 = 합친 판, 팩 56 그대로). 새 설정 칸에는 `desc`·`source`를 단다(페이지는 `tuningPages.ts` 규칙대로 "그 밖").
- 설정 칸을 더하면 `tuningCyborg.ts`와 `content/core/tuning.json`을 함께.
- 세력 쌍 호감·개인 신뢰도(D-255·D-315)가 서버에 생기면 `user_nation_standings`와 묶는 법(질문 848)을 정한다.

## 건드리지 말 것
- 올라간 마이그레이션 `20261108035507_nationality_changes`(이번 칸은 새 마이그레이션에 더했다). `nationality_changes.grant_returned` 칸은 옛 기록을 위해 남긴다.

## 미검증·TODO·알려진 문제
- 우호도는 쌓이고 보이기만 한다(효과 없음, 질문 847). 시간이 지나도 회복하지 않는다(질문 848).
- 나라 조건 칸을 정하는 화면·NPC 판단은 없다(NPC 국가는 늘 기본값, 질문 846). 시험은 DB로 칸을 넣는다.
- 적대 = NPC 사회 런타임 전쟁 상태만(불가침·호감 띠는 보지 않음, 질문 849).

## 검사
- 작업 중(Verified): 서버 DB 포함 `src/citizenship src/cyborg src/roster src/worldMap src/world/persist src/hospital` 15파일 81개, 프로토콜 21파일 115개, sim 설정 칸 33개, 게임(rosterText·mapUnits·government) 5파일 30개 통과.
- `merge/integration`(07e08fa)을 합친 뒤(Verified): `TEST_DATABASE_URL=… pnpm check` 통과(543파일 4,115개), `pnpm check:docs origin/main`·`pnpm check:content origin/main`(core@56) 통과.
- 화면 시험(Verified, 합친 뒤): `pnpm e2e e2e/citizenship.spec.ts e2e/injury.spec.ts e2e/combat-life.spec.ts e2e/unit-control.spec.ts` 23개 모두 통과(7.0분). 사진 390 파스텔 한국어·다크 한국어(지원금·적대 세력)·파스텔 영어(귀화 칸·확인 줄), 부상 칸 파스텔 한국어(중태 "중상까지 72시간 0분"·정상까지 144시간 0분·치료 뒤)·다크 영어(Serious · 48h 0m to Light)를 눈으로 봤다.

## 사용자 결정 대기
- 질문 845~849(`docs/questions/2026-11-08-injury-citizen2.md`).
