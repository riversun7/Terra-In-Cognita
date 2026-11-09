# 2차맵 판 고침: 1차맵 단추 겹침·내 유닛 목록·보낼 유닛 이름·건물 판 하나

- 일시: 2026-11-09 11:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-seamless-second-map.md` "바뀜 3"(새 절), 상태 줄만: `2026-10-29-app-shell.md`(전환 단추 자리 일부 대체)·`2026-11-07-unit-control.md`(내 유닛 목록 다시 둠), 가지 `work/map-panels-fix`(main `7cf9ebe`에서)

## 한 일
사용자 지적(2026-11-09, NAS 휴대폰 사진 2장, 운영자 계정): "문제1. UI가 겹쳐서 1차맵이 닫기를 가린다. 문제2. 내 사이보그가 아니라 보유한 유닛목록을 띄워서 선택하야한다. 내 유닛선택아 아예 사라졌다. 문제3. 사이보그선택상태이나 건물 누르면 고른 유닛1001이라는 이상한 상태이다. 문제4. 하나의 건물 클릭시 여러개가 다 뜬다"

- 까닭부터 화면 시험으로 재현(Verified: 탐색용 임시 시험 사진·판 목록 — 커밋하지 않음):
  - 문제1: 1·2차맵 전환 단추(`shell/overlays.css .map-switch`)가 오른쪽 가운데 고정(층 5)이라 키 큰 아래 판의 탭·[닫기]·글 위에 얹혔다. 근처 목록이 펼쳐질 때 30%로 올리던 `nearby.css :has` 땜질은 탭 줄을 가렸다.
  - 문제2: 앞 줄기(WP-2)가 [내 유닛 N] 목록을 근처 판 유닛 탭으로 합치고 [내 사이보그](사이보그로 가기만)를 남겼다.
  - 문제3: 건물 판이 기준 유닛 번호를 "고른 유닛 {id}"로 썼다(1001 = 그 사이보그 — 시험 계정에서는 "고른 유닛 336" = 사이보그). 안내 줄은 같은 유닛을 목록 이름으로 썼다. 운영자 자유 시점에서는 건물 판이 고른 유닛이 아니라 사이보그를 보냈다.
  - 문제4: 건물 하나를 누르면 근처 판(펼친 목록) + 건물 판 + 행정 건물이면 정부 판 + 채집 줄이 함께 쌓였다.
- 고침:
  - 전환 단추를 오른쪽 위 구석으로(D-6018 "구석에 전환 버튼"), 지도 위 판 줄(`.map-hud-top`, 2차맵·1차맵·맵 고르기 화면)이 `--map-switch-width` + 간격만큼 오른쪽을 비운다. `:has` 땜질·탐사 없음 알림의 오른쪽 여백을 지웠다.
  - [내 사이보그] 자리에 [내 유닛 N] → 이 2차맵의 내 유닛 목록(옛 `MyUnitsPanel` 모양 되살림, 637 나 차례 — 사이보그 본체 첫 줄, 끝에 "다른 곳에 내 유닛 N", 부상 남은 시간). 줄을 누르면 고르고 카메라가 따라가고 좁은 화면이면 접는다. 근처 판 유닛 탭은 그대로.
  - 명령 유닛 하나 `commandUnit`(안내 줄의 고른 유닛을 다룰 수 있으면 그 유닛, 남의 유닛이면 기준 유닛, 없으면 사이보그)을 건물 판 "보낼 유닛"·채집 줄·[옆 2차맵으로]가 쓴다. 이름은 안내 줄과 같은 `unitLabel`(목록 이름, 없으면 "유닛 #N"). 문구 `gather_actor_unit`("보낼 유닛: {unit}"), 채집 줄 머리도 같은 이름.
  - 아래 판 자리 하나 `bottomSheetOf`/`useBottomSheet`: 건물·오브젝트 판 > 내 유닛 목록 > 근처 판. 다른 판이 쓰는 동안 근처 판은 숨고(지도 표시는 남음) [근처] 단추로 다시 연다(건물 판·목록을 닫는다). 행정 건물의 정부 몫은 건물 판 안(`GovernmentSheet embedded`, h3). 건물 판이 열린 동안 채집 줄·지도자 판을 숨긴다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/shell/overlays.css` | 전환 단추 오른쪽 위 구석, 너비 `--map-switch-width` |
| `apps/game/src/map/map.css` | 위 판 줄이 전환 단추 자리를 비움, 탐사 없음 알림 여백 |
| `apps/game/src/map/nearby/nearby.css` | 30% 땜질 지움 |
| `apps/game/src/map/nearby/NearbyPanel.tsx` | [근처] 단추가 화면의 여는 함수를 받음 |
| `apps/game/src/map/UnitControlPanels.tsx`, `unitControl.css` | [내 유닛 N]·내 유닛 목록 되살림 |
| `apps/game/src/map/SecondMapTravel.tsx` | [내 사이보그] → [내 유닛 N] 자리 |
| `apps/game/src/map/anchorUnit.ts`·`.test.ts` | `commandUnit`·`bottomSheetOf`와 시험 |
| `apps/game/src/map/useBottomSheet.ts`(새) | 아래 판 자리 하나(목록 여닫기, 건물 판·근처 목록과 서로 닫기) |
| `apps/game/src/map/mapUnits.ts`·`.test.ts` | `unitLabel`과 시험 |
| `apps/game/src/map/gather/GatherPanel.tsx` | 명령 유닛·이름을 받음, 정부 몫을 건물 판 안에, 판이 열리면 채집 줄 숨김 |
| `apps/game/src/government/GovernmentSheet.tsx`, `government.css` | `embedded`(건물 판 안의 몫) |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 위 연결, `goToCyborg` 지움 |
| `apps/game/src/map/EdgeTravel.tsx` | 주석(전환 단추 자리) |
| `apps/game/messages/{ko,en}.json` | `map_units_*` 6개 되살림, `gather_actor_unit`, 쓰지 않는 `gather_actor_selected`·`gather_actor_cyborg`·`gather_loop_unit` 지움 |
| `e2e/unit-control.spec.ts` | 새 시험: 목록으로 고르기·건물 판 하나·보낼 유닛 = 안내 줄·전환 단추 겹침(390 × 파스텔·다크 × 한국어·영어, 넓은 화면, 운영자 영어) |
| `e2e/play-map.spec.ts`, `e2e/government.spec.ts` | [내 사이보그] → [내 유닛 N] 목록, 정부 몫이 건물 판 안 |
| ADR 3개 | 위 "관련" |

## 함께 바꿔야 하는 파일
- 전환 단추 너비(`overlays.css --map-switch-width`)를 바꾸면 위 판 줄의 비움(`map.css .map-hud-top`)이 그대로 따라간다. 단추 글이 길어지면(영어 "World Map") 두 줄로 접힌다.
- 아래 판 자리에 새 판을 더하면 `anchorUnit.ts bottomSheetOf`와 `useBottomSheet.ts`에 넣는다(아니면 다시 쌓인다).

## 건드리지 말 것
- 근처 판 유닛 탭(내 유닛 + 시야 안 유닛)과 지도 표시 규칙(`gatherOverlay.ts`·`nearbyRows.ts`)은 그대로다. 고정 카메라·이웃 안개·로딩 없는 이동도 그대로.
- 지도 입력 제안 ADR(다른 세션이 고치는 중)의 상태는 바꾸지 않았다.

## 미검증·TODO·알려진 문제
- 실제 휴대폰(NAS)에서는 보지 않았다(미실행). 헤드리스 Chromium 390×844·1440×900만.
- `SecondaryMapScreen.tsx` 635줄(600줄 경고, 앞 603줄 — 목록 연결로 늘었다. 아래 판 자리는 `useBottomSheet.ts`로 뺐다).
- 넓은 화면에서도 건물 판이 열리면 근처 목록이 숨는다(옛: 함께 펼침). 건물 판의 채집 줄 [멈추기]는 판을 닫으면 보인다.
- 건물 판 글이 길면(채집소 판) 45vh 안에서 넘겨야 "보낼 유닛"·[들어가기]가 보인다(전과 같음).

## 검사
(아래에 채운다)

## 사용자 결정 대기
- 없음
