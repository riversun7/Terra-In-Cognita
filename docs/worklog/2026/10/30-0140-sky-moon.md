# 1차맵 달 — 배경 구 달, 보임 판정, 미리 컴파일 (WP4)

- 일시: 2026-10-30 01:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-primary-map-sky.md`(제안) 5절·"구현하며 정한 것 (낮밤·달·구름 연결)" 달 절, 앞 기록 `30-0100-sky-day-night.md`(WP3), 사용자 결정 U3(달 찾기 없음)

## 한 일
- `moon.ts`(새): `MoonLayer`(달마다 재질, 지오메트리 하나), `moonSpots`(바다 3개·크레이터 15개, `createRng`), `createMoonMaterial`(항성 방향은 공용 `uSunDirView`, 우주색에서 나타나기 `uFade`). 놓기는 가운데 − 카메라(64비트), 반지름 배율, 조석 고정(+x = 행성 쪽, +z = 궤도 극), 먼 달부터 renderOrder. 그리기 상태: 깊이 시험·쓰기 끔, renderOrder < 0, 시야 거르기 끔, 꼭짓점 셰이더 끝 z = 0.5·w.
- 엔진: 하늘 조절기에 `createMoons`를 넘긴다(장면에 숨긴 채 넣고 미리 컴파일). 미리 컴파일 도우미 `precompile`(`planetView.ts`): 병렬 컴파일 확장이 있으면 `compileAsync`, 없으면 `compile`.
- 달 보임의 행성 원판 = 대기 띠 원판(1.018R, `ATMOSPHERE_SCALE`). 해수면 원판이면 띠 뒤에 다 든 달도 그렸다(헤드리스 사진으로 찾음).
- 달 찾기 단추·위상 줄은 넣지 않았다(사용자 결정 U3 "그대로 둔다").
- 시험(Verified: Vitest 5.0.5): 달 6개(그리기 상태·z = 0.5·w·공용 항성 uniform·약 24KB, 놓기·조석 고정·켜지기, 먼 달부터·받지 않은 달 숨김, 4개 상한, 버리기, 모습 시드), 하늘 조절기 +1(시계 전·off에서 달을 만들지 않음).
- 헤드리스 확인(Verified: Chromium 1243 + SwiftShader, 빌드한 앱·서버): 위상 넷(세로), 데스크톱 셋(다크 하나), 가로 892×412, 300km·틈 찾기 달 없음, 그리기 +1(62 대 61), 콘솔 오류 0. 사진을 찍을 시각·자리는 하늘 계산으로 찾았다(달 전체가 대기 띠 원판 밖, HUD 패널을 피한 곳).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/moon.ts`(새)·`moon.test.ts`(새) | 달 그리기와 시험 |
| `packages/engine/src/planet/planetEngine.ts` | `createMoons`(만들기·장면·미리 컴파일), 달 가리는 원판 = 대기 띠 |
| `packages/engine/src/planet/planetView.ts` | `SPACE_COLOR`·`ATMOSPHERE_SCALE` 내보내기, `precompile` |
| `packages/engine/src/planet/skyController.test.ts` | 시계 전·off에서 달을 만들지 않음 |
| `docs/adr/2026-10-29-primary-map-sky.md` | 달 절 |

## 함께 바꿔야 하는 파일
- 대기 띠 두께(`ATMOSPHERE_SCALE`)를 바꾸면 달 보임 판정도 함께 바뀐다(같은 상수).
- 달을 여럿 넣으면(기획 답, 질문 8) `PLACEHOLDER_PLANET_SKY.moons`가 아니라 콘텐츠 팩 → 목록 정보 → `PlanetDescription.sky`로(ADR 11절).

## 건드리지 말 것
- 달 재질의 깊이 끔·z = 0.5·w·renderOrder < 0: 달이 지도를 가리지 못하게 하는 장치다(시험이 지킨다).

## 미검증·TODO·알려진 문제
- 휴대폰에서 본 것이 없다(Unknown): 달 크기(약 35px)·색, 병렬 컴파일 확장 지원, 달이 보일 때 하늘 시계(0.33~0.5초) 배터리.
- 세로 화면에서 달이 보이는 하늘은 지구본과 아래 안내 사이 좁은 띠뿐이다(U3대로 둔다).

## 사용자 결정 대기
- 없다.
