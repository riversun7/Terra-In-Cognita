# 운영자 배율로 걷던 움직임을 다시 켜도 그 속도로 끝내기

- 일시: 2026-11-15 23:00 (KST)
- 작업 도구: Claude Code
- 관련: `apps/server/src/world/operatorPace.ts`(기획 D-560 1246~1248), ADR `docs/adr/2026-11-14-segment-speed.md`(같은 방식으로 칸을 더한 앞 예), ADR `docs/adr/2026-10-28-db-access-and-migrations.md`(직전 앱이 그대로 도는 마이그레이션)

## 한 일

문제(Verified, 코드 읽음):
- 2차맵 이동은 `round(유닛 속도 × 운영자 배율)`로 움직임을 만든다(`secondMap.ts` `onRoute`).
- 저장(`unitRowOf`)은 기본 속도(`speed`)만 남기고 움직임 속도를 버렸다.
- 그래서 다시 켜면 `motionOfRow`가 기본 속도로 움직임을 다시 만들었다. 유닛이 출발 시각부터 느린 속도로 계산한 자리로 뒤로 튀고, 남은 길을 느리게 걸었으며, 도착 예약도 늦었다.
- 같은 일이 걷는 중에 기본 속도가 바뀐 유닛(D-540 실효 AGI, `refresh`)에도 있었다. 이번 고침으로 같이 풀린다.

고친 것:
- `world_units`에 nullable 칸 둘을 더했다(마이그레이션 `20261115135818_unit_motion_speed`, 추가만).
  - `motion_speed`: 지금 움직임의 속도. null이면 `speed`와 같다. 기본 속도와 같으면 null로 쓴다(대부분 행).
  - `motion_depart_at_ms`: 그 속도가 가리키는 움직임의 출발 시각(짝).
- 읽을 때(`persist/load.ts`)는 짝이 지금 `depart_at_ms`와 같을 때만 움직임 속도를 쓴다. 그다음 `motionOfRow`가 정수·1 ~ `MAX_SPEED` 범위를 본다. 틀리면 기본 속도로 읽는다(지금까지와 같은 동작).
- 기본 속도(`speed`)는 그대로 유닛 속도다. 운영자 빠르기 표시(`paces` 맵)와 연결의 배율은 지금처럼 메모리에만 둔다. 다시 켜면 걷던 한 움직임만 저장한 속도로 같은 자리·같은 도착 시각으로 끝나고, 다음 걸음부터 보통이다.
- 2차맵 사이 이동의 부팅 복구(`travel/service.ts`, `speedFactor: 1`)는 그대로 뒀다. 다시 켜면 운영자 연결이 끊겨 운영자 모드가 꺼진 것과 같고, D-560 "모드를 끄면 바로 풀림"에 맞다.
- 서 있는 줄을 새로 만드는 곳(`travel/parked.ts` `standingRow`, `relayout.ts`)은 `motionSpeed: null`로 비운다. 서 있는 움직임에는 속도가 위치에 영향이 없지만, 옛 값을 끌고 다니지 않게 했다.
- 2차맵 사이로 넘기는 줄(`TransferRow` = `UnitRow` + 승객)은 같은 칸을 그대로 들고 다닌다. 받는 2차맵은 서 있는 움직임으로 세우므로 영향이 없다.

### 왜 칸 둘인가(출발 시각 짝)
- 쓰기 대기열은 표 열 목록에 있는 칸만 고쳐 쓴다(`persist/writer.ts`, `ON CONFLICT … DO UPDATE SET` 목록 칸만).
- 그래서 새 칸을 모르는 직전 판 앱으로 되돌리면, 그 앱이 새 길(path·depart_at_ms)을 써도 `motion_speed`가 옛 값으로 남는다. 다시 새 앱을 켜면 그 남은 값으로 새 길을 걷게 된다(운영자 속도로 튐).
- 짝 칸이 있으면 출발 시각이 어긋나 남은 값을 버린다. 그래서 "값이 기본 속도보다 작으면 버림" 같은 범위 규칙을 쓰지 않았다. 그 규칙은 남은 값을 못 거르고, 걷는 중에 기본 속도가 오른 정상 행(D-540)은 잘못 버린다.
- 마이그레이션 없이 하는 길로 운영자 배율을 구간 걸음 배율(`pace`)에 녹이는 것을 따져 봤다. 버렸다: `round(속도 × 배율)`과 정확히 같은 값이 나오지 않고, 지형 배율이라는 칸의 뜻이 섞인다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/db/schema.ts` | `world_units.motion_speed`·`motion_depart_at_ms` 칸. 파일이 998줄(상한 1,000)이라 같은 표 `pace` 주석을 한 줄로 줄였다(뜻은 그대로, 줄 수 998 유지). 파일은 나누지 않았다(다른 줄기와 부딪침) |
| `apps/server/drizzle/20261115135818_unit_motion_speed/` | 마이그레이션(칸 추가 둘). `prevIds` = 갈래 두 끝 `boats_dock_fuel`(7eb4628a…)·`business_shares`(e5d6a5de…) 확인 |
| `apps/server/src/world/secondMapRows.ts` | `UnitRow.motionSpeed`. `unitRowOf`가 움직임 속도를 남기고(같으면 null), `motionOfRow`가 그 속도로 움직임을 만든다(범위 밖이면 기본 속도). `unitColumnsOf`가 칸 둘을 쓴다 |
| `apps/server/src/world/persist/load.ts` | 칸 둘을 읽고 출발 시각 짝이 맞을 때만 움직임 속도를 넘긴다 |
| `apps/server/src/world/persist/tables.ts` | `world_units` 쓰기 열 목록에 칸 둘 |
| `apps/server/src/travel/parked.ts`, `apps/server/src/world/relayout.ts` | 서 있는 줄을 새로 만들 때 움직임 속도를 비운다 |
| `apps/server/src/world/operatorPace.ts` | 머리 주석 "메모리에만 둔다(다시 켜면 보통)"를 실제 동작으로 고쳤다(표시·배율은 메모리, 걷던 한 움직임은 저장한 속도로 끝남) |
| `apps/server/src/world/secondMapRows.test.ts` | 움직임 속도 저장·되읽기, 같으면 null, 범위 밖·정수 아님 → 기본 속도 |
| `apps/server/src/world/persist.db.test.ts` | 운영자 배율 10으로 걷던 유닛과 보통 유닛을 저장 → kill -9 흉내 → 다시 켜기. 같은 시각 위치·도착 시각·꺾이는 점이 같은지, 보통 유닛은 null·같은 움직임인지. 직전 판 앱이 움직임만 고친 행(출발 시각만 바꿈)은 기본 속도로 읽는지 |

## 함께 바꿔야 하는 파일
- `world_units`에 칸을 더하거나 이 칸을 바꾸면 `schema.ts`·`persist/tables.ts`·`persist/load.ts` `UNIT_COLUMNS`·`secondMapRows.ts` `unitColumnsOf`를 같이 고친다.
- 줄을 새 길로 고쳐 쓰는 새 코드(`...row`로 path·departAtMs만 바꾸는 곳)는 `motionSpeed`도 비운다. 비우지 않아도 짝 칸이 쓸 때 새 출발 시각으로 맞춰지므로, 그 속도가 새 길에 붙는다.

## 건드리지 말 것
- 2차맵 사이 이동의 부팅 복구 `speedFactor: 1`(D-560, 위 "한 일").
- 운영자 빠르기 표시(`paces`)를 저장하지 않는 것(다시 켜면 운영자 연결이 끊긴 것과 같다).

## 리셋
- 필요 없다(Verified: 마이그레이션은 nullable 칸 추가만). 있던 행은 두 칸이 null이라 지금까지와 같이 기본 속도로 읽는다. 배포 순간에 운영자 배율로 걷던 유닛만 옛 동작(배포 직후 한 번 느려짐)을 한 번 더 겪는다.

## 되돌림 위험(직전 판 앱으로 되돌렸을 때)
- 직전 판 앱은 새 칸을 모르고 그대로 돈다(칸 추가만, 기본값 없음).
- 되돌린 동안 직전 앱이 고쳐 쓴 행: 움직임 속도는 버리고 기본 속도로 걷는다(지금 main과 같은 동작).
- 다시 새 앱을 켤 때: 직전 앱이 새 길을 쓴 행은 출발 시각 짝이 어긋나 남은 속도를 버린다(DB 시험으로 확인).
- 남는 위험(Assumed, 작음): 직전 앱이 움직임은 그대로 두고 다른 칸만 고쳐 쓴 행. 짝이 맞으므로 새 앱은 저장한 운영자 속도로 그 움직임을 다시 계산한다. 직전 앱이 그 움직임을 기본 속도로 걸리던 것과 자리가 다르다. 이것은 새 앱이 원래 뜻한 움직임이고, 그 한 움직임이 끝나면 사라진다.
- 같은 ms에 직전 앱이 같은 출발 시각으로 새 길을 썼다면 짝이 맞아 버리지 못한다. 출발 시각은 ms 단위 지금 시각이라 사실상 일어나지 않는다(Assumed).

## 미검증·TODO·알려진 문제
- 검사(Verified, 실행): `secondMapRows.test.ts`·`persist.db.test.ts`(TEST_DATABASE_URL 포함) 통과, `operatorPace.test.ts`·`src/travel` 시험 통과. 전체 `pnpm check`(TEST_DATABASE_URL 포함) 통과: 시험 파일 735개·시험 5,534개 모두 통과, `pnpm check:docs` 통과.
- 운영 NAS에서 실제로 다시 켜 본 것은 아니다(미실행).
- 기기 코드(`apps/game`)는 바꾸지 않았다. 기기는 서버가 보내는 움직임(`unit_paths`의 `speed` = 움직임 속도, `wire.ts`)을 그대로 그리므로, 다시 켠 뒤 스냅샷도 같은 속도가 간다(Assumed: 코드 읽음).

## 사용자 결정 대기
- 없음
