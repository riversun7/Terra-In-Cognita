# 2026-11-22 diplomacy — 지도자끼리 조약(제안·협상·비준·서버 집행), 동맹·보호 효과, 참전 요청

- 일시: 2026-11-22 03:00 (KST)
- 작업 도구: Claude Code
- 관련: 새 ADR `docs/adr/2026-11-21-diplomacy-treaties.md`(제안), ADR `docs/adr/2026-11-21-governance.md` "바뀜 (diplomacy)"(제안 — 고침), 질문 표시 `docs/questions/2026-11-21-governance-5.md`(2497·2498),
  새 질문 `docs/questions/2026-11-21-diplomacy.md`(2551~2560), 사용자 결정 D-588(코디네이터 전달), 기획 D-255·D-290·D-291·D-292·D-329 86·87·D-444 167·D-5057·D-5060
- 가지 `work/diplomacy`, 바탕 main 25273679b5(묶음 1117a)

## 한 일
- **조약 기록**(표 `diplomacy_treaties`): 두 나라·지금 조항 지은이·판·조항 카드(jsonb)·기간·상태(proposed·negotiating·active·expired·broken·declined·lapsed)·지은이 받아들임·열린 비준 투표·답 기한·맺은 때·끝·공물 다음 시각.
- **제안(가)·협상(나)**(2497 D-588): WebSocket `dip_propose`·`dip_counter`(조항·기간 고쳐 되돌림 — 판 + 1, 지은이 바뀜)·`dip_respond`(받기·거절·거두기). 지도자만 [임시 2552]. 두 나라 사이 열린 조약은 하나.
- **받아들이기**: 두 나라 모두. 카드마다 투표 필요(D-444 167 — `@terra/shared/treaty` `treatyPathOf`): 투표면 의결 안건 새 종류 `treaty`(비준 — 휴전·강화만이면 짧은 기간), 독재·불가침만이면 지도자 바로.
  받는 쪽이 NPC가 이끄는 나라면 NPC 규칙(`npcTreatyAnswer` — 휴전·강화 = 기존 NPC 강화 규칙식, 불가침·동맹 = 차분함 문턱, 보호 = 힘 비교) [임시 2553]. 답 기한 = `gov_peace_offer_ms` 재사용.
- **서버 집행**: 휴전·강화 = 세력·사회 `makePeace`, 불가침·동맹·보호 = 조약 기간 불가침(`truces`, 틱마다 다시 건다), 보호 공물(봉신 공물 주기마다 원장 `treaty_tribute`), 끝 = 기간(expired)·두 나라 전쟁(broken)·기한(lapsed).
- **2498 기술 기본값**: 동맹 = 불가침 + 참전 요청·수락(양쪽), 보호 = 불가침 + 공물 + 보호받는 쪽 전쟁 때 보호국에 저절로 참전 요청(조약·적마다 한 번) + 보호받는 쪽의 요청. 참전(표 `diplomacy_war_joins`,
  `dip_war_request`·`dip_war_respond`) 수락 = 무명분 비용 없는 선포 규칙으로 그 적과 전쟁 참가자(D-291). NPC 참가국 = 힘이 적 이상 [임시 2556]. 목록은 질문 2559.
- **강화 안건 옮기기(2497)**: 플레이어가 이끄는 상대에게 강화 안건(가결·직권)은 휴전·강화 조약 제안이 된다(상대가 먼저 낸 휴전·강화 조약이 있으면 받아 맺음). 옛 길(서로 같은 강화) 그대로. NPC 상대는 그대로.
- **화면**: 세력 화면 외교 탭 위 조약 칸(`faction/diplomacy/DiplomacyPanel.tsx`) — 새 조약 내기(상대·카드·보호 쪽·공물·기간·받아들이는 길 안내), 조약 카드(상태·차례·조항·기한·받기·조항 고치기·거절/거두기),
  참전 요청 목록·답, 동맹 상대에게 참전 요청 단추. 비준 투표는 의결 칸에서(안건 종류 문구 `gov_kind_treaty`). 문구 80개(ko·en).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/treaty.ts`(+시험)·`package.json` exports, `packages/shared/src/governance.ts` | 조약 전송 타입·카드·받아들이는 길, 안건 종류 `treaty` |
| `packages/protocol/src/diplomacy.ts`(+시험)·`messages.ts`·`index.ts`·`version.ts` | dip_* 메시지, 프로토콜 131·130(줄기 판) |
| `apps/server/src/diplomacy/`(새 — clauses·store·port·service·view·gateway·attach, 시험 둘) | 외교 서비스 |
| `apps/server/src/db/diplomacySchema.ts`·`schema.ts`·`governanceSchema.ts`, `drizzle/20261121173236_diplomacy_treaties/` | 새 표 둘, 안건 종류 검사 넓히기 |
| `apps/server/src/governance/service.ts`·`leaderAgendas.ts`·`attach.ts`·`store.ts`·`rules.ts`·`npcVote.ts`·`view.ts` | 비준 집행 고리·`run`·강화 제안 옮기기·payload treatyId·설정값·NPC 표·올리기 목록에서 뺌 |
| `apps/server/src/factionIdentity/attach.ts`, `session.ts`, `trpc/diplomacy.ts`·`router.ts`·`context.ts`·`createContext.ts` | 소켓·tRPC 잇기 |
| `packages/sim/src/society/governanceCoefficients.ts`·`tuningGovernance.ts`, `apps/server/src/tuning/scope.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 넷, core@209(줄기 판) — 시뮬은 읽지 않는다 |
| `apps/game/src/faction/diplomacy/`(새), `FactionScreen.tsx`, `governance/*`, `map/mapFeed.ts`, `messages/{ko,en}.json` | 조약 칸, `treaty` 안건 문구·gov_propose 종류 좁히기, dip_result 넘기기 |
| `e2e/diplomacy.spec.ts`(새) | 화면 시험 |
| ADR 둘·질문 둘·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 131·130 → 묶음 판(`version.ts`, `diplomacy.ts DIPLOMACY_PROTOCOL_VERSION`, ADR 판 줄), 팩 core@209 → 묶음 판(`manifest.json`). 마이그레이션 prevIds = 세 끝 `8ccb7e3f`·`e44a1520`·`90e99c42`
  (다른 줄기와 형제 갈래 — 그대로 합친다). 질문 번호 2551~2560.
- `apps/server/src/governance/service.ts`는 990줄(이 줄기 +7). governance-6·gov-coup 줄기가 같은 파일을 키우면 1,000줄을 넘는다 — 합칠 때 나눌 것(이 줄기 고리는 `leaderAgendas.ts` `TreatyHooks`로 옮겨 두었다).
- `session.ts` 981줄(+9 — dip_* 를 도시 지분 case에 붙였다).

## 건드리지 말 것
- 외교 서비스의 `enact`·`peaceOffer`는 의결 사슬 안에서 불린다 — 그 안에서 `governance.service.run`을 부르면 멈춘다.
- 시뮬 판정은 그대로다(계수표에 칸만 더함). 참전은 세력·사회 `declareWar` 규칙을 바로 부른다(무명분 비용 없음 — `society.declareWar`를 쓰면 비용이 나간다).

## 검사 (Verified — 실행)
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함) **통과**: 시험 파일 **871/871**, 시험 **6,233/6,233**(포맷·타입·린트·경계·크기·다국어 8,865키·디자인 값·콘텐츠 core@209 포함, `@terra/sim` 골든 그대로 —
  SIM_VERSION 올리지 않음). 처음 한 번은 새 시험 파일 타입(protocol 시험의 readonly 배열, DB 시험의 NPC 맥락 undefined)으로 멈춰 고친 뒤 다시 돌렸다.
- 새 시험: `diplomacy/clauses.test.ts`(조항 고르기·NPC 답·참전·공물), `diplomacy/diplomacy.db.test.ts` 2(NPC 상대 제안·NPC 답·동맹 불가침·참전 요청·위반 / 플레이어 지도자끼리 비준 투표·맞제안·받기·보호 공물·
  저절로 참전 요청·수락·기한 지남·강화 안건 → 휴전·강화 조약), `protocol/diplomacy.test.ts` 4, `shared/treaty.test.ts` 2. 의결 DB 시험(governance·3·5) 그대로 통과(강화 NPC 길 변화 없음).
- `pnpm check:content`(core@209, 단계 1·2·4a·4b 기준 2527367), `pnpm settings:cells --check`, `pnpm --filter @terra/server db:generate`로 마이그레이션 생성(prevIds 세 끝).
- 화면 시험 `e2e/diplomacy.spec.ts` **6/6 통과**(1.0분 — 빌드 포함 전역 준비): 실제 자료(지도자 아님 안내·제안 칸 없음), 응답 고친 장면(조약 셋·참전 요청 — [받기]가 `dip_respond` 보냄·`not_leader` 오류 문구,
  [조항 고치기] 칸 열림), 390px × 파스텔·다크 × 한국어·영어 가로 넘침 없음·사진 4장(눈으로 dark·en 확인 — 긴 나라 이름 줄바꿈 정상).

## NAS 첫 켬 영향 (Assumed — 코드 읽기·DB 시험)
- 마이그레이션: 새 표 둘·안건 종류 검사 넓히기(직전 판 앱 그대로). 조약이 없으니 처음에는 아무 일도 없다. 플레이어가 이끄는 나라 사이 강화 안건은 이제 휴전·강화 조약 제안을 남긴다.

## 미검증·TODO·알려진 문제
- 세력 화면 외교 표(관계·신뢰·공식 상태)는 아직 시안 자료 — 조약 칸만 실제 자료.
- 영토·배상·포로·관세·시야·통행 카드(2551), 위반한 쪽·신뢰(2558), 해지·갱신(2557), NPC 먼저 제안(2553), 참전 거절 벌칙(2556) 없음.
- 강화 안건 → 조약 제안 길은 DB 시험으로 봤고 화면 시험은 응답을 고친 장면만 본다.

## 사용자 결정 대기
- `docs/questions/2026-11-21-diplomacy.md` 2551~2560(2559 = 2498 기술 기본값 검토).
