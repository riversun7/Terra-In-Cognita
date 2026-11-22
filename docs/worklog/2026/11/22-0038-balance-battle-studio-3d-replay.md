# `/dev/balance` 전투 테스트 양쪽 팀 세팅·1:1 비교·군단 편성·3D 전투 리플레이 통합

- 일시: 2026-11-22 00:38 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-01-balance-screen.md`, `docs/adr/2026-11-01-battle-replay.md`, `docs/adr/2026-11-14-battle-report.md`

## 한 일
- `/dev/balance` 전투 테스트 화면을 위에서 아래로 흐름이 바로 보이게 다시 짰다(**Verified** — 빌드·단위 시험·정적 검사).
  - **상단 조작 막대(`BattleCommandStrip`)**: `1:1 비교`·`파티전`·`군단전` 전환, `A ↔ B 바꾸기`·`A → B 복사`, `[3D 전투 보기]`·`[한 판]`·`[3D 탭에서 보기]`, 지형·시드 선택과 한 판 결과를 화면 맨 위로 올렸다.
  - **양쪽 팀 세팅(`.bl-teams-vs`)**: 넓은 화면에서 팀 A(왼쪽)·팀 B(오른쪽)를 나란히 배치했다. 9×6 자유 배치 격자는 접이식(`<details>`)으로 정리해 기본 화면을 간결하게 했다.
  - **1:1 전투 비교(`DuelCompareCard`)**: `1:1 비교`를 누르거나 양 팀이 1파티 1유닛이면 서버 미리 보기로 두 유닛의 HP·공격력·공격 간격·사거리·명중·크리·방어·1차 스탯을 나란히 비교해 준다.
  - **팀·파티·군단 저장과 불러오기(`LegionBar`, `legionPresets.ts`, `fields.tsx`, `PresetBar.tsx`)**:
    - 프리셋 저장 창에서 한국어·영어 이름 중 한쪽만 적어도 나머지 칸을 자동 채움해 바로 저장되게 했다.
    - 군단 편성 줄에서 저장된 파티 프리셋(샘플·팀 프리셋)을 골라 곧바로 군단의 새 파티로 추가할 수 있게 했다.
    - 여러 파티를 묶은 군단을 이 기기(`localStorage`)에 이름으로 저장·불러오기·지우기할 수 있게 했다.
  - **3D 전투·리플레이 통합(`BattleReplayTab`, `useWatchBattle.ts`, `BalancePanelScreen.tsx`, `ReportLogTab.tsx`)**:
    - `/dev/balance` 안에 `[3D 전투 · 리플레이]` 탭(`?tab=replay`)을 추가해 현재 팀 A vs 팀 B 세팅(1:1·파티전·군단전, 전투맵 명령 포함)과 기존 `/dev/battle-replay`의 시범 6 대 6 시드 재생을 한곳에서 볼 수 있게 했다.
    - `[보고서 기록]` 탭의 파티 대 파티 기록에 `[3D 보기]` 단추를 더해 저장된 기록을 곧바로 3D 탭에서 재생할 수 있게 했다.
    - 별도 페이지였던 `apps/game/src/editor/battleReplayLab/`을 삭제하고 `/dev` 홈의 중복 카드를 제거했다. 옛 `/dev/battle-replay` 주소는 `routes.ts`에 `parent: "dev_balance"`로 유지해(즐겨찾기·기존 시험 호환, `docs/PROTECTED.md`) 접속 시 `/dev/balance`의 `[3D 전투 · 리플레이]` 탭(시범 6 대 6 자동 재생)으로 바로 열리게 했다(`/dev/gather-tiers` → `/dev/production` 통합 방식과 동일).
- **UI 테두리·정렬·칸 크기·고정 미리 보기 정비**(**Verified** — 빌드·대비·정적 검사):
  - 모든 창(`.bp-panel`)에 또렷한 외곽 테두리(`--color-border-strong`)와 어두운 머리 막대(`--color-card-head`)를 입히고, 팀 A·B의 군단 줄과 팀 판을 하나의 통합 창으로 묶었다.
  - 모든 접이식 구간(`.bl-details`)을 테두리·머리 막대·안쪽 본문(`.bl-details-body`)이 있는 카드로 감싸 접힘·펼침 경계가 분명하게 했다. 유닛 편집 머리 줄에 `[모두 펼치기]`·`[모두 접기]`를 넣었다.
  - `1차 스탯 · K`·`스킬 등급`·`퇴각 기준`·`시드` 등 숫자 입력 칸을 자릿수에 맞는 고정 폭(`bl-num-compact`, 오른쪽 정렬 숫자)으로 줄이고 표 머리·입력 정렬을 맞췄다.
  - `1:1 스탯 비교` 표(`.bl-duel-table`)를 `.bl-table`의 우측 정렬 상속에서 분리해 `팀 A(39%) | 항목(22% 가운데 기둥) | 팀 B(39%)` 대칭 가운데 정렬로 바로잡았다.
  - `미리 보기` 창(`.bl-preview`)을 넓은 화면에서 오른쪽에 고정(`position: sticky`)해 왼쪽 편집 칸을 접고 펼칠 때 화면이 오르내리며 미리 보기를 놓치지 않게 하고, `1차 스탯`·`전투 사양 요약`·`2차 스탯(2열 타일 카드)`·`공격·적정`을 각각 안쪽 카드(`.bl-subcard`)로 구획했다.
- **`[유닛 · 프리셋]` 전용 탭·다양한 샘플 프리셋·일괄 레벨 조정**(**Verified** — 빌드·단위 시험·정적 검사):
  - `/dev/balance`에 `[유닛 · 프리셋]` 탭(`UnitWorkshopTab.tsx`, `#bp-tab-units`)을 추가했다. 저장된 팀 유닛과 내장 샘플을 검색·종류별 필터로 골라 `UnitEditor` + `UnitPreview`로 세팅·저장하고 `[팀 A에 추가]` / `[팀 B에 추가]`로 곧바로 전장에 투입할 수 있다.
  - 서버 내장 샘플 프리셋(`apps/server/src/battleLab/samples.ts`)을 **유닛 17종 + 파티 9종(총 26종)**으로 늘렸다(암살자·광전사·지휘관·빙결/번개/대지 마법사·흑마법사·안드로이드 선봉/포격·Lv 50 최정예 + 근접 돌격대·원소 마법대·철벽 수비대·정예 6인 풀파티·안드로이드 소대·Lv 50 최정예 편대).
  - 상단 조작 막대에 **양 팀 전체 일괄 레벨 조정 바**(`Lv 1/10/20/30/50/60`, `-5/-1/+1/+5`, 직접 입력 `[전체 적용]`)와 각 팀 창에 **팀별 일괄 레벨 조정 바**(`-5/-1/+1/+5`, 직접 입력 `[적용]`)를 추가했다(`setPartyLevel`·`shiftPartyLevel`).
- 단위 시험(`legionPresets.test.ts`, `labModel.test.ts`, `samples.test.ts`)과 화면 시험 시나리오(`e2e/battleLab.spec.ts`)를 추가했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/balance/BalancePanelScreen.tsx` | `[3D 전투 · 리플레이]` 탭 추가, 공용 3D 관람 상태(`useWatchBattle`) 연결, 보고서 기록에서 3D 재생 연결 |
| `apps/game/src/editor/balance/lab/BattleLab.tsx` | 상단 조작 막대 → 팀 A·B 양쪽 배치 → 1:1 비교 카드 → 유닛 편집·미리 보기 작업대 → 보고서 설정으로 재구성 |
| `apps/game/src/editor/balance/lab/BattleCommandStrip.tsx` | 전투 규모(1:1·파티·군단)·팀 바꾸기/복사·3D 전투 보기·한 판·지형/시드·한 판 결과 상단 배치 |
| `apps/game/src/editor/balance/lab/LegionBar.tsx` | 군단 파티 탭, 저장된 파티 프리셋을 군단에 바로 추가, 군단 저장·불러오기·지우기 |
| `apps/game/src/editor/balance/lab/DuelCompareCard.tsx` | 1:1 상태일 때 팀 A·B 유닛 서버 미리 보기 스탯 비교 표 |
| `apps/game/src/editor/balance/lab/BattleReplayTab.tsx` | `/dev/balance` 안 `[3D 전투 · 리플레이]` 통합 탭(현재 세팅 3D 재생 + 시범 6v6 시드 재생 + 전체 화면) |
| `apps/game/src/editor/balance/lab/useWatchBattle.ts` | 3D 리플레이 녹화·실시간 전투맵 명령·단일 WebGL 엔진 제어 훅 |
| `apps/game/src/editor/balance/lab/legionPresets.ts`, `legionPresets.test.ts` | 군단 프리셋 저장소(`localStorage`)와 1:1·팀 바꾸기 순수 함수 및 단위 시험 |
| `apps/game/src/editor/balance/lab/TeamPanel.tsx` | 9×6 진형 배치 접이식 전환, `1명만 남기기` 빠른 정리 단추 추가 |
| `apps/game/src/editor/balance/lab/PresetBar.tsx`, `fields.tsx` | 프리셋 선택·불러오기·저장 주 줄 정리, 이름 한쪽만 입력해도 자동 채움 저장 |
| `apps/game/src/editor/balance/lab/labModel.ts` | `looksLikeParty` 내보내기(군단 프리셋 모양 검사 재사용) |
| `apps/game/src/editor/balance/lab/battleLabStudio.css` | 새 스튜디오 레이아웃·양쪽 팀·1:1 비교·군단 편성·3D 리플레이 탭 스타일(`var(--…)` 토큰만 사용) |
| `apps/game/src/editor/balance/lab/ArenaPanel.tsx` | `BattleCommandStrip`으로 통합돼 미사용 파일 제거 |
| `apps/game/src/editor/balance/report/ReportLogTab.tsx` | 파티 대 파티 보고서 기록에 `[3D 보기]` 단추 추가 |
| `apps/game/src/editor/battleReplayLab/` | `/dev/balance`의 `[3D 전투 · 리플레이]` 탭으로 완전 통합해 별도 화면 파일 삭제 |
| `packages/shared/src/routes.ts`, `routes.test.ts`, `battleReplay.ts` | `dev_battle_replay`를 `parent: "dev_balance"`, `frame: "shown"`으로 변경(옛 주소는 통합 탭으로 연결) |
| `apps/game/src/shell/routeViews.tsx`, `DevHome.tsx`, `scope/scopeRoutes.ts` | `/dev` 중복 카드 제거, `/dev/battle-replay`를 `BalancePanelScreen` 리플레이 탭(시범 6v6 자동 재생)으로 연결, 범위 표 일치 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`, `pwa-build.test.mjs` | 삭제된 `BattleReplayLabScreen` 조각·진입점 목록 정리 |
| `e2e/dev.spec.ts`, `e2e/battle-replay.spec.ts` | `/dev` 도구 수(21→20)·범위(`common`) 및 통합 `[3D 전투 · 리플레이]` 탭 선택자 갱신 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 새 UI 문구 한·영 추가 및 `3D 관람` → `3D 전투 보기` 명확화 |
| `apps/game/src/editor/balance/lab/UnitWorkshopTab.tsx` | `[유닛 · 프리셋]` 전용 탭(도감 검색·필터·세팅 저장·빠른 레벨·팀 A/B 추가) |
| `apps/server/src/battleLab/samples.ts` | 역할·속성·종족·레벨별 유닛 샘플 10종 + 파티 샘플 6종 추가(총 26종) |
| `e2e/battleLab.spec.ts` | 1:1 비교·일괄 레벨·`[유닛 · 프리셋]` 탭·파티 프리셋으로 군단 편성·군단 저장·통합 `[3D 전투 · 리플레이]` 탭 시험 추가 |

## 함께 바꿔야 하는 파일
- `docs/WORKLOG.md` (`pnpm docs:index`로 자동 갱신)
- `apps/game/src/paraglide/` (빌드·typecheck 시 자동 생성, 저장소 제외 여부 따름)

## 건드리지 말 것
- `packages/shared/src/routes.ts`의 `/dev/battle-replay` 경로는 보호 대상(`docs/PROTECTED.md`)이라 지우지 않고 유지했다.
- `e2e/battleLab.spec.ts`·`e2e/battleReport.spec.ts`가 쓰는 기존 선택자(`.bl-watch`, `.bl-battle`, `.rp-party-add`, `.rp-mode`, `.rp-limit`, `.rp-runs` 등)와 중복 방지 규칙을 유지한다.

## 미검증·TODO·알려진 문제
- **검증 완료 (Verified)**: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm check:content --no-compat`, `pnpm test`(761개 파일, 5,779개 시험 통과), `pnpm --filter @terra/game build`, `pnpm check:bundle`, `node scripts/check-pwa.mjs`, `pnpm check:docs`.
- **미실행 (Playwright E2E)**: 로컬 환경에 Playwright용 `chromium-1243` 바이너리가 없어 `pnpm e2e e2e/battleLab.spec.ts`는 실행하지 못했다. 브라우저가 설치된 환경에서 `e2e/battleLab.spec.ts`와 `e2e/battleReport.spec.ts` 실행 확인이 필요하다.
- 군단 프리셋은 현재 기기(`localStorage`)에 저장된다. 팀 공용 DB 저장이 필요하면 `battle_lab_presets_kind` 제약 확장 마이그레이션으로 확장할 수 있다.

## 사용자 결정 대기
- 없음.
