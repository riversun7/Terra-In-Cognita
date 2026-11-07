# 2차맵 사이 이동(플레이 흐름 WP9): 1차맵 명령 [확정] → 이웃 2차맵을 하나씩 지나 걷기, 572 다 카메라, 582가 실제로 일어남

- 일시: 2026-11-07 22:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP9 2차맵 사이 이동 (play-move)"(상태 제안), 질문 `docs/questions/2026-11-07-play-map.md` 571 가·572 다(답 D-518, 기획 커밋 `451b5a7`)·513 다·590~594(새, 확인 대기), `docs/questions/2026-11-07-play-produce.md` 582, 기획 D-197·D-139·D-6019·D-6021·D-515·D-518, 가지 `work/play-move`(시작점 main `10b7055`)

## 한 일
- **571 가 그대로(다로 물러서지 않음)**: 1차맵 명령 판 [확정]이 내 사이보그를 출발 2차맵 변 끝까지 걷게 하고, 이웃 2차맵에 실제 유닛으로 넘겨(그곳 시야·탐사·조우 규칙 그대로) 하나씩 지나 목적 2차맵 목표 칸 둘레의 설 칸에 닿게 한다. 지나는 2차맵이 모두 이미 띄운 시험 2차맵(한 줄 6장)이라 2차맵을 더 띄우는 서버 비용이 없다 → 571 다로 시작할 까닭이 없었다. 띄우지 않은 2차맵을 지나야 하면 `no_route`(질문 593).
- **서버 권위 이동 서비스**(`apps/server/src/travel/`): 2차맵 줄(띄운 2차맵만, 변 이웃 너비 우선), 넘는 자리(변을 따라가는 좌표를 이어 감·막히면 가까운 쪽부터, 면 경계는 생성기 `stepMapCell`), 2차맵마다 길(그 2차맵 `moveUnit` = 경로 워커), 구간 도착 시각에 확인해 옆 2차맵으로 넘기기(`transferOut` → `transferIn`, 유닛 행은 지우지 않고 새 2차맵 키로 같은 쓰기 묶음), 멈추기(그 자리에 섬), 새 보내기 = 길 바꿈, 길에서 벗어나면(다른 명령·전투 뒤 안전한 곳·사망) 멈춤. 걸리는 시간 = 곧은 거리 ÷ 유닛 속도(걷기 437단위/초 = 2차맵 한 장 약 10분, 새 수치 없음).
- **582**: 넘기 직전 그 주인을 정산한다 → 다음 정산이 직무 배치를 풀고 노동 계약을 떠난 시각에 "유닛 사라짐"으로 끝낸다(Verified: DB 시험). 확인 단계가 "직무가 끝난다"를 알린다.
- **프로토콜 16(최소 15)**: `travel_start`·`travel_cancel` → `travel_result`. 조회 tRPC `world.travelPlan`(확인 단계)·`world.travels`(가는 중 + 최근 10분 끝난 길).
- **저장**: 새 표 `world_travels`(마이그레이션 `20261107130950_world_travels`, 더하기만). 다시 켜면 유닛이 서 있는 줄의 2차맵부터 그 구간을 다시 시작한다(Verified: DB 시험).
- **화면**: 1차맵 명령 판 = 확인(지나는 2차맵 수·약 km·걸리는 시간·도착 예상 시:분·직무 경고·길 바꿈 안내) → [확정] → 가는 중(2차맵 몇 번째·남은 시간·[멈추기]), 5초마다 다시 묻고 이 도시 2차맵에 닿으면 1차맵이 도시 목록·내 자리를 다시 받아 도시 판 [들어가기](513 다 확인). 2차맵 화면 = 572 다(`?at=` > 내 사이보그 > 도시 시청, 내 사이보그가 있으면 [내 사이보그]), 가는 중 한 줄, 따라 연 화면은 넘어갈 때 짧은 안내 뒤 그 2차맵으로(D-139), 아니면 [따라가기].
- **나눔**: `world/secondMap.ts`(973줄)의 칸·경로 도우미를 `world/mapGeometry.ts`로 옮겨 932줄. `world/world.ts`는 잇는 줄만(973 → 982줄), `db/schema.ts`는 다시 내보내는 두 줄(949줄).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/route.ts`·`service.ts`·`store.ts`·`gateway.ts`(새), 시험 `route.test.ts`·`service.test.ts`·`gateway.test.ts`·`travel.db.test.ts`(새) | 이동 서비스(길·걷기·넘기기·저장·복구·WebSocket) |
| `apps/server/src/world/secondMap.ts`, `world/mapGeometry.ts`(새) | `transferOut`·`transferIn`·`halt`·`isStandable`·`unitInfo().job`, 도우미 나눔(1,000줄 상한) |
| `apps/server/src/world/world.ts` | 이동 서비스 잇기(`persistence.travel`, 부팅 복구·멈춤) |
| `apps/server/src/db/travelSchema.ts`(새)·`schema.ts`, `drizzle/20261107130950_world_travels/` | 표 `world_travels`(더하기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 `travels`(유닛 다음 차례) |
| `apps/server/src/session.ts`·`app.ts` | `travel_*` 메시지를 이동 게이트웨이로(16판 연결만) |
| `apps/server/src/worldMap/travelReads.ts`(새)·`reads.ts`, `trpc/world.ts`·`context.ts` | 조회 `world.travelPlan`·`world.travels` |
| `packages/protocol/src/travel.ts`(새)·`messages.ts`·`index.ts`·`version.ts`, 시험 `travel.test.ts`(새) | 프로토콜 16(최소 15) |
| `packages/shared/src/worldMap.ts` | 확인 단계·가는 중 응답 모양 |
| `apps/game/src/map/PlanetCommandPanel.tsx`·`PlanetMapScreen.tsx`·`planetMap.css` | 확인·[확정]·가는 중·[멈추기], 닿으면 도시 목록 다시 받기 |
| `apps/game/src/map/travelCommands.ts`·`travelData.ts`·`useCyborgTravel.ts`·`SecondMapTravel.tsx`(새), 시험 `travelData.test.ts`(새) | WebSocket 명령·조회·문구 도우미·따라가기 훅·2차맵 몫 |
| `apps/game/src/map/mapTarget.ts`·`SecondaryMapScreen.tsx`, 시험 `worldMap.test.ts` | 572 다(`?at=` 먼저 + `cyborg`), [내 사이보그]·가는 중 한 줄·따라가기 |
| `apps/game/src/map/mapFeed.ts` | `travel_result`는 2차맵 흐름이 받지 않는다 |
| `apps/game/messages/{ko,en}.json` | 문구 25개 더함(`world_travel_*`·`map_travel_*`), 쓰지 않게 된 2개 뺌(`world_command_unavailable`·`world_command_party_cyborg_far`) |
| `e2e/play-map.spec.ts` | WP7 명령 판 시험을 확인 단계로, WP9 묶음([확정] → 가는 중 → 2차맵 한 줄 → [멈추기], 572 다), 사진 |
| `docs/adr/2026-11-07-play-flow.md`("WP9" 절), `docs/questions/2026-11-07-play-map.md`(상태·590~594)·`2026-11-07-play-produce.md`(582), `docs/PLAN.md`(14장 한 줄), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 작업 중(Verified): 서버 `travel/` 4파일(DB 포함 13개), 프로토콜 18파일 106개, 게임 `travelData`·`worldMap`·`mapFeed` 56개 통과. 서버·게임 타입 검사, 바꾼 파일 oxlint 통과.
- 화면 시험(Verified, `pnpm e2e play-map.spec.ts`, 빌드한 앱·서버, 헤드리스 Chromium): 19개 중 18개 통과, 1개(WP2 "[들어가기] → 2차맵") 실패 — [들어가기]가 `?at=`(시청)을 넘기므로 572 다로 카메라가 내 사이보그가 아니라 시청을 보게 된 것(바뀐 동작) → 기대를 `data-focus-source=picked` + [내 사이보그]로 고치고 그 시험만 다시 돌려 통과. WP9 [확정] → 가는 중(판 `data-travel=going`, `world.travels` going, 2차맵 화면 `data-travel=1/N`·가는 중 한 줄·[내 사이보그]) → [멈추기](멈췄습니다, `stopped`/`cancelled`, 내 사이보그는 출발한 2차맵) 통과, 572 다 시험 통과.
- 사진(390, 넘침·작은 누르는 곳 없음): `play-fog-command-390-{pastel,dark}-{ko,en}`(확인 단계: 멈췄습니다·지나는 2차맵 2장·약 1.5km·걸리는 시간 약 10분·도착 예상), `play-move-going-390-{pastel,dark}-{ko,en}`(가는 중: 2차맵 1/2·남은 시간·[멈추기]), `play-move-second-390-{pastel,dark}`(2차맵 아래 판 가는 중 한 줄 + [내 사이보그]). 눈으로 본 것: 파스텔·다크 모두 글자·단추가 판 안에 들어가고 넘치지 않는다. 오른쪽 위 [2차맵]·[1차맵] 전환 단추가 판 머리 줄 오른쪽에 겹쳐 보이는 것은 WP7부터 있던 배치다(바꾸지 않음). 사진 폴더(저장소 밖): 개발 컨테이너 임시 폴더 `move-shots`.
- 끝 검사: (아래 "끝 검사"에 적는다)

## 함께 바꿔야 하는 파일
- 프로토콜 판을 다른 줄기와 합칠 때: `packages/protocol/src/version.ts`(16 설명), `travel.test.ts`(16·최소 15를 본다).
- 마이그레이션이 다른 줄기와 같은 부모에서 갈라지면 그대로 합친다(AGENTS 6장 Drizzle — 다시 만들지 않는다).
- `world/secondMap.ts`를 다른 줄기가 함께 고쳤으면 `mapGeometry.ts`로 옮긴 도우미(`failureCode`·`bodyCells`·`rectsOverlap`·`remainingPathBlocked`·`lastPoint`) 자리를 맞춘다.

## 건드리지 말 것
- 넘을 때 `transferOut`은 유닛 행을 지우지 않는다(`removeUnit`을 쓰면 DB 행이 지워진다). 다음 `transferIn`이 같은 쓰기 묶음에서 새 2차맵 키로 쓴다.
- 넘기 직전 정산(`settle`)을 빼면 떠나기 전 일한 몫이 사라지고 계약 끝 시각이 틀려진다(582).

## 미검증·TODO·알려진 문제
- 띄우지 않은 2차맵은 지나지 못한다(질문 593). 파티는 내 사이보그 하나, 정찰 = 이동(질문 591), 확인 단계에 위험 구간·비용 없음(질문 594), 넘는 자리는 목표 쪽으로 곧지 않을 수 있다(질문 590).
- 1차맵의 내 자리 표시는 연 때·도착했을 때만 새로 받는다(가는 동안 그대로).
- 건물 작업(짓기 일꾼)에 묶인 유닛을 보냈을 때의 건물 작업 쪽 처리는 보지 않았다(Unknown — 건물 작업은 유닛 자리를 보지 않는 것으로 안다, Assumed).
- 운영 경로 워커(`createWorkerPathService`)로 넘기기를 돌려 보지는 않았다(시험은 같은 스레드 길 찾기, 미실행).

## 사용자 결정 대기
- 없음(질문 590~594는 기획 세션에 — 모양만, 답이 없으면 지금 코드).
