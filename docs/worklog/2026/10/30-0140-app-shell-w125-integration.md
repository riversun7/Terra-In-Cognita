# 앱 뼈대 W2·W5·W1 main 합치기

- 일시: 2026-10-30 01:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37) 4·5·11절, 머지 `e32515b`(W2)·`428ac81`(W5)·`a86f043`(W1), 작업 기록 `29-2220-app-shell-w2.md`·`29-2300-app-shell-w5.md`·`29-2310-app-shell-w1.md`와 각 검토 기록(`30-0020`·`30-0045`·`30-0120`)

## 한 일
- W2(계정 설정 nav·home) → W5(저장소 `e2e/` 화면 시험, 첫 화면 크기 검사) → W1(라우터·화면 틀·하단 탭·서랍·지도 위 단추) 순서로 main에 합쳤다. 잠금 파일이 바뀐 W5 뒤에는 `pnpm install --frozen-lockfile`을 돌렸다.
- W1은 W2 없이 만들어져서, 합칠 때 `apps/game/src/shell/shellPrefs.ts`만 고쳤다(W1 파일 머리 주석의 "W2 뒤에 바꿀 곳" 그대로).
  - 읽기: `parseNavigation(useSettings().device.nav)`.
  - 쓰기: `chooseNavigation(mergeNavigation(getSettingsSnapshot().device.nav, 바꾼 칸))`의 결과를 돌려준다(저장하지 못하면 false, 바꾸지 않음).
  - 레일 접힘은 그대로 이 기기 localStorage(`terra.shell`)에 둔다.
- 첫 화면 JS 상한(`apps/game/bundle-budget.json`)을 131,416B로 정했다. 잰 값은 123,416B(gzip 9단계, 파일 2개: `index` 95,848B + `device` 27,568B, 원본 403,545B)이고, 여유 8,000B를 더했다(Verified: `pnpm check:bundle`). W5가 처음 둔 값은 W1 화면 틀(라우터·탭·서랍)이 들어가기 전의 크기였다.
- 합친 나무에서 화면 시험을 돌렸다: 17개 모두 통과(1.3분, `e2e/shell.spec.ts` 15개 + `e2e/smoke.spec.ts` 2개). 빈 캐시에서 행성 두 개를 굽는 데 33.4초가 걸렸다(Verified: `TEST_DATABASE_URL=… pnpm e2e`).
- 배포 때 마이그레이션 `20261029125339_user_settings_nav_home`(열 두 개 추가: `nav`·`home` jsonb)이 돈다. 이름이 이미 NAS에 올라간 `20261029135300_planet_drafts`보다 앞 시각이지만, Drizzle 1.0.0-rc.5는 적용 여부를 이름으로만 판단하므로 빠지지 않는다(Verified: 패키지 코드 `migrator.utils.js` `getMigrationsToRun`, AGENTS §6과 같다). 열 추가뿐이라 직전 버전 앱이 그대로 돈다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/shell/shellPrefs.ts` | W1 메뉴 설정을 W2 계정 설정 묶음으로 읽고 쓰기(합칠 때) |
| `apps/game/bundle-budget.json` | 화면 틀이 들어간 첫 화면 크기에 맞춘 상한 |
| `docs/worklog/2026/10/30-0140-app-shell-w125-integration.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 메뉴 설정 모양을 바꾸면 `packages/shared/src/settings.ts`(parse·merge), `apps/game/src/settings/settings.ts`(chooseNavigation), `apps/game/src/shell/shellPrefs.ts`를 함께 본다.
- 첫 화면 상한을 다시 올리면 늘어난 까닭과 잰 값을 작업 기록에 적는다(ADR 37 11절).

## 건드리지 말 것
- 올라간 마이그레이션 폴더(`apps/server/drizzle/*`)는 고치지 않는다. 시각 순서를 맞추려고 이름을 바꾸지 않는다(이름이 바뀌면 다시 적용하려 한다).

## 미검증·TODO·알려진 문제
- NAS 배포·마이그레이션은 이 푸시 뒤 CI에서 돈다. 미실행이다. 배포 뒤 `nas-metrics`로 오류가 없는지 본다.
- W3(알림·받은 편지·돌아오면 요약)·W4(홈 화면)는 아직 합치지 않았다.
- 화면 틀을 휴대폰에서 눈으로 본 적은 없다(헤드리스 Chromium 시험만).

## 사용자 결정 대기
- 없음.
