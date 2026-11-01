# R5b 정원사 합치기, 웨이브 끄는 설정(GARDENER_WAVES)

- 일시: 2026-11-01 20:20 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/r5b`(534c5d0), ADR `2026-11-01-gardener-r5b.md` "바뀜 (2026-11-01, 사용자 결정 \"합치되 웨이브 끔\")", D-468

## 한 일
- 사용자에게 정원사 결과를 보이고 물었다. 답 "합치되 웨이브 끔".
- `work/r5b`를 main에 합치면서 서버 설정 `GARDENER_WAVES`(기본 0 = 끔)를 더했다. 끄면 도시 웨이브 확률 상한만 0이고 오염 층은 그대로 돈다. NAS compose에 0을 적었다.
- 시험: `apps/server/src/npc/gardenerSwitch.test.ts`(기본 끔, 1이면 켬, 끄면 확률 0·오염 계수 그대로). 2개 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/config.ts` | `GARDENER_WAVES` 읽기(기본 0) |
| `apps/server/src/main.ts`, `apps/server/src/world/world.ts` | 설정을 NPC 런타임까지 넘김 |
| `apps/server/src/npc/runtime.ts` | `gardenerRulesOf`: 끄면 `chanceMaxPm` 0 |
| `apps/server/src/npc/gardenerSwitch.test.ts` | 스위치 시험 |
| `ops/compose.yml` | NAS에서 끔(0) |
| `AGENTS.md`, ADR gardener-r5b | 설정 설명, 바뀜 |

## 함께 바꿔야 하는 파일
- 웨이브를 켤 때: `ops/compose.yml` `GARDENER_WAVES: "1"` 후 배포.

## 건드리지 말 것
- 시뮬레이터·시험의 웨이브(옵션 없으면 켬): 맞춤 도구와 D-391 비교가 쓴다.

## 미검증·TODO·알려진 문제
- NAS에서 웨이브가 실제로 안 오는지는 배포 뒤 지표(`gardenerWaves` 0 유지)로 본다.
- 도시 몫 판정·폐허 복원(D-339)·D-469 뒤 다시 맞춤은 남았다.

## 사용자 결정 대기
- 웨이브를 켜는 시점(위 조건).
