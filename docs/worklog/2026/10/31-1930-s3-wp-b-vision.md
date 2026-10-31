# S3 WP-B: 2차맵 시야 전송, 탐사 기록, 프로토콜 3, 안개, 시험 단추

- 일시: 2026-10-31 19:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-s3-server-stage.md` 3절·"구현하며 정한 것 (WP-B)", ADR 7·26, 앞 작업 기록 `2026/10/31-1650-s3-wp-c-settlement.md`. main(`1a6feba`, WP-A)을 합친 뒤

## 한 일
- `packages/sim`에 시야 칸·경로 자르기 함수, 서버에 2차맵마다 시야 전송(묶음마다 거른 흐름, 탐사 기록, 볼 수 있는지)을 넣었다.
- 프로토콜 3(자른 경로 `until`, 사라짐 `hidden`, 내 유닛 `own`, 탐사 칸 `vision`, 전체 보기 `observe`, 개발 시험 명령 `dev_spawn_units`). 2판 기기는 받지 않는다.
- 자기 유닛 이동은 권한 없이 된다. 전체 보기·시험 명령 권한(dev·admin), 전체 보기 감사 기록.
- 기기: 받기 규칙, 엔진 안개(탐사하지 않은 곳 어둡게), 2차맵 화면의 시험 단추 둘.

## 검사·측정
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과: 시험 파일 205개·시험 1,958개. 새 시험: sim 시야 4개, 게이트웨이 시야 3개(누출 없음: 남의 경로 점이 모두 그때 내 시야 칸 안, 멀어지면 hidden), DB 시험(시험 일꾼 → 내 유닛·탐사 칸, 끊으면 탐사 기록 저장), 기기 받기 규칙 3개, 엔진 안개 1개, 프로토콜 2개.
- `pnpm e2e` 66개 통과(4.4분, 새 `e2e/vision.spec.ts` 6개 포함). 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s3-shots/` (390px, 파스텔·다크 × 한국어·영어). 단추 줄이 넘치지 않고 안개 경계가 부드럽다(헤드리스).
- `pnpm check:bundle`: 첫 화면 JS 127,539B / 상한 131,416B.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/vision/vision.ts`(새)·`vision.test.ts`(새), `packages/sim/src/index.ts` | 시야 칸·자르기 |
| `packages/protocol/src/{secondMap,version,index}.ts`·`secondMap.test.ts`·`codec.test.ts` | 프로토콜 3 |
| `apps/server/src/world/vision.ts`(새) | 시야 전송 |
| `apps/server/src/world/{secondMap,mapStream,wire,gateway,visibility,terrainRoute,world}.ts` | 시야 연결, hidden 묶음, 구독·명령 규칙, 탐사 기록 저장, 시험 명령 |
| `apps/server/src/{app,session}.ts`, `auth/permissions.ts` | 전체 보기 감사 기록, 시험 명령 경로, 권한 동작 |
| `apps/server/src/world/{gateway,appWorld,world.db}.test.ts` | 시야 시험, 전체 보기로 바꾼 옛 시험 |
| `packages/engine/src/{engineTypes,secondMapEngine}.ts`, `terrain/{terrainMaterial,terrainView}.ts`·`terrainMaterial.test.ts` | 안개 |
| `apps/game/src/map/{mapFeed,feedTypes,feedTestSupport,SecondaryMapScreen}.tsx?`·`mapFeed.test.ts`, `apps/game/src/auth/sessionState.ts` | 받기 규칙, 시험 단추 |
| `apps/game/messages/{ko,en}.json` | `map_vision_*` 4개 |
| `e2e/vision.spec.ts`(새) | 화면 시험·사진 |
| `docs/adr/2026-10-31-s3-server-stage.md` | 구현하며 정한 것 (WP-B) |

## 함께 바꿔야 하는 파일
- 세력 가입이 생기면 `apps/server/src/world/vision.ts`의 `groupKeyOf`·`owns`를 최상위 세력 기준으로(기획 질문 S3-Q1·Q2 답에 따라 탐사 기록 규칙도).
- 시야 반지름 수치가 정해지면 `packages/sim/src/vision/vision.ts`의 `UNIT_VISION_CELLS`·`BUILDING_VISION_CELLS`(D-5037 식은 스탯이 생기면).

## 건드리지 말 것
- 2판 기기를 다시 받으려면 걸러지지 않은 흐름을 2판에 보내지 않는 길부터 만든다(지금은 받지 않는다).

## 미검증·TODO·알려진 문제
- 휴대폰에서 안개·단추를 보지 않았다. 배포 뒤 볼 것: 플레이어 계정은 2차맵이 처음에 열리지 않는다(내 유닛·탐사가 없음). dev·admin 계정은 [시험 일꾼 받기]로 확인한다.
- 마지막 본 건물(D-152)은 하지 않았다(작업 지시의 줄일 것). 탐사한 칸의 건물은 지금 상태로 보인다.
- 구독하지 않은 동안의 탐사는 기록하지 않는다.

## 사용자 결정 대기
- 없음.
