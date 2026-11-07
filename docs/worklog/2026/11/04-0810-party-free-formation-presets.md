# 파티 9×6 자유 배치 사각형 진형 및 기본 진형 프리셋 6종 추가

- 일시: 2026-11-04 08:10 (KST)
- 작업 도구: Claude Code
- 관련: `docs/adr/2026-10-30-units-screen.md`, `docs/adr/2026-11-01-balance-screen.md`

## 한 일
- 고정 3×2(전열 3 · 후열 3) 파티 배치를 **전투맵(`32×32`~`128×128`, 기본 `64×64`, 실험실 `48×48`)과 2차맵(`256×256`, 배치 칸 `1칸 ≈ 1m`)에 맞춘 `9×6` 자유 배치 사각형 구역(가로 폭 `x ∈ [-4, +4]`, 전후 깊이 `y ∈ [0, 5]`, 전선 거리 `4 + y`칸)** 안에 최대 6명의 시작 위치를 자유롭게 놓는 방식으로 바꿨다 (**Verified**: `arena.test.ts`, `roster.test.ts`, `labModel.test.ts`).
- 기본 진형 프리셋 6종(`FORMATION_PRESETS`)을 `@terra/shared/roster`에 정의했다:
  - `two_row`: **2열 기본진** (`y=1` 전열 3명 + `y=4` 후열 3명)
  - `three_row`: **3열 종심진** (`y=0` 선봉 2명 + `y=2` 중위 2명 + `y=4` 후위 2명)
  - `v_wing`: **V자 학익진** (`y=0·2` 양 날개 전진 + `y=4` 중앙 본대 후위 포위 진형)
  - `wedge`: **역V 쐐기진** (`(0,0)` 중앙 선봉 돌파 + `y=1·3` 계단식 날개 돌격 진형)
  - `phalanx`: **방진 · 호위진** (`(0,2)` 중앙 핵심을 전방·좌우·후방에서 감싸 보호하는 진형)
  - `wide_line`: **횡대 산개진** (광역 스킬 피해 분산을 위해 좌우 `-4..+4`로 넓게 벌린 진형)
- 사이보그·미니언 화면(`/units` → `[파티]` 탭)의 `PartyCard`에 기본 진형 프리셋 6종 버튼, `9×6` 배치 사각형 격자, 6개 대원 슬롯 카드, 선택한 대원의 X/Y 좌표를 직접 바꾸는 선택 막대를 넣었다.
- 개발자 밸런스 화면(`/dev/balance` → `[전투 실험실]` 탭)의 `TeamPanel`에도 팀별 기본 진형 프리셋 6종 버튼과 `9×6` 자유 배치 격자를 넣고, 서버 전투장(`arenaInit`)이 유닛마다 지정된 `pos: { x, y }` 시작 좌표(`depth = 4 + y`, `lateral = x`)에 그대로 세우도록 연결했다 (**Verified**: `apps/server/src/battleLab/arena.test.ts`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/roster.ts` | `FORMATION_X_MIN/MAX`, `FORMATION_Y_MIN/MAX`, `FORMATION_FRONT_DISTANCE`, `FormationPoint`, `FORMATION_PRESETS`(6종), `isValidFormationPoint`, `rowFromFormationY`, `formationPointFromRow`, `presetFormationPoint` 추가 및 `RosterPartyMember`/`RosterParty` 확장 |
| `packages/shared/src/battleLab.ts` | `LabUnit`에 선택적 자유 배치 좌표 `pos?: FormationPoint` 추가 |
| `apps/server/src/roster/preview.ts` | 시안 파티 `Alpha`(`v_wing`), `Bravo`(`wedge`)에 프리셋 ID와 대원별 `(x, y)` 시작 좌표 부여 |
| `apps/server/src/battleLab/schema.ts` | `unitSchema`에 `pos: { x: -4..+4, y: 0..5 }` Zod 검증 추가 |
| `apps/server/src/battleLab/services.ts` | `toArenaUnit`에서 `unit.pos`를 `ArenaUnit`으로 전달 |
| `apps/server/src/battleLab/arena.ts` | `arenaInit`에서 `unit.pos`가 있으면 `depth = FORMATION_FRONT_DISTANCE + pos.y`, `lateral = pos.x`로 전투맵 시작 위치를 배치 |
| `apps/server/src/battleLab/arena.test.ts` | `9×6` 자유 배치 좌표(`pos`)가 전투맵 시작 좌표로 반영되는지 검증하는 단위 시험 추가 |
| `apps/game/src/units/UnitPanels.tsx` | `/units` 파티 카드에 6종 진형 프리셋 버튼, `9×6` 사각형 격자판, 6슬롯 카드, X/Y 좌표 선택 막대 구현 |
| `apps/game/src/units/units.css` | 파티 `9×6` 자유 배치 격자·프리셋 버튼·슬롯·좌표 선택 막대 스타일(`tokens.css` 변수만 사용) |
| `apps/game/src/editor/balance/lab/labModel.ts` | `partyFormationPositions`, `applyFormationPreset`, `moveUnitFormationPos` 순수 함수 추가 |
| `apps/game/src/editor/balance/lab/labModel.test.ts` | 전투 실험실 `9×6` 자유 배치 및 진형 프리셋 적용·자리 맞바꾸기 단위 시험 추가 |
| `apps/game/src/editor/balance/lab/TeamPanel.tsx` | 팀 A·B 패널에 기본 진형 프리셋 6종 버튼과 `9×6` 자유 배치 격자판 추가 |
| `apps/game/src/editor/balance/lab/battleLab.css` | 전투 실험실 `9×6` 배치 격자 스타일 추가 |
| `apps/game/src/editor/buildings/buildingEditor.css` | `check:contrast`가 금지하는 색 이름 부분 문자열(`blue`)이 들어간 토큰 참조를 `--color-stat-int`로 교체 |

## 함께 바꿔야 하는 파일
- 진형 배치 사각형 크기(`FORMATION_X_MIN/MAX`, `FORMATION_Y_MIN/MAX`)를 바꿀 때는 `packages/shared/src/roster.ts`, `apps/server/src/battleLab/schema.ts`, `apps/server/src/battleLab/arena.ts`를 함께 맞춘다.

## 건드리지 말 것
- `packages/sim` 및 결정성 검사 대상 파일에는 비결정적 연산을 넣지 않는다.
- CSS 파일에는 `tokens.css`의 `var(--...)` 토큰만 쓰고 생 색깔이나 `px` 단위를 직접 적지 않는다.

## 미검증·TODO·알려진 문제
- 파티 편성·진형의 DB 영속 저장은 M4 미니언·파티 저장 단계에서 서버 명령과 연결한다(현재 `/units`의 파티 탭은 시안 데이터 위에서 인터랙티브하게 동작하며, 전투 실험실은 기기 저장소 및 프리셋으로 저장·전투 실행됨).

## 사용자 결정 대기
- 없음.
