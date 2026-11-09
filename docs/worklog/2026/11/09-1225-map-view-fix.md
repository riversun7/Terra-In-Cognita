# 1차맵 처음 5단계, 성능 판·고도 과장 막대는 운영진만

- 일시: 2026-11-09 12:25 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-07-planet-view.md` "바뀜 (2026-11-09)", `2026-10-29-s2-planet-lod.md` "바뀜 (2026-11-09)", `2026-11-08-operator-roles-log-switch.md`(역할)

## 한 일
- 사용자 요청(2026-11-09, NAS 휴대폰 main `7cf9ebe`, 원문): "2차맵이나 1차맵은 진입시항상 최대 확대 상태로 시작. 일반 유저는 fps나 ms 표시 없애고 운영진만 보이게, 고도과장 기능도 안됨." → 이어서 "고도과당도 일반유저는 안된다는 말이다".
- 1차맵 처음 단계: 들어갈 때마다 5단계(엔진 `initialStage`)로 연다. 가운데는 그대로(?key= > 내 사이보그 > 엔진 기본). `?stage=`·`?planet-view=`(거리)는 그대로 이긴다. 2차맵 처음 확대는 다른 줄기(map-panels-fix) 몫이라 건드리지 않았다.
- 운영진 표시: `isStaff`(gm·admin·dev) + `useStaffView` 훅. 2차맵 성능 판(`MapPerfPanel`)은 안에서 스스로 가린다(2차맵 화면 파일은 고치지 않음). 1차맵 성능 판은 화면 안에 그대로 쓰여 있어 `PlanetPerfPanel.tsx`로 나누고 같은 규칙으로 가렸다(화면 파일 633 → 약 580줄). 1차맵 [고도 과장] 막대도 운영진만. 플레이어는 처음 과장 ×6.
- 성능 보고(telemetry)는 앱 프레임 측정기(`telemetry/reporter.ts`)가 따로 보내므로 그대로다. 화면 `data-*`(시험이 읽는 값)도 그대로.
- 홈 "연결·성능" 카드(`DiagnosticsCard`)는 그대로 둔다: dev·admin 기본 카드이고 플레이어는 스스로 더할 때만 보인다(같은 종류의 늘 보이는 지도 표시가 아니다).
- 고도 과장: 처음에는 "기능이 안 된다"로 읽고 원인을 쟀다(아래). 사용자 뜻이 "일반 유저에게는 없게"로 바로잡혀 엔진은 고치지 않았다.

## 잰 값
- S2 시험 행성 F9 캐시(맵 레벨 9 타일, 칸 변 약 1,629m)의 땅 꼭짓점 경사(중앙 차분, 게임 m/m): 중앙값 0.0015, 75% 0.0037, 90% 0.0088, 99% 0.0455. 높이 중앙값 44m, 90% 147m, 가장 높은 땅 821m(Verified: 캐시 pack을 풀어 계산한 시험 스크립트, 저장소 밖).
- 그래서 5단계(카메라 약 22km, 기울기 약 38°, Assumed: `globeLimits`·`zoomStages`·`tiltFor` 손 계산)의 저지대에서는 과장 ×1~×20의 그림자 차이가 밝기 1% 안팎이고 올림도 거의 보이지 않는다(Assumed: 계산). 산지에서는 보인다.
- e2e 화소 차이(운영진, 처음 보기 = 5단계 내 도시, 하늘 끔, 390×844 지도 가운데 60%): ×1 → ×20 평균 0.27(dev)·0.14(admin) / 255, 같은 과장 두 번 찍기 0.00(Verified: `planet-view.spec.ts` 실행 출력). 막대 값은 엔진까지 간다(`data-engine-exaggeration`). 다시 말해 운영진에게도 처음 보기(저지대)에서는 과장 막대의 차이가 거의 보이지 않는다(눈으로 본 사진도 같다). 고치려면 그림자만 더 기울이는 배율(법선 = 위 − 과장 × K × 기울기) 같은 엔진 변경이 필요하다 — 이번에는 하지 않았다(코디네이터 지시).

## 시험
- 단위: `sessionState.test.ts`·`worldMap.test.ts` 26개 통과(Verified).
- e2e `planet-view.spec.ts --grep "플레이어|운영진"` 7개 통과(3.0분): 기존 확대 단계 4개 + 새 시험 3개(플레이어: 5단계 시작·성능 판·과장 막대 없음·과장 ×6, 2차맵 성능 판 없음 / dev·admin: 1차맵 성능 판·과장 막대·2차맵 성능 판 보임 + 화소 차이 측정).
- e2e `play-map.spec.ts --grep "지도 흐름|볼 수 없는 2차맵: 까닭"` 9개 통과(1.1분): 5단계 시작에서도 도시 표시를 눌러 도시 판을 연다. 사진(플레이어 1차맵: 5/5, 성능 판·과장 막대 없음)을 눈으로 확인했다.
- `pnpm check` 통과(단위 3,974 통과·273 건너뜀). 빌드·`check-pwa` 통과, `check:bundle` 첫 화면 JS 107,213 B / 상한 131,416 B.
- e2e를 돌린 뒤 `planet-view.spec.ts`의 스타일 지우기 한 줄만 타입 오류(`Node.remove`) 때문에 `parentNode.removeChild`로 바꿨다(그 뒤 e2e는 다시 돌리지 않음, 동작 같음 — Assumed).
- 2차맵 성능 판을 읽는 `building-art.spec.ts`는 dev 계정이라 그대로 보인다(실행하지 않음, Assumed: 코드).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/auth/sessionState.ts`·`.test.ts` | `isStaff`(gm·admin·dev)와 시험 |
| `apps/game/src/auth/session.ts` | `useStaffView` 훅 |
| `apps/game/src/map/MapPerfPanel.tsx` | 2차맵 성능 판을 운영진만 |
| `apps/game/src/map/PlanetPerfPanel.tsx` (새 파일) | 1차맵 성능 판을 화면에서 나눔 + 운영진만(플레이어는 1초 프레임 값도 구독하지 않는다) |
| `apps/game/src/map/PlanetMapScreen.tsx` | 처음 단계 5, 성능 판 부품, 고도 과장 막대 운영진만 |
| `apps/game/src/map/planetFocus.ts`, `worldMap.test.ts` | 처음 볼 곳에서 거리를 뺌(단계가 정한다) |
| `e2e/planet-view.spec.ts` | 처음 5단계(플레이어), 성능 판·과장 막대 없음(플레이어)·있음(dev·admin), 과장 화소 차이 측정, [+]로 2차맵 시험을 5단계 시작에 맞춤 |
| `docs/adr/2026-11-07-planet-view.md`, `docs/adr/2026-10-29-s2-planet-lod.md` | "바뀜 (2026-11-09)" |

## 함께 바꿔야 하는 파일
- 운영진에게만 보이는 화면을 더하면 `useStaffView`(`auth/session.ts`)를 쓴다. 역할이 바뀌면 `sessionState.ts` `STAFF_ROLES`.

## 건드리지 말 것
- 2차맵 화면 파일(`SecondaryMapScreen.tsx` 등)은 다른 줄기(map-panels-fix)가 고친다. 2차맵 성능 판은 `MapPerfPanel` 안에서만 가린다.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서는 보지 않았다(헤드리스 Chromium e2e만).
- 2차맵 화면은 플레이어에게도 1초마다 `usePerfStats`로 다시 그린다(판만 가렸다). 2차맵 화면 파일을 고칠 때 `MapPerfPanel` 안으로 옮기면 된다.

## 사용자 결정 대기
- 없음
