# 유닛 생활 규칙: 쉬러 가는 피로·다시 일하는 피로(성향 기본값 + 유닛 화면 설정)

- 일시: 2026-11-26 14:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-26-unit-life-rules.md`(새로 씀), `2026-11-26-fatigue-stat-penalty.md`, 앞 작업 기록 `26-1330-fatigue-stat-penalty.md`

## 한 일

사용자 지적("120 다 채우고 휴식으로 가는게 아니다 … 자율적인 판단", 물음 답 "유닛 성향, 주인유저가 규칙 설정 가능. 유닛페이지에서 … 설정가능하게")을 옮겼다.

- **정산 문턱**: 일하다 피로가 [쉬러 가는 피로]에 닿으면 쉬고, [다시 일하는 피로]까지 풀리면 다시 일한다(`JobRules.restAt`·`resumeAt`). 문턱이 없으면 옛 셈과 같다.
- **성향 기본값**: 주인이 정하지 않은 유닛은 첫 불이익 구간 시작(90) ± 규율 성향(±20). 다 풀고(0) 돌아온다.
- **주인 설정**: 유닛 화면 [생활 규칙] 판(슬라이더 둘) → 프로토콜 75 `unit_life` → 표 `unit_life_rules`.
- **직접 채집**: 이끄는 유닛이 쉬러 가는 피로에 닿으면 줄을 끝낸다.
- 포만감(음식 섭취) 규칙은 만들지 않았다 — 플레이어 유닛에 포만감 값이 서버에 없다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/sim/src/settle/settle.ts`, `settle.test.ts` | 정산 규칙의 문턱 둘 |
| `packages/shared/src/unitLife.ts`·`unitLife.test.ts`(새 파일), `package.json`, `roster.ts` | 규칙 모양·성향 기본값, 유닛 조회 칸 `life` |
| `packages/protocol/src/travel.ts`, `index.ts`, `version.ts`, `travel.test.ts` | 메시지 `unit_life`, 프로토콜 75(최소 74) |
| `apps/server/src/db/travelSchema.ts`, `schema.ts`, `apps/server/drizzle/20261126041054_unit_life_rules/`, `apps/server/src/world/persist/tables.ts` | 표 `unit_life_rules` |
| `apps/server/src/life/store.ts`·`store.test.ts`(새 파일) | 저장소(읽기·성향 기본값·저장) |
| `apps/server/src/world/settlement.ts`, `world.ts`, `secondMap.ts`, `secondMapTypes.ts` | 정산 고리 `lifeRules`, 저장소 붙이기, `unitInfo`에 성향 |
| `apps/server/src/session.ts`, `travel/gateway.ts`, `gateway.test.ts`, `app.ts` | `unit_life` 받기 |
| `apps/server/src/roster/worldUnits.ts`, `services.ts` | 유닛 조회에 지금 규칙 |
| `apps/server/src/gather/boatCrew.ts`, `service.ts`, `serviceTypes.ts`, `world.ts` | 직접 채집이 쉬러 가는 피로에서 끝남 |
| `apps/game/src/units/LifeRulesPanel.tsx`(새 파일), `UnitDetail.tsx`, `apps/game/src/map/travelCommands.ts`, `apps/game/messages/{ko,en}.json` | 유닛 화면 [생활 규칙] 판 |
| `apps/server/src/labor/produce.db.test.ts`, `apps/server/src/world/settlement.db.test.ts`, `apps/server/src/gather/station.db.test.ts` | 새 규칙 시험, 옛 기대(120에서 쉼)를 기본 생활 규칙(90에서 쉼)으로 고침 |
| `e2e/units.spec.ts` | 유닛 화면 [생활 규칙] 판(바꿔 저장 → 다시 열면 그 값) |

## 함께 바꿔야 하는 파일

- `Settlement`·`UnitLifeStore`·`SecondMap`을 흉내 내는 시험은 `lifeRules`·`of`도 넣는다.
- 포만감 규칙을 더할 때: `@terra/shared/unitLife`(모양), `unit_life_rules`(칸), `unit_life` 메시지(칸), `LifeRulesPanel.tsx`.

## 건드리지 말 것

- `life/store.ts` `set`의 저장 전 정산: 빼면 지난 시간이 새 규칙으로 정산된다.
- `settle.ts` `advanceJob`의 문턱 밖 가지(일 단계인데 쉬러 가는 피로 이상 → 바로 쉼): 직접 채집으로 찬 피로와 규칙을 낮춘 뒤를 이어 준다.

## 미검증·TODO·알려진 문제

- "판단"은 문턱 값까지다(숙소·임금을 견줘 스스로 옮기지 않는다).
- 저장한 규칙을 성향 기본값으로 되돌리는 방법이 없다.
- 좌표 유닛(띄우지 않은 2차맵)은 정할 수 없다.
- 작업 중 부상 굴림은 문턱을 모른다.
- 기획(D-430)과 다르다. 기획 세션에 전달이 필요하다.

## 검증

- Verified(깨끗한 작업 복사본, `3c29b1e3` + 이 변경): `pnpm check` 통과(시험 6,251개 통과·431개 건너뜀), `db:generate` 변경 없음.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 386파일 2,274개 통과(DB 시험 포함 — 생활 규칙 기본값·주인 설정·다시 켜기 `labor/produce.db.test.ts`).
  - 기본 생활 규칙(90에서 쉼) 때문에 달라진 기대값을 고쳤다: 정산 산출(`settlement.db.test.ts` — 기대값을 같은 규칙의 해결 함수로), 풀린 뒤 피로(`produce.db.test.ts` 120 → 75), 채집소 시험의 정산 길이(90분 → 80분).
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/units.spec.ts --grep "AI 작전"` 2개 통과(파스텔·한국어, 다크·영어 — [생활 규칙] 판에서 값을 바꿔 저장하고 다시 열어 확인). 판 사진 둘을 눈으로 봤다.
- `e2e/units.spec.ts`의 다른 시험은 돌리지 않았다(앞 작업 기록에 적은 낡은 시험 그대로).
