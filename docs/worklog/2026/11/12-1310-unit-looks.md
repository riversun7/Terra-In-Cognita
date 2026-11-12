# 유닛 겉모습 — 노란 캡슐로 돌아가던 내 사이보그, 큰 유닛·탈것 모델, 2차맵 유닛 이름표

- 일시: 2026-11-12 13:10 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 지적 2026-11-12(NAS 휴대폰, 2차맵 6/6 사진) "큰 유닛들은 캐릭터가 없는 문제. 내 사이보그도 갑자기 기존 노란원통 모델로 돌아가는 문제. 개선. 유닛 이름이 표시되게 하자.", ADR `docs/adr/2026-11-11-character-3d.md` "바뀜 (2026-11-12, 유닛 겉모습)", 질문 `docs/questions/2026-11-12-unit-looks.md`(1106~1110), 가지 `work/unit-looks`(main `e3baed6`에서)

## 한 일

### 1. 내 사이보그가 노란 캡슐로 돌아가던 원인과 고침
- 원인(Verified: 코드 읽기 + 화면 시험 `e2e/unit-looks.spec.ts`가 고치기 전 코드에서 `data-selected-draw` = `capsule`로 실패, 고친 뒤 통과):
  - 기기 `mapWire.ts` `unitLook`이 유닛 전송의 **움직임 빠르기**가 2칸/초(2,048) 이상이면 탈것 겉모습(키 × 0.8, 반지름 × 2.5, 노랑 `0xffcf75`)을 골랐다.
  - 2차맵 모델 층(`unitModels.ts`)은 키 2.2m·반지름 0.5m 이하만 모델로 그렸다 → 탈것 겉모습(반지름 0.75m)은 캡슐.
  - 운영자 모드(전체 보기 구독)에서 보낸 이동은 서버가 빠르기 100배(`OPERATOR_SPEED_FACTOR`)로 보낸다 → 걷기 437이 43,700 → 내 사이보그가 낮고 넓은 노란 캡슐. 사진의 노란 원통이 이 모양이다(납작하고 넓다).
  - 도착한 뒤에도 서버 움직임(경로 + 빠르기 43,700)이 다음 이동까지 그대로 남고 DB에도 그대로 저장된다 → 새로 고침·다시 접속·서버 재배포(12:55 KST) 뒤에도 노란 캡슐이었다. "갑자기"는 운영자 모드로 옮긴 순간이다.
  - Assumed: 사용자가 운영자 권한으로 운영자 모드를 켜고 옮겼다(사진에 [운영자 모드] 단추, 다른 길로는 사이보그 빠르기가 걷기 437을 넘지 않는다 — Verified: `cyborg/service.ts`가 늘 `WALK_SPEED`로 세운다).
  - 원인이 아니었던 것(Verified: 코드): 외형 조회(새 사이보그도 `world.unitLooks`가 저장한 외형을 준다), 팩 ID(외형 목록은 코드 상수), 고른 유닛 그림(모델로 그린 유닛은 발밑 고리만).
- 고침: 탈것은 서버가 유닛의 **기본 빠르기**로 정해 전송 표시 종류 `vehicle`을 붙이고(`unitKinds.ts` `wireKindOf` — 봇이고 기본 빠르기 ≥ 2,000), 기기는 그 표시 종류만 본다. 사람(사이보그·휴먼 등)은 빠르기와 상관없이 탈것이 아니다. 프로토콜 판은 그대로(표시 종류 칸은 글자, 모르는 값은 보통 유닛 — 18판부터).
- 옆 2차맵 유닛도 외형을 받는다(앞 작업 기록의 알려진 문제): 붙은 이웃 2차맵마다 같은 `world.unitLooks`를 묻는다. 받은 서버 외형은 화면이 바뀌어도 기억한다(걸어 넘은 직후에도 고른 외형).

### 2. 모든 유닛이 모델(큰 유닛·탈것)
- 엔진 `UnitModel`이 외형 또는 사람꼴이 아닌 몸(`characters/unitBodies.ts`: 네 발 짐승·차·짐차·궤도 탈것)과 배율을 받는다. 같은 조각·같은 도형별 InstancedMesh라 그리기 호출이 늘지 않는다.
- 기기 규칙([임시], `unitModelOf`): 크기 1 = 캐릭터(그대로), 크기 2·3 사람 = 키에 맞춰 늘린 캐릭터, 크기 2 비사람 = 기계 몸(`android` 외형), 크기 3 비사람 = 짐승, 탈것 = 크기마다 차·짐차·궤도 탈것. 사람인지는 `world.unitLooks`의 새 `labels`(종류·이름)로 안다.
- 사진의 큰 연보라 캡슐은 NPC 도시 휴먼이 시험 봇 규칙으로 크기 2(키 6m)를 받은 것이다(Verified: `bots.ts` `botPlan` 8% 크기 2·2% 크기 3·15% 차 빠르기, 한눈 정보 종류 휴먼). 이제 늘린 사람 모델로 그린다. 휴먼이 거인·차인 것 자체는 질문 1106.
- 크리쳐 도감 그림은 2D 초상이라 3D 모델로 쓰지 못했다. 콘텐츠 팩 `unit_kinds`는 지도 전송에 종 ID가 없어 아직 쓸 수 없다(질문 1107).

### 3. 2차맵 유닛 이름표
- `unitNames.ts`(+ `unitNames.css`): 지도자 이름표와 같은 덧그림 층. 내 사이보그·고른 유닛은 늘(확대 상관없이), 다른 유닛은 사람 키가 화면 20px 이상일 때(휴대폰 세로 6/6·5/6) 가운데에서 가까운 10개까지, 화면 안 이름 있는 유닛이 40개를 넘으면 숨김, 겹치면 건너뜀([임시], 질문 1108). 늘 보이는 이름표는 지도자 이름표와 겹치면 위로 비킨다(시작 도시에서 지도자 옆에 서는 내 사이보그 — 사진으로 찾음).
- 이름 = 사이보그 본체 이름·NPC 도시 휴먼 이름. 구인한 휴먼 등은 이름 칸이 없어 고를 때만 "휴먼 #번호"(질문 1109). 새 메시지 키 없음.

## 측정 (헤드리스 Chromium = SwiftShader, 휴대폰 값 아님)
`e2e/unit-looks.spec.ts` 390 사진 시험의 1초 요약(끌어서 이어 그린 뒤), 플레이어 시작 도시 2차맵 6/6 — 시험 세계 도시가 유닛 30개라 사용자 화면(52개)만큼 모으지 못했다(Verified: 실행).

| 테마 | 유닛 | 그린 유닛 | 모델(가까운 단계) | 그리기 호출 | 삼각형 | 엔진 p95 | 이름표 |
|---|---|---|---|---|---|---|---|
| 파스텔 | 30 | 6 | 4 (4) | 21 | 44,050 | 2.3ms | 2 |
| 다크 | 30 | 7 | 7 (7) | 21 | 44,572 | 3.1ms | 2 |

- 그리기 호출은 몸 종류가 늘어도 도형 묶음 수(8 + 빛 2) 안이다(Verified: 엔진 시험 — 사람·늘린 사람·짐승·차·짐차·궤도 여섯을 함께 그려 ≤ 10).
- 몸 모델 삼각형: 네 종류 × 씨앗 40개 모두 가까운 단계 ≤ 600, 먼 단계 ≤ 150(Verified: `unitBodies.test.ts`).
- 52유닛·큰 유닛이 많은 화면의 프레임 시간은 재지 못했다(Unknown). 휴대폰 실기기 값 없음(Unknown).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/unitKinds.ts`, `secondMap.ts`, `secondMap.test.ts` | 탈것 표시 종류를 기본 빠르기로(`wireKindOf`, `VEHICLE_MIN_SPEED`), 운영자 빠르기 이동에는 붙지 않음 시험 |
| `packages/protocol/src/secondMap.ts` | `UNIT_WIRE_KINDS`에 `vehicle` |
| `apps/game/src/map/mapWire.ts`, `mapWire.test.ts` | 탈것을 표시 종류로, 겉모습에 몸꼴·크기 등급 |
| `packages/engine/src/units/unitView.ts` | `UnitLook.form`·`sizeClass`(앱이 모델을 고를 때만) |
| `packages/engine/src/characters/unitBodies.ts`·`.test.ts`(새), `characterCompile.ts`, `characterLayer.ts`·`.test.ts`, `secondMapEngine.ts`, `index.ts` | 사람꼴이 아닌 몸, 배율, 몸 캐시, 누르기 폭 |
| `packages/shared/src/characterLook.ts`·`.test.ts` | 기본 외형 `android` 모습 |
| `packages/shared/src/mapUnits.ts`, `apps/server/src/worldMap/mapUnits.ts`·`.test.ts`, `reads.ts` | `world.unitLooks`의 `labels`(종류·이름), 사이보그 유닛 → 이름 |
| `apps/game/src/map/unitModels.ts`·`.test.ts` | 모든 유닛 모델 규칙, 옆 2차맵 조회, 외형 기억, 이름표 자료 |
| `apps/game/src/map/unitNames.ts`·`.test.ts`·`.css`(새), `mapSession.ts`, `SecondaryMapScreen.tsx`, `mapUnits.ts` | 유닛 이름표 층 |
| `e2e/unit-looks.spec.ts`(새), `e2e/helpers/cyborgTravel.ts`(새), `e2e/selection-ring.spec.ts` | 노란 캡슐 재현·이름표·사진, 운영자 빠르기 도우미, 고른 표시 고리 띠(이제 사이보그가 모델이라 고리가 몸 가까이) |
| `docs/adr/2026-11-11-character-3d.md`, `docs/questions/2026-11-12-unit-looks.md` | 바뀜 절, 질문 1106~1110 |

## 검사
Verified: 실행(공유 개발 컨테이너, `TEST_DATABASE_URL` 있음).
- 재현: 고치기 전 코드로 `e2e/unit-looks.spec.ts` 운영자 빠르기 시험이 `data-selected-draw` 기대 `character0`·받은 값 `capsule`로 실패, 고친 뒤 통과(새로 고침·동쪽 2차맵으로 넘은 뒤에도 `character0`).
- 화면 시험(헤드리스 Chromium, 한 번에 모아서): `unit-looks` 3개, `character-3d` 3개(측정 2개는 `E2E_MEASURE` 없어 건너뜀), `play-map` 23개, `government` 9개 — 38개 통과·2개 건너뜀(13.3분). 그 전에 `selection-ring` 1개 + `unit-looks` 3개 통과(고른 표시 고리 화소 249).
- 단위: 엔진 `characters/` 28개(새 `unitBodies` 4·층 1), game `unitModels`·`mapWire`·`unitNames` 26개, 서버 `worldMap`·`secondMap` 시험(새 이름표 1·탈것 표시 종류 2), shared `characterLook`.
- `pnpm check`(`TEST_DATABASE_URL` 있음): 통과 — 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠 팩·단위 시험 643파일 4,933개. 그 전 한 번은 포맷이 옮긴 `@ts-expect-error` 자리 때문에 타입 검사에서 실패해 고쳤다.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 통과(첫 화면 JS 108,911 B / 상한 131,416 B — 이름표·모델 코드는 2차맵 조각).
- 사진(390, 한국어): `unit-looks-shots/unit-looks-map-390-pastel.png`·`unit-looks-map-390-dark.png`(scratchpad). 다크 사진(첫 실행)에서 시작 도시 지도자 옆 내 사이보그 이름표가 지도자 이름표에 가려진 것을 보고 비키게 고쳤다(파스텔은 다시 찍은 사진 — 다른 화면 시험이 사이보그를 옮겨 지도자 옆이 아니다).

## 함께 바꿔야 하는 파일
- 탈것 판정을 바꾸면 서버 `unitKinds.ts` `wireKindOf`와 기기 `mapWire.ts` `VEHICLE_WIRE_KIND`를 함께.
- 몸 종류를 더하면 `unitBodies.ts` `UNIT_BODY_KINDS`·모델·칠, `unitModels.ts` `unitModelOf` 규칙, 시험.
- 이름표 높이를 바꾸면 `unitNames.ts`의 `LEADER_TAG_LIFT_M`이 `leaderTags.ts` `TAG_LIFT_M`과 같아야 한다.

## 건드리지 말 것
- 운영자 빠르기(100배)는 사용자 요청(2026-11-09)이라 그대로 두었다. 겉모습만 떼었다.

## 미검증·TODO·알려진 문제
- 큰 유닛(늘린 사람·기계 몸·짐승)과 탈것 모델은 엔진 시험으로만 봤고 화면 사진은 없다(시험 세계 시작 도시 화면에 큰 유닛이 들어오지 않았다 — Unknown: 실제 모습).
- NAS에 이미 저장된 사이보그 움직임(빠르기 43,700)은 그대로지만, 이제 기기가 빠르기를 보지 않으므로 배포하면 바로 모델로 보인다(Assumed: 같은 이미지로 서버·기기가 함께 나간다).
- 질문 1106이 정해지기 전까지 NPC 도시 휴먼 일부는 6~12m 거인 사람·차로 보인다.

## 사용자 결정 대기
- 질문 1106~1110(`docs/questions/2026-11-12-unit-looks.md`).
