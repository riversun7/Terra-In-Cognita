# 2차맵 생성 WP-1: 행성 값 입력, 정본 노이즈, 바탕 높이·물가·강·지표, 이음매 시험, TCTR 2판

- 일시: 2026-10-31 18:52 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-second-map-from-planet.md`(46, 제안) "구현하며 정한 것 (WP-1 입력·이음매)", 기획 질문 124~129(`docs/questions/2026-10-31-second-map-generation.md`). 가지 `work/second-map-v2`

## 한 일
- `packages/planet/src/secondMap/`(진입점 `@terra/planet/secondMap`)에 2차맵 생성기를 새로 만들었다.
  - `generateSecondMap(행성 값, 맵 키)`: 지형 꼭짓점 129²의 높이(cm)·물 높이, 지형 칸 128²의 지표(11종), 엄폐 256²(WP-2까지 0), 실제 칸 크기(mm), 결과 해시.
  - 결정성 검사 대상이다(`**`·초월함수·`Math.random` 없음, 정수 노이즈).
- 행성 값 입력: `planetValuesFromGeneration`이 `runPlanetGenerator`의 필드와 부가 정보에서 흐름 방향·호수 수면·웅덩이 종류까지 모은다. `PlanetFields`·행성 생성기 판·골든 해시는 그대로다.
  - 행성 값 파일 "TCPV" 1판의 쓰기·읽기를 만들었다(칸마다 14바이트). 서버가 파일을 쓰는 것은 WP-3에서 한다.
- 이음매가 같도록 설계했다. 자세한 것은 ADR 46 "구현하며 정한 것".
  - 노이즈 열쇠는 정육면체 정수 점 Q다.
  - 칸마다 2차 베지어 조각(조절점은 값 × 12 정수)이다.
  - 물가는 땅·바다 높이를 따로 보고 몫 + 노이즈로 정한다. smoothstep 경사로 둔다.
  - 강은 변·꼭짓점을 건너는 자리 반지름 8 안에서 직선 거리로 깎는다.
  - 지표는 둘레 바이옴 몫 + 노이즈로 정한다. 눈 문턱을 흔든다.
- 경계 칸 짝 `stepMapCell`을 만들었다. WP-2 배치·WP-3 이웃 미리 받기에 쓴다.
- 지형 파일 TCTR 2판을 만들었다.
  - 머리는 64바이트다.
  - 본문에 물 높이와 엄폐 값을 더했다.
  - 해석기는 1판·2판을 모두 읽는다.
  - 서버는 아직 1판을 낸다(WP-3에서 바꾼다).
  - `TERRAIN_SURFACE`와 엔진 색표를 11종으로 늘렸다.
- 측정·그림 명령 `pnpm --filter @terra/planet second-map`을 만들었다(AGENTS.md 7장 표에 한 줄).

## 잰 값
- 시험:
  - 이음매 시험(`seams.test.ts`, S2 시험 행성 F6)에서 아래 경우 모두 공유 꼭짓점의 높이·물 높이가 비트까지 같았다(**Verified**).
    - 면 경계 48쌍 × 129꼭짓점.
    - 정육면체 꼭짓점 칸 24개의 모든 이웃(없는 대각선 24개 확인).
    - 강 칸 10개의 8이웃. 변 흐름과 꼭짓점 흐름이 실제로 있었다.
  - 경계 주름 지표(가로지르는 2차 차분 평균 ≤ 안쪽 × 1.25 + 1cm)를 통과했다.
- 측정 명령, F9 4×4 이어 붙임 세 곳(강·바닷가·산):
  - 이웃 공유 변 불일치는 0이었다(**Verified**).
  - 2차맵 한 장 생성 시간(개발 컨테이너 4코어, 부하 1.5~2.5)은 바닷가 p50 24.6ms, p95 45.1ms, 최대 56.6ms였다. 앞선 측정은 p50 21~33ms, p95 37~78ms, 최대 129ms(처음 JIT)였다. ADR 46 예산 0.1초 안이다(**Verified**, 개발 컨테이너).
  - NAS 값은 재지 않았다. 2~4배로 어림하면 0.05~0.3초다(**Assumed**).
  - F9 행성 생성은 약 11초였다(기존 값과 같음).
- 검사: `pnpm check`(DB 시험 포함) 통과, 시험 2,142개.
- 화면 시험 `pnpm e2e`: 85개 중 84개 통과(6.5분). 1개(`dev.spec.ts` 플레이어 권한 없음 화면)는 `page.goto`가 `net::ERR_ABORTED`로 실패했다. 그 파일만 다시 돌리니 12개 모두 통과했다(흔들림, 이 일과 무관한 화면).
- 그림(저장소 밖): 강이 2차맵 경계를 끊김 없이 건넜다. 바닷가는 자연스러운 모래 띠와 섬이었다. 연못이 있었다. 풀밭에서 고산으로 차츰 바뀌었다. 바이옴 경계가 칼로 자른 줄이 되지 않았다(눈으로 확인).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/secondMap/layout.ts`(새) | 2차맵 크기 상수, 맵 키 → 면 좌표, 꼭짓점 → 면 칸 좌표, 정육면체 점, 9이웃 |
| `packages/planet/src/secondMap/latticeNoise.ts`(새) | 정육면체 점 해시 값 노이즈(정수 smoothstep), 격자 채우기 |
| `packages/planet/src/secondMap/cellPatch.ts`(새) | 칸 2차 베지어 조절점(× 12 정수), 번스타인 표, 값 계산 |
| `packages/planet/src/secondMap/planetValues.ts`(새) | 행성 값 묶음, 생성 결과에서 모으기, TCPV 파일 |
| `packages/planet/src/secondMap/rivers.ts`(새) | 강 물길 배치(건너는 자리·토막·베지어), 깎기 래스터 |
| `packages/planet/src/secondMap/surfaces.ts`(새) | 지표 번호 `SM_SURFACE`, 바이옴 비중표 [임시], 잔기복 배율 |
| `packages/planet/src/secondMap/generate.ts`(새) | 생성기 본체 |
| `packages/planet/src/secondMap/hash.ts`·`edges.ts`·`version.ts`·`index.ts`(새) | 결과 해시, 경계 칸 짝, 생성기 판, 진입점 |
| `packages/planet/src/secondMap/testPlanetValues.ts`(새) | 시험 도우미: S2 시험 행성 F6 행성 값(캐시) |
| `packages/planet/src/secondMap/*.test.ts`(새 7개) | 배치·노이즈·조각·행성 값·경계 짝·이음매·골든 해시 |
| `packages/planet/bench/secondMap.ts`(새), `packages/planet/package.json` | 측정·그림 명령, `./secondMap` 내보내기 |
| `packages/protocol/src/terrain.ts`·`index.ts`·`terrain.test.ts` | TCTR 2판 쓰기·읽기, 지표 11종 |
| `packages/engine/src/terrain/terrainData.ts`·`terrainTextures.ts`·`terrainTextures.test.ts` | 지표 4~10 색 |
| `apps/server/src/world/secondMap.test.ts` | 지표 번호표가 생성기·프로토콜에서 같은지 본다 |
| `docs/adr/2026-10-31-second-map-from-planet.md` | 구현하며 정한 것(WP-1) |
| `docs/PROTECTED.md` | 2차맵 생성기 출력·지표 번호 규칙 |
| `AGENTS.md` | 7장 명령 표에 `second-map` |

## 함께 바꿔야 하는 파일
- 생성기 출력이 바뀌면 `generate.test.ts` 골든 해시를 함께 고친다. WP-3 배포 뒤에는 `version.ts` 판도 올린다(PROTECTED).
- 지표 번호를 더하면 `surfaces.ts` `SM_SURFACE`, protocol `TERRAIN_SURFACE`, 엔진 `SURFACE`·색표, 서버 지형 비용을 함께 바꾼다.

## 건드리지 말 것
- 행성 생성기(`packages/planet/src/generate/`)와 `PlanetFields` 모양: 2차맵을 위해 바꾸지 않았다. 행성 골든 해시도 그대로다.
- R2 경제 줄기 영역(`packages/sim/src/ledger`, 경제 코드, 콘텐츠 팩 경제 분류).

## 미검증·TODO·알려진 문제
- 서버는 아직 이 생성기를 쓰지 않는다(WP-3). 지형 비용은 S1 임시값이고 지표 4~10의 비용은 없다(WP-2·WP-3).
- 지표 비중·강 폭·깊이·잔기복 배율은 [임시]다(기획 질문 124·126 답, Step 5 설정값 전).
- 엄폐 층은 0이다(WP-2 배치).
- F9에서 2차맵을 행성 전체로 고르게 뽑아 잰 것은 아니다. 세 곳 × 16장이다.

## 사용자 결정 대기
- 2차맵 밤 깊이(낮밤 작업 기록 `31-1740`)는 휴대폰을 본 뒤 사용자가 정한다.
