# 운영자 모드에서 옆 2차맵으로 보낼 때도 빠르게

- 일시: 2026-11-09 21:50 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 지적 2026-11-09 "운영자모드에서 속도가 인접 2차맵을 목적지로 선택시 원래 속도로 느려지는문제", `docs/worklog/2026/11/08-2230-seamless-second-map.md` "바뀜 2"(운영자 이동 10배), `docs/adr/2026-11-07-play-flow.md` "WP9"

## 한 일
- 원인(코드로 확인, Verified): 운영자 빠르기(`OPERATOR_SPEED_FACTOR`, 합칠 때 main에서 100배 — `09-2040-operator-speed.md`)는 2차맵 이동 명령(`move_unit`)에만 붙어 있었다. 옆 2차맵 땅을 누르면 2차맵 사이 이동(`travel_start`)이 가는데, 이동 서비스가 구간마다 `moveUnit`을 배수 없이 불러 1배로 걸었다.
- 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중이고 운영자 권한(`canCommandAnyUnit`)이면, 보내는 길에 배수를 단다.
  - 그 길의 모든 구간(넘은 뒤 다음 2차맵 포함)에 같은 배수를 쓴다.
  - 건너뛰는 시간, 도착 예상, 정찰이 돌아오는 길도 같은 배수를 쓴다.
- 배수는 길(`Journey.speedFactor`)에 메모리로만 둔다. DB 표는 바꾸지 않았다. 서버를 다시 켜면 이어지는 길은 1배다.
- 프로토콜은 바꾸지 않았다(서버가 연결 상태로 정한다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/service.ts` | `walkSpeed(속도, 배수)`(2차맵 이동과 같은 식), `start`의 `speedFactor`, 구간 걷기·건너뛰기·도착 예상·돌아오기에 배수 적용, 다시 켤 때 1 |
| `apps/server/src/travel/serviceTypes.ts` | `Journey.speedFactor`, `start` 옵션 |
| `apps/server/src/travel/gateway.ts` | 연결이 운영자 모드고 운영자 권한이면 `OPERATOR_SPEED_FACTOR`를 넘긴다 |
| `apps/server/src/world/gateway.ts` | 소켓에 `observing()`(전체 보기 구독이 있나) 추가, 닫을 때 비움 |
| `apps/server/src/session.ts` | 이동 연결에 같은 연결의 2차맵 소켓 `observing()`을 잇는다 |
| `apps/server/src/travel/gateway.test.ts`·`service.test.ts` | 운영자 모드면 `OPERATOR_SPEED_FACTOR`배, 운영자가 아니거나 전체 보기가 아니면 1배(게이트웨이). 배수 10을 넘기면 넘은 뒤 구간도 10배, 도착 예상이 짧아짐(서비스) |

## 함께 바꿔야 하는 파일
- `OPERATOR_SPEED_FACTOR`·운영자 판정을 바꾸면 `world/gateway.ts`(2차맵 이동)와 `travel/gateway.ts`(2차맵 사이 이동)를 같이 본다.
- `walkSpeed`의 식은 `world/secondMap.ts` `onRoute`의 빠르기 식과 같아야 한다.

## 건드리지 말 것
- 유닛 속도(`unit.speed`)는 바꾸지 않는다. 그 이동의 움직임 속도만 빠르다.

## 미검증·TODO·알려진 문제
- NAS에서 운영자 모드로 옆 2차맵에 보내 보지 않았다(미검증). 서버 단위 시험으로만 확인했다.
- 확인 단계의 걸리는 시간(tRPC `world.travelPlan`, 1차맵 명령 판·[옆 2차맵으로] 판)은 연결 정보가 없어 1배로 보인다. 보낸 뒤 결과의 도착 예상은 운영자 배수 기준이다.
- 서버를 다시 켜면 가는 중인 운영자 길은 1배로 이어진다.

## 검사
- 서버 이동·게이트웨이 시험 54개 통과(DB 시험 5개는 DB 없이 건너뜀), 서버·게임 타입 검사, oxlint 통과(Verified).
- main 합치기(2026-11-09): main에 다른 세션의 [멈추기] 깜빡임 고침(`a160764b`)과 운영자 100배(`c296a43f`)가 먼저 들어와 있었다. 이 세션의 같은 고침(`824eefaa`)과 seamless 시험 고침(`407678a5`, main이 그 안내를 지워 필요 없어짐)은 빼고, 경로 표시와 이 고침만 최신 main 위에 다시 올렸다(작업 브랜치를 main에서 새로 만들고 골라 옮김). 이동 서비스는 같은 상수를 쓰므로 100배를 따른다.
- 합친 뒤 검사(최신 main + 경로 표시 + 이 고침, Verified):
  - 단위 시험: 엔진·2차맵·서버 이동·게이트웨이 719개 통과(DB 시험 5개는 건너뜀). 타입 검사(엔진·게임·서버)와 oxlint 통과.
  - 화면 시험 53개 모두 통과: unit-control·seamless·map-input·play-map, 사진 시험 포함. 한 번에 돌리다 시간 제한에 걸려 남은 7개는 따로 돌렸다.
  - `pnpm build`, `check:bundle`(첫 화면 JS 107,233B / 상한 131,416B), `check-pwa` 통과.
