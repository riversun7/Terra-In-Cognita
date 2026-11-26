# 유닛 성장: 휴먼·사이보그 유닛의 경험치·레벨, 저장된 스탯을 세계 몸에 연결

- 일시: 2026-11-26 17:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-26-unit-growth.md`(새로 씀), `2026-11-26-gather-exp.md`, 앞 작업 기록 `26-1600-gather-exp.md`

## 한 일

사용자 답("네, 유닛 성장도")으로 휴먼·사이보그 유닛이 경험치를 받고 레벨이 스탯에 들게 했다.

- 알게 된 것(Verified: 코드 읽기): 휴먼·사이보그 유닛은 저장된 스탯조차 쓰지 않고 모든 곳에서 기본 몸(1차 스탯 10, 레벨 1)으로 계산되고 있었다.
- **성장 거울**(`growth/store.ts`): 스탯이 저장된 휴먼·사이보그 유닛의 레벨·스탯·성장 K·경험치를 메모리에 들고, 월드 쓰기 대기열을 지켜보며 따라간다.
- **몸 연결**: 전투 몸·걷기·작업 스탯·생명 수치·유닛 화면이 거울의 몸 바탕(저장된 스탯 + 레벨 성장)을 쓴다. 성장 K가 없으면 기준 K 1000‰(임시).
- **경험치**: 표 `unit_exp`. 채집 경험치가 본체가 아니면 거울로 가고, 구간을 넘으면 레벨이 오른다.
- **화면**: 유닛 상세에 "경험치 지금/구간"(레벨은 원래 칸이 있어 값이 생기면 보인다).

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/growth/store.ts`·`store.test.ts`(새 파일) | 성장 거울(읽기·몸 바탕·경험치·대기열 따라가기) |
| `apps/server/src/world/persist/writer.ts`, `tables.ts` | 대기열 지켜보기(`observe`), 표 `unit_exp`·레벨 부분 쓰기 |
| `apps/server/src/db/travelSchema.ts`, `schema.ts`, `apps/server/drizzle/20261126133311_unit_exp/` | 표 `unit_exp` |
| `apps/server/src/roster/unitBody.ts`, `unitBody.test.ts` | 저장된 스탯 몸의 성장 K |
| `apps/server/src/world/battleBodies.ts`, `walkSpeed.ts`, `apps/server/src/vitals/world.ts`·`config.ts`, `apps/server/src/holdings/world.ts`·`config.ts` | 몸 바탕을 거울에서 |
| `apps/server/src/world/world.ts`, `apps/server/src/gather/world.ts` | 거울 만들기·붙이기, 경험치 받는 쪽 |
| `apps/server/src/roster/worldUnits.ts`, `services.ts`, `packages/shared/src/roster.ts` | 유닛 조회의 성장 몸·레벨·경험치 |
| `apps/game/src/units/UnitDetail.tsx`, `apps/game/messages/{ko,en}.json` | 유닛 상세의 경험치 |
| `apps/server/src/recruit/recruit.db.test.ts` | 고용한 휴먼의 몸 바탕·레벨 오르기·다시 켜기 |
| `docs/adr/2026-11-26-unit-growth.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- 유닛의 몸을 새로 읽는 곳은 `worldBodyBase(cyborgs, unitId, growth)`처럼 거울을 넘긴다(안 넘기면 그 자리만 기본 몸으로 센다).
- 휴먼·사이보그 유닛 표에 칸을 더하면 `growth/store.ts`의 읽기 질의와 대기열 줄 해석도 본다.

## 건드리지 말 것

- `growth/store.ts`의 대기열 지켜보기: "humans" 지움은 거울이 휴먼일 때만 지운다(융합은 휴먼 줄을 지우고 사이보그 유닛 줄을 쓴다).

## 미검증·TODO·알려진 문제

- 실제 화면에서 일꾼 휴먼의 레벨·경험치가 오르는 것은 보지 않았다(미실행).
- 플레이 값이 바뀐다: 스탯이 저장된 모든 휴먼(NPC 구인 휴먼 포함)·사이보그 유닛이 자기 스탯으로 싸우고 걷고 일한다.
- 기준 K 1000‰은 임시 값이다(기획에 구인 휴먼의 K가 없다).
- 레벨 오름 알림이 없다. 채집이 아닌 직무·전투는 경험치가 없다.
- 기획 세션에 전달이 필요하다(유닛 성장 K, 경험치 값).

## 검증

- Verified(깨끗한 작업 복사본, `5b290df5` + 이 변경): `pnpm check` 통과(시험 6,257개 통과·432개 건너뜀), `db:generate` 변경 없음.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 387파일 2,280개 통과(DB 시험 포함 — 고용한 휴먼의 몸 바탕 = 카드 스탯, 경험치로 레벨 3, 다시 켜도 남음 `recruit/recruit.db.test.ts`). 기본 몸에서 저장된 스탯으로 바뀌며 달라진 기존 시험은 없었다.
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/units.spec.ts --grep "AI 작전"` 2개 통과(고용한 휴먼의 유닛 상세가 열린다). 경험치 표시 줄은 사진으로 따로 보지 않았다.
