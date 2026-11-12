# 운영자 빠르기를 모든 유닛 명령에(채집·들어가기·직무 배치·운반)

- 일시: 2026-11-12 21:05 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-unit-control.md` "바뀜 (2026-11-12, 운영자 빠르기를 모든 유닛 명령에)", 질문 1246~1248(`docs/questions/2026-11-12-operator-speed.md`), 앞 작업 `09-2040-operator-speed.md`·`09-2150-operator-travel-speed.md`·`12-1310-unit-looks.md`

## 한 일
- 사용자 지적(원문): "운영자모드에서 이동시 맵을클릭할때는 빠른속도가 적용되나 작업이나 다른 명령시엔 원래느린속도다".
- 원인(**Verified**: 코드): 운영자 빠르기(100배)는 `move_unit`(그 2차맵 전체 보기 구독)과 `travel_start`에만 매개변수로 붙었다. 채집 줄·들어가기(`gather/service.ts`)·운반꾼(`gather/porter.ts`)은 `SecondMap.moveUnit`을 빠르기 없이 불러 보통이었다.
- 유닛을 걷게 하는 길(**Verified**: `moveUnit` 호출 전수 검색): 2차맵 이동 게이트웨이, 채집 서비스(채집 줄·들어가기), 운반꾼, 2차맵 사이 이동 서비스. 그 밖(건물 공격·짓기 일꾼·병원·신전·융합)은 유닛을 걷게 하지 않는다(자리만 본다). 봇 판단은 2차맵 안에서 따로 길을 부탁한다(운영자 표시와 상관없음).
- 한 곳에서 고침: `SecondMap`이 유닛마다 운영자 빠르기 표시를 든다(`setPace`·`paceOf`). `moveUnit`에 빠르기를 따로 주지 않으면 표시를 읽는다. 유닛 명령 게이트웨이(2차맵·2차맵 사이 이동·채집·노동)는 `withPace`로 명령마다 표시를 달거나(운영자 모드) 지우고, 거절되면 되돌린다. 운영자 모드 판정은 `isOperatorMode`(전체 보기 구독 + `canCommandAnyUnit`) 하나다.
- 덤으로 고침(**Verified**: 시험): 건물이 남은 길을 막아 다시 찾은 길이 보통 빠르기로 떨어지던 것 — 하던 이동의 빠르기(`motion.speed ÷ unit.speed`)로 다시 찾는다.
- 운반꾼: 표시가 달린 운반꾼은 나르는 시간도 배수로 나눈다(올림) [임시, 질문 1247].
- 화면 시험 `e2e/operator-speed.spec.ts`(WebSocket만, dev): 보통 연결과 운영자 연결에서 내 사이보그에게 `unit_enter`를 보내 전송 빠르기가 1배·100배인지 본다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/operatorPace.ts` (새) | 운영자 빠르기 상수(`gateway.ts`에서 옮김)·운영자 모드 판정·표시 달기/되돌리기(`markPace`·`withPace`) |
| `apps/server/src/world/secondMap.ts` | 유닛마다 표시(`setPace`·`paceOf`), `moveUnit`이 표시를 읽음, 지움·넘김에서 표시 지움, 막힌 길 다시 찾기가 빠르기 유지 |
| `apps/server/src/world/gateway.ts` | 이동·멈추기 명령이 표시를 단다(전처럼 그 2차맵 전체 보기 구독 기준). 매개변수로 넘기던 빠르기 지움 |
| `apps/server/src/travel/gateway.ts` | 보내기·멈추기도 표시를 단다(길 빠르기는 전처럼 `speedFactor`로) |
| `apps/server/src/gather/gateway.ts` | 채집·채집 멈추기·들어가기가 표시를 단다(연결의 전체 보기 구독 `observing`) |
| `apps/server/src/labor/gateway.ts` | 직무 배치·풀기·일자리 받기가 표시를 단다(운반꾼이 읽는다) |
| `apps/server/src/gather/station.ts` | 표시가 달린 운반꾼의 나르는 시간 ÷ 배수 |
| `apps/server/src/session.ts` | 채집·노동 연결에 `observing` 넘김 |
| `apps/server/src/app.ts` | 세 게이트웨이에 띄운 2차맵(`maps`) 넘김 |
| `apps/server/src/world/unitKinds.ts`, `e2e/helpers/cyborgTravel.ts` | 상수 자리 주석만 |
| 시험: `world/operatorPace.test.ts`(새), `gather/gateway.test.ts`(새), `world/gateway.test.ts`, `travel/gateway.test.ts`, `labor/gateway.test.ts`, `gather/service.test.ts`, `gather/station.test.ts`, `e2e/operator-speed.spec.ts`(새) | 명령마다 운영자 모드 100배·보통 1배·거절 되돌림·실제 채집 서비스 걸음·운반 시간 |

## 함께 바꿔야 하는 파일
- 유닛을 걷게 하는 새 명령(게이트웨이)을 더하면 `withPace`로 감싼다. 그 명령이 `moveUnit`에 빠르기를 따로 주면 표시를 읽지 않는다(2차맵 사이 이동처럼 길이 자기 빠르기를 들 때만 준다).

## 건드리지 말 것
- 유닛 속도와 표시 종류(`wireKindOf`는 움직임 빠르기를 보지 않는다 — 앞 고침 `12-1310-unit-looks.md`).
- 기기는 빠르기를 보내지 않는다(서버 권위).

## 미검증·TODO·알려진 문제
- `pnpm check`(DB 시험 포함, `TEST_DATABASE_URL`): 통과 — 660 파일, 5,030 시험(**Verified**: 실행). `pnpm check:docs origin/main` 통과. `apps/game`은 바꾸지 않아 빌드·`check-pwa`·`check:bundle`은 따로 돌리지 않았다(화면 시험 전역 준비가 빌드했다).
- 화면 시험(`operator-speed.spec`·`unit-control.spec`·`gather-station.spec`·`unit-looks.spec`, 36개): 34 통과, 2 실패(**Verified**: 실행, 37.8분 — 여러 줄기가 한 기계를 나눠 쓰는 중). 새 `operator-speed.spec`(보통 연결 들어가기 = 기본 빠르기, 운영자 연결 = 100배) 통과. 실패 둘은 플레이어(운영자 모드 아님) 흐름의 화면 기다림이다: `unit-control.spec.ts:212`는 [멈추기] 단추가 다시 그려져 누르기가 120초를 넘었고, `:352`는 view_only를 찾는 되풀이가 90초를 넘었다. 플레이어 명령은 운영자 표시를 달지 않으므로(지우기만) 이 고침과 상관없다고 본다(**Assumed**). 두 시험만 따로 다시 돌린 결과는 아래 줄.
- 운영자 모드 판정은 명령마다 본다(역할은 연결의 로그인 캐시, 전체 보기는 구독 상태). 운영자가 남의 유닛에 채집·들어가기를 시킬 수는 없다(채집 서비스 소유 판정 그대로, **Verified**: 코드).
- 휴대폰에서 직접 눌러 보지 않았다(**Unknown**).

## 사용자 결정 대기
- 질문 1246(일하는 시간도 줄일까), 1247(운반 시간), 1248(표시가 남는 범위).
