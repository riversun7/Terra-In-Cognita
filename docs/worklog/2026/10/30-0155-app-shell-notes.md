# 앱 뼈대 W2·W5·W1 문서 정리: ADR 37 "구현하며 정한 것", AGENTS 6장 두 줄, utf8ByteLength 옮기기

- 일시: 2026-10-30 01:55 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 3·5·11절과 끝의 "구현하며 정한 것", 작업 기록 `29-2220-app-shell-w2.md`·`30-0020-app-shell-w2-review.md`(지적 4: `utf8ByteLength`)·`29-2300-app-shell-w5.md`·`30-0045-app-shell-w5-review.md`·`29-2310-app-shell-w1.md`·`30-0120-app-shell-w1-review.md`·`30-0140-app-shell-w125-integration.md`, main 합침 `e32515b`(W2)·`428ac81`(W5)·`a86f043`(W1)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-notes`, 가지 `work/app-shell-notes`. main `a86f043`에서 만들었다. 푸시·합치기는 하지 않았다.
  - 아무것도 고치기 전에 main이 `51ddd5f`(W2·W5·W1 합치기 작업 기록)로 움직여 그 위로 옮겼다(`git rebase main`, 앞으로 감기).
  - 커밋한 뒤 main이 `18acf73`(W3 합침)로 움직여 다시 옮겼다(`git rebase main`). 겹친 파일은 목차 `docs/WORKLOG.md` 하나였고 `pnpm docs:index`로 다시 만들었다. W3는 이 가지가 고친 다른 파일(ADR 37, AGENTS.md, `packages/shared`)을 건드리지 않았다.

## 한 일
- ADR 37
  - 끝의 "구현하며 정한 것 (0단계)" 뒤에 "(W2)"·"(W5)"·"(W1)" 절을 합친 차례로 더했다. 줄기 작업 기록과 검토 고침 기록의 "정한 것"·지적 처리·"고침 안과 다르게 한 것"을 옮겼다. 쓰기 전에 지금 main 코드와 대 봤다(아래 "확인").
    - W2: 메뉴·홈 묶음 저장, 크기·글자 규칙(NUL·짝 없는 대리 문자 → 400), 아는 칸 모양, 템플릿 저장 규칙, 계정 요청 줄(계정이 바뀐 뒤), 마이그레이션 갈래(다시 만들지 않음. 운영 NAS에는 planet_drafts 뒤에 적용됐다 — W3 합치기 기록 `30-0210-app-shell-w3-integration.md`의 배포 확인).
    - W5: 화면 시험 틀(빌드 확인, 새 DB, 가짜 계정, 작업 트리마다 실행 잠금, `test.use`로 메뉴·홈 미리 넣기, jsonb 칸 순서), 크기 검사와 상한 131,416 B, `@playwright/test`는 Dependabot에서 빼고 손으로 올림.
    - W1: 라우터 칸 상태와 규칙, 스크롤·초점·제목, 배치마다 하단 탭 칸 수, 서랍·레일, 배지 99+, 연결 줄, 지도 위 단추, 계정 바뀜 → `resetToHome`, `nav` 칸 이름 `menu`(`order` 아님), CSS 나눔.
  - 본문 고침
    - 11절: 115,427바이트는 Python `gzip` 9단계 값이고 검사 도구로는 같은 빌드가 115,550바이트다. W1 뒤 다시 정한 상한 131,416바이트를 적었다.
    - 0단계 디자인 값 줄: `--badge-size` 20px 옆에 W1이 1.25rem으로 바꾼 것.
    - 배경 줄의 115,427에 "잰 도구는 11절".
    - 3절 방향 안내 자리: "가운데" → "화면 위쪽"(W1 코드는 위에서 28dvh에 둔다).
    - 5절 묶음 응답 가정: Assumed → Verified(W2 시험).
    - "결과"의 다시 볼 조건 중 첫 화면 상한 줄: 정했다(131,416바이트).
  - 맡긴 말과 다르게 적은 것 둘
    - "가장 좁은 칸 ≥ 4.5em"은 W1 검토 고침이 바로잡은 셈으로 적었다. 4.5em은 계단을 세는 기준이고, 띠 안쪽 여백을 빼면 계단 시작 폭의 실제 칸은 약 4.42em(70.7px)이다.
    - 상한 규칙("잰 값 + 8,000")은 11절과 "결과"에 있고 14절에는 없다. 그래서 11절만 가리켰다.
- AGENTS.md 6장: 두 줄만 더했다(확인한 것 + 날짜 + 근거).
  - Drizzle 줄 아래: 1.0.0-rc.5의 마이그레이션 갈래(같은 부모 `prevIds`, 이름으로 적용해 차례와 상관없음, 다음 `db:generate`의 `prevIds`에 두 끝, 적용된 것을 다시 만들면 옛 DB가 실패).
  - PostgreSQL jsonb 글자(16.15): `\u0000`과 짝 없는 대리 문자를 받지 않는다. 그래서 서버가 넣기 전에 400으로 막는다.
- W2 검토 지적 4: `utf8ByteLength`를 중립 모듈 `packages/shared/src/utf8.ts`로 옮겼다.
  - `settings.ts`(첫 화면 모듈)·`planetDraftApi.ts`·`index.ts`가 `./utf8.ts`에서 가져온다. `@terra/shared`의 이름은 그대로다.
  - `planetDraftApi.ts`는 같은 함수를 다시 내보낸다. 그 파일에서 가져가던 코드(다른 가지 포함)가 그대로 돈다. 로컬 가지 모두에서 `./planetDraftApi.ts`를 가져오는 파일은 `index.ts`·`settings.ts`·`planetDraftApi.test.ts`뿐이다(Verified: `git grep`).
  - 시험: 새 `utf8.test.ts` 3개(1~4바이트 문자, 바이트 수가 바뀌는 경계 코드 포인트, 짝 없는 대리 문자). `planetDraftApi.test.ts`의 바이트 시험은 옮기고, 다시 내보낸 것이 같은 함수인지 보는 시험으로 바꿨다.
  - 맨 위에서 부르는 코드가 없다(`"sideEffects": false`, AGENTS 6장).

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16.15 시험 클러스터 `127.0.0.1:55432`)
| 무엇 | 결과 |
|---|---|
| ADR에 옮긴 값을 코드와 대 보기 | `router.ts`(칸 상태 모양, `OVERLAY_KINDS`, `PENDING_TIMEOUT_MS` 1,000), `layout.ts`(A 27·31.5em, C 31.75em, 지도 칸 4.75em, `splitCenterTabs`), `CountBadge.tsx`(`BADGE_MAX` 99), `connectionStatus.ts`(`LOST_NOTICE_DELAY_MS` 2,000), `OrientationHint.tsx`·`overlays.css`(`terra.orientationHint`, 4,000ms, 위에서 28dvh), `MapSwitch.tsx`, `shellPrefs.ts`(`terra.shell`, 합칠 때 W2 전환), `tokens.css`(`--badge-size: 1.25rem`), 서버 `trpc/settings.ts`(검사 차례, 짧은 값 모양), 메시지 키, 마이그레이션 두 스냅샷의 `prevIds`(둘 다 `52ee1e81-…`), drizzle-orm 1.0.0-rc.5 `migrator.js`(이름 차례 `localeCompare`)·`migrator.utils.js`(`getMigrationsToRun`은 이름만 본다). 어긋난 것 없음 |
| `psql`로 jsonb 넣어 보기(PostgreSQL 16.15. 이스케이프 글자는 스크립트가 만들어 넣었다) | 이스케이프 `\u0000`(값·칸 이름) → "unsupported Unicode escape sequence". 짝 없는 `\ud800`·`\udc00`, 뒤집힌 `\udc00\ud800` → "invalid input syntax for type json". 받는 것: 짝이 맞는 `\ud83d\ude00`, `\u0001`, `\uffff`(이스케이프), 이스케이프 없이 쓴 그림 문자·U+FFFF |
| `pnpm --filter @terra/game build` + `pnpm check:bundle`(옮기기 전, main `51ddd5f`) | 123,416 B(파일 2개: `index` 307,863 → 95,848 B, `device` 95,682 → 27,568 B, 원본 403,545 B) / 상한 131,416 B, 남음 8,000 B. 첫 화면 `index` 조각 소스 맵에 `packages/shared/src/planetDraftApi.ts`가 있다 |
| 같은 명령(옮긴 뒤) | 123,416 B 그대로다. 조각 이름·해시도 같다(`index-lf4-xrCu.js`). 소스 맵의 `planetDraftApi.ts`가 `utf8.ts`로 바뀌었다. 어느 조각의 소스에도 `planetDraftApi.ts`는 없다(글자는 `utf8.ts` 주석에만 있다) |
| 같은 명령(main `18acf73` 위로 옮긴 뒤) | 126,188 B(파일 5개, 원본 409,811 B) / 상한 131,416 B, 남음 5,228 B. W3 합치기 기록의 main 값(126,188 B, 파일 5개, 원본 409,811 B)과 같다. 첫 화면 `index` 조각의 공용 소스에 `utf8.ts`가 있고 `planetDraftApi.ts`는 어느 조각에도 없다 |
| `pnpm exec vitest run packages/shared apps/game/src/settings apps/server/src/settings apps/server/src/planetEditor apps/server/src/trpc` | 26파일 통과·4파일 건너뜀(DB), 310개 통과·43개 건너뜀 |
| 같은 줄기 DB 포함(`TEST_DATABASE_URL`): 서버 `settings`·`planetEditor`, 공용 `utf8`·`planetDraftApi`·`settings` 시험 | 9파일 99개 통과 |
| biome 형식, oxlint(`packages/shared`), `pnpm --filter @terra/shared typecheck` | 통과 |
| `TEST_DATABASE_URL=… pnpm check`(main `51ddd5f` 위, 코드·ADR·AGENTS 커밋 뒤 트리, 01:53 KST 시작, 부하 평균 14.6→18.9, 4분 13초) | 통과: 포맷 600파일·린트·타입(전체, e2e 포함)·경계·크기(경고 없음)·다국어 377개 키·대비 136쌍(화면 CSS 13개)·콘텐츠 `core@3 (ca75451a06b5)`, 시험 파일 159개·시험 1,599개 모두 통과(DB 포함, 건너뜀 없음). 시간 초과로 실패한 시험은 없었다 |
| `TEST_DATABASE_URL=… pnpm check`(main `18acf73` 위로 옮긴 트리, 두 번: 02:01 KST 3분 46초, 마지막 트리 = 이 기록·목차까지 02:07 KST 3분 44초, 부하 평균 10.5~17.6) | 둘 다 통과: 다국어 414개 키, 대비 136쌍(화면 CSS 15개), 콘텐츠 `core@3 (ca75451a06b5)`, 시험 파일 175개·시험 1,717개 모두 통과(DB 포함, 건너뜀 없음). 시간 초과로 실패한 시험은 없었다. W3 합치기 기록은 고친 뒤 전체 `pnpm check`를 다시 돌리지 않았다고 적었는데, W3가 들어간 이 트리에서 전체가 통과했다 |
| `node scripts/check-docs.mjs main`, `node scripts/check-content.mjs main`, `pnpm docs:index --check`(마지막 트리) | 변경 규칙 통과(기준 main), 콘텐츠 통과(4b 기준 `18acf73`), 목차 최신(75건, 옮긴 뒤 다시 만듦) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-10-29-app-shell.md` | "구현하며 정한 것" W2·W5·W1 절, 11절·0단계 디자인 값·배경·3절·5절·결과 줄 고침 |
| `AGENTS.md` | 6장 두 줄(Drizzle 갈래, PostgreSQL jsonb 글자) |
| 새 `packages/shared/src/utf8.ts`·`utf8.test.ts` | `utf8ByteLength`의 새 자리와 시험 |
| `packages/shared/src/planetDraftApi.ts`·`planetDraftApi.test.ts` | `utf8.ts`에서 가져와 다시 내보냄, 바이트 시험을 옮김 |
| `packages/shared/src/settings.ts` | `./utf8.ts`에서 가져옴 |
| `packages/shared/src/index.ts` | `utf8ByteLength`를 `./utf8.ts`에서 내보냄(이름 그대로) |
| `docs/worklog/2026/10/30-0155-app-shell-notes.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- W3·W4를 합칠 때 ADR 37 끝에 같은 꼴로 "구현하며 정한 것 (W3)"·"(W4)"를 더한다(W1 절 뒤).
- `utf8ByteLength`의 세는 규칙을 바꾸면 `utf8.test.ts`, 공용 설정 시험(한글 3바이트·그림 문자 4바이트·4096/4097바이트 경계), 서버 DB 시험(`settings.db.test.ts`, 행성 초안 상한)을 함께 본다.
- `packages/protocol/src/codec.ts`에도 `utf8ByteLength`가 따로 있다(프로토콜 메시지 크기, 같은 셈). `packages/protocol`·`packages/shared`는 다른 내부 패키지를 가져오지 않으므로(AGENTS 4장) 하나로 합치지 않았다.

## 건드리지 말 것
- `planetDraftApi.ts`의 `utf8ByteLength` 다시 내보내기는 그 파일에서 가져가는 코드가 모두 `./utf8.ts`·`@terra/shared`로 옮긴 뒤에만 지운다.
- 올라간 마이그레이션(`apps/server/drizzle/*`)은 다시 만들거나 이름을 바꾸지 않는다(ADR 37 "구현하며 정한 것 (W2)", AGENTS 4·6장).

## 미검증·TODO·알려진 문제
- PostgreSQL 18(운영, CI 18.6)의 jsonb 글자 규칙은 재지 않았다(Unknown). AGENTS 6장 줄에도 적었다.
- ADR 37에 옮긴 값 중 화면에서 잰 것(칸 너비, 영어 이름 잘림, 신호마다의 시험 틀 동작 등)은 각 줄기 기록의 값이다. 이번에 다시 재지 않았다. 화면을 바꾸지 않았고, `pnpm e2e`는 main 작업 트리에서 다른 실행이 돌고 있어 돌리지 않았다.
- ADR 37 "결정을 반영할 때 할 일(0단계)"의 "남은 것" 중 셋은 이미 된 것으로 보인다: AGENTS 7장 명령 두 줄(W5), PLAN 14장의 "다음은 0단계 코드", PROTECTED의 "(앱 뼈대 0단계 코드와 함께 생긴다)"(지금 파일에 그 글이 없다). 이번 범위가 아니라 고치지 않았다.
- 화면을 바꾸지 않았다. 그래서 사진·`web-design-guidelines`·`break-ui`·화면 시험은 하지 않았다.

## 사용자 결정 대기
- 없음.
