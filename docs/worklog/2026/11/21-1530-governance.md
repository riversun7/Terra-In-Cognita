# 2026-11-21 governance — 나라 의결 첫 판(안건·투표·선출·체제 전환·선전포고, 서버 + 줄기 판 94 + 투표 탭 칸)

- 일시: 2026-11-21 15:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-governance.md`(새, 제안), 질문 `docs/questions/2026-11-21-governance.md`(2351~2365 답 표시 — D-580·D-581), 새 질문
  `docs/questions/2026-11-21-governance-2.md`(2401~2410), 기획 D-217·D-5057·D-131·D-344·D-349·D-574 10·D-555 1509·D-256
- 가지 `work/governance`, 바탕 497aba3e97(main, 묶음 1116u)

## 한 일
- **서버 의결 서비스**(`apps/server/src/governance/` 새 모듈): 포트(거울 세계·원장 지분·소유 주체), 투표권(민주주의 가문마다 한 표·자본주의 지분 — 국고 지분은
  다른 주주에게 비례로 나눔 D-581·독재 표 없음), 명령(올리기·표·후보 등록), 1분 틱(임기 세기·임기 끝 자동 선출·NPC 표·닫기·집행), 조회, 게이트웨이.
- 안건 넷: 지도자 선출(이기면 지배 가문이 그 가문 — 2358 가), 지도자 해임(가결 → 다시 뽑기, 해임된 가문은 못 나섬), 체제 전환(가결 → 7일 유예 뒤 집행,
  D-131), 선전포고(가결 → 바로 세력·사회 declareWar). 세율 안건은 나라 세율 저장(줄기 tax-2) 뒤 TODO(2407).
- 독재: 투표 없음, 지도자 직권 체제 전환(유예). 지분 과반이면 지도자 직권으로 독재(D-344), 다른 지분은 의결권만 잃음(표시 — D-349).
- NPC 표(2361 나): 만족도 차 + 나라 성향 규칙식(npcVote.ts), NPC 지배 가문은 선출에 스스로 나선다 [임시 2404].
- 표 넷 + 마이그레이션 `20261121060714_governance`(prevIds `2d53a6a4`, 새 표만 — 직전 판 앱 그대로).
- 프로토콜: `gov_propose`·`gov_vote`·`gov_candidate` → `gov_result`(결과 코드 19개). 줄기 판 PROTOCOL_VERSION 94·MIN 93(앞 줄기 house-9 88·87과 같은 틀 —
  합칠 때 묶음 판으로). 가문 소켓과 한 소켓(`withGovernance` — app.ts 999줄을 늘리지 않음, 맥락 칸 `houseCity` → `houseServices` 한 줄 바꿈).
- tRPC `governance.view`. 화면: 세력 화면 투표 탭 위 나라 의결 칸(GovernancePanel.tsx, governance.css), 문구 86개(ko·en).
- 설정 칸 16개(core@131 줄기 판, S34 넷 포함), 계수표 `governance` 칸(시뮬은 읽지 않음 — SIM_VERSION 그대로), 서버 실시간 반영 경로(`tuning/scope.ts`).
- 기획 답 D-581(코디네이터 전달)로 처음 넣었던 [임시] "국고 지분 기권" 칸(`gov_treasury_vote`)을 지우고 비례 나눔으로 바꿨다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/governance.ts`(새)·`.test.ts`, `package.json` | 셈(정족수·문턱·단순 다수·동점)과 조회 모양 |
| `packages/protocol/src/governance.ts`(새)·`.test.ts`, `messages.ts`·`index.ts`·`version.ts` | WebSocket 명령, 줄기 판 94 |
| `packages/sim/src/society/governanceCoefficients.ts`(새)·`coefficients.ts`·`index.ts`, `tuningGovernance.ts`(새)·`tuning.ts`·`tuningPages.ts` | 설정 칸 계수표(세력·사회 페이지) |
| `content/core/tuning.json`·`manifest.json` | 칸 16개, core@131 |
| `apps/server/src/db/governanceSchema.ts`(새)·`schema.ts`, `drizzle/20261121060714_governance/` | 표 넷 |
| `apps/server/src/governance/*`(새: port·electorate·npcVote·service·view·store·rules·gateway·attach, 시험 3) | 의결 서비스 |
| `apps/server/src/factionIdentity/attach.ts`·`rules.ts` | 의결을 가문 묶음에 얹음, HouseRules에 governance 설정 |
| `apps/server/src/session.ts` | gov_* 메시지를 가문 소켓으로 |
| `apps/server/src/trpc/governance.ts`(새)·`router.ts`·`context.ts`·`createContext.ts`, `app.ts`(한 줄 바꿈, 999줄 그대로) | 조회 |
| `apps/server/src/tuning/scope.ts` | 칸 반영 범위 live |
| `apps/game/src/faction/governance/*`(새), `FactionScreen.tsx`, `identity/houseCommands.ts`(request 내보내기), `map/mapFeed.ts`(gov_result 거름) | 화면 |
| `apps/game/messages/{ko,en}.json` | 문구 86개 |
| `e2e/governance.spec.ts`(새) | 화면 시험 |
| ADR·질문 둘·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 94 → 묶음 판(`version.ts` PROTOCOL·MIN, `governance.ts` GOVERNANCE_PROTOCOL_VERSION, ADR 4절·이 기록), 팩 core@131 → 묶음 판. 줄기 tax-2도 같은 부모
  `2d53a6a4`의 마이그레이션을 더한다(형제 갈래 — 그대로 합친다, AGENTS.md 6장 Drizzle).
- 세율 안건(2407)은 tax-2의 나라 세율 저장이 들어온 뒤 `service.ts` 안건 종류·`governanceSchema.ts` kind 검사·프로토콜 enum에 더한다.

## 건드리지 말 것
- 의결은 거울 세계 세력 regime만 바꾼다. 배당·독립 경로·지분 양도 검사는 regime을 그대로 읽는다(시뮬 함수). 시뮬에 의결 층을 넣지 않았다(SIM_VERSION 그대로).

## 검사 (Verified — 실행)
- 의결 시험: `governance.db.test.ts` 2개(민주주의 NPC 나라에서 플레이어 가문장이 선출을 열고 NPC 표로 이겨 지배 가문이 됨 → 체제 전환 가결 → 유예 뒤 집행 → DB regime
  capitalism → 국고만 지분이라 지배 쪽 1000‰ → 직권 독재 → 독재는 표 없음·직권만 / 선전포고 가결 → 전쟁(같은 틱 NPC 강화면 불가침) · 해임 → 다시 뽑기·해임 가문 막힘),
  `electorate.test.ts` 4·`npcVote.test.ts` 3, `@terra/shared` 10, 프로토콜 3(28 파일 175 시험 통과 — 판 시험 포함).
- 빌드 통과, `pnpm check:bundle` 첫 화면 110,515 B / 131,416 B(바뀜 없음 — 의결 칸은 세력 화면 지연 조각).
- 화면 시험 `e2e/governance.spec.ts` **6/6 통과**(1.1분): 실제 자료(지배 가문 칸, 무소속 발의 불가), 고친 응답 안건 셋(찬성 → gov_vote 보냄, 서버 unknown_agenda 오류 문구),
  390 × 파스텔·다크 × 한국어·영어 가로 넘침 없음·사진 4장. 사진을 눈으로 봤다(파스텔·한국어, 다크·영어).
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함) **통과**: 시험 파일 **819/819**, 시험 **6,003/6,003**, 포맷·타입·린트·경계·파일 크기·다국어·디자인 값·콘텐츠 팩(호환 제외).

## 미검증·TODO·알려진 문제
- 사진 뒤 고친 것: 영어 고르기 칸 글자에 펼침 화살표가 겹쳐 `.gov-field select` 오른쪽 여백을 더했다 — 다시 찍지 않았다(미검증).
- `faction.spec.ts`는 돌리지 않았다(투표 탭에 칸 하나를 더했을 뿐, 시안 자료를 켜면 칸이 안 보인다 — Assumed 영향 없음).
- 작은 누르는 곳(smallTapTargets 38px)은 이 시험에서 검사하지 않았다(사용자 결정 대기 중인 알려진 항목).
- 실제 NAS 세계(국고 지분만 있는 NPC 나라)에서 자본주의 나라는 투표권이 비어 안건이 늘 정족수 미달이다(D-581 규칙대로 — 다른 주주가 생기면 돈다).
- 빈틈·새 질문 2401~2410(쿠데타·동점 점수 기준·해임 뒤 대리·NPC 후보·의결권 되찾기·지배 가문 바뀜의 다른 체계 반영·세율 안건·안건 차례·청원·일찍 끝내기).

## 사용자 결정 대기
- `docs/questions/2026-11-21-governance-2.md` 2401~2410.
