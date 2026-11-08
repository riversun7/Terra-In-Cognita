# 운영 역할 다시 나눔·조회 감사 기록 스위치·권한 부여 이동·읽기 쉬운 감사 기록

- 일시: 2026-11-08 19:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-operator-roles-log-switch.md`(새), `2026-11-08-operator-console.md`(상태에 일부 대체 표시), 앞 줄기 `docs/worklog/2026/11/08-1640-operator-console.md`, 가지 `claude/trusting-carson-fr2yv7`(main `44b8748` 위)

## 한 일
- 사용자 지적 세 가지(로그 스위치 기본 꺼짐 + 관리자/운영자로 다시 나눔, 감사 기록을 읽기 쉽게·거르기, 권한 부여는 개발자만)를 반영했다.
- **역할**: `gm_lead` 뺌. 운영자(gm) = 감시 + 약한 통제, 관리자(admin) = + 강한 통제 + 로그 스위치, 개발자(dev) = 전체(권한 부여 포함). 화면 이름 gm "운영자(약한 통제)".
- **로그 스위치**: 표 `ops_switches`(마이그레이션 `20261108100034_ops_switches`), 서버 메모리 캐시(`src/ops/switches.ts`), 운영 권한 `log_switch`, tRPC `ops.switches.*`, 관리자 화면 "로그 스위치" 판. 꺼져 있으면 `second_map.observe`·`planet_editor.read_definitions`를 쓰지 않는다(기본 꺼짐). 계정·통제·편집 기록은 늘 남는다.
- **권한 부여**: 운영자 콘솔 탭 → `/dev/ops-grants`(새 접근 종류 `RouteAccess` "dev"). 개발자 홈에 "운영 권한" 묶음(개발자에게만 보임 — 열 수 없는 도구 줄은 숨김).
- **감사 기록**: 서버가 대상 계정 아이디·분류(동작 앞부분 목록)·한 사람/대상 아이디 거르기를 받는다. 화면은 분류 칩(여러 개)·아이디 칸·동작 앞부분, 줄마다 시각·분류·한 일(사람 말)·한 사람·대상·내용 한 줄(역할 이전→이후, 지급 양·잔고·사유, 정지 기한, 스위치 켜짐/꺼짐 등) + [원본] JSON 펼치기(`apps/game/src/ops/auditText.ts`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/roles.ts`·`ops.ts`·`routes.ts`(+ 시험 셋) | 역할·운영 권한 기본·`log_switch`·스위치·감사 분류·접근 종류 "dev"·주소 `dev_ops_grants` |
| `apps/server/src/ops/switches.ts`(새)·`services.ts`·`reads.ts`·`access.ts`, `trpc/ops.ts`(+ 시험 둘) | 스위치, 감사 기록 거르기·대상 아이디 |
| `apps/server/src/db/opsSchema.ts`·`schema.ts`, `drizzle/20261108100034_ops_switches/`(새), `cli/resetWorld.ts` | 표 `ops_switches`(세계 새로 시작에서 남김) |
| `apps/server/src/app.ts`(950줄), `planetEditor/services.ts`·`testSupport.ts` | 켤 때 스위치 읽기, 조회 기록 두 곳을 스위치로 막기(편집기 시험은 스위치를 켜고 시작) |
| `apps/server/src/auth/permissions.ts`·`permissions.test.ts` | `gm_lead` 뺌 |
| `apps/game/src/ops/AuditTab.tsx`·`auditText.ts`(새)·`auditText.test.ts`(새)·`OpsConsole.tsx`·`OpsGrantsScreen.tsx`(새)·`opsUi.tsx`·`ops.css` | 감사 기록 화면, 권한 부여 화면 이동 |
| `apps/game/src/admin/AdminLogSwitch.tsx`(새)·`AdminPage.tsx`·`UserCard.tsx` | 관리자 화면 로그 스위치, 역할 이름 |
| `apps/game/src/editor/DevHome.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx` | 개발자 홈 도구 줄·주소 잇기 |
| `apps/game/messages/ko.json`·`en.json` | 새 문구(`audit_*`·`admin_log_*`·`ops_perm_log_switch`·주소 이름), 뺀 키(`role_gm_lead`·`ops_tab_grants`·`ops_audit_action`) |
| `e2e/ops.spec.ts` | 탭 7개·감사 기록 거르기·로그 스위치·관리자는 권한 부여 주소 막힘·개발자 권한 부여·사진 |
| `docs/PROTECTED.md` | 뺀 역할 이름도 다시 쓰지 않음 |

## 함께 바꿔야 하는 파일
- 새 감사 동작을 만들면: 분류에 안 들면 `packages/shared/src/ops.ts` `AUDIT_CATEGORIES`, 사람 말은 `apps/game/src/ops/auditText.ts` `ACTION_LABELS`(+ 메시지 ko·en), 내용 문장이 필요하면 `auditSummary`.
- 스위치를 더하면: `OPS_SWITCHES`(끝에), 쓰는 곳에서 `isOn`, 관리자 화면 판.

## 건드리지 말 것
- 이미 올라간 마이그레이션 `20261108072132_ops_grants`는 그대로(새 마이그레이션만 더했다).

## 검증
- 단위·라우터 시험: `ops.test.ts`(스위치 권한·감사 거르기 포함), `auditText.test.ts`, shared `ops.test.ts`·`routes.test.ts` 통과.
- DB 시험(이 컨테이너 PostgreSQL 16): `apps/server/src/ops`·`apps/server/src/planetEditor` 통과(스위치 저장·다시 읽기, 감사 분류·아이디 거르기·대상 아이디).
- 화면 시험 `e2e/ops.spec.ts` 10개 통과(관리자 탭 7개·감사 기록 분류 칩·로그 스위치 켜고 끄기·관리자는 `/dev/ops-grants` 권한 없음·개발자 권한 부여 체크박스 14개 중 13개 잠김·사진 1440·390 × 네온·라이트). 사진은 저장소 밖.
- `pnpm check` 통과(시험 3,824 통과 / 265 건너뜀). DB 시험 `apps/server/src/{auth,ops,planetEditor,cli}` 15파일 153개 통과.
- `e2e/dev.spec.ts`: 관리자 도구 줄 수 기대값을 13으로 고쳤다(크리처 편집기가 main에 들어오며 이미 13이었다). "플레이어 — 권한 없음 화면" 시험은 main `44b8748` 원본에서도 3번 중 3번 실패한다(이 줄기와 상관없음, 고치지 않음).

## 미검증·TODO·알려진 문제
- 출시 전에 조회 감사 기록 스위치를 켜 둘지 정해야 한다(ADR 2절, 행성 정의 조회 기록 규칙).
- 감사 기록의 설정 칸·편집기 동작은 사람 말 이름만 있고 내용은 "칸=값" 몇 개다(원본 펼치기로 본다).
- `second_map.operator_command`는 대상 칸(uuid)에 유닛 ID를 넣으려 해서 DB가 거절할 수 있다(Assumed, 코드 읽기 `app.ts` onOperatorCommand — 실패는 경고 로그만). 이번 범위 밖이라 고치지 않았다.

## 사용자 결정 대기
- 없음.
