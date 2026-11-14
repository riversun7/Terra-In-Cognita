# 설정 칸 시간 단위·2차 스탯 에디터 화면 시험 실패 5건 고침

- 일시: 2026-11-14 15:37 (KST)
- 작업 도구: Claude Code
- 관련: 커밋 `9c5035c`(작업 기록 `2026/11/14-0828-secondary-stats-and-tuning-units.md`), ADR `2026-11-02-dev-ui.md`, `2026-11-01-dev-settings-panel.md`("바뀜" 범위 밖 맞춤 문구), D-534(`679f7e4`)

## 한 일
사용자 결정 "기술 세션이 고침"(기획 세션이 전함). `9c5035c`가 더한 시험·화면에서 난 화면 시험 실패 5건을 하나씩 화면 결함인지 시험 잘못인지 가렸다. 단위 전환과 2차 스탯 에디터의 의도한 동작은 그대로 두었다.

| # | 실패 | 판정 | 근거 | 고침 |
|---|---|---|---|---|
| 1·2 | `secondaryStats.spec.ts:38` 폭 390·1440 배치: `smallTapTargets`가 `input "초기 스탯 합" 260×16`(1440은 347×16)을 찾음 | **결함** | 초기 스탯 합 막대(`input type="range"`)에 label이 없고 높이가 기본 16px라 누르는 곳(`--tap-size` 24px, 터치 30px) 미달. ADR dev-ui "누르는 곳 최소 24px" | `secondaryStats.css` `.sec-range-inline input[type="range"]`에 `min-height: var(--dev-touch-tap)`(마우스 24px·터치 44px), `margin: 0` |
| 3 | `tuning.spec.ts:152` 서로 묶인 칸: `n9_initial_sum`에 150을 친 뒤 [담기]가 안 나옴 | **시험**(`9c5035c` 탓 아님) | D-534(`679f7e4`, 11-12)가 `n9_initial_sum` 최대를 100으로 내렸다. 150은 범위 밖이라 [담기] 대신 범위 문구가 나온다(화면이 맞다). 또 합 ≤ 100 ≤ 칸 최대 20 × 6이라 합만 바꿔서는 N9 거절을 만들 수 없다 | 칸 최대만 9로 담아(9 × 6 = 54 < 팩 합 60) N9 거절을 보고, 합 50을 함께 담아 받게 바꿨다. 시험 이름도 "칸 최대만 보내면 거절, 합과 함께 보내면 받는다"로. 내보내기 ID 세 개는 그대로 |
| 4 | `tuning.spec.ts:292` 값 칸 바로 검사: 범위 밖 값을 치고 떠난 뒤 `.tp-clamped`(10,000) 없음 | **결함**(`9c5035c` 회귀) | `RowEditor`가 처음 값이 바뀔 때 `setClamped(null)`을 새로 불렀다. 범위 밖 값을 끝 값으로 맞춰 담으면 처음 값이 곧 그 값으로 바뀌므로 맞춘 까닭 문구가 바로 지워졌다. ADR dev-settings-panel "범위 밖 정수는 칸을 떠날 때 끝 값으로 맞춰 담고 까닭을 적는다" | 단위가 바뀌었거나 새 처음 값이 지금 글자와 다를 때(담기 취소·적용·되돌리기)만 문구를 지운다. 맞춘 값을 담아 글자 = 새 값이면 남긴다(`TuningRow.tsx`) |
| 5 | `tuning.spec.ts:474` 시간(ms) 단위 전환(데스크톱): 데스크톱에서 안 보이는 `.tp-page-select`에 `selectOption` | **시험** | 시험이 다시 불러온 바로 뒤에 `choosePage`를 불러, 목록(`.tp-nav-list`)이 그려지기 전에 `isVisible()`이 false → 휴대폰용 고르기 상자로 갔다. 다른 데스크톱 시험은 목록을 먼저 기다린다. 이걸 고친 뒤에는 `.tp-preview`를 못 찾았다: 미리 보기는 처음 값과 다른 맞는 값을 칠 때만 보이는데(단위 전환 전부터 같은 규칙, `checkValueInput`·`checkDurationInput`의 `same`) 시험은 아무것도 치지 않았다 | `choosePage`가 먼저 `.tp-screen` `data-status="ready"`를 기다린다. 단위 전환 시험은 분으로 바꾼 뒤 값 칸 = 86,400, 지금 값 풀이에 `5,184,000,000 ms`를 보고, 86,460분을 쳐서 미리 보기·담은 값이 `5,187,600,000 ms`(ms 정수)인지 본 뒤 담기 취소한다. 시험 이름이 말하던 "단위 전환 후 담아도 ms 정수로 저장 대기"를 실제로 본다 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/secondaryStats/secondaryStats.css` | 초기 스탯 합 막대 누르는 곳 높이(실패 1·2) |
| `apps/game/src/editor/tuning/TuningRow.tsx` | 범위 밖 맞춤 문구가 담자마자 지워지던 회귀(실패 4) |
| `e2e/tuning.spec.ts` | 묶인 칸 시험을 D-534 범위에 맞춤(실패 3), `choosePage` 준비 기다림·단위 전환 시험이 실제로 값을 쳐 담음(실패 5) |

## 함께 바꿔야 하는 파일
- 없음

## 건드리지 말 것
- 단위 전환(`.tp-unit-switch`)·`ms` 정수 저장, 2차 스탯 에디터 동작은 `9c5035c` 그대로.

## 검증
- 화면 시험 `secondaryStats`·`tuning`·`dev`: 첫 실행 52개 중 51 통과, 실패 1(단위 전환 시험의 `.tp-preview`, 위 5번) → 시험 고친 뒤 `tuning` 단위 전환 + 배치·사진 시험 다시 실행 통과(사진용 임시 시험 포함 29 통과). **Verified**
- 사진(네온 다크·라이트 × 390·1440, 2차 스탯 에디터와 설정 칸 시간 단위 줄): 저장소 밖 임시 폴더. 막대 높이·단위 전환 줄 눈으로 확인. **Verified**
- `pnpm check`(DB 시험 포함): 단위 시험 687 파일·5,205개 통과. 빌드 뒤 `check-pwa`·`check:bundle` 통과, `check:docs origin/main` 통과. **Verified**

## 미검증·TODO·알려진 문제
- 실패 3이 `9c5035c` 앞(`679f7e4` 뒤)에서도 실패했는지는 그 판으로 돌려 보지 않았다(코드로 판단: 150 > 최대 100). **Assumed**

## 사용자 결정 대기
- 없음
