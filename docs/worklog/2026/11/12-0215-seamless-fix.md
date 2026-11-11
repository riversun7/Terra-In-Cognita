# 이웃 안개 화면 시험을 도시 간격 세계에 맞춤(seamless-fix)

- 일시: 2026-11-12 02:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-08-seamless-second-map.md`(WP-3 "띄우지 않은 이웃(unknown_map)은 온통 어둡게"), ADR `2026-11-07-world-layout.md` "바뀜 (2026-11-11, 도시 배후지 간격)", ADR `2026-11-07-play-flow.md` "WP15"(그때 띄우기)

## 한 일
- 통합 묶음 검사에서 `e2e/seamless.spec.ts` 4개(넘기·옆 땅 누르기·이웃 안개 사진 둘)가 `볼 수 있는 이웃 2차맵이 없습니다`로 실패한 까닭을 찾았다.
  - **Verified(실행)**: dev 시작 도시 2차맵 `413963980374025`의 변 이웃 넷이 모두 `unknown_map`으로 거절된다 — `not_visible`이 아니라 서버가 띄우지 않은 2차맵이다. player 시작 2차맵 이웃도 거절된다(사진 시험이 `not_visible`·`unknown_map` 가운데 하나임을 본다, 어느 코드인지는 기록하지 않았다).
  - **Verified(코드)**: 부팅은 시험 2차맵 줄과 도시 2차맵만 띄우고, 다른 2차맵은 이동이 목적지에 들어설 때만 띄운다(`world/mapSpawn.ts`). 도시 간격(배후지 반경 R = 2 → 같은 국가 도시 사이 4칸 이상) 전에는 시작 도시 옆 2차맵이 같은 나라 도시 2차맵이라 띄워져 있었고 같은 나라 시야 공유(D-250)로 vision이 왔다.
  - 판정 (a) 맞는 게임 동작: ADR seamless-second-map이 "띄우지 않은 이웃(`unknown_map`)·볼 수 없는 이웃(`not_visible`)은 온통 어둡게"로 정했고, 경계 너머 내 유닛 시야는 기기가 그림으로만 칠한다(`neighbourSight.ts`, 서버 시야 판정은 2차맵마다 그대로). 걸어서 넘으면 이동 서비스가 그 2차맵을 띄우고 기기는 넘기 신호(`crossedNeighbour`)로 넘는다(걸어서 넘기 시험 통과). 앱 코드는 바꾸지 않았다.
- 시험을 뜻대로 고쳤다(`e2e/seamless.spec.ts`).
  - `openAtEdge(page, rig, want)`: 바라는 답(`vision` 또는 `refused`)이 오는 변을 찾는다. 없으면 변마다 `지금→이웃:답(코드)`을 오류에 적는다. 거절 코드를 `rig.refusedCodes`에 적는다.
  - 넘기·옆 땅 누르기: dev(운영자 모드 끔 — 이웃을 보통 구독으로 받는다)로 바꾸고, 먼저 `spawnEastNeighbour`가 운영자 빠르기로 사이보그를 동쪽 이웃에 보냈다가 제자리로 돌려 그 2차맵을 띄워 둔다(그때 띄우기, 비면 10분 뒤 내림). 이웃이 그 동쪽 2차맵인지, `data-operator="off"`인지 본다.
  - 넘은 뒤 다시 구독하지 않는다는 검사를 "넘기 전에 그 2차맵을 구독했고, 넘은 뒤로 새 구독이 없다"로 좁혔다(넘기 전 거절 뒤 다시 보낸 구독은 넘기와 상관없다). 구독 기록을 `[subscribe]` 줄로 남긴다.
  - 옆 땅 누르기: 휠 3 → 5번, 누르는 고리 150·110 → 180·150·110px(dev 시작 2차맵에서는 옆 땅이 화면 구석에만 들었다).
  - 이웃 안개 사진(player): 거절된 이웃(`not_visible`·`unknown_map`, vision 없음)을 찾아 온통 어두운 이웃을 찍는다 — 거절 = 온통 어둡게를 이 시험이 본다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/seamless.spec.ts` | 도시 간격 뒤 시작 도시 옆 2차맵은 띄우지 않은 2차맵이라 볼 수 있는 이웃을 dev + 그때 띄우기로 만들고, 거절 경우는 player로 따로 본다 |

## 함께 바꿔야 하는 파일
- 없음.

## 건드리지 말 것
- 서버 시야·구독 규칙(`world/vision.ts` `canView`, `world/gateway.ts` subscribe)은 ADR대로다. 시험을 맞추려고 바꾸지 않는다.

## 검사 결과
- Verified: `pnpm e2e e2e/seamless.spec.ts --grep "다시 만들지 않고 넘는다|travel_start"` 2 통과. 고치기 전 실행: 사진 둘·걸어서 넘기 통과, 넘기·옆 땅 누르기 실패(위 `unknown_map`).
- Verified: `pnpm e2e e2e/seamless.spec.ts e2e/play-map.spec.ts e2e/unit-control.spec.ts` 49 통과(26.5분). 넘기 시험 `[subscribe]` = 넘기 전 [지금, 동쪽], 넘은 뒤 없음, 거절 없음.
- 사진(player, 거절된 이웃 = 위쪽 온통 어둡게, 눈으로 확인): `seamless-neighbour-fog-390-pastel.png`·`-dark.png`(작업 폴더 밖 임시 폴더).
- biome format·oxlint(`--deny-warnings`)·`tsc -p e2e/tsconfig.json` 통과.

## 미검증·TODO·알려진 문제
- Unknown: 고치기 전 둘째 실행에서 넘기 시험이 동쪽 구독 2번으로 한 번 실패했다(그 뒤 실행에서는 1번, 넘은 뒤 0번). 넘기 전 다시 보낸 구독인지 넘은 뒤 구독인지 기록이 없다. 새 검사는 넘은 뒤 구독만 막고 `[subscribe]` 줄을 남긴다.
- 질문거리(기획·사용자): 플레이어가 시작 도시 변에 서도 옆 2차맵은 띄우지 않은 2차맵이라 미리 구독할 수 없다 → 걸어서 넘을 때 그 2차맵은 넘는 순간 받는다(로딩 없는 넘기는 이웃이 띄워진 곳에서만 온전하다). 내 유닛이 변 가까이 오면 옆 2차맵을 미리 띄울지는 따로 정할 일이다(서버 부하·그때 띄우기 상한 32).

## 사용자 결정 대기
- 없음.
