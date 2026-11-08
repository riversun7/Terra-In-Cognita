# 옆 2차맵을 그때 띄우기 (플레이 흐름 WP15, 기획 답 730 다)

- 일시: 2026-11-08 13:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP15 (2026-11-08) 옆 2차맵을 그때 띄우기", 질문 `docs/questions/2026-11-08-map-spawn.md`(800~806), PLAN 14장 "옆 2차맵을 그때 띄우기", 가지 `work/map-spawn`(main `3d6ad70`에서)

## 한 일
- 기획 답 730 다(D-523 포인터): 길의 마지막 2차맵(목적지)을 서버가 띄우지 않았으면 보낼 수 있게 하고, 유닛이 그 2차맵에 들어서려 할 때(변 끝에 닿음·건너뛰다 나타남) 서버가 띄운 뒤 넘긴다. 띄운 2차맵은 부팅 때 띄운 2차맵과 같다(구독·시야·탐사·채집 오브젝트·다른 사람의 이동).
- 띄우기 = 지형(고정본 → 지형 서비스 메모리 → 디스크 캐시 → 생성기 워커) → DB에 남은 그 2차맵 유닛·건물 행 → `world.maps` → 경로 워커 사본 `add`. 같은 2차맵을 함께 부르면 한 번.
- 상한(설정 칸 `map_spawn_max_loaded` 32 [임시], 씨앗 2차맵 빼고) — 꽉 차면 가장 오래 빈 것을 내리고 띄움, 없으면 확인 단계 `map_full`·보내기 `busy`·가는 중이면 변 앞 `map_full`.
- 내리기(1분마다, 비어 있은 지 `map_spawn_idle_ms` 10분 [임시]): 유닛·건물·도시·폐허·구독·이동이 없을 때만. 시험 줄·도시 2차맵은 내리지 않는다. 경로 워커 사본 `drop`.
- 다시 켤 때: 플레이어 유닛·건물이 선 2차맵을 씨앗과 함께 띄우고(새 표 없음 — 유닛·건물 행의 2차맵 키), 그때 띄운 2차맵으로 센다. 시험 봇은 씨앗 2차맵에만.
- 화면: [옆 2차맵으로] 판에서 띄우지 않은 옆 2차맵도 [보내기] + "닿으면 이 2차맵을 엽니다", 1차맵 명령 판 한 줄, `map_full` 문구(확인 단계·멈춘 까닭, ko·en).
- world.ts(1,000줄 상한)에서 2차맵 만들기·탐사 기록 저장을 `world/mapFactory.ts`로 옮겼다(979 → 약 900줄).

## 잰 값
- 방법(Verified, 개발 컨테이너, Node 24.22.1): 임시 측정 스크립트(커밋하지 않음)가 실제 부품으로 세계를 띄움 — 행성 서비스(캐시) + 지형 서비스(워커) + `startWorld`(새 DB, 봇 1,000, 시험 2차맵 6, NPC 국가 넷 = 씨앗 17장, 경로 워커 1) → 준비 뒤 이웃 미리 받기가 끝나면 `persistence.spawn.open`을 차례로 32장(도시 2차맵에서 3칸 떨어진 땅) → `--expose-gc` 뒤 `process.memoryUsage()` → 비어 있음 → 내림. 띄운 2차맵의 "지형 출처"는 서버 기록 `second map opened on demand`의 `source`.
- 한 장 띄우는 시간(지형 + DB 행 + 목록·워커 사본):
  - 차가운 캐시(디스크 캐시를 지운 뒤 — 지형 워커가 행성 값에서 생성): 26~75ms. 다만 띄울 때마다 둘레 8장을 미리 받기에 걸어서(지형 워커 하나가 차례로) 그 뒤 차가운 띄우기는 그 줄 뒤에서 기다려 250~1,036ms였다.
  - 디스크 캐시(다음 실행): 6~97ms(가운데 약 25ms).
  - 메모리 캐시(이웃 미리 받기·보낼 때 미리 받기에 든 것): 2~8ms. 이동은 보낼 때 목적지 지형을 미리 받으므로 닿을 때는 대개 이 경우다.
- 메모리: 그때 띄운 2차맵 하나 RSS 약 +1.3~1.9MB(32장에 +43~62MB, arrayBuffers +0.5MB/장 — 봇·NPC가 없는 2차맵이라 부팅 씨앗 2차맵의 약 5~7MB/장보다 작다). 내리면 힙·arrayBuffers는 처음 값으로 돌아오고(32장 내림 → 띄운 2차맵 17장) RSS는 운영체제에 돌려주지 않는다(다음에 띄울 때 다시 쓴다). 상한 32장이면 NAS(17장 RSS 약 430MB)에서 약 +60MB.
- 이벤트 루프(32장 띄우는 동안, `monitorEventLoopDelay` 10ms): 최대 14~31ms, p99 13~24ms(지형 생성은 워커, 메인 스레드는 격자 복사·행 놓기만).
- 짧은 실제 서버 실행(Verified, `merge/integration` 7c80aa9를 합친 판, `node --import tsx src/main.ts`, 새 DB, `S1_TEST_BOTS=1000`·`S1_TEST_MAPS=6`·`NPC_SOCIETY=1`·`NPC_TEST_NATIONS=4`·`PATH_WORKERS=1`, 캐시된 행성): 첫 실행 `/health` world ready·worldIssues 0·띄운 2차맵 17·`mapsOnDemand` 0 → 끄고 첫 시작 도시 2차맵의 띄우지 않은 옆 2차맵에 가짜 계정 유닛 하나를 DB로 넣음 → 다시 켬: 띄운 2차맵 18·`mapsOnDemand` 1·`orphanUnits` 0·`problems` [] → 끄고 `node --import tsx src/cli.ts check-world` = `{"ok":true,"problems":[]}`.
- 불변 조건: 32장 띄운 뒤 `checkInvariants`(메모리 + DB = `check-world`의 DB 몫) 위반 0. DB 시험(`layoutTravel.db.test.ts`)도 넘어간 뒤·다시 켠 뒤·내린 뒤 모두 0.

## 끝 검사 (Verified, `merge/integration` 7c4d141을 합친 판 — 지도자·농장 채집소·국적 바꾸기 줄기 포함)
- `TEST_DATABASE_URL=… pnpm check`: 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠·단위 시험 통과 — 시험 파일 528개·시험 4,036개 모두 통과(DB 시험 포함).
- `pnpm check:content origin/main`: core@53 호환 통과. `pnpm check:docs origin/main`: 통과.
- `pnpm e2e map-travel.spec.ts`: 5개 모두 통과(띄우지 않은 옆 2차맵 [보내기]·"닿으면 이 2차맵을 엽니다"·막힌 변 없음 → 가는 중·이름표 → [멈추기], [1차맵에서 고르기], 사진 390 파스텔·다크 한국어, 파스텔 영어). 사진(`map-edge-sheet-390-*`, `map-edge-going-390-*`)을 눈으로 봄: 수도 2차맵 네 변 모두 [보내기], 띄우지 않은 세 변에 "닿으면 이 2차맵을 엽니다"(영어 "opens on arrival"), 넘침 없음.
- 같은 나라 시야 공유(국적 바꾸기 줄기): 그때 띄운 2차맵도 2차맵마다 `createMapVision`이고 나라 찾기는 구독·볼 수 있나에서 보는 사람에 붙어(`world/gateway.ts`·`visibility.ts`) 따로 등록할 것이 없다 — DB 시험에 그 나라 NPC 주체로 보면 그때 띄운 2차맵의 내 유닛이 보이는지 더함(Verified).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/mapSpawn.ts`(새) | 띄우기·상한·내리기·부팅이 함께 띄울 2차맵 고르기(`bootExtraMaps`)·도시 자리 |
| `apps/server/src/world/mapSpawnWorld.ts`(새) | 세계에 잇기(설정 칸 실효 값·DB 행·이동 붙잡음·도시), 이동 서비스에 붙이기, 1분 타이머 |
| `apps/server/src/world/mapFactory.ts`(새) | world.ts에서 옮긴 2차맵 만들기(고정본 → 지형 서비스 → 임시 지형)·고정본 쓰기·이웃 미리 받기·탐사 기록 저장 + 한 장 만들기(`build`)·미리 받기 |
| `apps/server/src/world/world.ts` | 위 모듈 쓰기, 부팅에 플레이어 2차맵 더하기, `persistence.spawn`, 봇은 씨앗 2차맵에만, 지표·끄기 |
| `apps/server/src/world/persist/load.ts` | 유닛·건물 행 읽기를 함수로 나누고 2차맵 하나의 행 읽기(`loadMapRows`) |
| `apps/server/src/world/pathMessages.ts`·`pathReplica.ts`·`pathService.ts`·`pathPool.ts`·`testSupport.ts` | 경로 워커 사본 더하기·버리기(`add`·`drop`) |
| `apps/server/src/travel/service.ts`·`serviceTypes.ts` | 띄우지 않은 목적지 받기(띄운 것처럼 길 고르기), 들어설 때 띄우고 넘기기, `map_full`, `attachSpawn`·`touches`, 정찰 출발 2차맵이 내려갔으면 다시 띄움 |
| `apps/server/src/tuning/scope.ts` | 서버가 읽는 설정 칸 경로 둘 |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 `map_spawn_max_loaded`·`map_spawn_idle_ms`(core@53, 시뮬은 읽지 않음) |
| `packages/shared/src/worldMap.ts` | `WorldTravelPlan.opensMap`, 확인 문제·멈춘 까닭 `map_full` |
| `apps/game/src/map/EdgeTravel.tsx`·`edgeTravelData.ts`·`travelData.ts`·`PlanetCommandPanel.tsx`, `apps/game/messages/{ko,en}.json` | 띄우지 않은 옆 2차맵 [보내기] + "닿으면 엽니다", `map_full` 문구, 명령 판 한 줄 |
| 시험: `world/mapSpawn.test.ts`(새), `world/pathPool.test.ts`, `travel/service.test.ts`, `travel/layoutTravel.db.test.ts`, `travel/gateway.test.ts`, 게임 `map/travelData.test.ts`, `e2e/map-travel.spec.ts` | 위 동작 |
| `docs/adr/2026-11-07-play-flow.md`, `docs/PLAN.md`, `docs/questions/2026-11-08-map-spawn.md` | 결정·요약·질문 800~806 |

## 함께 바꿔야 하는 파일
- 판 번호를 합칠 때: 팩 core@53(다른 줄기도 올리면 통합에서 하나로), 프로토콜·`SIM_VERSION`은 그대로.
- `world.maps`에 2차맵이 실행 중에 더해지고 빠진다: 2차맵 목록을 켤 때 한 번만 읽어 두는 새 코드는 쓰지 않는다(부를 때마다 읽기). 2차맵마다 기억을 두는 코드(채집 오브젝트 목록 등)는 내린 2차맵이 다시 띄워질 수 있다는 것을 안다.
- 시야(`world/vision.ts`)는 고치지 않았다(시민권 줄기가 공유 규칙을 고친다) — 그때 띄운 2차맵도 2차맵마다 `createMapVision`이라 같은 규칙이 걸린다.

## 건드리지 말 것
- 그때 띄운 2차맵 내리기의 "비어 있음"(유닛·건물·도시·구독·이동)을 줄이지 않는다 — 유닛·건물이 있는 2차맵을 내리면 메모리 상태(정산·전투·직무)가 사라진다.

## 미검증·TODO·알려진 문제
- 채집 서비스(`gather/service.ts`)의 2차맵별 오브젝트 목록 캐시는 내린 2차맵 것도 남는다(띄웠던 2차맵 수만큼). 다른 줄기(농장 채집소)가 고치는 파일이라 건드리지 않았다 — TODO.
- NAS에서는 미실행(띄우는 시간·RSS는 개발 컨테이너 값).

## 사용자 결정 대기
- 질문 800~806(`docs/questions/2026-11-08-map-spawn.md`, 기획 세션 확인 대기 — 답이 없으면 지금 코드).
