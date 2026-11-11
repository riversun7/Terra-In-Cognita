# 캐릭터 3D 외형 — 로우폴리 부위 조립, 만들기 3D 미리 보기, 2차맵 유닛 모델

- 일시: 2026-11-11 18:54 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-character-3d.md`(제안), ADR `docs/adr/2026-11-01-first-login-cyborg.md` "바뀜 (3D 외형, 2026-11-11)", 질문 `docs/questions/2026-11-11-character-3d.md`(961~968), 기획 D-529, 가지 `work/character-3d`(main `8370909`에서)

## 한 일
사용자 요청(2026-11-11, 원문): "개선3. 캐릭터 생성을 더 다양한 프리셋과 폴리곤 3d로 구성할 수있게 해달라. 2차맵에서도 사용가능하게."

1. **외형 자료(2판)** — `@terra/shared/characterLook` `CharacterLook`: 체형 4·키 90~110%·머리 모양 8·얼굴 8·머리 장식 13·몸통 8·팔 5·다리 5·등 장식 8·덧장식 8·겉 장갑 0~3·색 다섯 칸(살·주색·보조·포인트·빛) × 20색. 프리셋 24개, 씨앗 무작위, 칸 잠그기·그 칸만 다시 뽑기, 유닛 ID로 정하는 기본 외형(휴먼·지도자), 옛 2D 외형과 오가기.
2. **로우폴리 모델(엔진 `characters/`)** — 단위 도형 8가지(상자·사다리꼴 기둥·6각 기둥·6각 뿔·공·반구·쐐기·사각뿔) 조각을 조립한다. 묶음 여섯(몸·머리·두 팔·두 다리)을 축 둘레로 돌려 걷는다. 도형마다 InstancedMesh 하나로 그린다(텍스처·모델 파일·새 의존성 없음).
   - 삼각형(Verified: 시험·셈): 프리셋 24개 가까운 단계 234~480(평균 360)·먼 단계 96~120, 무작위 2,000개 가까운 단계 최대 528·먼 단계 최대 120. 칸마다 가장 무거운 값을 함께 골라도 상한(600·150) 안이다.
3. **만들기 외형 단계** — 위에 3D 미리 보기(끌기·화살표 키로 돌리기, 휠·두 손가락·+ − 키로 확대, 돌림판·걷기·밤·처음 각도 단추), [무작위]·[되돌리기], 아래에 탭 여섯(프리셋 썸네일 24·몸·머리·옷·장식·색). 부위 칸마다 앞·뒤·다시 뽑기·잠그기. 미리 보기 엔진은 지연 로딩하고, 받는 동안·WebGL을 못 쓸 때는 2D 그림을 보인다.
4. **저장·전달** — `cyborgs.look`(jsonb, null 가능) 열, `cyborg_create` 선택 칸 `look`(프로토콜 판 20 그대로 — 선택 칸이고 옛 서버는 모르는 칸을 버린다), 서버가 목록·범위를 보고 저장하며 옛 칸 `appearance`는 그 외형에서 넘긴 값으로 맞춘다. `cyborg.status`에 `look`, 새 tRPC `world.unitLooks`(보는 유닛 가운데 사이보그 본체·NPC 지도자).
5. **2차맵** — 걷는 사람 크기 유닛은 가까우면 모델, 아니면 캡슐·점. 사이보그 본체 = 고른 외형(옛 사이보그는 넘긴 외형), NPC 지도자 = 망토·장갑 기본 외형, 휴먼 등 = 유닛 ID로 정한 수수한 외형. 가시거리 단계(0~4)마다 거리 60~180m·모델 32~128명·가까운 단계 8~32명. 모델로 그린 유닛은 발밑 고리로 고른 표시를 하고, 몸 위 누르기 폭을 모델 폭(0.45m)까지 넓혔다.

## 정한 것(까닭은 ADR)
- 캐릭터마다 지오메트리를 합치지 않고 도형별 인스턴스로 그린다: 외형이 다 달라도 그리기 호출이 10 이하다(건물 모델과 같은 방식).
- 색은 꼭짓점 색이 아니라 인스턴스 색이다(조각 하나가 한 색이라 결과가 같다).
- 프로토콜 판을 올리지 않았다(선택 칸 하나, `z.object`가 모르는 칸을 버린다 — 시험이 본다).
- 지도로는 tRPC 조회(건물 겉모습과 같은 방식). 지도 전송 메시지는 그대로다.
- 서 있는 유닛은 멈춘 자세다(화면 변화가 없으면 그리기를 멈추는 규칙). 숨쉬기는 만들기 미리 보기에만 있다.
- 만든 뒤 외형 바꾸기는 만들지 않았다(기획 D-352·D-7032). 옛 사이보그 다시 고르기는 질문 961.

## 측정 (헤드리스 Chromium = SwiftShader, 휴대폰 값 아님)
화면 시험 `e2e/character-3d.spec.ts`의 측정(`E2E_MEASURE=1`), 1440×900, 플레이어 계정의 시작 도시 2차맵(유닛 33개 — 시험 세계에 80개짜리 도시가 없어 그 수로는 재지 못했다), 끌어서 이어 그리는 동안의 1초 요약. 주소 `?unit-models=0`(모델 끔)과 기본(켬)을 견줬다. 여섯 줄기가 한 기계를 같이 써서 엔진 p95는 크게 흔들린다(같은 조건 3/5에서 7.7ms와 0.8ms가 나왔다) — 믿을 만한 것은 그리기 호출·삼각형 수다(Verified: 실행, 두 번).

| 확대 | 모델 | 화면 안 유닛 | 모델(가까운 단계) | 그리기 호출 | 삼각형 | 엔진 p95(ms) | JS 힙(MB) |
|---|---|---|---|---|---|---|---|
| 5/5 | 끔 | 15 | 0 | 16 | 62,218 | 0.80 | 16 |
| 5/5 | 켬 | 22 | 13 (8) | 21 | 58,062 | 2.10 | 20 |
| 5/5(두 번째) | 끔 | 7 | 0 | 16 | 52,514 | 2.00 | 14 |
| 5/5(두 번째) | 켬 | 6 | 2 (2) | 19 | 50,556 | 1.60 | 18 |
| 3/5 | 끔 | 30 | 0 | 17 | 100,014 | 7.70 | 14 |
| 3/5 | 켬 | 28 | 0 | 17 | 100,014 | 0.80 | 18 |
| 1/5(점) | 끔·켬 | 33 | 0 | 10 | 35,410 | 0.60 | 14·18 |

- 그리기 호출: 모델 13명에 +5(쓰는 도형 묶음 수). 캐릭터 수와 상관없이 10 이하다(Verified: 단위 시험 200명에서 16 이하로 막고, 실제 묶음은 도형 8 + 빛 2).
- 삼각형: 모델이 캡슐보다 가볍다. 캡슐은 몸 + 외곽선 두 번 그려 유닛마다 약 1,000삼각형이고(반구 6단 × 둘레 20), 모델은 가까운 단계 평균 360·먼 단계 약 108이다. 그래서 모델을 켜면 삼각형 수가 조금 준다.
- JS 힙 +4MB(외형 목록·모델 캐시·인스턴스 버퍼).
- 넓은 화면에서도 3/5부터는 키가 9px 아래라 모델을 그리지 않는다(모두 캡슐). 가시거리 단계는 헤드리스에서 0(가장 낮음 — 거리 60m·모델 32명)까지 내려갔다.
- 휴대폰 값은 없다(Unknown).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/characterLook.ts`·`.test.ts`, `package.json` | 외형 2판 자료·검사·프리셋·무작위·기본 외형·옛 외형과 오가기, 진입점 `@terra/shared/characterLook` |
| `packages/shared/src/mapUnits.ts`, `cyborgApi.ts` | `world.unitLooks` 응답 모양, `cyborg.status`의 `look` |
| `packages/protocol/src/cyborg.ts`·`.test.ts`, `index.ts` | `characterLookSchema`, `cyborg_create.look`(선택 칸) |
| `packages/engine/src/characters/*`(새 폴더) | 조각·몸틀·몸·머리·장식 모델(순수), 도형 지오메트리, 그리기 배열·캐시, 인스턴스 메시, 2차맵 층, 미리 보기·썸네일, 시험 5개 |
| `packages/engine/src/secondMapEngine.ts`, `engineTypes.ts`, `engineParts.ts`, `index.ts`, `package.json` | 캐릭터 층 잇기(`setUnitModels`, 통계 `characters`·`characterLod0`·`selectedDraw`), 진입점 `@terra/engine/characterPreview` |
| `packages/engine/src/units/unitView.ts`, `unitRoster.ts`·`.test.ts` | 모델로 그린 유닛은 캡슐·강조 외곽선을 건너뜀, 몸 위 누르기 폭 넓히기 |
| `apps/server/src/db/schema.ts`, `drizzle/20261111072107_cyborg_look/` | `cyborgs.look` 열(더하기만) |
| `apps/server/src/cyborg/state.ts`, `service.ts`, `gateway.ts`, `world/persist/tables.ts` | 읽기·쓰기·만들 때 검사, `cyborgLookOf`(저장한 것 또는 넘긴 값) |
| `apps/server/src/worldMap/mapUnits.ts`·`.test.ts`, `reads.ts`, `trpc/world.ts`, `trpc/context.ts` | `world.unitLooks` |
| `apps/server/src/cyborg/cyborg.db.test.ts`, `roster/*.test.ts` | 3D 외형 저장·검사 DB 시험, 기록 모양 맞춤 |
| `apps/game/src/start/LooksStep.tsx`, `CharacterPreviewPane.tsx`, `lookText.ts`, `looks.css` | 외형 단계(3D 미리 보기·탭·잠금·되돌리기) |
| `apps/game/src/start/StartScreen.tsx`, `nameLookSteps.tsx`, `startText.ts`, `start.css` | 3D 외형 상태·만들기 명령에 `look`, 옛 외형 단계·문구 표·스타일 정리 |
| `apps/game/src/map/unitModels.ts`·`.test.ts`, `mapSession.ts`, `mapHudData.ts` | 2차맵 유닛 외형 잇기, 화면 표지 `data-characters`·`data-character-lod0`·`data-selected-draw`·`data-draw-calls`·`data-triangles` |
| `apps/game/messages/ko.json`·`en.json` | 외형 단계 문구(칸·부위·색·프리셋 이름, 약 140개씩) |
| `e2e/first-login.spec.ts`, `e2e/character-3d.spec.ts` | 외형 단계 흐름·저장 확인, 2차맵 모델·되돌아가기·측정 |
| `docs/adr/2026-11-11-character-3d.md`, `docs/adr/2026-11-01-first-login-cyborg.md`, `docs/questions/2026-11-11-character-3d.md`, `docs/PLAN.md` | 설계·바뀜·질문·계획 줄 |

## 검사
Verified: 실행. 기기 = 공유 개발 컨테이너, `TEST_DATABASE_URL` 있음.
- 단위 시험: 바꾼 꾸러미(engine·shared·protocol·game start·map·cyborg) 144파일 1,211개 통과, 서버 `cyborg/`(DB 포함) 16개·`worldMap/mapUnits.test.ts` 통과, 새 시험 = shared `characterLook` 13 · engine `characters/` 23(모델 8·도형 3·그리기 배열 4·층 8) · `unitRoster` 6 · protocol `cyborg` 6 · game `unitModels` 5 · 서버 DB `3D 외형` 1 · `world.unitLooks` 2.
- `pnpm check`: 실행 중 — 다른 줄기와 같이 쓰는 잠금을 기다린다(결과는 이 줄을 고쳐 적는다). 그 전에 따로 돌린 것: 포맷·린트·타입 검사(전 꾸러미 + e2e)·모듈 경계·파일 크기·다국어(6,212키)·디자인 값·위키 검사 통과
- 빌드 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 통과(첫 화면 묶음 상한 안 — 미리 보기 엔진은 지연 조각 `characterPreview`, three는 첫 화면에 들지 않음).
- 화면 시험(헤드리스 Chromium): `character-3d.spec.ts` 2개 + 측정 2개(`E2E_MEASURE=1`) 통과, `first-login.spec.ts` 6개(새 플레이어 흐름·속성 분배 전 사이보그·사진 390 파스텔·다크 × 한국어·영어) 통과, 원래 있던 `unit-control`·`play-map`·`building-art` 53개 통과.
- 사진(`/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/character-3d-shots/`): 프리셋 표 `sheet-presets.png`, 유닛 기본 외형 표 `sheet-commoner.png`, 만들기 390 `creation-presets-390-pastel-ko.png`·`creation-presets-390-dark-en.png`·`creation-head-390-pastel-ko.png`·`creation-colors-390-dark-en.png`, 미리 보기 넷 `creation-preview-closeups.png`, 2차맵 가까이 `character-3d-map-close-1440-pastel.png`·`character-3d-map-close-390-pastel.png`.

## 함께 바꿔야 하는 파일
- 부위를 더할 때: `characterLook.ts` 목록(뒤에 더하기만) + 엔진 `characterBody`·`characterHead`·`characterGear`의 그 칸 + `lookText.ts` + 문구(ko·en). 모델 시험이 삼각형 상한과 "값마다 다른 모델"을 본다.
- 색을 더할 때: `CHARACTER_COLORS`·`CHARACTER_COLOR_IDS` + `COLOR_LEGACY`(옛 색으로 넘기기) + `lookText.ts` + 문구.
- 외형 칸 이름·차례를 바꾸면 `e2e/first-login.spec.ts`의 `LOOK_KEYS`와 `packages/protocol/src/cyborg.ts` `characterLookSchema`도.

## 건드리지 말 것
- 저장된 부위·색 ID는 바꾸거나 다시 쓰지 않는다(`cyborgs.look`). 목록에서 빠진 ID가 든 값은 "없는 것"으로 읽혀 옛 외형에서 넘긴 모습이 된다.
- 마이그레이션 `20261111072107_cyborg_look`은 올라가면 고치지 않는다.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서 재지 않았다(Unknown): 프레임 시간·메모리. 위 수치는 헤드리스(SwiftShader)다.
- 2차맵에서 캐릭터가 작다: 가장 가까이 보아도 390px 화면에서 키 약 18px(유닛은 실제 크기, ADR 25). 얼굴·장식은 거의 구별되지 않는다 → 질문 962.
- 유닛에 세력 색 표시가 없다(지금도 없었다) → 질문 963.
- 사이보그 화면·위 띠의 얼굴은 아직 2D 그림이다(3D 외형에서 가까운 옛 부위로 그린다).
- 다른 2차맵으로 넘어간 직후 한 프레임은 방향이 기본(남쪽)이다(유닛 ID로 방향을 이어 가지만 새 유닛은 처음 움직일 때 정해진다).
- 전투 다시보기·전투 화면의 유닛은 그대로 캡슐이다(외형을 넘기지 않는다).

## 사용자 결정 대기
- 질문 961~968(`docs/questions/2026-11-11-character-3d.md`): 옛 사이보그 다시 고르기, 더 가까운 확대, 세력 색, 휴먼 외형, 사이보그·휴먼 구분, 프리셋 목록, 부위 잠금(상품), 남의 외형 공개 범위.
