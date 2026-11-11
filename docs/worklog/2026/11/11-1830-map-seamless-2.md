# 걸어서 2차맵 넘기를 끊김 없이(확대 그대로·안내 없음·유닛·건물 이어 보이기) + 빌드 차례 번호

- 일시: 2026-11-11 18:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-seamless-second-map.md` "바뀜 (2026-11-11, 걸어서 넘기를 끊김 없이)", 질문 `docs/questions/2026-11-11-map-seamless-2.md`(976~980), 앞 작업 기록 `docs/worklog/2026/11/08-2230-seamless-second-map.md`·`10-2230-map-tap-2.md`, 가지 `work/map-seamless-2`(main `8370909`에서)

## 한 일
사용자 지적(2026-11-11, NAS 휴대폰, 원문): "5.깜빡이진 않으나 미세한 화면전환의 흔적 근처에서 미리 불러와 완전히 자연스럽게 연결될순 없는지?", "개선1. 운영자모드에서 다음 맵으로 이동시 확대배율이 유지되게.", "2.확인되나 빌드번호가 직관적이지 않은 무작위수같다. 순차적으로 증가하는형태가 좋을듯".

### 1. "흔적"이 무엇인지 쟀다
- 재는 길: 주소 `?map-probe=1`이면 엔진이 그리는 프레임마다 한 줄(2차맵·유닛 수·고른 유닛·확대 단계·카메라 거리·따라가는 유닛의 화면 자리·나무 수·안내 판·HUD 글)과 넘기 신호를 `window.terraMapProbe`에 적는다(`apps/game/src/map/mapProbe.ts`). 화면 시험 `e2e/seamless.spec.ts` "걸어서 넘기"가 dev 사이보그를 운영자 빠르기로 변 앞에 세운 뒤 **걷는 빠르기로 진짜 넘기고** 넘는 앞 1.5초 ~ 뒤 3초를 본다.
- 고치기 전(main `8370909` + 기록만 붙인 빌드) — **Verified(실행)**, 헤드리스 Chromium(SwiftShader) 390×844 픽셀 비율 1, 약 10fps. 휴대폰 값이 아니다.

| 본 것 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 확대 단계(4/5에서 넘음) | 4 → 5(카메라 거리 307.8m → 118.9m) | 4 그대로 |
| 지도 위 안내 판 | 1개("넘어가는 중") | 0 |
| 떠나온 2차맵으로 되돌아갔다 다시 넘기 | 있음(구독 차례: 지금 → 옆 → 옆 → 지금 → **지금 → 옆 → 옆 → 지금**) | 없음 |
| 엔진 유닛 수 | 0 ~ 32 | 32 ~ 32 |
| 따라가는 유닛이 엔진에 없는 프레임 | 47 가운데 5 | 42 가운데 0 |
| 따라가는 유닛의 화면 자리가 한 프레임에 튄 거리 | 16.3px | 0.4px |
| 고른 유닛이 풀린 프레임 | 14 | 0 |
| HUD 글(안내 줄·[내 유닛 N]·확대 사다리) | 4가지(픽셀 비율 2로 잰 때는 5가지 — "유닛을 누르거나 내 유닛 목록에서 고르세요"·"내 유닛 0"까지) | 1가지 |
| 넘는 동안 보낸 구독 | 6번 | 1번(볼 수 없어 거절됐던 옆 2차맵을 다시 구독) |
| 지형 파일 받기 | 넘은 2차맵 3번·떠나온 2차맵 2번 | 2차맵마다 1번 |
| 나무 수 | 242 ~ 503 | 517 ~ 520 |
| 가장 긴 프레임(넘는 앞뒤 4.5초) | 150ms | 133ms(헤드리스·공유 기계라 견줄 값이 못 된다 — 앞 실행은 233ms) |

- 고친 뒤 실행(마지막, 커밋 `719aada`)에서 옆 2차맵은 처음에 "서버가 띄우지 않음"이었다: 사이보그가 변에서 사라지자 다시 구독했고(0.24초 뒤 열림 — 목적지라 서버가 띄웠다), 그 흐름에 사이보그가 보이자 넘었다(기록: `gone … (not loaded: asking again)` → `opened` → `cross … carried=true`).
- 운영자 100배(같은 시험 4단계, 옆 2차맵 ↔ 처음 2차맵 세 번, 5.9초): 넘기 3번 모두 화면 안에서, 안내 0, 확대 4 그대로, 유닛 수 32 ~ 32, 따라가는 유닛이 없는 프레임 0, 고른 유닛이 풀린 프레임 0, **새 구독 0번·지형 받기 0번**(두 2차맵 흐름을 그대로 썼다). 따라가는 유닛의 화면 자리는 한 프레임에 많아야 152px 움직였다 — 100배(초당 약 42칸)로 달리는 유닛을 카메라가 0.16초 늦게 따라붙기 때문이다(넘기와 상관없다, Assumed: 걷는 넘기에서는 0.4px).
- 찾은 까닭(Verified: 위 기록 + 코드):
  1. **되돌아가기** — 가장 큰 흔적. 화면이 이웃 구독으로 곧바로 넘은 뒤, 5초마다 묻는 길 조회의 옛 답("아직 앞 2차맵")을 보고 0.9초 뒤 떠나온 2차맵으로 다시 넘겼다. 다음 답이 오면 또 넘는다. 그때마다 "넘어가는 중" 안내, 유닛 비움, 확대 당김이 되풀이됐다.
  2. 넘을 때 5/5로 당김(2026-11-09 "진입마다 최대 확대"를 걸어서 넘기에도 걸었다).
  3. 넘을 때 구독을 모두 풀고 다시 걸었다 → 새 스냅샷이 올 때까지 유닛이 비고 고른 유닛·따라가기가 풀렸다. 내 유닛 목록(5초 조회)도 비워 이름이 "유닛 #336"으로, [내 유닛 N]이 수 없이 보였다.
  4. 새 2차맵 지형 파일이 오면 지형을 다시 만들었다(칸 크기·높이 밝기가 그 2차맵 값으로 바뀜). 나무 자리 소금이 "지금 2차맵 0·이웃 차례"라 넘는 순간 숲이 다시 섞였다(Verified: 코드. 숲 사진으로는 견주지 않았다).
  5. 서버가 유닛을 옆 2차맵 첫 칸에 세운다(한 칸 약 6m 건너뜀 + 다음 길을 찾을 때까지 섬) — 화면 자리 16px 튐의 몫.

### 2. 고친 것(규칙은 ADR "바뀜 (2026-11-11)")
- **확대**: 화면을 열 때만 5/5. 걸어서 넘으면 그대로(플레이어·운영자).
- **안내 없음**: "넘어가는 중" 판·0.9초 기다림·메시지 `map_travel_crossing`을 지웠다. 길 조회 답은 화면이 스스로 넘은 뒤에 물은 것만 넘기 신호로 쓴다(되돌아가기 고침).
- **자료 흐름 모음**(`mapFeedPool.ts`): 구독한 2차맵마다 자료 받기를 살려 두고 넘을 때 받는 쪽만 바꾼다. 넘기는 한 작업 안에서 끝난다(엔진 rebase → 앞 모음 멈춤 → 새 모음 켬 → 다시 고르기). 운영자 모드도 이웃을 전체 보기로 붙인다.
- **따라가는 유닛 잇기**(`unitMerge.ts`·`unitBlend.ts`): 사라지면 걷던 쪽으로 걷는 남은 그림, 넘은 뒤 5초는 새 경로를 보이던 자리에서 잇는다.
- **엔진**: 같은 지형 자료면 다시 만들지 않음, 나무 소금 = 2차맵 이름, 보기 범위·누른 목적지 고리를 새 틀로, 빛 다시 잡지 않음.
- **미리 받기**: 멀리 보면 받기 시작하는 거리를 넓힘(카메라 거리 × 2.5, 변의 20~45%), 따라가는 유닛의 길이 변에서 끝나면·옆 2차맵 땅을 눌러 보내면·가는 길의 다음 2차맵이면 바로 받음. 지형이 아직 없으면 4초까지 기다렸다 넘음.
- **옆 2차맵 건물**(`buildingMerge.ts`): 지금 틀로 옮겨 함께 그린다. 겉모습은 2차맵마다 기억(넘은 직후 바로 붙는다).
- **띄우지 않은 옆 2차맵**: 유닛이 변에서 사라졌는데 그 이웃이 "서버가 띄우지 않음"이었으면 다시 구독해 보고, 열리면 넘고 아니면 넘지 않는다(건너뛰는 중). 재다가 찾았다: 운영자 100배로 두 장 너머에 보내자 가운데 2차맵(띄우지 않음)으로 화면이 넘어가 "이 2차맵은 아직 열려 있지 않습니다" 안내가 떴다(고치기 전 코드도 같은 길이다 — Verified: 코드).
- **HUD**: 넘은 직후 내 유닛 목록은 새 답이 올 때까지 앞 답을 이름·개수에만 쓴다. 고른 유닛이 잠깐 엔진에 없어도 4초는 고른 채로.

### 3. 빌드 차례 번호
- CI가 이미지에 `APP_BUILD_NUMBER`(= GitHub Actions `ci` 워크플로 실행 번호 `GITHUB_RUN_NUMBER`)를 함께 넣고, 게임 앱이 `__APP_BUILD_NUMBER__`로 받아 설정 → 앱 정보에 **"빌드 307 (8370909)"**처럼 보인다(번호 먼저, 괄호 안은 커밋 앞 7자). 개발 실행·손으로 만든 이미지는 번호가 없어 앞처럼 "빌드 dev".
- **번호가 느는 법**: `ci` 워크플로가 돌 때마다 1씩 는다. main 푸시마다 한 번 돌므로 배포되는 빌드의 번호는 늘 커진다. 다만 **문서만 바꾼 푸시·PR 검사·수동 실행도 번호를 하나씩 쓰고 배포는 하지 않는다** → 기기에 보이는 번호가 1씩 이어지지는 않는다(예: 307 다음 배포가 311). 같은 실행을 다시 돌리면(Re-run) 번호는 그대로다(Assumed: GitHub Actions 문서의 `run_number` 뜻 — 이 저장소에서 실행해 보지 않았다).
- `__APP_BUILD__`(커밋 앞 12자)는 그대로다: 접속 인사 `clientBuild`·성능 보고·GPU 벤치가 쓴다. 서버·배포 점검(`ops/smoke.mjs`)·PWA 갱신 규칙은 빌드 글을 견주지 않는다(Verified: 찾아봄 — `APP_BUILD`를 읽는 곳은 `Dockerfile`·`apps/game/vite.config.ts`뿐).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/map/mapFeedPool.ts`·`.test.ts`(새) | 2차맵 자료 흐름 모음: 흐름을 살려 두고 받는 쪽만 바꿈, 지형 파일 한 번만 받기 |
| `apps/game/src/map/mapSession.ts` | 모음을 흐름 모음 위에: 넘겨받기(handover), 이웃 흐름 붙이기(유닛·건물·안개·넘기 신호), 미리 받기(가는 쪽·prefetch) |
| `apps/game/src/map/unitMerge.ts`·`.test.ts` | 옆 유닛을 엔진 값으로 합침, 따라가는 유닛 남은 그림·잇기·넘겨주기, 엔진 상한 |
| `apps/game/src/map/unitBlend.ts`·`.test.ts`(새) | 경로·점을 놓는 자리로 옮기기, 보이던 자리에서 잇기(순수 계산) |
| `apps/game/src/map/buildingMerge.ts`·`.test.ts`(새) | 옆 2차맵 건물 바닥을 지금 틀로, 지금 2차맵 건물과 합침 |
| `apps/game/src/map/buildingLooks.ts`·`.test.ts` | 2차맵마다 겉모습 기억(`cachedLooks`), 옆 2차맵 것 한 번 받기(`prefetchLooks`) |
| `apps/game/src/map/neighbourVision.ts`·`.test.ts`(지움) | 흐름 모음으로 바꿈 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 흐름 모음·한 작업 안 넘기(`crossRef`), 확대 그대로, 안내 판 뺌, 넘은 직후 앞 목록 쓰기, 지형 기다리기 |
| `apps/game/src/map/useMapEngine.ts` | `zoomToClosest` 지움, 넘을 때 빛 다시 잡지 않음, 프레임 기록 달기, 고른 유닛 잠깐 붙잡기 |
| `apps/game/src/map/useCyborgTravel.ts`, `SecondMapTravel.tsx` | 길 조회 옛 답 거르기·기다림 없앰, `CrossingNotice` 지움 |
| `apps/game/src/map/anchorUnit.ts`·`.test.ts` | `heldSelection`(고른 유닛 붙잡는 시간) |
| `apps/game/src/map/useCameraArea.ts` | 넘은 직후 범위 그대로 두기(hold) |
| `apps/game/src/map/secondMapNeighbours.ts`·`secondMapNeighbourLoader.ts`·시험 | `nearMarginM`(멀리 보면 넓힘), `want`(가는 쪽 받기), 처음 알림 |
| `apps/game/src/map/neighbourTravel.ts` | 옆 2차맵 땅을 눌러 보내면 그 2차맵을 바로 받기 |
| `apps/game/src/map/mapProbe.ts`(새) | [시험용] 프레임 기록(`?map-probe=1`) |
| `packages/engine/src/secondMapEngine.ts`, `engineTypes.ts` | rebase: 보기 범위·목적지 고리 옮김, 누르기 높이 범위, 같은 지형이면 다시 만들지 않음, 밝기 범위 이어 쓰기, 옆 2차맵 건물 누르기 = 옆 땅 |
| `packages/engine/src/props/propLook.ts`·`propView.ts`·시험 | `propSalt`(2차맵 이름), 이웃 돌림 더하기, 옆 2차맵 건물 판 안에 나무 세우지 않기 |
| `packages/engine/src/buildings/footprint.ts`·시험 | `footprintOutsideCells`·`outsideCellKey` |
| `packages/engine/src/terrain/terrainData.ts`·시험, `units/routePath.ts`·시험, `index.ts` | `heightRangeM`, 목적지 `shift`, `invertPlacement` 내보내기 |
| `.github/workflows/ci.yml`, `Dockerfile`, `apps/game/vite.config.ts`, `apps/game/src/env.d.ts`, `.oxlintrc.json` | 빌드 차례 번호(`APP_BUILD_NUMBER` → `__APP_BUILD_NUMBER__`) |
| `apps/game/src/settings/buildInfo.ts`·`.test.ts`(새), `SettingsPage.tsx` | "빌드 307 (8370909)" 글 |
| `apps/game/messages/ko.json`·`en.json` | `settings_about_build_numbered` 더함, `settings_about_hint`에 "번호가 클수록 새 버전", `map_travel_crossing` 지움 |
| `e2e/seamless.spec.ts`, `e2e/shell.spec.ts` | 걸어서 넘기 시험(프레임 기록), 넘어도 4/5·다시 구독 없음, 빌드 글 |
| `docs/adr/2026-11-08-seamless-second-map.md`, `docs/questions/2026-11-11-map-seamless-2.md` | 바뀜 절, 질문 976~980 |

## 함께 바꿔야 하는 파일
- 넘을 때 엔진에 넣는 차례를 바꾸면: `SecondaryMapScreen.tsx` `crossRef` ↔ `mapSession.ts`(시작 차례: 유닛 합치기 → 이어 보일 유닛 → 지금 2차맵 흐름 붙이기 → 이웃 흐름) ↔ `unitMerge.ts`.
- 서버 한 연결 구독 상한(`apps/server/src/world/gateway.ts` `MAX_MAPS_PER_SOCKET` 4)을 바꾸면 `mapFeedPool.ts` `MAX_CHANNELS`·`mapSession.ts` `MAX_NEIGHBOUR_CHANNELS`.
- 서버가 넘는 유닛을 세우는 자리(`apps/server/src/travel/service.ts` `cross`·`route.ts` `entryOf`)를 바꾸면 `unitBlend.ts` `BLEND_MAX_CELLS`(3칸)·`unitMerge.ts` `GHOST_CELLS`.
- 빌드 번호를 넣는 곳: `.github/workflows/ci.yml`(build-arg) ↔ `Dockerfile`(ARG·ENV) ↔ `apps/game/vite.config.ts`(define) ↔ `env.d.ts`·`.oxlintrc.json`(이름 허용).

## 건드리지 말 것
- 안개 규칙(서버 시야·탐사 기록), 어제 누르기 규칙(`unitTapOf`·`PeekCard`·누르는 반경), 가시거리 자동 조절 문턱은 바꾸지 않았다.
- `packages/engine/src/units/`는 `routePath.ts`의 `shift` 한 줄기만 더했다(유닛 그리기는 다른 줄기 `character-3d`).

## 미검증·TODO·알려진 문제
- **휴대폰에서 보지 못했다**(Unknown): 넘는 프레임의 시간, 숲에서 나무가 그대로인지, 되돌아가기가 사용자 화면의 그 흔적이었는지. 헤드리스 값만 있다.
- 따라가는 유닛만 잇는다. 다른 유닛은 넘을 때 한 칸 튄다(질문 980).
- 칸 크기·높이 밝기 범위는 화면을 연 2차맵 값을 이어 쓴다(질문 978). 여러 2차맵을 걸으면 조금씩 벌어진다 — 화면을 다시 열면 맞는다.
- 운영자 모드에서 이웃을 전체 보기로 구독해 감사 기록 줄이 는다(질문 977).
- 옆 2차맵 건물 겉모습은 붙일 때 한 번만 받는다(질문 979). 면 경계 너머(90° 돌아간 이웃) 건물 옮기기는 단위 시험만 했다(화면에서 보지 않음 — 미실행).
- 채집 표시·근처 목록·지도자 이름표는 넘으면 그 2차맵 것으로 다시 받는다(그대로).
- `secondMapEngine.ts` 802줄, `SecondaryMapScreen.tsx` 713줄(600줄 경고 범위 — 앞에도 넘어 있었다). 다음에 나눌 후보: 엔진 rebase 몫, 화면의 넘기 몫.
- HUD 성능 판의 "준비 Nms·다시 구독 N"은 이제 그 2차맵 흐름을 처음 연 때부터 센 값이다(넘은 뒤 큰 수로 보일 수 있다 — 개발 표시).

## 사용자 결정 대기
- 질문 976~980(`docs/questions/2026-11-11-map-seamless-2.md`).
