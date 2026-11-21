# 2026-11-21 governance-2 — 지배 가문 지분 계정·국고 지분 과반 제외·NPC 도전자·지배 가문 반영·빈자리·일찍 끝내기·세율 안건

- 일시: 2026-11-21 17:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-governance.md` "바뀜 (governance-2)"(제안 — 고침), `docs/adr/2026-11-11-faction-identity.md` "바뀜 (governance-2 …)"(덧붙임), 질문 표시
  `docs/questions/2026-11-21-governance-2.md`(2401~2410 + D-582)·`2026-11-21-governance.md`(2356 추천 문구 고침)·`2026-11-21-npc-claim-3.md`(2381~2385), 새 질문
  `docs/questions/2026-11-21-governance-3.md`(2431~2440), 기획 D-338·D-298·D-581·D-580 6·7·D-555 1509·D-344·D-217·D-509·D-572·D-577·D-582
- 가지 `work/governance-2`, 바탕 f3ff55b412(main 묶음 1116v) + main ed25b71a3c(묶음 1116w, tax-2) 합침

## 한 일
- **지배 가문 지분 계정(D-338)**: 가문이 도시 지분을 갖는 원장 시스템 계정 `shares:house:<가문 꼬리><share_도시>`. 시뮬 지분 함수(합·소각·배당·점령 몰수)가 가문 계정을 함께 센다(시뮬은
  가문 계정을 만들지 않아 결과 그대로).
- **독재 나라 지분 정리**: 의결 틱마다 국고 지분 → 지배 가문 계정(멱등, 감사 기록). NAS 옛 세계는 배포 뒤 첫 틱(세계가 준비되면 곧바로)에 독재 나라 도시의 국고 지분이 모두 옮겨진다.
- **자본주의 NPC 나라 처음 지분(D-582)**: 도시마다 한 번 국고 지분 → 세운 NPC 가문(수도 → 지배 가문), 새 표 `governance_share_fixups`. NAS 옛 세계는 첫 틱에 국고 지분을 모두 옮긴다.
  가문 계정 지분은 자본주의 주주다(국고만이라 투표권이 비던 문제가 풀림).
- **지분 과반에서 국고 빼기(D-298·D-581·D-580 6)**: 지배 쪽 = 지배 가문 지분만, 국고는 비례 나눔으로 셈 = 지배 ÷ (합 − 국고). 국고만이면 0‰.
- **NPC 도전자(2404 나)**: 출마 점수 규칙식 + 설정 칸 둘.
- **지배 가문 반영(2406)**: 의결 지배 가문을 NPC 런타임(cityHouses `setRuling`)에 → 독재 남은 이익 금고, 정부 판 지도자(플레이어 가문장), 지도·랭킹의 지배 가문, 나라 이동 정책.
- **빈자리(2403 답 D-582)**: 해임 뒤 다시 뽑기 실패 → `governance_state.vacant_since_ms`. 가르는 절차는 빈틈(설정 칸만).
- **일찍 끝내기(2410 가)**: 확정 표(NPC)만 세고 흔들리는 무게를 양쪽 끝으로 줘도 결과가 같으면 닫는다.
- **세율 크게 바꾸기(2407 가, tax-2 위)**: 안건 `tax_change`, 민주주의·자본주의에서 폭 ≥ 설정 칸이면 `nation_tax`가 안건을 연다(ok + agendaId), 가결되면 나라 세금에 쓴다. 화면: 안건 카드에
  바꿀 세율, 나라 세금 칸에 "안건을 열었다" 안내.
- **쿠데타(2401 답 D-582)**: 결과 도우미만(몰수·만족도 벌칙 + 설정 칸), 일으키는 길은 질문 2433.
- **2384 닳음 확인**: 레벨 0 건물은 플레이어·NPC 모두 닳지 않는다(`facilities/service.ts` advance — 다 지은 건물만). 버려진 NPC 알박기 건물도 같은 규칙이라 코드 바꿈 없음(질문 문서에 까닭).
- main(묶음 1116w) 합침: `content/core/manifest.json` 충돌만(줄기 판 172로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/shares.ts`·`dividends.ts`·`occupation.ts`·`index.ts`, `houseShares.test.ts`(새) | 가문 지분 계정을 합·소각·배당·점령 몰수에 |
| `packages/sim/src/society/governanceCoefficients.ts`·`tuningGovernance.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 5개, core@172(줄기 판) |
| `packages/shared/src/governance.ts` | 안건 `tax_change`, 조회 `taxes` |
| `packages/protocol/src/governance.ts`·`nationTax.ts`·`version.ts` | gov_propose `tax_change`·`taxes`, nation_tax_result `agendaId`, 프로토콜 98·97(줄기 판) |
| `apps/server/src/db/governanceSchema.ts`, `drizzle/20261121084410_governance_vacancy_tax/` | 빈자리 칸·처음 지분 기록 표·안건 종류 검사 |
| `apps/server/src/governance/houseShares.ts`·`shareFixups.ts`·`early.ts`(새, 시험 둘), `port.ts`·`electorate.ts`·`service.ts`·`store.ts`·`npcVote.ts`·`rules.ts`·`view.ts`·`attach.ts`·`gateway.ts`, 시험 | 위 한 일 |
| `apps/server/src/npc/cityHouses.ts`·`rulingVault.ts`, 시험 | 의결 지배 가문 반영(2406) |
| `apps/server/src/government/reads.ts`·`reads.test.ts` | 선출된 플레이어 가문장 = 정부 판 지도자 |
| `apps/server/src/government/nationTaxPolicy.ts`, `nationTaxPolicy.db.test.ts`(새) | 세율 안건 문턱(2407 가) |
| `apps/server/src/factionIdentity/houseEntryPolicy.ts`·`.db.test.ts`, `attach.ts`·`gateway.ts` | 선출된 지배 가문장이 나라 이동 정책, 세율 안건 연결 |
| `apps/server/src/tuning/scope.ts` | 새 칸 실시간 반영 |
| `apps/game/src/faction/governance/GovernancePanel.tsx`·`governanceText.ts`, `government/NationTaxPolicy.tsx`·`nationTaxCommands.ts`, `messages/{ko,en}.json` | 세율 안건 문구 3개(ko·en) |
| ADR 둘·질문 넷·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 98·97 → 묶음 판(`version.ts`·ADR 판 줄), 팩 core@172 → 묶음 판. 마이그레이션 prevIds는 세 끝(74cfa5b9·8ba706b5·6429529b) — 다른 줄기가 같은 끝에 더하면 형제 갈래로 그대로 합친다.

## 건드리지 말 것
- 가문 지분 계정 앞머리 `shares:house:`를 돈 금고 앞머리 `vault:house:`와 합치지 않는다(랭킹 자산·금고 음수 검사·가문 장부가 `vault:house:%`를 돈으로 읽는다).
- 자본주의 처음 지분 옮기기는 도시마다 한 번(`governance_share_fixups`) — 기록을 지우면 그 뒤 몰수 지분(D-298)까지 옮겨진다.

## 검사 (Verified — 실행)
- 시뮬 `src/society` 19 파일 152 시험 통과(가문 지분 시험 포함 — 시뮬 결과 그대로: 골든 시험은 전체 검사에서).
- 서버 의결·NPC 가문·금고·정부 판 8 파일 46 시험 통과(합치기 전), DB 시험 `governance.db.test.ts` 3개(합치기 전) 통과, 가문 이동 정책 DB 9개 통과.
- 합친 뒤: 프로토콜 30 파일 182 시험, 서버 의결·세금·가문 정책 DB 시험(`governance.db.test.ts` 4개·`nationTaxPolicy.db.test.ts` 3개·`houseEntryPolicy.db.test.ts`) 통과.
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함) **통과**: 시험 파일 **830/830**, 시험 **6,059/6,059**(첫 번째는 `packages/sim/src/index.ts` 1,001줄로 실패 →
  가문 지분 내보내기를 `society/houseShareApi.ts`로 묶어 995줄, 다시 돌려 통과).
- `pnpm build` 통과, `pnpm check:bundle` 첫 화면 110,530 B / 131,416 B.
- 화면 시험 `e2e/governance.spec.ts` **6/6 통과**(46.4초). 세율 안건 카드·나라 세금 칸 안내 문구는 이 시험이 다루지 않는다(미검증 — 사진 없음). 작은 누르는 곳(38px)은 보지 않았다.

## 미검증·TODO·알려진 문제
- 화면: 세율 안건 문구 3개를 더했을 뿐이라 그 칸의 사진은 찍지 않았다(미검증). 빈자리일 때 의결 칸은 지배 가문 "없음"으로만 보인다(빈자리 문구 없음).
- NAS 첫 틱 동작(Assumed — 코드 읽기·DB 시험): 독재 나라 모든 도시의 국고 지분 → 지배 NPC 가문 계정, 자본주의 NPC 나라 도시의 국고 지분 → 세운 NPC 가문(수도 → 지배 가문, 가문 없는 도시는
  나중에). 감사 기록 `governance.shares_to_house`. 민주주의 나라는 바뀌지 않는다.
- 독재 NPC 나라의 지분 팔기(국고에서 팖)는 국고에 지분이 없어 일어나지 않는다(2439). 시뮬 자본주의 독립 투표는 가문 계정 지분을 세지 않는다(2435).
- 선출로 바뀐 NPC 가문의 도시를 잃으면 NPC 런타임은 처음 규칙으로 돌아가지만 의결 지배 가문(조회·발의)은 선출 기록 그대로다.

## 사용자 결정 대기
- `docs/questions/2026-11-21-governance-3.md` 2431~2440.
