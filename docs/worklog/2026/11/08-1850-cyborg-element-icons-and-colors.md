# 사이보그 생성과정 및 스탯 창 속성별 아이콘과 색상 적용

- 일시: 2026-11-08 18:50 (KST)
- 작업 도구: Antigravity
- 관련: docs/adr/2026-11-01-first-login-cyborg.md, 기획 D-182·D-450·D-5011

## 한 일
- 12속성(물, 빙결, 불, 폭렬, 바람, 번개, 땅, 크리스탈, 빛, 신성, 어둠, 암흑)에 대한 인라인 24×24 SVG 아이콘 컴포넌트(`ElementIcon`)를 신규 생성(`apps/game/src/ui/elementIcons.tsx`)했습니다.
- 사이보그 생성 4단계(속성 분배, `ElementsStep`):
  - 각 속성(물, 불, 바람, 땅) 이름 앞에 속성 아이콘(`ElementIcon`)을 배치하여 시각적 직관성을 향상했습니다.
  - 선택된 속성(`data-picked="true"`)의 테두리, 수치, 아이콘에 속성별 고유 테마 색상(`--element-color`)을 강조 적용했습니다.
- 사이보그 생성 7단계(강하 요약, `ElementsSummaryRow`):
  - 단순 텍스트("불 5 · 바람 5")로만 표시되던 속성 목록을 상단 초기 스탯 배지와 조화를 이루는 알약 캡슐 배지(`start-summary-element-chip`)로 전면 개편했습니다.
  - 각 속성별 아이콘, 속성명, 고유 테마 색상 및 수치가 포함된 칩으로 렌더링되며, 스크린 리더 및 e2e 테스트 호환용 구분자(`·`)를 숨김 텍스트로 보존했습니다.
- 사이보그 화면 / 스탯 창의 속성 판(`CyborgExtras.tsx`의 `Elements`):
  - 12개 모든 속성 카드에 고유 `ElementIcon`을 추가했습니다.
  - 12속성별 고유 테마 색상 토큰을 매핑하여, 수치가 있는 활성 속성은 테두리·아이콘·수치·채워진 눈금 점(`data-on="true"`)이 해당 속성 색상으로 선명하게 강조되도록 하고, 0인 속성은 뮤트 처리하여 한눈에 유효 속성이 부각되도록 꾸몄습니다.
- 융합 유전자 판(`GenePanel.tsx`):
  - 유전자 속성 칩(`fusion-element`)에도 `ElementIcon`과 속성 색상을 적용하여 게임 전반의 일관성을 높였습니다.
- 단위 테스트 작성(`apps/game/src/ui/elementIcons.test.ts`):
  - 12속성 아이콘 렌더링 및 `ElementsSummaryRow` 칩 렌더링 테스트를 추가하고 통과했습니다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/ui/elementIcons.tsx` | 12속성 SVG 패스 및 공용 `ElementIcon` 컴포넌트 신규 작성 |
| `apps/game/src/ui/elementIcons.test.ts` | 12속성 아이콘 및 요약 칩 렌더링 단위 테스트 |
| `apps/game/src/start/elementsStep.tsx` | 4단계 속성 아이콘 추가 및 7단계 강하 요약 속성 칩 렌더링 개편 |
| `apps/game/src/start/elements.css` | 4단계 속성 아이콘 배치 및 원소별 고유 테마 색상(`--element-color`) 스타일 |
| `apps/game/src/start/start.css` | 7단계 강하 요약의 속성 캡슐 칩(`start-summary-element-chip`) 스타일 추가 |
| `apps/game/src/cyborg/CyborgExtras.tsx` | 사이보그 스탯 창 속성 목록에 `ElementIcon` 적용 |
| `apps/game/src/cyborg/cyborg.css` | 12속성 카드 그리드 레이아웃, 아이콘 및 활성/비활성 색상 스타일 적용 |
| `apps/game/src/units/GenePanel.tsx` | 융합 유전자 판 속성 칩에 `ElementIcon` 추가 |
| `apps/game/src/units/fusion.css` | 유전자 속성 칩 아이콘 및 속성 색상 스타일 추가 |

## 함께 바꿔야 하는 파일
- 없음 (프론트엔드 UI/스타일 변경이며 서버/프로토콜 변경 없음)

## 건드리지 말 것
- 기획 수치 및 프로토콜 규격, 서버 속성 판정 로직

## 미검증·TODO·알려진 문제
- 없음 (디자인 토큰 대비 검사, biome 포맷, oxlint 타입 인식 린트, tsc 타입 검사, apps/game 954개 단위 테스트 모두 통과)

## 사용자 결정 대기
- 없음
