# 운영자 콘솔(/ops): 유저·NPC·유닛 감시와 통제, 운영 역할 둘과 권한 체크박스

- 일시: 2026-11-08 16:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-operator-console.md`(새), 가지 `claude/trusting-carson-fr2yv7`(시작점 main `3441c7f`), 기획 `docs/design/70_BM_LiveOps.md` D-7021·D-7025

## 한 일
- 사용자 요청 "운영자 기능 추가"(모든 유저·유닛 감시·통제, 유저/NPC 나눔, 방대한 자료는 옮겨서 조회, 전문 기능 제시)와 범위 답("감시+계정+월드 통제, 개발자는 전체, 운영자 2종류(감시+가벼운 통제 / 강한 통제), 권한 체크박스")을 구현했다.
- **역할·권한**: 역할 `gm_lead`(운영자 강한 통제) 추가, `gm` 표시 이름을 "운영자(감시·가벼운 통제)"로. 운영 권한 13개(`@terra/shared/ops`)와 역할 기본(gm = 감시+가벼운, gm_lead = +강한, dev·admin = 전체). 계정마다 더 주는 체크박스 표 `ops_grants`(더하기만, 콘솔 역할이 없으면 효과 없음).
- **서버**: `src/ops/`(권한 판정 `access.ts`, DB 조회 `reads.ts`, 메모리 월드 조회·통제 `world.ts`, 묶음 `services.ts`), tRPC `ops.*`(`src/trpc/ops.ts`). 모든 통제는 감사 기록(`ops.*`).
  - 조회: 현황(서버 가동·메모리·WS 연결, 월드 상태·위반·유닛, 사람·세력·도시·휴먼·건물·전쟁 수, 24시간 기기 오류·감사·가입), 유저 목록(검색·접속/정지/운영진·정렬)·상세(계정·세션·정지·사이보그 스탯/K/속성/신앙·자산·유닛·물건·스킬·최근 감사), NPC 세력·상세(성향·연구·도시·전쟁·자산·소속·유닛), 도시, 유닛 목록(유저/NPC 나눔·맵·종류)·상세(직무·부상·휴먼·생명 수치·스킬·물건·화물), 경제(자산 총량·상위 보유·큰 거래·운영자 거래), 감사 기록.
  - 통제: 강제 로그아웃, 정지·해제(사유·기간, 정지하면 세션 지움, admin 계정은 admin만), 유닛 멈추기·안전한 곳으로·치료·같은 2차맵 안 순간이동, 원장 지급·회수(시스템 계정 `ops:<자산>`, 거래 `ops_grant`·`ops_revoke`, 사유 필수), 권한 체크박스 저장. 자기 계정 통제·자기 권한 바꾸기는 거절.
- **화면**: `/ops`(개발 화면 층, 사이드 메뉴 링크) 탭 8개(현황·유저·NPC 세력·도시·유닛·경제·감사 기록·권한 부여), 줄을 누르면 오른쪽(좁은 폭은 아래) 상세 판. 현황 탭 자동 경보 4종(월드 준비·위반·기기 오류 ≥ 50·RSS ≥ 900MB, [임시] 기준).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/ops.ts`(새)·`ops.test.ts`(새), `package.json`(진입점 `./ops`) | 운영 권한 목록·역할 기본·실효 권한 함수·응답 모양 |
| `packages/shared/src/roles.ts`, `dashboard.test.ts` | 역할 `gm_lead` |
| `packages/shared/src/routes.ts`·`routes.test.ts` | 주소 `ops`(`/ops`, 여는 역할 gm·gm_lead·dev·admin) |
| `apps/server/src/ops/access.ts`·`reads.ts`·`world.ts`·`services.ts`(새), `ops.db.test.ts`(새) | 서버 운영 기능 |
| `apps/server/src/trpc/ops.ts`(새)·`ops.test.ts`(새), `router.ts`, `context.ts`, `createContext.ts` | tRPC `ops` 라우터·맥락 |
| `apps/server/src/app.ts`(940줄) | 운영 서비스에 DB·월드·WS 연결 수·나라 이름 잇기 |
| `apps/server/src/db/opsSchema.ts`(새), `db/schema.ts`, `drizzle/20261108072132_ops_grants/`(새) | 표 `ops_grants`(추가만 — 직전 판 앱은 모른 채 돈다) |
| `apps/server/src/auth/permissions.ts`·`permissions.test.ts` | Better Auth 역할 표에 `gm_lead`(계정 관리 권한 없음) |
| `apps/server/src/cli/resetWorld.ts` | `ops_grants`는 세계 밖 표 → 시험 세계 새로 시작에서 남김 |
| `apps/game/src/ops/*`(새: `OpsConsole`·`OverviewTab`·`PlayersTab`·`NpcTabs`·`UnitsTab`·`UnitTable`·`EconomyTab`·`AuditTab`·`GrantsTab`·`PlayerDetail`·`FactionDetail`·`UnitDetail`·`DetailParts`·`opsUi`·`ops.css`) | 운영자 콘솔 화면 |
| `apps/game/src/shell/routeViews.tsx`·`SideMenu.tsx`·`devSurface.ts`, `sections/ComingSoon.tsx`, `admin/UserCard.tsx` | 화면 잇기·메뉴 링크·개발 화면 층·역할 이름 |
| `apps/game/messages/ko.json`·`en.json` | `ops_*` 250개 + `role_gm_lead`, `role_gm` 이름 바꿈 |
| `e2e/ops.spec.ts`(새) | 화면 시험·사진 |
| `docs/PROTECTED.md` | 계정에 저장되는 ID 줄에 역할 이름·운영 권한 ID |
| `docs/adr/2026-11-08-operator-console.md`(새) | 결정 기록 |

## 함께 바꿔야 하는 파일
- 운영 권한을 더하면: `packages/shared/src/ops.ts`(끝에 더함·단계표) → `apps/game/src/ops/opsUi.tsx` `PERMISSION_LABELS` + 메시지 ko·en → 서버 `src/trpc/ops.ts` 프로시저.
- 역할을 더하면: `roles.ts`, `ops.ts` `OPS_ROLE_DEFAULTS`, `auth/permissions.ts` 역할 표, `routes.ts` `ACCESS_ROLES`, `admin/UserCard.tsx` `ROLE_LABELS`, 시험 표(routes·permissions·dashboard).
- 콘솔 역할 목록은 두 곳: `ops.ts` `OPS_CONSOLE_ROLES`와 `routes.ts` `ACCESS_ROLES.ops`(routes.ts는 첫 화면 묶음이라 ops 모듈을 가져오지 않는다).

## 건드리지 말 것
- 원장 코드(PROTECTED)는 고치지 않았다(`post`만 부른다). 지급·회수 거래 종류 `ops_grant`·`ops_revoke`와 시스템 계정 `ops:<자산>`은 감사·경제 탭이 이 이름으로 찾는다.
- 감사 기록 추가만 트리거·`actor_kind` 검사 조건은 그대로(운영자 동작은 'admin').

## 검증
- `pnpm check` 통과(시험 3,810 통과 / 265 건너뜀 — DB 없이).
- DB 통합 시험: 이 컨테이너의 PostgreSQL 16을 켜고 `TEST_DATABASE_URL`로 `apps/server/src/ops/ops.db.test.ts` 통과(실제 월드·SQL: 현황·유저·유닛·치료·순간이동·지급/회수·정지/해제·세션 지움·체크박스·감사 기록·세력·도시). 서버 DB 시험 전체(`TEST_DATABASE_URL=… pnpm vitest run apps/server`): 179파일 / 1,154개 통과, 건너뜀 0.
- 화면 시험 `e2e/ops.spec.ts` 6개 통과(admin: 탭 8개·현황·유저 상세·유닛·감사·권한 체크박스 13개 잠김, 1440·390px × 네온·라이트 사진, 390px 가로 넘침·누르는 곳 검사, player 권한 없음). 첫 실행에서 390px 상세 판 가로 넘침(문서 폭 790px)을 잡아 `ops.css`(`.ops-stack` 칸 최소 폭 0)로 고쳤다. 사진 8장은 저장소 밖(세션 임시 폴더)에 두었다.
- Node는 이 컨테이너가 22.23.4라 저장소 기준(24)과 다르다(경고만, 시험은 돌았다).

## 미검증·TODO·알려진 문제
- 유닛 지우기 없음(ADR 4절, 종류마다 정리가 필요). 다음 단계에서 권한 `unit_remove`를 끝에 더한다.
- 이상 거래 자동 표시(기획 70 "시장가와 크게 다른 가격, 같은 IP·계정 사이 반복 이동")는 기준이 없어 넣지 않았다. 경제 탭은 큰 거래 목록만.
- 경보 기준(기기 오류 50·RSS 900MB)은 [임시].
- 세력 이름표는 한국어 나라 이름(팩 프리셋)만 쓴다[임시] — 영어 화면에서도 한국어 이름이 보인다.
- 순간이동은 같은 2차맵 안만. 2차맵 사이 이동 중인 유닛을 순간이동하면 이동 서비스 상태와 어긋날 수 있다(Assumed, 시험 안 함).
- 열린 WebSocket은 세션을 지워도 세션 조회 캐시가 끝날 때까지 이어진다.
- 유닛 목록·세력 유닛 수는 조회마다 메모리 월드를 훑는다(10만 유닛 비용은 재지 않음).

## 사용자 결정 대기
- 없음. 사용자가 두 가지를 맡겼다(2026-11-08 "알아서 해달라"): 통제는 tRPC 예외로 둔다(ADR 3절 확정), 유닛 지우기는 판정 코어에 길을 내야 해서 실제 필요가 생길 때까지 미룬다(ADR 4절).
