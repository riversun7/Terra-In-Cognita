# 앱 뼈대 W3·W4 문서 정리: ADR 37 "구현하며 정한 것" W3·W4, 0단계 남은 것 표시, PLAN 14장 줄

- 일시: 2026-10-31 09:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안), 작업 기록 `29-2240-app-shell-w3.md`·`30-0030-app-shell-w3-review.md`·`30-0210-app-shell-w3-integration.md`·`29-2300-app-shell-w4-home.md`·`30-0150-app-shell-w4-review.md`·`30-0220-app-shell-w4-integration.md`, main 합침 `18acf73`(W3)·`acd651d`(W4)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-notes`, 가지 `work/app-shell-notes-2`(main `acd651d`에서. 커밋 뒤 main `2bbf77b`(기획 미러 동기화, 문서만) 위로 옮겼고 겹친 파일은 목차 하나였다). 푸시·합치기는 하지 않았다.

## 한 일
- ADR 37 끝(W1 절 뒤)에 "구현하며 정한 것 (W3)"·"(W4)"를 합친 차례로 더했다. 줄기 기록·검토 고침·합치기 기록에서 옮겼고 코드와 대 봤다(아래 "확인").
  - W3: 서버 묶기·실패 규칙, 홈 조회 한 모듈, 시안 스위치 `terra.preview` 하나, 저장소 다시 받기(5초·10초), 종 배지, 모르는 분류·종류, 바로 처리 단추는 시안 자료에만, 마감 `formatDue` 내림, 강조 줄, 복귀 요약, 분류 아이콘 `ui/icons.tsx`(모름 = `bell`), 첫 화면 JS 126,188B(파일 5개).
  - W4: 템플릿 머리·뺄 수 없는 처리할 일 카드·줄 수·가린 줄의 분류별 수, 편집 시트(누르기 처리기에서만 연다, `chooseHome` false면 바꾸지 않고 알림), 자료 받기, 6절 "요청 하나"는 앱 안에서 돌아올 때만(켤 때는 두 번), 첫 화면 JS 125,940B(파일 3개).
- ADR 37 "결정을 반영할 때 할 일(0단계)"의 "남은 것" 중 된 세 줄에 "→ 했다"를 붙였다(지우지 않음): AGENTS 7장 명령(W5 `428ac81`), PLAN 14장 "다음은 0단계 코드"(`ed63ed4`), PROTECTED 괄호(`ed63ed4`. 처리할 일 종류는 넣었고 분류·동작 ID는 아직).
- PLAN 14장 "화면 흐름·첫 화면" 줄: 상태 → "앱 뼈대 W1~W5 main에 합침·NAS 배포(ADR 37 제안 그대로, 휴대폰 확인 뒤 확정)". 비고 끝에 합친 차례, 배포(CI 99 `sha-51ddd5f79578` W2·W5·W1, CI 101 `sha-18acf73a1472` W3, CI 102 `sha-acd651d8c184` W4), 첫 화면 JS, 남은 것. ADR 37 상태 줄은 제안 그대로다.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9)
| 무엇 | 결과 |
|---|---|
| 코드와 대 보기 | `inbox/preview.ts`(`terra.preview`), `inbox/store.ts`(60초·10초·5초), `summaryGate.ts`(10초), `inboxText.ts` `formatDue`(내림), `quickActions.ts`(시안 자료·아는 종류만), `InboxList.tsx`·`home/cards/icons.tsx`(`ui/icons.tsx`, 모름 `bell`), `homeView.ts` `HERO_CARDS`, `EditSheet.tsx`(처리할 일 카드에 빼기 없음), 줄 수(`PINNED_ROWS` 6, 카드 2·3·6, 처리함 30), `shellParts.tsx` `useSheetOverlay`, `homeSettings.ts` `patchHome`, `homePrefs.ts`(`terra.home`), `homeQueries.ts`(`loadInbox`·`loadSummary`·`loadCards`), 서버 `trpc/preview.ts`·`inbox/preview.ts`(8시간). 어긋난 것 없음 |
| `pnpm --filter @terra/game build` + `pnpm check:bundle`(main `acd651d`) | 125,940 B(파일 3개, 원본 410,159 B) / 상한 131,416 B, 남음 5,476 B. 첫 화면 소스 맵에 `home/`·`homeQueries`·공용 `inbox.ts`·`dashboard.ts`가 없다 |
| `git log -m --first-parent -S` | PROTECTED 괄호와 PLAN "다음은 0단계 코드"가 바뀐 곳은 둘 다 `ed63ed4` |
| `pnpm check`(DB 시험 없이, 문서 커밋 뒤 트리, 2분 6초) | 통과: 다국어 473개 키, 대비 148쌍(화면 CSS 19개), 콘텐츠 `core@3 (ca75451a06b5)`, 시험 파일 171개 통과·9개 건너뜀(DB), 시험 1,694개 통과·81개 건너뜀. 이 가지는 문서만 바꿨다 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-10-29-app-shell.md` | "구현하며 정한 것" W3·W4, 0단계 남은 것 세 줄 표시 |
| `docs/PLAN.md` | 14장 "화면 흐름·첫 화면" 줄 |
| `docs/worklog/2026/10/31-0910-app-shell-notes-2.md`, `docs/WORKLOG.md` | 이 기록, 목차 |

## 함께 바꿔야 하는 파일
- ADR 37을 확정할 때(휴대폰 확인 뒤) 상태 줄과 PLAN 13장 ADR 목록·14장 이 줄의 상태를 함께 바꾼다.

## 건드리지 말 것
- ADR 37 "남은 것"의 옛 줄은 지우지 않고 "→ 했다"만 붙인다(기록).

## 미검증·TODO·알려진 문제
- 켤 때 홈 요청 두 번, W4 홈·편집 조각 크기(gzip 약 15.9KB·6.6KB, W4 하네스 빌드)는 줄기 기록의 값이다. 이번에 다시 재지 않았다(화면 시험은 돌리지 않았다).
- PROTECTED "계정에 저장되는 ID"에 처리할 일 분류·동작 ID를 넣을지는 남았다(푸시 설정·`inbox_action` 때).

## 사용자 결정 대기
- 없음.
