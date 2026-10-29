# WORKLOG

작업 기록 목차. **자동 생성 파일이므로 직접 고치지 않는다** (`pnpm docs:index`).
실제 기록은 `docs/worklog/` 아래 작업마다 파일 하나로 남긴다(양식: `docs/worklog/TEMPLATE.md`).

| 일시 (KST) | 작업 | 작업 도구 | 기록 |
|---|---|---|---|
| 2026-10-30 01:40 | 앱 뼈대 W2·W5·W1 main 합치기 | Claude Code | [30-0140-app-shell-w125-integration](worklog/2026/10/30-0140-app-shell-w125-integration.md) |
| 2026-10-30 01:20 | 앱 뼈대 W1 검토 고침: 겹침·다시 고름을 화면 이동과 나눔, 처음 켤 때 초점, C 지도 버튼 여백, 화면 시험 e2e/shell.spec.ts | Claude Code | [30-0120-app-shell-w1-review](worklog/2026/10/30-0120-app-shell-w1-review.md) |
| 2026-10-30 00:45 | 앱 뼈대 W5 검토 고침: 같은 트리의 두 번째 실행, 계정 메뉴·홈, 신호, 프로세스 확인, 누르는 곳 검사, 크기 값 출처 | Claude Code | [30-0045-app-shell-w5-review](worklog/2026/10/30-0045-app-shell-w5-review.md) |
| 2026-10-30 00:20 | 앱 뼈대 W2 검토 고침: 계정이 바뀐 뒤의 계정 요청, 저장할 수 없는 글자, 마이그레이션 갈래 다시 확인 | Claude Code | [30-0020-app-shell-w2-review](worklog/2026/10/30-0020-app-shell-w2-review.md) |
| 2026-10-29 23:50 | 1차맵 하늘 계산 `packages/engine/src/planet/sky.ts` — 항성·달·낮밤 세기·구름 걷힘·보임·하늘 시계 (WP2) | Claude Code | [29-2350-sky-math](worklog/2026/10/29-2350-sky-math.md) |
| 2026-10-29 23:50 | 2차맵 선명도 검토 고침: 평평한 지형 점무늬, 칸 가운데 줄, 점 테두리, 잡음 먼저, 시험 | Claude Code | [29-2350-second-map-sharpness-review](worklog/2026/10/29-2350-second-map-sharpness-review.md) |
| 2026-10-29 23:45 | 공용 행성 달력 `@terra/shared/planetCalendar` — 정수·결정성 검사·화면 쪽 내림 입구 (1차맵 하늘 WP1) | Claude Code | [29-2345-planet-calendar](worklog/2026/10/29-2345-planet-calendar.md) |
| 2026-10-29 23:40 | 1차맵 하늘 문서 — ADR(제안)·조사·기획 질문 두 묶음, PLAN·ADR 36, 사용자 결정 U1~U3 반영 (WP0) | Claude Code | [29-2340-primary-map-sky-docs](worklog/2026/10/29-2340-primary-map-sky-docs.md) |
| 2026-10-29 23:15 | 행성 편집기 서버(WP-B) 검토 고침: 지적 14개 확인·처리 | Claude Code | [29-2315-planet-editor-server-review](worklog/2026/10/29-2315-planet-editor-server-review.md) |
| 2026-10-29 23:10 | 앱 뼈대 W1: 화면 길·틀(라우터·위 띠·하단 탭·사이드 메뉴), 메뉴 순서 하나(D-265) | Claude Code | [29-2310-app-shell-w1](worklog/2026/10/29-2310-app-shell-w1.md) |
| 2026-10-29 23:00 | 앱 뼈대 W5: 화면 시험 틀(e2e/)과 첫 화면 JS 크기 검사 | Claude Code | [29-2300-app-shell-w5](worklog/2026/10/29-2300-app-shell-w5.md) |
| 2026-10-29 22:20 | 앱 뼈대 W2: 계정 설정에 메뉴(nav)·홈(home) 묶음 — 기기 저장·맞추기·서버 저장·템플릿 저장 규칙 | Claude Code | [29-2220-app-shell-w2](worklog/2026/10/29-2220-app-shell-w2.md) |
| 2026-10-29 22:10 | 행성 편집기 서버(WP-B): 초안 표·planetEditor tRPC·확인 해시·fieldsHash·편집 전용 행성·tRPC 같은 출처 확인 | Claude Code | [29-2210-planet-editor-server](worklog/2026/10/29-2210-planet-editor-server.md) |
| 2026-10-29 21:40 | 기획 원본 f0e0e71(D-260~D-271·Step 5 D-5029~D-5048·Step 6 D-6039~D-6049·Step 7 D-7026~D-7035) → ADR 35·36·38·PLAN 14장·특수 지형 제안서 | Claude Code | [29-2140-planning-f0e0e71](worklog/2026/10/29-2140-planning-f0e0e71.md) |
| 2026-10-29 21:20 | 2차맵 선명도: 지형 재질 셰이더, 휴대폰 픽셀 비율 상한 2, 아이콘 점·캡슐, ?pixel-ratio | Claude Code | [29-2120-second-map-sharpness](worklog/2026/10/29-2120-second-map-sharpness.md) |
| 2026-10-29 21:00 | 단위 시험 제한 시간 30초(공유 개발 컨테이너 부하) | Claude Code | [29-2100-bake-test-timeout](worklog/2026/10/29-2100-bake-test-timeout.md) |
| 2026-10-29 21:00 | 앱 뼈대 0단계 검토 반영: 주소 표 타입·값 규칙, 부모 화면·검색어 바꾸기, 설정 쓰기 도우미, 완료 종류, ADR 37 문장 | Claude Code | [29-2100-app-shell-stage0-review](worklog/2026/10/29-2100-app-shell-stage0-review.md) |
| 2026-10-29 20:15 | 앱 뼈대 0단계: 주소 표·메뉴·홈 카드·처리할 일 계약, 개발 도구 권한, 화면 경로 대조 | Claude Code | [29-2015-app-shell-stage0](worklog/2026/10/29-2015-app-shell-stage0.md) |
| 2026-10-29 20:13 | 행성 편집기 핵심(WP-C): 미리보기 워커·작업 줄·결과 기억·타일·칸 정보·초안 동기화 | Claude Code | [29-2013-planet-editor-core](worklog/2026/10/29-2013-planet-editor-core.md) |
| 2026-10-29 20:10 | 행성 편집기 평면 미니맵(WP-E): 픽셀 → 칸 표, 바이옴 색·땅 음영, 미니맵 부품 | Claude Code | [29-2010-editor-flatmap](worklog/2026/10/29-2010-editor-flatmap.md) |
| 2026-10-29 19:45 | 기획 D-248~D-259·Step 5 D-5022~D-5028(원본 61a7d96) → ADR 35·PLAN 14장 | Claude Code | [29-1945-planning-d248-d259](worklog/2026/10/29-1945-planning-d248-d259.md) |
| 2026-10-29 19:20 | 행성 편집기 1단계: 사용자 결정 반영(ADR 38) | Claude Code | [29-1920-planet-editor-decisions](worklog/2026/10/29-1920-planet-editor-decisions.md) |
| 2026-10-29 19:10 | NAS 행성 캐시 고침 확인(판 2 배포 뒤) | Claude Code | [29-1910-nas-planet-cache-verified](worklog/2026/10/29-1910-nas-planet-cache-verified.md) |
| 2026-10-29 17:10 | S2 다듬기 통합: 검토 반영 가지 넷 합치기, 생성기 출력 판 2를 서버에 맞추기, 통합 검토 지적 처리 | Claude Code (작업 트리 `.claude/worktrees/s2-polish`, 가지 `work/s2-polish`, main `e1e281b`에서 시작. 푸시하지 않음) | [29-1710-s2-polish-integration](worklog/2026/10/29-1710-s2-polish-integration.md) |
| 2026-10-29 17:00 | 앱 뼈대 설계: ADR 37(제안) — 사용자 결정 반영, 조사 원본, 기획 질문 | Claude Code | [29-1700-app-shell-design](worklog/2026/10/29-1700-app-shell-design.md) |
| 2026-10-29 16:40 | D-214 특수 지형 제안서 올림 (기획·사용자 확인용) | Claude Code | [29-1640-special-terrain-proposal](worklog/2026/10/29-1640-special-terrain-proposal.md) |
| 2026-10-29 16:00 | S2 렌더러 검토 반영: 치마 바닥, 큰 행성 고르기, 받기 시간 제한, 타일 메모리, 가장 높은 땅, 가짜 행성 ADR 규칙 | Claude Code | [29-1600-s2-renderer-review](worklog/2026/10/29-1600-s2-renderer-review.md) |
| 2026-10-29 15:05 | S2 셰이더 측정판 리뷰 반영: TSL 모델뷰 정밀도, 같은 일을 재는 컴파일, GPU 지연, 순서·멈춤, 다시 잰 헤드리스 수치 | Claude Code (서브에이전트, 작업 트리) | [29-1505-s2-webgpu-bench-review](worklog/2026/10/29-1505-s2-webgpu-bench-review.md) |
| 2026-10-29 14:15 | S2 행성 생성기 리뷰 고침: 해상도와 무관한 강가 가산, 결정성 검사 범위, 콘텐츠 검사, 면 레벨 상한, 호수 수면 | Claude Code | [29-1415-s2-generator-review-fixes](worklog/2026/10/29-1415-s2-generator-review-fixes.md) |
| 2026-10-29 14:05 | NAS 행성 캐시 쓰기 실패(EACCES) 원인 찾기 | Claude Code | [29-1405-nas-planet-cache-permission](worklog/2026/10/29-1405-nas-planet-cache-permission.md) |
| 2026-10-29 12:50 | S2 통합: 생성기·타일·서버·렌더러 합치기, 이음매 하나로, 실제 생성기 → 서버 굽기 → 타일 HTTP → 1차맵 화면 | Claude Code (작업 트리 `worktree-wf_cf86e8da-f84-1`, main `e16b47e`에서 시작) | [29-1250-s2-integration](worklog/2026/10/29-1250-s2-integration.md) |
| 2026-10-29 12:10 | S2 셰이더 측정판: WebGL2 + GLSL과 WebGPU + TSL을 같은 행성 타일로 재기(관리자 화면), 헤드리스 측정, 조사 | Claude Code (서브에이전트, 작업 트리) | [29-1210-s2-webgpu-bench](worklog/2026/10/29-1210-s2-webgpu-bench.md) |
| 2026-10-29 11:30 | S2 렌더러: 1차맵 행성 LOD 엔진, 가짜 행성, 임시 1차맵 시험 화면 | Claude Code (서브에이전트, 작업 트리) | [29-1130-s2-renderer](worklog/2026/10/29-1130-s2-renderer.md) |
| 2026-10-29 10:20 | S2 행성 생성기 1판: 결정적 수학·투영, 행성·바이옴 콘텐츠, `generatePlanet`, 벤치마크·그림 | Claude Code | [29-1020-s2-generator](worklog/2026/10/29-1020-s2-generator.md) |
| 2026-10-29 09:50 | S2 행성 타일·서버 굽기·전송: 타일 만들기, TCPT 형식, 굽기 워커, 디스크 캐시, 목록 정보·타일 경로 | Claude Code (서브에이전트, 작업 트리) | [29-0950-s2-tiles-server](worklog/2026/10/29-0950-s2-tiles-server.md) |
| 2026-10-29 09:18 | 운영 지표 보기 워크플로(nas-metrics) — S1의 NAS 쪽 지표를 재려고 | Claude Code | [29-0918-nas-metrics](worklog/2026/10/29-0918-nas-metrics.md) |
| 2026-10-29 08:50 | S2 계획: 결정적 생성기, 쿼드트리 타일, 서버 굽기, 렌더러 — ADR 36(제안) | Claude Code | [29-0850-s2-plan](worklog/2026/10/29-0850-s2-plan.md) |
| 2026-10-29 08:32 | S1 휴대폰 첫 측정 기록, S2로 넘어가기 | Claude Code | [29-0832-s1-phone-measure](worklog/2026/10/29-0832-s1-phone-measure.md) |
| 2026-10-29 03:10 | S1 기기 연결: 2차맵 시험 화면을 서버 자료로(구독·조각·rev 규칙·다시 구독, 지형, 관리자 이동 명령, HUD 측정값) | Claude Code (서브에이전트, 작업 트리) | [29-0310-s1-client](worklog/2026/10/29-0310-s1-client.md) |
| 2026-10-29 02:05 | S1 서버: 시험 2차맵 구독·명령(프로토콜 2), 경로 워커 풀, 시험용 봇 1,000개, 지형 파일, 측정 | Claude Code (서브에이전트, 작업 트리) | [29-0205-s1-server](worklog/2026/10/29-0205-s1-server.md) |
| 2026-10-29 01:30 | S1 2차맵 엔진: 쿼터뷰 카메라, 워커 지형, 유닛 1,000개 보간, 건물, 시험 화면 | Claude Code (서브에이전트, 작업 트리) | [29-0130-engine-s1](worklog/2026/10/29-0130-engine-s1.md) |
| 2026-10-29 00:37 | 전투맵 인스턴스 ADR(35, 제안)과 기획 세션에 보낼 기술 제약 | Claude Code | [29-0037-combat-map-adr](worklog/2026/10/29-0037-combat-map-adr.md) |
| 2026-10-29 00:22 | 기획서 미러 다시 동기화 (GDD v4, D-001~D-183) | Claude Code | [29-0022-design-mirror-sync](worklog/2026/10/29-0022-design-mirror-sync.md) |
| 2026-10-29 00:20 | S1 판정 코어: packages/sim — 배치 격자·통과 폭, 8방향 A*, 경로 이동, 이벤트 큐, 건물 배치, 임시 지형 | Claude Code (클라우드 세션, 서브에이전트 worktree) | [29-0020-sim-core](worklog/2026/10/29-0020-sim-core.md) |
| 2026-10-29 00:05 | 행성 격자 계약 구현: `@terra/planet` 셀 키·힐베르트 순서·면 경계·이웃·꼭짓점·탄젠트 투영 | Claude Code (서브에이전트, 작업 트리) | [29-0005-planet-grid](worklog/2026/10/29-0005-planet-grid.md) |
| 2026-10-28 23:40 | 새 앱 아이콘 PNG를 손실 없이 다시 압축 (736KB → 286KB) | Claude Code | [28-2340-icon-compress](worklog/2026/10/28-2340-icon-compress.md) |
| 2026-10-28 23:40 | 디자인 시스템 구현: 후보 A(새싹 장난감), 테마 4개, 글꼴, 설정 화면(기기 + 계정) | Claude Code | [28-2340-design-system](worklog/2026/10/28-2340-design-system.md) |
| 2026-10-28 23:27 | 파비콘과 앱 아이콘 새로 그리기 (정원 새싹·행성·궤도 정거장) | Antigravity | [28-2327-favicon-redesign](worklog/2026/10/28-2327-favicon-redesign.md) |
| 2026-10-28 22:15 | 기획서 미러 첫 동기화 (GDD v4, D-001~D-138) | Claude Code | [28-2215-design-mirror-sync](worklog/2026/10/28-2215-design-mirror-sync.md) |
| 2026-10-28 21:50 | 로그인·관리자 화면: 들어가기·새 아이디 확인·비밀번호 찾기·계정 줄·역할 바꾸기, 디자인 값 한곳에 | Claude Code (서브에이전트, 작업 트리) | [28-2150-auth-ui](worklog/2026/10/28-2150-auth-ui.md) |
| 2026-10-28 21:00 | 인증 서버: Better Auth 연결, 들어가기·비밀번호 찾기, 관리자 역할, 감사 기록, 관리 명령 | Claude Code (클라우드 세션, 서브에이전트 worktree) | [28-2100-auth-server](worklog/2026/10/28-2100-auth-server.md) |
| 2026-10-28 20:55 | 기획서 GDD v4 대조, 기술 계획 정합(ADR 25~27, PLAN 14장) | Claude Code (클라우드 세션) | [28-2055-gdd-v4-alignment](worklog/2026/10/28-2055-gdd-v4-alignment.md) |
| 2026-10-28 20:43 | 게임 앱 임시 파비콘 추가 | Claude Code (클라우드 세션) | [28-2043-favicon](worklog/2026/10/28-2043-favicon.md) |
| 2026-10-28 20:40 | PWA: 설치·서비스 워커·새 버전 적용, 지원 브라우저 하한 | Claude Code (서브에이전트, 작업 트리) | [28-2040-pwa](worklog/2026/10/28-2040-pwa.md) |
| 2026-10-28 20:10 | PWA·인증 의존성 먼저 추가, 인증 ADR(제안), 아이디 로그인 조사 원본 | Claude Code (클라우드 세션) | [28-2010-auth-pwa-deps](worklog/2026/10/28-2010-auth-pwa-deps.md) |
| 2026-10-28 20:08 | 콘텐츠 팩 검증 1·2·4·7단계, 팩을 서버 이미지에 포함 | Claude Code (클라우드 세션, 서브에이전트 worktree) | [28-2008-content-validation](worklog/2026/10/28-2008-content-validation.md) |
| 2026-10-28 19:35 | 서버: 믿는 프록시 범위 좁히기, 없는 파일은 404 | Claude Code (클라우드 세션) | [28-1935-proxy-trust-static-404](worklog/2026/10/28-1935-proxy-trust-static-404.md) |
| 2026-10-28 18:51 | tRPC 11 연결, 서버 타입 공유(타입 전용 예외), Zod 4 연동 확인 | Claude Code (클라우드 세션) | [28-1851-trpc](worklog/2026/10/28-1851-trpc.md) |
| 2026-10-28 18:20 | 텔레메트리: 기기 오류·성능 요약 수집, 성능 오버레이, 서버 지표 로그 | Claude Code (클라우드 세션) | [28-1820-telemetry](worklog/2026/10/28-1820-telemetry.md) |
| 2026-10-28 18:10 | DB 기반: Drizzle 1.0 RC + pg, 마이그레이션, 배포 연동 | Claude Code (클라우드 세션) | [28-1810-db-layer](worklog/2026/10/28-1810-db-layer.md) |
| 2026-10-28 17:50 | Dependabot 주간 업데이트, git-cliff 변경 이력 설정 | Claude Code (클라우드 세션) | [28-1750-dependabot-git-cliff](worklog/2026/10/28-1750-dependabot-git-cliff.md) |
| 2026-10-28 17:40 | 백업·복구 훈련·되돌림 훈련 자동화, 문서만 바뀐 푸시는 배포 생략 | Claude Code (클라우드 세션) | [28-1740-backup-rollback-drills](worklog/2026/10/28-1740-backup-rollback-drills.md) |
| 2026-10-28 17:25 | Matt Pocock 개발 흐름 스킬 추가 | Claude Code (클라우드 세션) | [28-1725-matt-pocock-skills](worklog/2026/10/28-1725-matt-pocock-skills.md) |
| 2026-10-28 17:10 | 디자인 스킬 설치와 한국어 스킬 작성 | Claude Code (클라우드 세션) | [28-1710-design-skills](worklog/2026/10/28-1710-design-skills.md) |
| 2026-10-28 16:45 | 외부 접속(역방향 프록시) 설정 확인 | Claude Code (클라우드 세션) | [28-1645-external-access](worklog/2026/10/28-1645-external-access.md) |
| 2026-10-28 16:25 | 첫 NAS 배포: CPU 상한 오류 수정 | Claude Code (클라우드 세션) | [28-1625-first-deploy](worklog/2026/10/28-1625-first-deploy.md) |
| 2026-10-28 16:10 | NAS 사양 수집 결과 기록 | Claude Code (클라우드 세션) | [28-1610-nas-facts](worklog/2026/10/28-1610-nas-facts.md) |
| 2026-10-28 15:35 | NAS 실행기 무한 재시작 수정, NAS 컨테이너 정리 안내 | Claude Code (클라우드 세션) | [28-1535-runner-fix-nas-cleanup](worklog/2026/10/28-1535-runner-fix-nas-cleanup.md) |
| 2026-10-28 14:50 | M0 골격: 모노레포·검사 도구·접속 핸드셰이크·배포 준비 | Claude Code (클라우드 세션) | [28-1450-m0-skeleton](worklog/2026/10/28-1450-m0-skeleton.md) |
| 2026-10-28 14:20 | 리부트 계획 확정과 저장소 초기화 | Claude Code (클라우드 세션, grill-me 스킬) | [28-1420-reboot-repo-reset](worklog/2026/10/28-1420-reboot-repo-reset.md) |
