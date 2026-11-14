# 느려짐 소품 느림 배율 (눈더미·모래언덕·늪 웅덩이)

- 일시: 2026-11-14 09:25 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-540 1223 나, 질문 `docs/questions/2026-11-12-terrain-objects.md` 1223, ADR `docs/adr/2026-11-07-gather-objects.md` "바뀜 (2026-11-13): 느려짐 소품 느림 배율", 가지 `work/slow-props`, `SIM_VERSION` 37, 팩 core@84

## 한 일
- 팩 `map_props` 흩기 항목에 느림 배율 `slowPm`(천분율 1001 ~ 5000, 엄폐 0·1 마른 칸 소품만) 스키마와 값: 눈더미·모래언덕·늪 웅덩이 [임시] 1500.
- `@terra/sim` `placementCostsFromLayers`가 그림 번호 → 느림 배율 표(`slowByArt`)를 받으면 그 그림이 선 지나갈 수 있는 칸 비용 × 배율(숲 지나가기와 같은 길). `SIM_VERSION` 37.
- 서버: 팩 → 표(`mapPropSlowByArtFromPack`) → 지형 서비스·지형 워커(생성·디스크 캐시 읽기)·고정본 읽기(`mapFactory.ts`). 생성기 입력·소품 규칙 해시는 그대로(지형 캐시 열쇠 그대로).
- 걷는 빠르기는 바꾸지 않았다: 숲도 길 고르기 비용만이고 유닛은 경로 전체를 같은 빠르기로 간다(`motion.ts`). 질문 1317.
- 측정 스크립트 `bench:second-map [레벨] [수] [바이옴]`의 느려짐 모드(`apps/server/bench/slowProps.ts`).
- 지형 오브젝트 편집기(`/dev/terrain-objects`): 느림 배율 칸, 줄 종류 "느려짐"(ko·en 메시지).

## 측정 (Verified, 공유 개발 기계, F9 2차맵 3장씩, 경로 1,000개 같은 출발·목표)
| 바이옴 | 느려짐 칸 몫 | 밟은 느려짐 칸 평균(표 없음 → 1.5배) | 경로 칸 평균 | 펼친 칸 평균 | 경로 시간 합 | 크기 등급 1 비용(돌아가지 않음 → 돌아감) |
|---|---|---|---|---|---|---|
| 사막 | 3.7 / 3.5 / 1.7% | 5.7→0.2 / 5.3→0.2 / 3.8→0.4 | +0.1 ~ 0.2 | 4439→4486 / 3279→3274 / 2009→2036 | 943→1042 / 687→822 / 433→442 ms | −2.3 / −2.2 / −1.9% |
| 툰드라 | 1.2 / 1.4 / 1.9% | 1.7→0.1 / 2.0→0.1 / 2.3→0.1 | +0.0 ~ 0.1 | 8954→8972 / 9167→9183 / 408→527 | 1986→2250 / 2101→2079 / 121→151 ms | −0.7 / −0.8 / −0.9% |
- 느림 표를 넣은 지형 비용 계산 0.6 ~ 6.9 ms(2차맵 하나, JIT 전후 흔들림). 원본 출력: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/slow-bench-desert.md`, `…/slow-bench-tundra.md`(임시).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/terrain/layerCosts.ts`, `.test.ts`, `version.ts` | 느림 배율 표 → 칸 비용, SIM_VERSION 37 |
| `packages/content/src/schema/mapProps.ts`, `validate/mapProps.test.ts` | `slowPm` 칸·조건 |
| `content/core/map_props.json`, `manifest.json` | 세 소품 1500, 설명, core@84 |
| `apps/server/src/world/mapProps.ts`, `.test.ts` | 팩 → 표, 사막 2차맵 비용 시험 |
| `apps/server/src/world/mapTerrain.ts`, `terrainCore.ts`, `terrainMessages.ts`, `terrainService.ts`, `mapFactory.ts`, `appOptions.ts`, `app.ts`, `main.ts` | 표를 생성·캐시·고정본 지형 비용까지 넘김 |
| `apps/server/bench/secondMapPaths.ts`, `slowProps.ts` | 느려짐 경로 측정 |
| `apps/game/src/editor/terrainObjects/*`, `apps/game/messages/{ko,en}.json`, `e2e/terrain-objects.spec.ts` | 편집기 느림 배율 칸 |
| `docs/adr/2026-11-07-gather-objects.md`, `docs/questions/2026-11-13-slow-props.md` | 바뀜 기록, 질문 1316 ~ 1318 |

## 함께 바꿔야 하는 파일
- 새 지형 비용 호출 길을 더하면 `slowByArt`도 넘긴다(전투장·임시 지형은 그림 층이 없어 해당 없음).
- 소품 그림 번호(`@terra/shared` `MAP_PROP_ARTS`)가 256을 넘으면 `SLOW_TABLE_SIZE`·지형 파일 그림 층 형식을 함께 본다.

## 건드리지 말 것
- 느림 배율을 생성기 입력(`mapPropInputsFromPack`)·소품 규칙 해시에 넣지 않는다(넣으면 지형 캐시·주소 판 표지가 바뀐다, 생성기 출력은 같다).
- 걷기 빠르기 공식(walk-agi 줄기).

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL 켬): 시험 파일 673·시험 5,117 모두 통과.
- `pnpm build` → `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,275 B / 상한 131,416 B, `pnpm check:docs origin/main` 통과.
- 화면 시험 `terrain-objects`·`play-map`·`seamless` 38개 통과(10.1분). 편집기 390px 단위 글자가 세로로 쪼개져(느림 배율 칸 때문에 더 좁아짐) `.to-amount` 단위를 한 줄로·입력 아래로 내린 뒤 `terrain-objects --grep 편집기` 3개 다시 통과.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/slow-props-shots/terrain-objects-slow-390-{neon,light}.png`(임시).

## 미검증·TODO·알려진 문제
- 편집기 390px: 긴 코드 ID(`termite_mound` 등)가 다음 줄 이름과 겹친다(이 줄기 전부터 있던 것, 고치지 않음).
- 실제 서버에서 유닛이 소품을 돌아가는 것은 눈으로 보지 않았다(Unknown). 시험·측정으로만 확인.
- 느려짐 칸에서 실제로 느리게 걷지는 않는다(질문 1317).

## 사용자 결정 대기
- 질문 1316(배율 값), 1317(실제 빠르기), 1318(다른 소품).
