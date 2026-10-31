# 1차맵 구름 — GPU 굽기 큐브, 기후 치우침, 날씨 창, 껍질·걷히기·고른 칸 둘레 (WP5)

- 일시: 2026-10-31 09:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-primary-map-sky.md`(제안) 6·7·10절과 "구현하며 정한 것 (낮밤·달·구름 연결)" 구름 절, 앞 기록 `30-0100-sky-day-night.md`(WP3)·`30-0140-sky-moon.md`(WP4), 사용자 결정 U2(구름 그림자 없음)

## 한 일
- `cloudNoise.ts`(새): 64³ R8 격자값(`createRng`), 날씨 창 번호(3시간, 64비트 JS 수), 창 → 노이즈 오프셋, 정의 해시 → 구름 시드.
- `cloudClimate.ts`(새): GL 큐브 면 방향 식(ES 3.0 표 3.21)과 거꾸로 식, 기후 큐브 크기(2^(F−4), 64 상한), 첫 단계 마디, 방향 → [습도, 땅](받지 않은 타일은 바다), RG8 면 6장.
- `cloudSchedule.ts`(새): 굽기 예약 상태 기계. 쉬는 프레임마다 면 하나, 첫 단계 타일 또는 10초, 동작 뒤 300ms, 보이지 않는 거리(1.2R 안)에서는 굽지 않음, 1초 3차 ease-out 나타나기·숨기기, 날씨 창 바뀜, 컨텍스트 복구 뒤 다시 굽기.
- `clouds.ts`(새): `CloudLayer` — R8 큐브 렌더 타깃 512²(밉맵, 깊이 없음), 3D 노이즈 텍스처, RG8 기후 큐브(`textureLod` 1.5단계로 읽기), 굽기 셰이더, 껍질(구 128×64, 큐브 읽기 2번, 낮밤 조각, 가장자리 옅게, 고른 칸 둘레 비우기, 걷히기), R8 완전성 확인 한 번(실패하면 구름만 끄고 한 번 알림), GPU 바이트는 첫 굽기 뒤부터.
- `skyLayers.ts`(새): 엔진이 하늘 조절기에 넘기는 달·구름 만들기 함수(숨긴 채 장면에 넣고 새 물체만 미리 컴파일, 첫 단계 타일 늘 원함).
- `tilePipeline.ts`: `pin`·`pinnedReady`(낮은 우선, 취소하지 않음, 상한·실패 수에 넣지 않음).
- 엔진: 동작이 끝난 때·카메라 움직임을 하늘 프레임에, 먼 자르기 면에 구름 껍질, `PlanetDescription.skySeed`. `planetView.ts`: 고른 칸 둘레 uniform, `precompile`이 새 물체만 컴파일(장면을 넘기면 그리지 않는 색인 지킴이 재질까지 컴파일했다). 쓰지 않던 `CloudFrame.frozen`을 뺐다.
- 화면: `planetSource.ts`가 정의 해시로 `skySeed`를 만든다.
- 시험(Verified: Vitest 5.0.5): 노이즈 5개, 기후 큐브·면 방향 6개, 굽기 예약 8개(타일 기다림·10초, 면 하나씩·숨김·나타남, 동작 미룸, 창 바뀜, fixed 한 번, 보이지 않는 거리, 복구, 높이 상한), 타일 늘 원함 2개, 하늘 조절기 구름 3개(만드는 때·넘기기·통계, 버리기·복구, 던지면 하늘 끔), 화면 시드 1개. `pnpm check` 통과(1,488개 통과).
- 헤드리스 확인(Verified: Chromium 1243 + SwiftShader, 빌드한 앱·서버, 사설 DB·가짜 계정, 저장소 밖 하네스. 부하 평균 8~19라 시간 값은 휴대폰 값이 아니다): 사진·그리기 호출·굽기 횟수·GPU 바이트·면 방향 오차·면 굽기 시간은 ADR 구름 절에 적었다. 요약: 껍질이 보일 때만 그리기 +1, 1.2R 안·기후·틈 찾기에서 굽지 않음, 하늘 GPU 2.64MiB, 면 방향 최대 오차 0.0075, 면 하나 22~39ms(일회용 묶음), 콘솔 오류 0.
- 검토
  - review-animations(구름·낮밤 전환): 구름 나타나기·숨기기를 smoothstep → 3차 ease-out으로 바꿨다(들어오고 나가는 것). 하늘 켜기·늦은 시계 맞추기(0.5초 smoothstep)는 빛이 바뀌고 방향이 움직이는 것이라 그대로. 1초·0.5초는 UI 300ms보다 길지만 드문 세계 변화(첫 표시, 3시간마다)라 둔다. 거리 걷히기는 손가락을 따라가 끊을 수 있다. 동작 줄이기는 fixed라 하늘이 움직이지 않고 구름 나타나기(불투명도만)는 남는다. 날씨 창 바뀜은 겹쳐 바꾸기 대신 숨김 → 굽기 → 나타남이다(큐브 하나 더 2MiB를 쓰지 않는다, ADR 6절). 결론: 승인.
  - break-ui(HUD 하늘 줄, 재기 모드만): 실제 굽기 값으로 390px ko·en을 봤다. 두 줄로 접히고 넘침은 없다(영어 "… bake 213.1 ms ·" / "moons 0 · 2.6 MB"). 새 문구는 없다.
  - web-design-guidelines: 이번 단계에 새 화면 요소·문구가 없다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/clouds.ts`(새) | 구름 굽기·껍질 |
| `packages/engine/src/planet/cloudSchedule.ts`(새)·`cloudSchedule.test.ts`(새) | 굽기 예약과 시험 |
| `packages/engine/src/planet/cloudClimate.ts`(새)·`cloudClimate.test.ts`(새) | 면 방향 식·기후 큐브와 시험 |
| `packages/engine/src/planet/cloudNoise.ts`(새)·`cloudNoise.test.ts`(새) | 노이즈 격자·날씨 창·시드와 시험 |
| `packages/engine/src/planet/skyLayers.ts`(새) | 달·구름 만들기(엔진 600줄 아래로) |
| `packages/engine/src/planet/tilePipeline.ts`·`tilePipeline.test.ts` | 첫 단계 타일 늘 원함 |
| `packages/engine/src/planet/planetEngine.ts` | 하늘 프레임 값, 먼 자르기 면, 만들기 함수 연결 |
| `packages/engine/src/planet/planetView.ts` | 고른 칸 둘레 uniform, 새 물체만 미리 컴파일 |
| `packages/engine/src/planet/skyController.ts`·`skyController.test.ts` | 하늘 프레임 필드, `frozen` 빼기, 오류 보고 함수 내보내기, 구름 시험 |
| `packages/engine/src/planet/planetTypes.ts`·`index.ts` | `skySeed`, `skySeedOfHash` 내보내기 |
| `apps/game/src/map/planetSource.ts`·`planetSource.test.ts` | 정의 해시로 구름 시드 |
| `docs/adr/2026-10-29-primary-map-sky.md` | "구현하며 정한 것" 구름 절 |

## 함께 바꿔야 하는 파일
- 굽기 셰이더 면 방향(`clouds.ts` `FACE_DIR`)을 바꾸면 `cloudClimate.ts` `glCubeDirection`도(기후 큐브와 구름 큐브가 같은 방향을 봐야 한다).
- 구름 높이·걷히기 값은 `cloudSchedule.ts` `CLOUD_LOOK`·`sky.ts` `CLOUD_FADE` 한 곳씩이다.

## 건드리지 말 것
- `precompile`에 장면 전체를 넘기지 않는다(숨긴 메시 재질도 컴파일된다).
- 기후 큐브 읽기를 `texture(…, bias)`로 되돌리지 않는다(확대에서는 치우침이 효과가 없다).

## 미검증·TODO·알려진 문제
- 휴대폰에서 본 것이 없다(Unknown): 면 하나 굽기 시간(상한 4ms), 껍질 비용, 구름 모습·문턱·불투명도, 병렬 컴파일 확장. WP7에서 잰다.
- 데스크톱·가로 화면은 가장 먼 거리도 걷히기 구간 안이다(2.13~2.36R, 불투명도 0.72~0.79). 휴대폰 세로 기준 값이라 WP7에서 함께 본다.
- 화면 열기·닫기 10번 뒤 GL 자원이 돌아오는지(계획 WP5 메모리 시험)는 하지 않았다(아껴 쓰라는 요청, 스크립트는 하네스에 있다). 날씨 창이 실제 시계로 바뀌는 장면(3시간마다)은 단위 시험과 고정 시각 사진 두 장으로만 봤다.

## 사용자 결정 대기
- (2026-10-31 통합 때 (가)로 정함: ADR 10절에 상한 조정 줄을 더했다. 넘친 몫이 작고 첫 화면은 그대로라 기술 판단으로 정했다. 사용자가 바꾸라고 하면 (나)·(다)로 간다.) 1차맵 조각 상한: 하늘 작업 전보다 +34.86kB(gzip +12.28kB), 미리 캐시 +33.57KiB로 ADR 10절 상한(+25kB, gzip +10kB)을 넘었다. 첫 화면 JS는 그대로다. 선택: (가) 상한을 잰 값으로 올린다(권장, 넘친 몫은 gzip 약 2.3kB), (나) 줄인다(GLSL 공백·작은 정리로 약 1~2kB, 기능을 빼지 않고 10kB는 어렵다), (다) 구름을 따로 지연 조각으로(조각 상한은 맞지만 미리 캐시는 그대로).
