# 건물 안 유닛 숨김·"안에 N명" 표시·[나가기]

- 일시: 2026-11-15 20:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-gather-objects.md` 5절(건물 들어가기 — "안에 머물기"), 앞 작업 기록 `15-1920-path-teleport-money-ui.md`(원인만 찾았던 것)

## 한 일

사용자 지적(2026-11-15): "유닛이 건물에 들어갔다는데 달라진 기능도 없고 유닛은 밖에 있다".
물음의 답: "숨기고 건물에 표시"(추천안). 들어간 유닛은 지도에서 숨기고, 건물 위에 "안에 N명"을, 건물 판에 [나가기]를 둔다. 기능(화물 넣기·직무 받기)은 그대로다.

- **서버**:
  - `gather.inside {mapKey}` 조회: 그 2차맵에서 들어가기로 머무는 유닛(유닛·건물·내 것인가). 건물 판(`gather.building`)과 같은 범위다(로그인한 사용자, 시야로 거르지 않음 — 그 판이 이미 안의 유닛을 보인다).
  - [나가기] = 기존 멈추기 명령(`gather_stop`). 채집 줄이 없고 안에 머무는 내 유닛이면 머묾을 끝낸다. 프로토콜 판·DB는 그대로다.
- **엔진**: `setHiddenUnits(ids)`. 일하는 유닛 칸 표시(`workingUnits.ts`)에 `HIDDEN_FLAG`(2)를 싣는다. 캐릭터 모델·캡슐·점·나라 고리가 그 칸을 그리지 않는다. 숨긴 칸은 누르기 고르기 너비도 0이다.
- **화면**(`map/gather/insideOverlay.ts`):
  - 4초마다 묻는다. 채집 자료가 바뀌면 0.6초 뒤 한 번 더 묻는다.
  - 숨길 유닛을 엔진에 넘긴다.
  - 건물 위에 이름표 "안에 N명"을 띄운다. 내 유닛이 있으면 주 색 테두리다.
  - 유닛 이름표도 숨긴다(`unitNames.ts` `isHidden`).
  - 건물 판 "안에 있는 유닛" 줄의 내 유닛(들어가기로 머묾)에 [나가기]를 둔다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/shared/src/gather.ts` | `GatherInsideResponse` |
| `apps/server/src/gather/service.ts`·`serviceTypes.ts`·`reads.ts`·`apps/server/src/trpc/gather.ts`(+ `service.test.ts`·`gateway.test.ts`) | `insideOn`·`gather.inside`, 멈추기로 나가기 |
| `packages/engine/src/characters/workingUnits.ts`(+ 시험)·`characterLayer.ts`·`units/unitView.ts`·`units/nationRings.ts`·`secondMapEngine.ts`·`engineTypes.ts`·`engineParts.ts` | 숨김 칸 표시, `setHiddenUnits` |
| `apps/game/src/map/gather/insideOverlay.ts`(새, + 시험)·`gather.css`·`GatherPanel.tsx`·`map/mapSession.ts`·`map/unitNames.ts` | 숨김·이름표·[나가기] |
| `apps/game/messages/{ko,en}.json` | "안에 {count}명"·[나가기] |
| `e2e/building-inside.spec.ts`(새) | 화면 시험 |

## 함께 바꿔야 하는 파일

- 유닛을 그리는 층을 더하면 `HIDDEN_FLAG` 칸을 건너뛰게 한다(지금: 캐릭터·캡슐·점·나라 고리).
- 서버 안에 머묾은 메모리에만 있다. 다시 켜면 모두 나온다(옛 규칙과 같다).

## 건드리지 말 것

- `secondMapEngine.ts` 999줄(1,000줄 상한). 이번에도 API 두 줄을 한 줄 꼴로 줄여 늘리지 않았다.

## 미검증·TODO·알려진 문제

- 건물 종류별 안에서 하는 일(정부 판 바로 열기·숙소 쉬기 등)은 넣지 않았다(사용자 답 범위 밖).
- 다른 사람 유닛도 들어가면 숨긴다. 시야로 거르지 않는다(건물 판과 같은 범위).
- 휴대폰에서 보지 않았다(미검증).

## 검사

- 단위 시험(Verified): 서버 채집 서비스·게이트웨이 11개(안 목록·[나가기]·남의 사용자 거절), 엔진·게임 2차맵 841개(숨김 칸 표시·안 수 세기).
- 화면 시험(Playwright, 헤드리스, dev 운영자 모드, Verified): `building-inside.spec.ts` 통과. [들어가기] → 건물 위 "안에 1명"(내 것) → [나가기] → 표시 사라짐. 사진(390 파스텔)에서 들어간 사이보그가 지도에 없고 농장 위에 "안에 1명"이 보인다.
