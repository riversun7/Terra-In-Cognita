# 2차맵 사이 이동 2(플레이 흐름 WP11): 곧은 선으로 넘기(590 나)·정찰은 돌아옴(591 나)·띄우지 않은 2차맵 건너뛰기(593 나)·위험 구간과 비용(594 나)·가는 동안 1차맵 내 자리·경로 워커 시험

- 일시: 2026-11-07 23:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP11 이동 2 (play-move2)"(상태 제안), 질문 `docs/questions/2026-11-07-play-map.md` 590 나·591 나·593 나·594 나(답 D-518, 기획 커밋 `f8a9c93`)·610~614(새, 확인 대기), 기획 D-197·D-139·D-6021·D-515·D-518, 가지 `work/play-move2`(시작점 main `51c59a9`)

## 한 일
- **590 나 — 곧은 선**: 이웃 2차맵 틀 → 지금 2차맵의 늘인 틀 바꾸기(부호 있는 자리바꿈 2×2 + 옮김)를 생성기 `stepMapCell`에서 읽고(`travel/frame.ts`), 줄의 바꾸기를 이어 목표를 지금 2차맵 틀로 옮겨 "지금 자리 → 목표" 선이 넘는 변을 지나는 자리를 넘는 자리로 한다(막히면 가까운 쪽부터, 선이 그 변으로 가지 않으면 목표를 변에 내린 자리). 2차맵 줄도 같은 길이면 띄우지 않은 2차맵이 적은 줄 → 큰 원에 가까운 2차맵 → 목적에 가까운 2차맵(대각선이면 계단처럼).
- **593 나 — 건너뛰기**: 줄에 띄우지 않은 2차맵이 든다. 걷던 2차맵 다음이 띄우지 않은 것이면 변 끝까지 걷고 넘기 직전 정산(582) → 탐사 기록 → 유닛을 2차맵에서 빼서 이동 서비스가 든 채(DB 행은 사라진 자리 그대로) 곧은 거리 ÷ 속도 뒤 다음 띄운 2차맵 변(곧은 선 자리, 막히면 가까운 쪽부터)에 세운다. 그동안 `world.travels`·`world.myPosition`은 곧은 선 위 지금 자리(`hidden`). 다시 켜면 사라진 자리에 놓인 유닛을 다시 숨기고 `hidden_until_ms`까지 기다린다. 건너뛰는 중 멈추기 = 나타난 자리에서 선다(질문 613), 새 보내기 = `busy`(확인 단계 `in_transit`). 도중 습격은 없다(질문 610).
- **591 나 — 정찰**: 보낼 때 출발 자리를 적고, 정찰이 목표 둘레에 닿으면 닿은 2차맵 → 출발 2차맵 줄로 다시 정해 돌아온다(`returning`·`scoutedMapKey`). 구간이 끝날 때마다 걸은 자리의 시야를 탐사 기록에 남긴다(`MapVision.explore` — 구독하지 않아도, 이동도 같다) → 본 2차맵을 계속 볼 수 있고(U3) 그 도시를 안다(570 ③).
- **594 나 — 위험 구간·비용**: `world.travelPlan`(이제 비동기)이 비용 `walk`, 위험 구간(아는 2차맵의 오염 ≥ 유목 목표 오염 문턱 S17, 아는 도시가 선 2차맵의 전쟁 중 세력), 모르는 2차맵 수, 건너뛰는 2차맵 수를 준다(`worldMap/travelDanger.ts`, 문턱은 설정 칸 실효 값 — 새 칸 없음).
- **가는 동안 1차맵 내 자리**: 1차맵 화면이 길을 묻는다(`useMyTravel` — 열 때·가는 중이면 5초마다·명령 뒤 바로). 내 자리 표시·[내 위치]가 길의 지금 자리를 따라가고(`data-me-at`·`data-me-travel`), 끝나거나 정찰이 돌아서면 도시 목록·내 자리를 다시 받는다. 명령 판은 같은 값을 받는다(따로 묻지 않음).
- **경로 워커 시험**: `travel/travelWorker.test.ts`가 운영 경로 워커(`createWorkerPathService`, 실제 워커 스레드)로 변 끝 → 넘기기 → 옆 2차맵 길 → 도착을 본다.
- **화면**: 명령 판 = 정찰·이동의 다른 점 한 줄, 확인 줄에 건너뛰는 2차맵·비용·위험 구간(위험 색, 두 줄까지 + "N곳 더")·모르는 2차맵, 가는 중 줄은 건너뛰는 중·정찰이 돌아오는 중. 2차맵 가는 중 한 줄도 같은 문구, 건너뛰는 중이면 따라가지 않는다. `no_route` 문구는 "너무 멀어 한 번에 보낼 수 없습니다"로(이제 64장을 넘을 때만).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/frame.ts`(새) | 2차맵 틀 바꾸기(곧은 선, 590) |
| `apps/server/src/travel/route.ts` | 줄 고르기(띄우지 않은 2차맵 포함·곧은 선), 곧은 선 넘는 자리, 길 문맥·구간 목표·건너뛰는 구간·지금 있을 자리 |
| `apps/server/src/travel/service.ts`, `serviceTypes.ts`(새) | 건너뛰기·정찰 돌아오기·탐사 기록·숨은 자리, 모양·순수 도우미 나눔(파일 크기) |
| `apps/server/src/travel/store.ts`, `db/travelSchema.ts`, `drizzle/20261107143011_travel_scout_hidden/`(새), `world/persist/tables.ts` | `world_travels` 칸 더하기(보낸 사용자·출발 자리·정찰한 2차맵·나타나는 시각) |
| `apps/server/src/world/vision.ts` | `explore`(구독하지 않아도 탐사 기록), 새로 드러난 건물 보내기 도우미 |
| `apps/server/src/worldMap/travelDanger.ts`(새)·`travelReads.ts`·`reads.ts`, `trpc/world.ts`, `app.ts` | 위험 구간(594), 확인 단계 비동기, 건너뛰는 중 내 자리, 문턱 = 설정 칸 S17 |
| `packages/shared/src/worldMap.ts` | 응답 모양: `WorldTravelPlan` 위험·비용·건너뜀, `WorldTravel` 돌아옴·숨음, `WorldPosition.hidden`, 문제 `in_transit` |
| `apps/game/src/map/useMyTravel.ts`(새)·`PlanetMapScreen.tsx`·`PlanetCommandPanel.tsx`·`travelData.ts`·`SecondMapTravel.tsx`·`useCyborgTravel.ts`·`mapTarget.ts`·`planetMap.css` | 가는 동안 내 자리, 명령 판 줄(위험·비용·건너뜀·정찰), 2차맵 줄·따라가기, 숨은 자리를 열지 않음 |
| `apps/game/messages/{ko,en}.json` | 문구 16개 더함, `world_travel_problem_no_route` 문구 바꿈 |
| 시험 `travel/route.test.ts`·`service.test.ts`·`gateway.test.ts`·`travel.db.test.ts`·`travelWorker.test.ts`(새), `worldMap/travelDanger.test.ts`(새), 게임 `travelData.test.ts`·`worldMap.test.ts`, `e2e/play-map.spec.ts` | 위 규칙 |
| `docs/adr/2026-11-07-play-flow.md`("WP11" 절), `docs/questions/2026-11-07-play-map.md`(상태·610~614), `docs/PLAN.md`(14장 한 줄), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 작업 중(Verified): 서버 `travel/`·`worldMap/`·`world/vision`·`testWorkers` 9파일 36개(DB 포함) 통과, 게임 `travelData`·`worldMap`·`mapFeed` 통과, 서버·게임 타입 검사, 바꾼 파일 oxlint 통과.
- 끝 검사(Verified, 무거운 잠금 안, 커밋 `7d0ffa3` 위 — 메시지 생성 뒤): `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어 4,415키·대비 738쌍·콘텐츠 core@50·시험 476파일 3,783개, DB 시험 포함). `pnpm check:docs origin/main` 통과. 크기 경고는 `travel/service.ts` 691줄(1,000줄 상한 안 — 모양·도우미를 `serviceTypes.ts`로 나눈 뒤).
- 화면 시험(Verified, `pnpm e2e e2e/play-map.spec.ts`, 빌드한 앱·서버, 헤드리스 Chromium): 19개 모두 통과(4.3분). WP7 확인 단계 시험에 정찰·이동 안내 줄·비용 줄·`data-dangers`·`data-hidden-maps = 0`, WP9 시험에 가는 동안 `data-me-travel = going`·`data-me-at`이 20초 안에 바뀜(5초마다 다시 묻기).
- 사진(390, 넘침·작은 누르는 곳 없음, 저장소 밖 임시 폴더 `move2-shots`): `play-fog-command-390-{pastel,dark}-{ko,en}`(확인 단계: 정찰 안내·지나는 2차맵 2장·약 1.4km·약 10분·비용 없음·알려진 위험 없음·모르는 2차맵 1장), `play-move-going-390-{pastel,dark}-{ko,en}`(가는 중), `play-move-second-390-{pastel,dark}`. 눈으로 본 것: 파스텔·다크 모두 줄이 판 안에 들어간다. 오른쪽 [2차맵] 전환 단추(WP7부터 있던 배치)가 영어의 긴 정찰 안내 줄 끝을 가렸다 → 영어 문구를 줄였다("Scout: looks at the target, then comes back.", 사진은 줄이기 전). 영어 복수형("1 local maps")도 "…: {count}" 꼴로 바꿨다(메시지만, 다시 돌리지 않음 — 다국어 검사만 다시 통과).

## 함께 바꿔야 하는 파일
- 마이그레이션이 다른 줄기와 같은 부모에서 갈라지면 그대로 합친다(AGENTS 6장 Drizzle — 다시 만들지 않는다).
- `world_travels` 칸을 더 고치면 `world/persist/tables.ts`의 `travels` 칸 목록과 `travel/store.ts`를 같이.
- `WorldTravelPlan`·`WorldTravel` 모양을 바꾸면 `travelData.test.ts`·`gateway.test.ts`의 가짜 값도.

## 건드리지 말 것
- 건너뛸 때 유닛 DB 행을 고치지 않는다(사라진 자리 그대로여야 다시 켤 때 그 자리에 놓이고 다시 숨긴다). `finish`는 든 유닛을 사라진 자리로 되돌린 뒤 끝낸다.
- 틀 바꾸기는 `stepMapCell`에서 읽는다(면 경계 틀을 손으로 적지 않는다).

## 미검증·TODO·알려진 문제
- 시험 세계(띄운 2차맵 6장이 한 줄)에서는 건너뛰기·대각선 줄이 일어나지 않는다 — 서버 시험(가짜 2차맵)만 본다. 화면에서 건너뛰는 중 문구·정찰이 돌아오는 화면은 사진이 없다(걷는 시간 2차맵 한 장 약 10분).
- 1차맵 내 자리는 5초마다 바뀐다(사이 보간 없음).
- 오른쪽 [2차맵]·[1차맵] 전환 단추가 명령 판 오른쪽 줄 끝에 겹치는 배치(WP7부터)는 그대로다 — 긴 줄이 가려질 수 있다.
- 건너뛰는 동안 습격 없음(질문 610), 위험 문턱 = 유목 문턱·전쟁 영토 = 도시 2차맵(질문 611), 정찰 결과 알림 없음(질문 612).

## 사용자 결정 대기
- 없음(질문 610~614는 기획 세션에 — 모양만, 답이 없으면 지금 코드).
