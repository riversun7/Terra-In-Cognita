# 랭킹: 경로별 감쇠형 점수·백분위 등급과 세력 순위(하루 한 번 집계), 사이보그·세력 화면 안 순위표

- 일시: 2026-11-07 15:35 (KST)
- 작업 도구: Claude Code
- 관련: 기획 20 §7·§8, D-034~D-043·D-047·D-392·D-443(134)·D-481·D-499(질문 394 답 "다")·D-500·D-6010·D-7018·D-7022·D-515·D-507, ADR `docs/adr/2026-11-07-ranking.md`(새), 질문 425~430 `docs/questions/2026-11-07-ranking.md`, 가지 `work/ranking`(origin/main `fa2cbbd` 위)

## 한 일
- **기획 읽기**: 미러 `docs/design/`에서 "랭킹·순위·백분위·명성"을 모두 찾았다. 정본은 20 §8(감쇠형 D-037·백분위 D-041·공통 장치 D-042·NPC 같은 규칙 D-043·보상 D-038), 경로 목록 20 §7(D-481 26개), 공개 묶음 D-392, 화면 자리 D-6010(메뉴 아님 — 사이보그·세력 화면 안), 버프 제외 D-7018·D-7022, 웨이브 보상 명성·랭킹 점수 D-499·보호 레이드 랭킹 없음 D-500. 49에는 랭킹 칸이 없다.
- **옛 규칙 대조(D-507, AntiGravt01 로컬 사본 읽기만)**: `terra-server/routes/ranking/ranking_routes.js`(전투력·재력·업적, 요청마다 셈, LIMIT 50) — v4(경로별 감쇠형)가 이겨 모양만(위 50줄·순위·이름·소속·점수) 빌렸다. 작업 지시의 `git -C /home/user/AntiGravt01 show 0ea5299:…`는 이 작업 트리 격리가 막아 로컬 사본 파일을 읽었다(Assumed: 0ea5299와 같은 내용인지 확인하지 못함).
- **판정 규칙(sim)**: `packages/sim/src/ranking/`(계수표 `ranking` 칸, 정수 log2(‰)·로그 압축·언더독·감쇠·순위(같은 점수 = 같은 순위)·백분위 등급·문턱 점수·세력 규모 점수). 실수 로그·`**` 없음. 시뮬레이터는 아직 읽지 않는다(출력 그대로 — `SIM_VERSION` 그대로).
- **팩(core@43)**: 새 분류 `ranking_paths`(26경로, 연 것 넷 = 정복자·용병·투사·대지주·건축가, 나머지 곧 열림), 설정 칸 12(`ranking_*`, 49 코드 없음, 서버 live).
- **서버**: 표 3(`ranking_state`·`ranking_path_scores`·`ranking_faction_scores`, `rankingSchema.ts`, 마이그레이션 `20261107061337_ranking`), 지표 읽기(원장 산출·전투 결과 언더독·도시·시설·세력 규모), 집계(1분마다 경계 확인 → 쓰기 대기열이 닿은 뒤 한 트랜잭션), 조회(판·내 자리·사이보그 칸, 이름 = 사이보그 이름·국가 프리셋 이름), 시안 자료, tRPC `ranking.board`·`ranking.mine`, `cyborg.get` 랭킹 칸 채움.
- **화면**: 주소 `/cyborg/ranking`(?path=)·`/faction/ranking`(지연 조각 `ranking/RankingScreen.tsx`), 사이보그 랭킹 칸 경로 줄 → 그 경로 순위표 + "모든 경로 순위 보기", 세력 화면 옆 판 "세력 순위" 칸(`faction/FactionRanking.tsx`). 판 고르기·재는 것·내 자리(유저 명성 칸 자리)·등급 문턱·순위(위 50 + 내 줄)·집계 안내. 토큰만, 문구 61개 ko·en.
- **정원사 명성**: main에 없어 자리만(세력 판 `renown` 열·화면 "명성 아직 없음", `ranking.mine`·`ranking.board`의 유저 명성 null). ADR 확인 대기에 합칠 때 할 일 둘(세력 명성 싣기, 보호 레이드 전투 빼기).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/ranking.ts`(새)·`package.json` | 전송 타입·지표·영역 목록, `@terra/shared/ranking` 진입점 |
| `packages/content/src/schema/ranking.ts`(새)·`categories.ts`·`index.ts` | 분류 `ranking_paths` 스키마(지표 겹침·연 경로 지표 하나 이상) |
| `content/core/ranking_paths.json`(새)·`tuning.json`·`manifest.json` | 26경로, 설정 칸 12, 판 43 |
| `packages/sim/src/ranking/coefficients.ts`·`score.ts`·`score.test.ts`(새), `tuningRanking.ts`(새), `tuning.ts`·`society/coefficients.ts`·`index.ts` | 점수 규칙(순수·정수), 설정 칸 ↔ 계수표, 시험 9개 |
| `apps/server/src/db/rankingSchema.ts`(새)·`schema.ts`, `apps/server/drizzle/20261107061337_ranking/`(새) | 표 더하기만 |
| `apps/server/src/ranking/paths.ts`·`measures.ts`·`snapshot.ts`·`reads.ts`·`preview.ts`·`services.ts`(새) | 경로 목록·지표·집계·조회·시안·일정 |
| `apps/server/src/ranking/snapshot.test.ts`·`ranking.db.test.ts`(새) | 순수 셈 2개·DB 5개 |
| `apps/server/src/trpc/ranking.ts`(새)·`router.ts`·`context.ts`·`createContext.ts` | `ranking.*` 조회 |
| `apps/server/src/app.ts`·`main.ts` | 집계 일정(월드·DB가 있을 때)·서비스·팩 경로 목록 |
| `apps/server/src/roster/services.ts` | 사이보그 화면 랭킹 칸을 집계 표에서 |
| `apps/server/src/tuning/scope.ts` | `ranking.*` 12칸 live |
| `packages/shared/src/routes.ts`·`routes.test.ts` | 주소 둘(부모 사이보그·세력) |
| `apps/game/src/ranking/RankingScreen.tsx`·`rankingText.ts`·`rankingText.test.ts`·`rankingQueries.ts`·`ranking.css`(새) | 랭킹 화면 |
| `apps/game/src/faction/FactionRanking.tsx`(새)·`FactionSide.tsx`·`faction.css` | 세력 순위 칸 |
| `apps/game/src/cyborg/CyborgExtras.tsx`·`cyborg.css` | 경로 줄 링크·모든 경로 순위 링크(누르는 곳 44px) |
| `apps/game/src/shell/routeViews.tsx`·`sections/ComingSoon.tsx` | 지연 조각·제목, 준비 중 화면 목록에서 뺌 |
| `apps/game/messages/{ko,en}.json` | 문구 61개 |
| `e2e/ranking.spec.ts`(새) | 실제 자료·시안·나쁜 자료·사진 |
| `docs/adr/2026-11-07-ranking.md`(새)·`docs/questions/2026-11-07-ranking.md`(새)·`docs/PLAN.md` | 결정·확인 대기, 질문 425~430, 14장 줄 |

## 검사·시험 (Verified, 개발 컨테이너, main `fa2cbbd` 위, 무거운 잠금 안)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 434파일 3,564개(DB 시험 포함), 다국어 4,010키, 대비 738쌍, 콘텐츠 core@43. 새 시험: sim `ranking/score.test.ts` 9개, 서버 `ranking/snapshot.test.ts` 2개·`ranking/ranking.db.test.ts` 5개(처음 집계·같은 경계 다시 안 셈·판·내 자리·사이보그 칸·경로 비우면 고름·다음 경계 감쇠·지난 순위·401·403·400·시안), 게임 `ranking/rankingText.test.ts` 4개, 주소 표 시험에 두 줄.
- 화면 시험 `pnpm e2e ranking.spec.ts` 9개 통과(1.1분, 빌드 포함): 플레이어 실제 자료(서버가 켜질 때 센 첫 집계 — 세력 화면 세력 순위 칸 → 세력 순위표 내 세력 줄, 정복자 판에 NPC 세력, 무역상 곧 열림, 누르는 곳 44px), 사이보그 랭킹 칸 → 모든 경로 순위(서버가 경로를 고름), dev 시안(50줄 + 내 줄 63위·문턱 넷·최상위 셋, 세력 판 16줄), 긴 이름·큰 수 390 ko·en 넘침 없음, 사진 12장.
- 사진(세션 임시 폴더 `ranking-shots`, 저장소 밖): `ranking-path-{pastel,dark}-ko-390`·`ranking-path-{pastel,dark}-en-1440`, 같은 꼴로 `ranking-faction-*`·`ranking-faction-card-*`. 파스텔·다크에서 눈으로 확인(390 경로 판 파스텔·다크, 1440 다크 세력 판, 390 다크 세력 화면 칸). 확인 중 고친 것: 내 세력 자리의 "휴먼 328명성 아직 없음"이 붙어 보여 " · "로 잇고, 영어 "1 cities"를 "Cities 1"로 바꿨다(그 뒤 형식·린트·다국어·게임 타입 검사만 다시 돌림, 화면 시험은 다시 돌리지 않음).
- `pnpm check:docs`·`pnpm check:content origin/main`: 아래 합친 뒤 결과.

## [임시] 값
- 집계 하루(UTC 0시), 감쇠 18‰/집계, 등급 문턱 10·50·200·500‰, 최상위 1~3위, 언더독 상한 4000‰, 세력 판 도시 1000·발전도 10·휴먼 100·국고 1000단위 = 1점, 경로 가중치 모두 1000‰, 판 줄 50(옛 LIMIT 50), 시안 참가 1,284·내 순위 63·세력 16.

## 함께 바꿔야 하는 파일
- 새 지표를 더하면: `packages/shared/src/ranking.ts` `RANKING_MEASURES`(끝에), `apps/server/src/ranking/measures.ts`(읽기)·`snapshot.ts` `measureValues`, 화면 `rankingText.ts` `MEASURE_NAMES`, 문구 ko·en.
- 경로를 열면: 팩 `ranking_paths.json`(`open`·`measures`)과 `manifest.json` 판.
- 정원사 2를 합치면: `snapshot.ts`·`measures.ts`(세력 명성 → `renown`, 보호 레이드 전투 빼기), `reads.ts`(유저 명성).

## 건드리지 말 것
- 랭킹 표는 집계가 통째로 바꿔 쓰는 파생 자료다. 손으로 고치면 다음 집계의 감쇠·지난 순위가 그 값에서 이어진다.
- 순위 차례(점수 높은 순·같으면 주체 ID 작은 순, 같은 점수 = 같은 순위)는 결정적이어야 한다(시험이 본다).

## 미검증·TODO·알려진 문제
- 집계 질의 시간을 운영 규모(원장 수백만 줄)에서 재지 않았다. `ledger_transactions`에 (kind, at_ms) 색인이 없어 거래 표를 훑는다 → 커지면 색인 마이그레이션.
- 산출은 원장 거래 시각으로 가른다(정산은 1시간마다 쓸어 담는다) — 오래 정산되지 않은 주체는 한 집계에 몰린다.
- 언더독 전력 = 편 유닛 수(도중 참전 안 셈). 보상(어드밴티지·칭호·연대기, D-038)·최상위 혜택·영향력·천적·최초 장치는 없다.
- 실제 휴대폰에서 재지 않았다(헤드리스 Chromium 390·1440만).

## 사용자 결정 대기
- 질문 425~430(판 주체, 집계와 보상 기간, 세력 판, 처음 연 경로 지표, 작은 판 등급, 유저 명성 자리) — 기획 세션. 지금 코드는 기본안(가).
