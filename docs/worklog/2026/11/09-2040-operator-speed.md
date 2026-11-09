# 운영자 모드 이동 빠르기 10배 → 100배

- 일시: 2026-11-09 20:40 (KST)
- 작업 도구: Claude Code
- 관련: `docs/adr/2026-11-08-seamless-second-map.md` "바뀜 (2026-11-09, 운영자 이동 빠르기 100배)", 커밋 7cf9ebe(처음 10배)

## 한 일
- 사용자 지적 "운영자모드 이동속도 10배 더 빠르게": 서버 `OPERATOR_SPEED_FACTOR`를 10에서 100으로 올렸다.
- 걷기 속도 437 × 100 = 43,700 < 프로토콜 상한 `MAX_UNIT_SPEED` 1,048,576(**Verified**: 코드). 빠른 유닛 속도도 상한 안에서 `secondMap.ts`가 자른다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/gateway.ts` | `OPERATOR_SPEED_FACTOR` 100 |
| `docs/adr/2026-11-08-seamless-second-map.md` | 바뀜 한 줄 |

## 함께 바꿔야 하는 파일
- 없음(배수는 이 상수 하나. `secondMap.test.ts`는 배수를 직접 넘겨 시험한다)

## 건드리지 말 것
- 플레이어 이동 속도(배수 1)

## 미검증·TODO·알려진 문제
- 100배면 한 초에 약 40칸을 간다. 시야 갱신(1초마다)·탐사 기록이 따라오는지는 휴대폰에서 보지 않았다(**Unknown**).

## 사용자 결정 대기
- 없음
