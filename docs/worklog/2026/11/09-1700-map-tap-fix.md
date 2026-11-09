# 2차맵 남의 유닛 누르기 → 정보 판, [옆 2차맵으로]·[시험 일꾼 받기]·탐사 없음 안내 지움

- 일시: 2026-11-09 17:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-unit-control.md` "바뀜 (2026-11-09)"(새 절, 상태 줄에 한 마디), `docs/PLAN.md` WP14 줄에 바뀜 한 마디, 가지 `work/map-tap-fix`(main `5df3547`에서)

## 한 일
사용자 지적(2026-11-09, NAS 휴대폰 main `4e491c5`, 2차맵, 플레이어 계정, 사진: 안내 줄 "임시 국가 16의 휴먼 Ambrose Mere(이동 중)입니다. 정보만 볼 수 있습니다.").

1. **남의 유닛을 누르면 정보 판** — 원문: "이동하려는데 다른 유닛이 선택되는문제. 다시 이동하려면 내유닛이 아니라 이동안됨. 애초에 다른 유닛을 이동시키는 기능은 없음. 다른 유닛 눌려지면 상호작용 메뉴가 나오거나 다른곳을 눌러 저절로 닫히게 해야함"
   - 까닭(Verified: 코드): 엔진은 누른 곳 화면 거리 22px(+ 몸 크기) 안의 유닛을 먼저 고르고(`unitRoster.pick`), 화면(`selectFromMapRef`)은 그 유닛을 고른 유닛(`selectedRef`)으로 바꿨다. 땅 누르기는 고른 유닛에 이동을 보내므로 남의 유닛이면 `view_only`("내 유닛만 움직일 수 있습니다")로 막혔다. 고르기를 되돌리는 길은 [내 유닛으로]·목록뿐이었다.
   - 고침: 플레이어가 남의 유닛을 누르면(지도 유닛·지도자 이름표·근처 판 유닛 탭 남의 줄) 고르지 않는다 — 엔진 `onSelect`가 `false`를 돌려주면 고른 표시를 옮기지 않고(엔진 API 한 줄), 화면은 아래 판 자리에 정보 판(`PeekCard`: 이름·주인·움직임, "땅을 누르면 닫고 내 유닛을 보낸다", [닫기])을 연다. 지도자면 지도자 몫(지도자와 이야기)이 판 안(`LeaderSheet embedded`). 아래 판 하나 규칙에 정보 판을 넣었다(건물 > 정보 > 내 유닛 목록 > 근처). 운영자 모드는 그대로 고른다. 고른 유닛이 늘 내 유닛이라 [내 유닛으로]를 지웠다.
   - **닫는 누르기 = 이동(결정)**: 판이 열린 채 땅을 누르면 판이 닫히고 같은 누르기로 명령 유닛이 간다(이웃 땅이면 옆 2차맵으로). 사용자는 움직이려다 남의 유닛을 눌렀으므로 한 번 더 누르게 하지 않는다. 판만 닫으려면 [닫기].
   - 누르는 반경은 고치지 않았다: 잘못 눌러도 정보 판이 뜰 뿐이고 다음 땅 누르기가 닫고 보낸다. 남의 유닛만 반경을 줄이려면 엔진 명단에 유닛마다 구분이 필요해 이번에는 하지 않았다.
2. **[옆 2차맵으로] 판을 지움** — 원문(조정 세션 전달): "옆2차맵으로 이동 없애라 그냥 걸어가는거지." EdgeTravel 판(변 넷 [보내기]·[1차맵에서 고르기]·[닫기])·변 화살표·유닛 이름표, 문구 `map_edge_*`, CSS, 단위 시험(`edgeTravelData.test.ts`), 화면 시험(`map-travel.spec.ts`)을 지웠다. 그려 둔 이웃 땅을 누르면 걸어가 넘는 길(`neighbourTravel.ts`, `travel_start`)·로딩 없는 이동·가는 중 줄(`TravelLine`)·고른 유닛 [멈추기](`stop_unit` — 서버가 2차맵 사이 이동을 "길에서 벗어남"으로 끝낸다, `gateway.ts` 주석 Verified)는 그대로다. 1차맵에서 보내는 길은 다른 줄기(planet-travel) 몫이라 1차맵 파일은 건드리지 않았다.
3. **[시험 일꾼 받기] 단추를 지움** — 원문(조정 세션 전달): "시험일꾼받기 기능 없애라". 단추·기기 보내기(`mapFeed.devSpawn`, `onDevSpawn`, 화면의 안내 상태)·문구 `map_vision_spawn*`를 지웠다. 서버 `dev_spawn_units` 처리·프로토콜 메시지는 남겼다(지우려면 프로토콜 판 올림). 시험 일꾼이 필요한 화면 시험(`units`·`inventory`·`equip-stats`)은 그 명령을 WebSocket으로 바로 보내는 도우미(`e2e/helpers/wsCommands.ts` — `labor.spec.ts`의 `sendCommands`·`cyborgMapKey`를 옮김 + `devSpawnUnits`)를 쓴다. `vision.spec.ts`는 단추 없이 내 사이보그로 본다.
4. **seamless 화면 시험 실패(7cf9ebe부터)** — `seamless.spec.ts` "변 가까이 … 넘는다"가 넘은 직후 `.map-notice` 0개 확인에서 실패했다(앞 줄기 기록). 떠 있던 판 = "탐사한 곳이 없어 어둡다"(`dark = feed.explored === 0`).
   - 판단: 앱 버그. 이 안내는 "유닛도 탐사한 곳도 없는 계정"용인데, 내 유닛이 없는 2차맵은 들어갈 수 없게 된 뒤(seamless WP-1 Q3 — 그때는 "들어갈 수 없음" 안내) 남은 경우는 처음 가는 옆 2차맵에 넘은 직후뿐이다: 서버 탐사 기록은 내 유닛 시야로 시야 틱(1초)마다 채워지고, 넘은 직후 새 2차맵 vision은 아직 0칸일 수 있다(Assumed: 서버 `vision.ts` 머리 주석·`VISION_TICK_MS` 읽음 — 실제 넘기는 재지 않음). 플레이어에게도 "유닛이 없다"는 틀린 말이 잠깐 뜬다. 시험에서는 서버의 사이보그가 넘지 않아 계속 0칸이라 늘 떴다.
   - 고침: 안내·문구 `map_dark_*`·CSS(`.map-dark`)와 그 상태를 일부러 만든 시험(`vision.spec.ts` 탐사 없음)을 지웠다. 따로 커밋.
   - 같이 찾은 시험 섞임: 같은 파일의 "옆 2차맵 땅 누르기" 시험이 player 사이보그를 서버에서 실제로 보내 두고 끝나, 뒤에 도는 `unit-control.spec.ts`(같은 사이보그를 2차맵 안에서 움직임)가 가는 중인 사이보그로 실패했다(Verified: 실패 사진 "내 사이보그가 가는 중: 2차맵 1/2"). 시험 끝에 `travel_cancel`을 보낸다(`sendCommands`가 `travel_result`도 기다리게).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/secondMapEngine.ts`, `engineTypes.ts` | `onSelect`가 `false`면 고른 표시를 옮기지 않음 |
| `apps/game/src/map/anchorUnit.ts`·`.test.ts` | `unitTapOf`(고르기·정보 판), `bottomSheetOf`에 정보 판 |
| `apps/game/src/map/useBottomSheet.ts` | 정보 판 상태·여닫기(늘 같은 함수), 다른 판과 서로 닫기 |
| `apps/game/src/map/useMapEngine.ts` | 땅·이웃 땅 누르기가 정보 판을 먼저 닫음 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 남의 유닛 → 정보 판, [내 유닛으로]·EdgeTravel·시험 일꾼·탐사 없음 안내 지움(660 → 636줄) |
| `apps/game/src/map/UnitControlPanels.tsx`, `unitControl.css` | `PeekCard`, `SelectedActions`는 [멈추기]만, `OperatorActions`에서 시험 일꾼 |
| `apps/game/src/map/mapUnits.ts`·`.test.ts` | `peekText`(정보 판 이름·주인·움직임) |
| `apps/game/src/government/LeaderSheet.tsx` | `embedded`(정보 판 안의 지도자 몫, h3) |
| `apps/game/src/map/EdgeTravel.tsx`, `edgeTravelData.ts`·`.test.ts`, `edgeTravelOverlay.ts`, `edgeTravel.css` | 지움 |
| `apps/game/src/map/mapFeed.ts`·`.test.ts`, `feedTypes.ts`, `feedTestSupport.ts`, `mapSession.ts` | 시험 일꾼 보내기 지움 |
| `apps/game/src/map/SecondMapNotices.tsx`, `map.css` | 탐사 없음 안내 지움 |
| `apps/game/src/map/travelCommands.ts`, `travelData.ts`, `start/cyborgGate.ts` | 주석 |
| `apps/game/messages/{ko,en}.json` | `map_peek_*` 4개 더함. `map_back_to_anchor`·`map_edge_*` 20개·`map_vision_spawn*` 3개·`map_dark_*` 3개 지움 |
| `e2e/unit-control.spec.ts` | 옛 "남의 유닛은 정보만, 땅은 view_only" → 새 규칙 시험 둘(근처 판으로 정보 판 → 땅 = 닫고 내 사이보그 `move_unit` / 지도 가운데 누르기로 정보 판, 이 맵에 내 유닛 없음 → 닫고 보내지 않음) + 정보 판 사진 390 × 파스텔·다크 × 한국어·영어 |
| `e2e/control-move3.spec.ts`, `e2e/government.spec.ts` | 남의 유닛 한눈 정보·지도자 판을 정보 판 안에서 봄 |
| `e2e/map-travel.spec.ts` | 지움(옆 2차맵으로 판 시험) |
| `e2e/helpers/wsCommands.ts`(새), `e2e/labor.spec.ts`, `units`·`inventory`·`equip-stats`·`vision`·`first-login`·`seamless` `.spec.ts` | 시험 일꾼 = WebSocket 명령, 단추·탐사 없음 확인 지움, seamless 끝에 `travel_cancel` |
| `docs/adr/2026-11-07-unit-control.md`, `docs/PLAN.md` | 바뀜 |

## 함께 바꿔야 하는 파일
- 아래 판 자리에 새 판을 더하면 `anchorUnit.ts bottomSheetOf`와 `useBottomSheet.ts`에(정보 판도 여기서 서로 닫는다).
- 엔진 `onSelect`를 쓰는 곳이 새로 생기면 반환값(`false` = 고르지 않음)을 정한다.
- 서버 `dev_spawn_units`를 지우면 프로토콜 판을 올리고 `e2e/helpers/wsCommands.ts devSpawnUnits`·`labor.spec.ts`를 바꾼다.

## 건드리지 말 것
- 1차맵 파일(`PlanetMapScreen.tsx`·`PlanetCommandPanel.tsx` 등) — planet-travel 줄기.
- 최대 확대 시작·아래 판 하나 규칙(어제 줄기)은 그대로다.

## 미검증·TODO·알려진 문제
- 실제 휴대폰(NAS)에서는 보지 않았다(헤드리스 Chromium 390×844만).
- 넘은 직후 탐사 없음 안내가 실제 플레이에서 떴다는 것은 코드 읽기로 정한 것이다(Assumed). 지운 뒤에는 볼 수 없다.
- 정보 판의 "이동 중/서 있음"은 누른 때 값이다(판이 열린 동안 바뀌지 않는다).
- 남의 유닛만 누르는 반경을 줄이는 것(빗나간 누르기가 땅이 되게)은 하지 않았다.
- 2차맵 사이 이동 중인 내 사이보그를 고르면 [멈추기] 단추가 계속 다시 그려져(사라졌다 나타남) 누르기 어려웠다(Verified: 실패한 시험 기록 "element was detached from the DOM, retrying" — 사이보그가 seamless 시험에서 보내져 가는 중이었다). 까닭은 재지 않았다(Unknown, 가는 동안 `moving`이 1초마다 바뀌는 것으로 보임 — Assumed). 다음 줄기 후보.
- 서버 `dev_spawn_units` 처리·프로토콜 메시지는 남아 있다(다음 프로토콜 판 올림 때 정리 후보).
- `SecondaryMapScreen.tsx`는 아직 600줄 경고 위다.

## 검사
- 단위 시험: `src/map`·`src/government` 32파일 216개 통과(Verified, 시험 일꾼 지운 뒤). 새 시험: `anchorUnit.test.ts`(정보 판 차례·`unitTapOf`), `mapUnits.test.ts`(`peekText`).
- 화면 시험(Playwright, 헤드리스 Chromium SwiftShader, 390×844):
  - 1차: `seamless` 4개 전부 통과(넘은 직후 `.map-notice` 0개 포함 — 7cf9ebe부터 실패하던 것), `unit-control` 19개 중 18개 통과. 실패 1개 = 이동·[멈추기] 시험: 앞서 돈 seamless "옆 2차맵 땅 누르기"가 사이보그를 서버에서 보내 둔 탓(위 4) → seamless 끝에 `travel_cancel`.
  - 2차(12파일 126개: seamless·unit-control·play-map·map-input·control-move3·government·vision·units·inventory·equip-stats·labor·first-login): 119 통과·1 건너뜀·6 실패. 실패 까닭: control-move3 636 나(최대 확대에서 가운데에 유닛 없음 → 시험 고침), government 지도자 사진 1개(이름표 아래 걷는 휴먼이 먼저 눌림 → 다시 누르기), units 플레이어 2개(같은 실행에서 government 시험이 player에게 휴먼을 고용시킨 뒤라 "유닛 0" 가정이 깨짐 — 시험 차례 탓, 이 줄기와 무관), vision dev 1개(복귀 요약 대화상자가 가림 → 요약 숨김), vision "경계 너머 보기"(아래).
  - 3차(고친 시험만, 새 DB): control-move3 636·government 지도자 4·units 4·vision dev 5 — 14 통과·1 건너뜀(측정)·1 실패 = vision "경계 너머 보기": 이웃 8장을 그리며 2 fps(p95 450ms, SwiftShader)라 끌기 `mouse.move`가 120초를 넘는다. 이 줄기가 고치지 않은 화면(운영자 자유 시점 끌기)이고 main에서 도는지는 재지 않았다(Unknown).
  - unit-control·seamless·play-map·map-input 전체는 2차 실행에서 모두 통과(Verified).
- `pnpm check`(TEST_DATABASE_URL 있음): 통과 — 560파일 4,251개 시험, 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠(Verified).
- 빌드(마지막 앱 코드 `2d7c06a` 위): `pnpm build`·`node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 107,232 B / 상한 131,416 B(Verified). `pnpm check:docs origin/main` 통과.
- 사진(세션 임시 폴더, 저장소 밖): 정보 판 390 파스텔 한국어·영어, 다크 한국어 — 눈으로 확인: 판 하나, 긴 영어 안내 줄바꿈, [닫기] 누름 크기, 전환 단추와 겹침 없음.

## 사용자 결정 대기
- 없음
