# 모든 사람 유닛에 저장된 스탯·레벨: 지도자·봇도 휴먼과 똑같이

- 일시: 2026-11-27 13:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-27-all-units-have-stats.md`(새로 씀), `2026-11-26-unit-growth.md`(일부 대체 표시), 앞 작업 기록 `27-1325-npc-work-exp.md`(커밋 `d652a637`)

## 한 일

사용자 결정(2026-11-27 "모든 것은 유닛이고 레벨 스탯이 있어야한다", 스탯 없는 유닛에 스탯을 줄지 묻자 "똑같은 유닛이라니까?")을 옮겼다.

- 자기 스탯 줄이 없던 사람 유닛(NPC 지도자, 아직 NPC 나라 휴먼이 아닌 봇·규모 시험 봇)이 **처음 읽힐 때 구인 카드 규칙으로 스탯·속성을 굴려 새 표 `unit_stats`에 저장**한다(처음부터 있던 휴먼과 같은 굴림, 행정 레벨 1).
- 그 뒤로는 휴먼과 똑같다: 저장된 스탯 + 레벨 성장으로 싸우고 걷고, 경험치를 받으면 레벨이 오른다.
- 봇이 NPC 나라 휴먼이 되어 휴먼 줄이 생기면 그 줄이 이기고 굴려 둔 줄은 지운다. 유닛이 지워지면 줄도 지운다.
- 운영자 콘솔 유닛 상세의 성장 자료에 "그 밖 유닛(굴려 저장한 스탯)"을 더했다. "기본 몸"은 이제 탈것·배·시험 유닛만이다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/db/travelSchema.ts`, `schema.ts`, `apps/server/drizzle/20261127044359_unit_stats/` | 표 `unit_stats`(더하기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 표 `unitStats` |
| `apps/server/src/world/unitKinds.ts` | 굴려 줄 유닛 종류 `rollsUnitStats`(봇·NPC 지도자, 탈것 제외) |
| `apps/server/src/growth/store.ts`, `store.test.ts` | 그 밖 유닛(kind "unit"): 처음 읽힐 때 굴려 저장, 표 읽기, 레벨 저장, 휴먼 줄이 생기면 지움 |
| `apps/server/src/world/world.ts` | 성장 거울에 "굴려 줄 유닛인가"를 잇는다 |
| `apps/server/src/ops/world.ts`, `packages/shared/src/ops.ts`, `apps/game/src/ops/UnitDetail.tsx`, `apps/game/messages/{ko,en}.json` | 운영 조회의 성장 자료 "unit" |
| `apps/server/src/npc/workExp.db.test.ts` | DB 시험: 지도자 스탯이 저장되고 다시 켜도 같다, 경험치로 레벨이 오른다 |
| `docs/adr/…` | 새 ADR, 성장 ADR에 일부 대체 표시 |

## 함께 바꿔야 하는 파일

- 사람인 유닛 종류를 더하면(크리쳐·안드로이드 등) `world/unitKinds.ts` `rollsUnitStats`에 넣을지 본다(자기 스탯 줄이 없으면 넣는다).
- 세계 밖 표가 아니다: `unit_stats`는 세계 새로 시작(`cli/resetWorld.ts`) 때 비워진다(남길 표 목록에 넣지 않는다).

## 건드리지 말 것

- `growth/store.ts` `ensure`의 "표를 다 읽기 전에는 굴리지 않는다"(`ready`): 빼면 읽을 휴먼 줄을 굴린 값으로 덮는다.
- 줄 없이 세운 휴먼(시험 도우미 `addTestUnits`)을 굴림 대상에 넣지 않는다: 서버 DB 시험 대부분이 그 유닛의 기본 몸(모두 10)에 기대어 값을 잰다.

## 미검증·TODO·알려진 문제

- **플레이 값이 바뀐다**: 지도자·봇이 기본 몸(모두 10) 대신 굴린 스탯을 쓴다(걷는 빠르기·전투).
- 지도자 스탯은 일반 휴먼과 같은 규칙이다(더 센 값을 주지 않았다 — 기획에 값이 없다).
- 봇마다 `unit_stats` 한 줄을 처음 읽힐 때 쓴다. 규모 계단 시험(`s3-ramp`, 봇 10만)에서 쓰기 부하가 얼마나 느는지는 재지 않았다(미실행).
- 실제로 돌고 있는 세계(NAS·개발 서버)에서는 보지 않았다(미실행). 배포 뒤 운영자 콘솔에서 지도자 유닛을 열어 확인할 수 있다.
- 지도자·규모 시험 봇은 일하지 않아 경험치를 받을 일이 아직 없다(전투 경험치가 없다).
- 기획서에 없는 규칙이다. 기획 세션에 전달이 필요하다.

## 검증

- Verified(깨끗한 작업 복사본, `d652a637` + 이 변경): `pnpm check` 통과(시험 6,269개 통과·435개 건너뜀), `db:generate` 변경 없음.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 388파일 2,286개 통과(DB 시험 포함 — `npc/workExp.db.test.ts`가 지도자 스탯 저장·다시 켜기·레벨 오름을, `growth/store.test.ts`가 굴림·저장·휴먼 줄이 이김을 본다). 봇이 굴린 스탯을 쓰게 되면서 값이 달라진 다른 시험은 없었다.
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/ops.spec.ts` 15개 통과.

## 사용자 결정 대기

- 지도자에게 일반 휴먼보다 센 스탯을 줄지.
- 전투 경험치.
