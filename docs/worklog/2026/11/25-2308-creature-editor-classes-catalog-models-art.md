# 크리쳐 편집기 개선: 범위 줄 제거·분류 편집 UI·대중소 트리·388종 도감·기본 3D 모델 20종·12지신 초상화

- 일시: 2026-11-25 23:08 (KST)
- 작업 도구: Antigravity
- 관련: ADR `docs/adr/2026-11-25-creature-codex-groups.md`, 기획 `docs/design/51_Creature_Presets.md`, 앞 작업 `docs/worklog/2026/11/25-1940-creature-dex-rework.md`

## 한 일
사용자 요청(2026-11-25) 4가지를 반영했다.

1. **범위 줄 제거**: 크리쳐 도감은 행성과 무관한 공용 카탈로그(출현 조건은 인카운터 편집기에서 설정)이므로 `apps/game/src/scope/scopeRoutes.ts`에서 `dev_creatures: null`로 바꿔 `/dev/creatures` 위 `ScopeBar`("범위 모든 행성 공통…")를 숨겼다.
2. **분류 편집 UI·닫기 버튼 개선**:
   - 원인: `.ce-class-row-main`의 `grid-template-columns: auto 4rem repeat(auto-fit, ...)`가 CSS Grid 문법 위반(`auto`와 `auto-fit` 혼용 불가)이라 브라우저가 선언을 버려 1열 전체 너비로 길게 쌓이고 있었다.
   - 수정: flexbox 한 줄 배치 + 입력 칸 너비 고정(아이콘 `3.25rem`, 한국어 `9.5rem`, 영어 `10.5rem`, 위 분류 `12.5rem`), 트리 목록 스크롤 상자(`max-height: 28rem`), 분류 검색, 단계별 접기/펼치기(`▾`/`▸`, 모두 접기·모두 펼치기)를 넣었다.
   - 닫기 위치: `CreatureClassEditor`를 필터 막대 아래(표 바로 위)로 옮겨 `[분류 편집]` 버튼이 아래로 밀리지 않게 하고, 패널 머리 우측에 `[닫기]` 버튼을 추가했다.
3. **대·중·소 3단계 분류 트리(117개) 및 388종 도감 채우기**:
   - 기존 대분류 14종 ID를 유지한 채 중분류·소분류 103개를 추가해 총 117개 분류(`content/core/creature_classes.json`)를 구성했다.
   - 기존 크리쳐 91종의 ID·스탯·이미지를 유지하며 중·소분류와 3D 모델을 배정했다.
   - 기획 `51_Creature_Presets.md`와 사용자 아이디어를 반영해 297종을 추가해 총 388종(`content/core/creatures.json`, 팩 판 `core@155 → 156`)으로 확장했다:
     - **동양 12지신 24종**: 기본 동물 형태 12종(`zodiac_rat`~`zodiac_boar`, 신화 › 십이지신) + 크리쳐 환생 후 강한 인간형 화신 12종(`zodiac_*_avatar`, 인간형 › 십이지신 화신, `variantOf`로 각 동물형과 변종 그룹 연결).
     - **황도 12궁 48종**: 12궁 × 4단계(일반·희귀·보스·전설, 각 궁의 일반형을 대표로 `variantOf` 연결).
     - **동양 공용 39종**: 황룡(오방신 완성)·사흉 4종·용생구자 9종·기린·봉황·해태·구미호·이무기 등.
     - **서양 신화 52종**: 그리스·로마·북유럽·켈트·중세 우화집.
     - **16개 국가 프리셋 134종**: 미국·중국(산해경)·일본·한국·영국·독일/북유럽·프랑스·인도·브라질/남미·중동/이집트·지중해·동남아·멕시코/중미·슬라브·터키/페르시아·아프리카/오세아니아.
4. **기본 3D GLB 모델 20종 생성·연결**:
   - 대·중분류 대표 실루엣 20종(`beast_canine.glb`, `beast_heavy.glb`, `beast_equine.glb`, `beast_small.glb`, `dragon_western.glb`, `dragon_eastern.glb`, `aquatic_serpent.glb`, `aquatic_slime.glb`, `bird_raptor.glb`, `insect_arachnid.glb`, `humanoid_warrior.glb`, `humanoid_zodiac.glb`, `undead_wraith.glb`, `construct_golem.glb`, `dinosaur_theropod.glb`, `dinosaur_quadruped.glb`, `elemental_spirit.glb`, `plant_treant.glb`, `demon_fiend.glb`, `aberration_eldritch.glb`)을 Idle 애니메이션 포함 glTF 2.0 바이너리(총 734.9 KB)로 만들어 `apps/game/public/creatures/models/`에 넣고 388종 전체에 연결했다.
5. **게임 컨셉 일러스트 생성(11종 적용 후 한도 도달로 나머지 스킵)**:
   - 12지신 동물형·환생 인간형 화신 11종(`ZODIAC_RAT.jpg`, `ZODIAC_RAT_AVATAR.jpg`, `ZODIAC_OX.jpg`, `ZODIAC_OX_AVATAR.jpg`, `ZODIAC_TIGER.jpg`, `ZODIAC_TIGER_AVATAR.jpg`, `ZODIAC_RABBIT.jpg`, `ZODIAC_DRAGON.jpg`, `ZODIAC_DRAGON_AVATAR.jpg`, `ZODIAC_SNAKE_AVATAR.jpg`, `ZODIAC_HORSE.jpg`)을 512×512 JPEG로 최적화해 `apps/game/public/creatures/`에 넣고 `creatures.json`에 연결했다.
   - 이후 이미지 생성 모델 한도(`RESOURCE_EXHAUSTED`, HTTP 429)에 도달해 나머지 신규 크리쳐 이미지는 사용자 지시대로 건너뛰었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/scope/scopeRoutes.ts`, `scopeRoutes.test.ts` | `/dev/creatures`의 범위 줄(`ScopeBar`) 제거 및 단위 시험 갱신 |
| `apps/game/src/editor/creatures/CreatureClassPanel.tsx` | 분류 편집 머리 `[닫기]`·검색·접기/펼치기·간결한 행 구조 |
| `apps/game/src/editor/creatures/CreatureDex.tsx` | 분류 편집기를 필터 막대 아래로 이동하고 `onClose` 연결 |
| `apps/game/src/editor/creatures/creatureEditor.css` | 무효한 CSS Grid 선언 수정(flexbox 한 줄 배치), 입력 칸 너비 제한, 트리 스크롤 상자 |
| `content/core/creature_classes.json` | 3단계 분류 트리 117개(대 14 + 중·소 103) |
| `content/core/creatures.json`, `content/core/manifest.json` | 388종 도감(기존 91 + 신규 297), 3D 모델·11종 신규 초상화 연결, 팩 판 `155 → 156` |
| `apps/game/public/creatures/models/*.glb` (20개) | 대·중분류별 기본 3D GLB 모델(Idle 애니메이션 포함) |
| `apps/game/public/creatures/ZODIAC_*.jpg` (11개) | 12지신 동물형·환생 인간형 일러스트(512×512) |
| `e2e/dev.spec.ts`, `e2e/creatureDex.spec.ts` | 범위 줄 제외 확인, GLB 기본 연결·임시 몸 전환·분류 편집 닫기·그룹/전체 정렬 시험 갱신 |

## 함께 바꿔야 하는 파일
- 새 기본 3D 모델을 더할 때 `apps/game/public/creatures/models/`에 `.glb`를 두고 `content/core/creatures.json`의 `model`을 맞춘다.
- 추후 이미지 생성 한도가 풀리면 나머지 12지신(사·오 화신·미·신·유·술·해)과 황룡·사흉·별자리·신화 크리쳐 일러스트를 `apps/game/public/creatures/`에 추가하고 `creatures.json`에 연결한다.

## 건드리지 말 것
- 기존 대분류 14종 ID와 기존 크리쳐 91종 ID(`wolf` 첫 줄 유지, `slime` 단독 유지 — `e2e/creatureDex.spec.ts`·`e2e/creatures.spec.ts` 기준).
- `content/core/id-changes.json`은 이번 작업에서 ID 삭제·이름 변경이 없어 고치지 않았다.

## 미검증·TODO·알려진 문제
- **Verified** `pnpm check` 전체 통과: `biome format`(3,527파일), `typecheck`(8개 패키지 + e2e), `oxlint`(0 경고·0 오류), 경계·파일 크기·다국어(9,590키)·디자인 대비(746쌍, CSS 132개)·콘텐츠(`core@156`, 1·2·4a·4b 호환 포함), 단위 시험 823파일 6,210건 통과(DB 시험 107파일은 `TEST_DATABASE_URL` 없이 건너뜀).
- **Verified** `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 JS 114,096 B / 상한 131,416 B) 통과.
- **Verified** 화면 시험 `e2e/creatureDex.spec.ts` 11/11 통과, `e2e/dev.spec.ts --grep "범위 줄"` 2/2 통과. 1440 네온 스크린샷으로 범위 줄 제거·388종 도감·3D GLB 모델·분류 편집 한 줄 레이아웃과 닫기 버튼 확인.
- TODO: 이미지 생성 한도 초기화 뒤 미생성 크리쳐 일러스트 보충. 추후 소분류·속성별 3D 모델 색/뿔/장식 바리에이션 시스템 연결.
- 커밋하지 않았다(작업 트리에 다른 작업 `home-city-card` 변경분이 함께 있음).

## 사용자 결정 대기
- 없음.

- 커밋 때(2026-11-26) 팩 판은 158이다: 그 사이 다른 커밋이 157까지 올려, 호환 검사에 맞춰 한 번 더 올렸다. 깨끗한 작업 복사본에서 `pnpm check`·`check:content`·`check-pwa`·`check:bundle`, 화면 시험 `e2e/creatureDex.spec.ts`·`e2e/dev.spec.ts` 26개가 통과했다(Claude Code가 대신 확인·커밋).
