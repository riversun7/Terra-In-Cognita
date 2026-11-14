# 2차맵 장식 소품 작은 섬(islet) 지우기

- 일시: 2026-11-14 21:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-second-map-from-planet.md` "바뀜 (2026-11-14, 작은 섬 지움)", 사용자 결정 2026-11-14 "모두 지우기", 줄기 `work/islet-remove`

## 한 일
- 사용자가 휴대폰에서 바다 위에 뜬 나무로 본 물 위 장식 소품 "작은 섬"(`islet`)을 모든 곳에서 지웠다(팩 core@92).
- 그림 이름표 번호 자리는 남기고 "지운 그림"으로 표시했다: 콘텐츠 스키마가 막고, 엔진은 그리지 않는다. 그래서 작은 섬이 이미 들어 있는 고정본 2차맵도 새 기기에서는 보이지 않는다.
- **리셋 필요 여부: 필요 없다.** 고정본이 없는 2차맵은 배포 뒤 새 규칙 해시로 다시 만들고(작은 섬 없음, Verified: 코드 읽기), 고정본 2차맵은 지형 파일에 번호가 남지만 새 기기가 그리지 않는다(Verified: 엔진 시험·코드 읽기). 옛 기기는 PWA 갱신 전까지 고정본 2차맵에서 작은 섬을 본다(Assumed).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/map_props.json` | `islet` 항목 지움 |
| `content/core/id-changes.json` | 지움 기록(`map_props`/`islet`, since 92, 보상 없음) 뒤에 더함 |
| `content/core/manifest.json` | core@91 → 92 |
| `packages/shared/src/mapProps.ts`, `index.ts` | `MAP_PROP_ARTS`의 `islet` 자리는 그대로 두고 주석(지움, 번호 자리만 남김). `RETIRED_MAP_PROP_ARTS`·`isUsableMapPropArt` 추가 |
| `packages/content/src/schema/mapProps.ts`, `gatherObjects.ts` | 그림 종류 검사가 지운 그림도 막는다(안내 문구에서도 뺀다) |
| `packages/content/src/validate/mapProps.test.ts` | 지운 그림을 막는지 시험 |
| `packages/engine/src/props/propLook.ts`, `propKits.ts` | 작은 섬 겉모습·모델 지움 → 옛 고정본에 남은 번호는 그리지 않는다(모르는 번호 규칙) |
| `packages/engine/src/props/propLook.test.ts`, `propParts.test.ts` | 지운 그림은 겉모습이 없고 땅 색도 섞지 않는다 |
| `packages/planet/src/secondMap/testMapPropsTerrain.ts` | 시험 팩 사본에서 지움(`props.test.ts`가 팩과 같은지 본다) |
| `packages/planet/src/secondMap/generate.test.ts` | 골든 해시 호수 `cff29995` → `1d84dcaf`, 해안 `22ddfbb0` → `46165490` |
| `docs/adr/2026-10-31-second-map-from-planet.md` | "바뀜 (2026-11-14, 작은 섬 지움)" |

## 확인한 것
- 생성 비교(Verified): 시험 행성 F6 2차맵 1,730장(면마다 6칸 간격 + 호수 칸 절반 + 바다 칸 일부)을 같은 프로세스에서 앞 팩·새 팩 규칙으로 만들었다. 작은 섬이 있던 2차맵 394장, 바뀐 배치 칸 70,211 = 작은 섬 칸 전부, 작은 섬이 아닌 칸의 바뀜 0, 바뀐 칸에 다른 그림이 들어선 것 0(모두 0), 엄폐·높이·지표·물 층이 바뀐 2차맵 0. 규칙 해시(시험 바이옴) `33ba448f` → `7d6bb2fb`. 비교 스크립트는 커밋하지 않았다(임시 폴더).
- 서버 지형 길(Verified: 코드 읽기): 지형 판 표지 = 생성기 판·행성 생성기 판·정의 해시·소품 규칙 해시(`mapTerrain.ts` `terrainVersionToken`). 디스크 캐시 파일 이름에 판 표지가 들어가고 시작 때 다른 판 파일을 지운다(`terrainDisk.ts` `pruneTerrainCache`). 고정본은 `second_map_pins`의 그때 지형 파일·판 표지를 그대로 쓴다(`mapFactory.ts`, 건물을 처음 놓을 때 씀).
- 고정본을 서버에서 고쳐 쓰지 않은 까닭: 같은 판 표지(불변 주소)에 다른 내용을 내면 기기 캐시와 어긋나고, 고정본 규칙("처음 손댄 때의 지형")이 깨진다. 엔진에서 지운 번호를 그리지 않는 쪽이 작고 안전하다.

## 검사 (Verified: 실행)
- `pnpm --filter @terra/planet test`: 33 파일 241 시험 통과. 엔진 `src/props` 22 통과, 콘텐츠 `mapProps.test.ts` 8 통과.
- `pnpm check:content`: core@92 통과.
- `pnpm check`(TEST_DATABASE_URL 포함): 693 파일 5,229 시험 통과.
- `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,212 B / 상한 131,416 B(`apps/game`은 바꾸지 않았지만 엔진·공용 꾸러미가 묶음에 들어가서 돌렸다).
- 화면 시험 `e2e/map-props.spec.ts`·`e2e/terrain-objects.spec.ts`: 13 통과, 1 건너뜀(측정 시험, `E2E_MEASURE` 없음).
- `pnpm check:docs origin/main` 통과.

## 함께 바꿔야 하는 파일
- 그림을 또 지우면: `MAP_PROP_ARTS` 자리는 두고 `RETIRED_MAP_PROP_ARTS`에 넣고, 엔진 `propLook.ts` 겉모습을 지운다. 팩·시험 사본·골든 해시·`id-changes.json`을 함께 고친다.

## 건드리지 말 것
- `MAP_PROP_ARTS`에서 `islet` 자리를 지우거나 차례를 바꾸지 않는다(옛 지형 파일·옛 기기와 번호가 어긋난다).
- 개발자 2차맵 시험 문구 `second_map_lab_art_islet`는 남긴다(문구 표 타입이 이름표 전체를 키로 받는다, 옛 고정본 번호를 이름으로 보여 준다).

## 미검증·TODO·알려진 문제
- 고정본이 없는 2차맵에서는 빈 물 칸이 늘어 바다 위 채집 site(난파선 등) 자리가 옮을 수 있다(그 자리의 남은 번수는 가득으로 돌아간다). 크기는 재지 않았다(Assumed: 작다, 팩 소품 규칙을 바꿀 때마다 같은 길).
- 기획 42 §5 표(미러)는 호수 오브젝트에 "작은 섬"을 아직 적고 있다. 기획 원본 정리는 기획 세션 몫이다.
- NAS에서 눈으로 확인하지 않았다(배포 전).

## 사용자 결정 대기
- 없음
