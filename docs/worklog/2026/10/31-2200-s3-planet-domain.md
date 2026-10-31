# S3 뒤: 월드 표에 행성 ID·영역(D-372)

- 일시: 2026-10-31 22:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-s3-server-stage.md` "구현하며 정한 것 (행성 ID·영역)", ADR `2026-10-29-cell-key-layout.md`(행성 ID는 키 밖, 복합 키), ADR 22(직전 판 호환 마이그레이션), 기획 D-372(미러 `6731f8f`). 가지 `work/s3-planet-domain`(main `a903d60`에서)

## 한 일
- `world_units`·`world_buildings`에 `planet_id`·`domain`, `world_exploration`에 `planet_id`를 더했다(열 더하기만, 기본값 시험 행성 `s2_test_planet`·`land`).
- 서버 메모리 모델(2차맵의 `planetId`, 유닛·건물의 `domain`)과 저장·부팅 복구에 두 값을 넣었다. 부팅 복구는 (행성, 2차맵 키)가 맞는 행만 놓고 다른 행성의 행은 남긴다. 탐사 기록도 행성으로 거른다.
- 프로토콜·화면은 바꾸지 않았다.

## 검사·측정
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과(아래 "결과").
- 새 시험(`persist.db.test.ts`): 저장된 유닛·건물의 행성·영역 값, 다른 행성의 같은 2차맵 키 유닛은 놓지 않고 DB에 남음. `world.db.test.ts`: 탐사 기록 행의 행성 ID.

## 결과
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 211개·시험 2,046개(새 시험 1개 + 고친 시험 2개). `pnpm check:docs` 통과. 마이그레이션은 열 더하기 5개 + 검사 조건 5개뿐이다(생성된 SQL 확인).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261031063506_world_planet_domain/` | 열·검사 조건, 기본 행성·영역 상수 |
| `apps/server/src/world/persist/{tables,load}.ts` | 쓰는 열, 읽기 |
| `apps/server/src/world/{secondMap,world}.ts` | 2차맵 행성, 유닛·건물 영역, (행성, 키)로 복구, 탐사 기록 행성 |
| `apps/server/src/world/{persist,world}.db.test.ts` | 시험 |
| `docs/adr/2026-10-31-s3-server-stage.md` | 짧은 메모 |

## 함께 바꿔야 하는 파일
- 행성이 둘 이상 되기 전: `world_exploration` 기본 키를 (user_id, planet_id, map_key)로 바꾸는 마이그레이션 + `world/persist/tables.ts`의 탐사 기록 `key`(직전 판 호환 때문에 이번에는 하지 않았다).
- 팩에 지구가 생기면 `apps/server/src/world/world.ts` `TEST_PLANET_ID`와 `schema.ts` `DEFAULT_WORLD_PLANET_ID`(기본값을 바꾸면 새 마이그레이션).

## 건드리지 말 것
- 이미 올라간 마이그레이션은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 영역은 모두 land다. 하늘·바다·우주 유닛의 이동 층(ADR 35 하늘·바다 전투맵 등)은 그 기능 때.

## 사용자 결정 대기
- 없음.
