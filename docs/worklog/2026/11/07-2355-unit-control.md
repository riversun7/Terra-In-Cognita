# 2차맵 유닛 조종 권한·내 유닛 목록·운영자 모드

- 일시: 2026-11-07 23:55 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-unit-control.md`(제안), 질문 `docs/questions/2026-11-07-unit-control.md`(630~637), 가지 `work/unit-control`(main `51c59a9`에서)

## 한 일
사용자 지적(2026-11-07 원문 "문제점1. 유저는 맵 진입시 본인의 유닛만 움직일 수 있어야함. 사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야 자유이동이 가능.")을 넣었다.
- 서버 권위: 2차맵 이동·멈추기는 내 유닛(수호신 빼고)이거나 운영자(권한 표 `move-unit` = dev·admin, dev에 더함)만. 남의 유닛·없는 유닛 `not_owner`, 내 수호신 `unit_stays`(17판 연결만, 16판은 `forbidden`). 판정 함수 하나(`world/unitControl.ts`)를 명령과 목록이 같이 쓴다. 운영자 권한으로만 된 명령은 감사 기록 `second_map.operator_command`.
- 멈추기 `stop_unit`(프로토콜 17·최소 16): 2차맵 `halt`. 서버 봇·포로·중태는 `invalid_request`.
- 내 유닛 목록 조회 tRPC `world.mapUnits({ mapKey })`(메모리만, 사이보그 본체 먼저, 종류·직무·부상·명령할 수 없는 까닭, `operator`).
- 2차맵 화면: [내 유닛 N] → 목록(줄 = 이름 + 상태 한 마디) → 줄을 누르면 고르고 카메라가 그 자리로(좁은 화면은 목록을 접음) → 땅 = 이동, 가는 동안 [멈추기]. 남의 유닛은 번호·움직임만(보내지 않음, "보기 전용" 문구를 "내 유닛만 움직일 수 있습니다"로). dev·admin [전체 보기] → [운영자 모드](모든 유닛 명령 + 안개 없는 전체 보기 + 위 판 "운영자" 알약). 플레이어 안개는 그대로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/secondMap.ts`·`index.ts`·`version.ts` | `stop_unit`, 결과 코드 `not_owner`·`unit_stays`, `UNIT_CONTROL_PROTOCOL_VERSION` 17, 프로토콜 17(최소 16) |
| `packages/protocol/src/secondMap.test.ts`·`travel.test.ts` | 멈추기·새 코드 시험, 이동 시험의 판 숫자를 "현재 − 1"로(판이 오를 때마다 고치지 않게) |
| `apps/server/src/world/unitControl.ts`(새) | 운영자 판정·명령 거절 까닭·목록의 명령할 수 없는 까닭 — 명령과 목록이 같이 씀 |
| `apps/server/src/world/gateway.ts`(+시험) | 유닛 명령 판정을 unitControl로, `stop_unit`, 연결 판에 따라 새 코드/forbidden, 운영자 명령 감사 고리 |
| `apps/server/src/session.ts` | `stop_unit` 받기(17판만), 월드 연결에 프로토콜 판 넘김 |
| `apps/server/src/auth/permissions.ts`(+시험) | dev에 `secondMap: move-unit`(운영자) |
| `apps/server/src/app.ts` | 운영자 명령 감사 기록(`second_map.operator_command`) |
| `apps/server/src/worldMap/mapUnits.ts`(새, +시험)·`reads.ts`·`trpc/world.ts`·`trpc/context.ts` | `world.mapUnits` 조회 |
| `packages/shared/src/mapUnits.ts`(새)·`package.json` | 목록 응답 타입(`@terra/shared/mapUnits`) — `worldMap.ts`를 건드리지 않으려고 따로 |
| `apps/game/src/map/mapFeed.ts`·`feedTypes.ts`(+시험) | `stopUnit`·`isOwn`, 명령 결과에 `action`(이동·멈추기) |
| `apps/game/src/map/mapUnits.ts`(새, +시험)·`useMapUnits.ts`(새) | 목록 자료·5초 묻기, 줄 이름·상태·고른 유닛 다룸·선택 안내 |
| `apps/game/src/map/UnitControlPanels.tsx`(새)·`unitControl.css`(새) | 목록·[내 유닛 N]·[멈추기]·"운영자" 알약·[운영자 모드] |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 목록·운영자 모드·고른 유닛 다룸·멈추기 연결, `isAdmin` → 운영자 모드 |
| `apps/game/src/map/commandNotice.ts`(새)·`MapPerfPanel.tsx`(새) | 화면 파일 600줄 아래로 나눔(명령 안내·성능 숫자 판, 동작 같음) |
| `apps/game/src/map/mapMessages.ts`, `apps/game/messages/{ko,en}.json` | 새 코드·목록·운영자 문구(ko·en 함께). 안 쓰게 된 `map_selected`·`map_selected_view`·`map_vision_observe`는 지움 |
| `e2e/unit-control.spec.ts`(새) | 화면 시험(목록 → 고르기 → 이동 → 멈추기, 남의 유닛 정보만, 운영자 모드, 사진) |
| `docs/adr/2026-11-07-unit-control.md`·`docs/questions/2026-11-07-unit-control.md`·`docs/PLAN.md` 14장 | 결정·확인 대기 630~637·표 한 줄 |

## 함께 바꿔야 하는 파일
- 결과 코드를 더하면 `apps/game/src/map/mapMessages.ts` 표(satisfies가 알려 준다)와 `unitControl.ts`의 판정을 같이 본다.
- 유닛 종류 코드가 늘면 `worldMap/mapUnits.ts` `kindOf`와 `@terra/shared/mapUnits` `MAP_UNIT_KINDS`.

## 건드리지 말 것
- `apps/server/src/travel/`·`map/PlanetCommandPanel.tsx`(다른 줄기 `work/play-move2`가 고치는 중). 멈추기는 이동 서비스 코드를 고치지 않고 "길에서 벗어남"으로 끝나게 했다.
- `.map-dev-observe` 단추 이름(운영자 모드 단추가 그대로 쓴다 — `e2e/vision.spec.ts`가 본다).

## 검사 결과
- 작업 중(고친 꾸러미만): 프로토콜 18파일 105개 통과, 서버 `gateway`·`permissions`·`mapUnits` 33개 통과, 게임 `src/map` 18파일 143개 통과, 서버·게임 타입 검사 통과, 고친 파일 oxlint·biome 통과.
- 끝에 한 번(Verified): 메시지 다시 만들기 → `TEST_DATABASE_URL=… pnpm check` 통과(시험 476파일 3,779개, DB 시험 포함, 다국어 4,424키, 디자인 값·경계·파일 크기 통과), `pnpm check:docs origin/main` 통과.
- 화면 시험(Verified): `pnpm e2e e2e/unit-control.spec.ts e2e/vision.spec.ts e2e/play-map.spec.ts` 39개 통과·1개 건너뜀(측정 시험, `E2E_MEASURE` 없음), 7.7분. 새 `unit-control.spec.ts` 7개: 목록 → 사이보그 고르기 → 땅 = 이동(ok) → [멈추기](ok), 남의 유닛 정보만·move_unit 0개, 운영자 모드(표시·전체 보기·운영자 다룸), 사진 4장.
- 사진(390, 세션 임시 폴더 `unit-control-shots/`): `unit-control-list-390-{pastel,dark}`(내 유닛 목록 펼침), `unit-control-operator-390-{pastel,dark}`(위 판 "운영자" 알약·운영자 선택 안내), `unit-control-moving-390`(가는 중 [멈추기]). 눈으로 봄: 넘침 없음, 다크에서 목록·알약 글자 읽힘.
- 빌드·`check-pwa`·`check:bundle`은 돌리지 않았다(지시 — 합치는 묶음에서). 화면 시험의 전역 준비가 빌드는 했다.

## 미검증·TODO·알려진 문제
- 질문 630~637(확인 대기, 모양만 — 답이 없으면 지금 코드).
- 목록은 이 2차맵만, 5초마다 묻는다. 운영자 모드는 화면마다 꺼진 채 연다.
- 포로·중태 명령 거절은 `invalid_request` 그대로(전용 코드는 전투 화면 때).

## 사용자 결정 대기
- 없음(기획 질문 630~637은 기획 세션으로).
