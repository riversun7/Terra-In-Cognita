# 작은 고침 셋: 개발 편집기 막대가 하단 탭에 가림, 다국어 겹친 키 검사, 2차맵 엔진 파일 나누기

- 일시: 2026-11-03 09:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-02-dev-ui.md`(개발 화면 층), `docs/adr/2026-10-28-i18n.md`(다국어 검사), 직전 기록 `03-0530-building-editor.md`의 "미검증·TODO"(아이템·스킬·설정 칸 막대가 390px에서 하단 탭 뒤), 가지 `work/small-fixes`

## 한 일
- **담은 변경 막대 띄움을 한 곳에서**: 개발 화면 층 `styles/dev.css`에 `--dev-dock-bottom`(하단 탭이 있으면 `--tabbar-h` + 안전 여백, 배치 C는 솟은 지도 버튼만큼 `--space-6` 더, 없으면 0)을 두고, 화면 아래에 붙는 막대 여섯(아이템 `.ie-stagebar`, 스킬 `.sk-actions`, 설정 칸 `.tp-pending`, 건물 `.be-stagebar`, 밸런스 가중치 `.bp-pending`·식 `.fx-pending`)이 `bottom: calc(var(--dev-dock-bottom) + 제 여백)`을 쓴다. 건물 편집기만 따로 두던 띄움 규칙 둘은 지웠다(건물 막대와 탭 사이 틈은 `--space-3` → `--space-2`로 다른 막대와 같아졌다).
  - 고치기 전 390px에서 잰 값(Verified, 새 시험을 고치기 전 CSS로 실행): 아이템·설정 칸·밸런스 막대 아래 끝 836~840px, 하단 탭(지도 버튼) 위 끝 766.8px → 막대가 탭 뒤에 걸렸다. 건물은 통과(이미 고쳐 둔 화면).
- **다국어 겹친 키 검사**: `scripts/check-i18n.mjs`가 메시지 파일 원문을 훑어(작은 토큰 읽기, 모든 깊이의 객체) 한 객체 안에 두 번 나온 키를 줄 번호와 함께 알리고 실패한다. JSON.parse는 뒤 값만 남겨서 다른 검사(키·변수 비교)로는 안 보였다. 검사 몸통을 `checkMessages`·`findDuplicateKeys`로 내보내고 명령줄은 `import.meta.main`일 때만 돈다. 지금 `apps/game/messages/{ko,en}.json`(키 3,432개)에는 겹친 키가 없다(고친 키 없음).
- **2차맵 엔진 나누기**: `packages/engine/src/secondMapEngine.ts` 626줄 → 522줄. 동작·API(`createSecondMapEngine`, `SecondMapEngine`)는 그대로 두고 책임 둘을 뺐다.
  - `lighting/sceneLight.ts`(96줄): 빛 둘(반구·방향)·하늘 색에 낮밤 빛을 넣고 1초 하늘 시계를 돈다(`start`·`frame`·`wake`·`setMode`·`stats`·`dispose`). three 객체 만드는 차례(카메라 → 빛 둘 → 지형·건물·유닛)는 그대로다.
  - `units/unitRoster.ts`(143줄): 유닛 id ↔ 슬롯, 고른 유닛, 경로·세우기·모습, 화면에서 누른 유닛 찾기. 서버 시계를 부르는 때(명단 바꿀 때 크기 검사 뒤, 세울 때 슬롯 확인 뒤)도 그대로다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/dev.css` | `--dev-dock-bottom` 정의(하단 탭·배치 C·안전 여백) |
| `apps/game/src/editor/items/itemEditor.css`, `skills/skillEditor.css`, `tuning/tuningPanel.css`, `balance/balancePanel.css`, `balance/formulaTab.css` | 막대 `bottom`이 `--dev-dock-bottom`을 더한다 |
| `apps/game/src/editor/buildings/buildingEditor.css` | 같은 값으로 바꾸고 따로 두던 하단 탭 규칙 둘을 지움 |
| `e2e/dev-stagebar.spec.ts`(새) | 390px × 네온·라이트에서 다섯 편집기의 막대가 아래에 붙은 채 하단 탭 위 끝보다 위인지, 사진 |
| `scripts/check-i18n.mjs`, `scripts/check-i18n.test.mjs`(새) | 겹친 키 검사, 시험 12개(줄 번호·이스케이프·값 안 괄호·안쪽 객체·저장소 파일·명령줄) |
| `packages/engine/src/secondMapEngine.ts` | 낮밤 빛·유닛 명단을 새 파일에 맡김 |
| `packages/engine/src/lighting/sceneLight.ts`(새) | 장면 빛·하늘 시계 |
| `packages/engine/src/units/unitRoster.ts`(새)·`unitRoster.test.ts`(새) | 유닛 명단·누른 유닛 찾기, 시험 5개 |

## 검사·시험 (Verified, 개발 컨테이너)
- `TEST_DATABASE_URL=… pnpm check` 통과(시험 383파일 3,220개, DB 시험 포함), `pnpm check:contrast` 통과(대비 738쌍, 화면 CSS 51개), `pnpm check:bundle` 통과(첫 화면 JS 105,572 B / 상한 131,416 B — 바뀐 화면은 모두 지연 조각).
- 단위 시험: `scripts/check-i18n.test.mjs` 12개, `packages/engine` 36파일 347개(새 `unitRoster.test.ts` 5개 포함) 통과.
- 화면 시험(작업자 하나, 한 번에): 147개 통과·3개 건너뜀(측정 시험, `E2E_MEASURE` 없음), 19.6분. 파일별 `dev-stagebar` 10(새), `items` 41, `skills` 12, `tuning` 20, `buildings` 11, `balance` 14, `formulas` 11, 엔진을 쓰는 `second-map-lab` 6·`vision` 13·`battle-replay` 9(낮밤 빛·땅 누르기·유닛 고르기·덧그림 층).
- 새 시험을 고치기 전 CSS로 먼저 돌려 아이템·스킬(그때는 담기 단계가 틀림)·설정 칸·밸런스가 실패하고 건물만 통과하는 것을 봤다(위 "한 일"의 잰 값).
- 사진: `dev-stagebar-{items,skills,tuning,buildings,balance}-{neon,light}-390.png` 10장을 눈으로 확인했다 — 막대가 하단 탭·지도 버튼 위에 붙고 탭 뒤로 걸리지 않는다(세션 임시 폴더, 저장소 밖).

## 함께 바꿔야 하는 파일
- 개발 화면에 화면 아래에 붙는 막대를 새로 만들면 `bottom: calc(var(--dev-dock-bottom) + …)`를 쓰고 `e2e/dev-stagebar.spec.ts`의 `EDITORS`에 넣는다.
- 하단 탭 높이·배치 C의 솟음(`tabbar.css` `.tab-map-button` 음수 위 여백)을 바꾸면 `dev.css`의 `--dev-dock-bottom`도 본다(`shell.css`의 새 버전 배너 띄움과 같은 식, `shell/layout.test.ts`는 dev.css를 보지 않는다).

## 건드리지 말 것
- `packages/sim/src/simulator/economy.ts`(775줄)는 다른 줄기가 고치는 중이라 이번에 나누지 않았다.

## 미검증·TODO·알려진 문제
- 600줄 넘는 파일(경고, 1,000줄 아래): `packages/sim/src/simulator/economy.ts` 775·`society.ts` 759·`index.ts` 735·`tuning.ts` 617, `packages/shared/src/routes.ts` 678, `apps/server/src/world/secondMap.ts` 916·`world.ts` 719·`app.ts` 627·`db/schema.ts` 984, CSS `planetEditor.css` 747·`economy.css` 688·`tokens.css` 666, 시험 `e2e/items.spec.ts` 734 등. 다음에 나눌 후보.
- 막대 띄움은 헤드리스 Chromium 390×844(안전 여백 0)에서만 쟀다. 실제 아이폰 홈 막대(안전 여백)는 재지 않았다(Unknown).

## 사용자 결정 대기
- 없음
