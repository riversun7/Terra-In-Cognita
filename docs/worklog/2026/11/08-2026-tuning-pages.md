# 설정 칸 패널 분야별 페이지·[임시] 값 칸 열기

- 일시: 2026-11-08 20:26 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-dev-settings-panel.md` "바뀜 (2026-11-08 분야별 페이지)", 질문 830~831(`docs/questions/2026-11-08-tuning-pages.md`), 가지 `work/tuning-pages`(main `27f35c6` 위)

## 한 일
- 사용자 요청(원문 "앞서말한 수치 조정을 위한 개발자 패널에 페이지를 만들어라"): ADR의 [임시]·출발값을 개발자 패널(/dev/tuning)에서 분야별로 보고 바꾸게 했다.
- **조사**: 아래 표. ADR 여섯(세력·사회·NPC 두뇌·정원사·보유 아이템·전투·경제 코어)과 최근 ADR(플레이 흐름·채집 오브젝트·국적·옆 2차맵)의 수치를 계수표·코드와 맞춰 봤다. 계수표 숫자 칸 가운데 칸이 없던 것은 51개였고(스크립트로 셈: `TEST_SOCIETY_COEFFICIENTS`·`TEST_COMBAT_COEFFICIENTS`의 숫자 잎 − `TUNING_KEYS` 경로), 그 밖에 코드 상수로 남은 [임시]를 `grep "임시"`로 찾았다.
- **새 칸 40개**(출발값 = 옛 상수, 행동 그대로): NPC 판단 점수·규칙식 문턱 29, NPC 중앙은행 공식 4(E5·S1, 옛 `TEST_CENTRAL_BANK_RULE`을 NPC 계수표 `bank*`로 — 시뮬·서버 `runEconomy` → `bankDay(…, centralBankRuleOf(npc))`), 도시 발전도 식 5(계수표 `development.*`, `simulator/society.ts` 하루 끝), NPC 지분 팔기 2(`shareSaleAmount`·`shareSalePrice`). 반영 범위 sim.
- **분야 페이지**: `@terra/shared/tuning` `TUNING_PAGES`(7), `@terra/sim` `tuningPageOf`(묶음·경로 규칙), 서버 `tuning.list`에 `page`·`desc`·`source`. 화면 탭(전체 + 7, ←→·Home·End, 칸 수, 고른 탭은 localStorage), 탭 판 한 줄 풀이, 페이지별 무리 목록, 찾기는 출처도 본다.
- **칸 줄 풀이·출처**: 팩 `tuning` 선택 칸 `desc`(ko·en)·`source`를 스키마에 더하고 480칸 모두 적었다(출처는 묶음 → ADR·결정 ID 규칙으로 스크립트가 만들고, 풀이는 손으로 썼다). 팩 core@56.

### 조사 표 (값 → 코드 → 이미 칸? → 이번에)
| ADR | 값([임시]·출발값) | 코드 | 이미 칸? | 이번에 |
|---|---|---|---|---|
| 세력·사회 코어 | 약탈 금고 몫·약탈/통합 만족도 하락 | `lootTakeBp`·`lootSatisfactionDrop`·`integrateSatisfactionDrop` | 예(`d186_*`) | 페이지·풀이 |
| 〃 | 점령 결과(약탈 창고 몫·재건 비용·점령 기간·세금 등, D-520) | `war.*` | 예(`d520_*`) | 〃 |
| 〃 | 만족도 복원 속도·목표 기여 11칸·임금 격차 | `satisfactionRestorePmPerDay`·`satisfactionTarget.*`·`wageTopSharePm` | 예(N29·N30) | 〃 |
| 〃 | 편입 기한 3일 | `offerDeadlineMs` | 예(S30) | 〃 |
| 〃 | 반란·예고·태업 문턱, 독립 통과 | `rebellionThreshold`·`rebellionWarningAt`·`sabotageAt`·`independencePassPm` | 예(S26·N35·S27) | 〃 |
| 〃 | 수명 60~90일·환생·신격화 확률 | `lifespanMinMs/MaxMs`·`rebirthPm`·`deifyPm` | 예(T4·D-395) | 〃 |
| 〃 | 기술 단계 상한·작업량·발전도 문턱 | `techGroundMax`·`researchWorkBase`·`developmentPerTech` | 예(`q121_*`) | 〃 |
| 〃 | 발전도 식(만족도 ÷ 2000 + 휴먼 × 2 ≤ 30 + 연구 Lv × 4, ≤ 100) | `simulator/society.ts` 상수 | 아니오 | **칸 5개** `dev_*` |
| 〃 | NPC 지분 팔기 100주 × 주당 10 | `simulator/society.ts` `sellShares` 상수 | 아니오 | **칸 2개** `share_sale_*` |
| 〃 | 피로 상한·구간 3·회복·주거 배율 | `fatigue*`·`housingRecoveryPm` | 예(N21~N25·S25) | 〃(0번 구간 = 늘 0·1000은 열지 않음) |
| 〃 | 임금 단가·탄력·상하한·재계산 6시간·고용주 조정 | `wage*`·`employerAdjust*` | 예(N27·N28) | 〃 |
| 〃 | 구인 카드(D-469)·신전·폐허 복원 | `recruit.*`·`temple.*`·`restoration.*` | 예 | 〃 |
| 〃 | 마을 세우기 값 | 시나리오 설정 `foundCost` | 아니오 | 안 함(시나리오 설정, 서버는 `DEFAULT_SCENARIO_SOCIETY`) |
| NPC 두뇌 | 성향 축 0~1000·물려받기 폭 | `npc.traitMin/Max/Drift` | 예(S19) | 페이지·풀이 |
| 〃 | 판단 간격 6시간 | `npc.decideEveryMs` | 예(`d323_decide_every`) | 〃 |
| 〃 | 세율 폭·상한·만족도 하한 | `npc.tax*` | 예(`d323_tax_*`) | 〃 |
| 〃 | 성향 가중 점수 계수(쉬기·치기·소탕·예비금·마을·연구·지분·강화·독립·규칙식 문턱·거래 몫·폐허·굶음 문턱) | `npc.*` 29칸 | 아니오 | **칸 29개** `npc_*` |
| 〃 | 무명분 비용·백지 강화·불가침·공격 힘 비·구인 목표 | `npc.*` | 예 | 페이지·풀이 |
| 정원사 | 오염 생산(전투·휴먼·전선)·감소(숲·정화·자연)·퍼짐 | `gardener.*` | 예(P15·S14) | 〃 |
| 〃 | 웨이브 확률·세기·예고·쉬는 시간·물리형 | `gardener.*` | 예(C14~C18) | 〃 |
| 〃 | 유목 부대(탐지·예고·문턱·수·규모)·관계도·보호 레이드·보상·이동 습격 | `gardener.*` | 예(S16·S17·N52·D-499·D-500) | 〃 |
| 보유 아이템 | 닳을 확률 250‰·패배 150‰·닳는 양 1·4 | `durability.wear*` | 예(N49·D-496) | 〃 |
| 〃 | 수리 감소 Lv1~5·하한·파괴 문턱·장인 적정 50 | `durability.repair*`·`destroyAtMax`·`craftAppropriate` | 예(F11·F12) | 〃 |
| 〃 | 탄약 보충 감소 50‰ | `durability.ammoRefillLossPm` | 예(`d509_ammo_refill_loss`) | 〃 |
| 〃 | 물약 쿨 30초·요리 쿨 5분·자동 물약 400‰·보존 배율 7 | `consumables.*` | 예(D-509·D-510·N49) | 〃 |
| 〃 | 소모품 효과량 오차 | 팩에만(`d496_use_variance`) | 예(읽는 코드 없음 → none) | 페이지(보유 아이템) |
| 전투 코어 | C2·C5·C19~C27·C10·N10~N13 | 전투 계수표 | 예 | 〃 |
| 〃 | 아머 회복·부상 회복·불이익(D-514)·부상 단계·병원(D-521) | `armorRegenPm`·`vitals.*`·`injury.*` | 예(N54·N55) | 〃 |
| 〃 | 틱 100ms·스냅숏·필드·입장 줄·제한 상한 | `tickMs` 등 | 아니오 | 안 함(재계산·재생이 같은 값을 써야 하는 기술 상수) |
| 경제 코어 | 중앙은행 목표·이득 20%·하루 상한 3%·이율 0.01%/일 | `economy/centralBank.ts` `TEST_CENTRAL_BANK_RULE` | 아니오 | **칸 4개** `npc_bank_*`(E5·S1) |
| 〃 | 1인당 하루 거래액 200(E6) | 시나리오·서버 `perCapitaDaily` bigint | 아니오 | 안 함(시나리오·서버 경제 설정) |
| 〃 | 채집 레벨 보너스·진행·광석 g·창고 용량 | `gather*`·팩 `d506_storage_per_level` | 예(N43·N44·D-506) | 페이지·풀이 |
| 〃 | 거래 판단(목표 재고·95%/101%·±2%) | `economyStub.ts` | 아니오 | 안 함(ADR 8절 "게임 규칙이 아님", R5가 대신) |
| 〃 | 시설 건설·노화·노동 계약 | `facilityBuild.*`·`labor.*` | 예(M14·N50·N48) | 페이지·풀이 |
| 플레이 흐름·채집·국적·옆 2차맵 | 세계 씨앗·낮밤 일·채집 오브젝트·귀화 값·쉬는 날·띄우기 상한·이동 습격 | `worldSeed.*`·`gatherObjects.*`·`cyborg.naturalize*`·`gardener.travelRaid*` | 예 | 페이지·풀이 |
| (사이보그) | 스킬 최대 등급 기본 3·상한 10 | `cyborg.skillGrade*` | 아니오 | 안 함(D-031·D-5001 기획 확정 값) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/tuning.ts` | `TUNING_PAGES`·`isTuningPage`, 칸 화면 모양에 `page`·`desc`·`source` |
| `packages/content/src/schema/tuning.ts` | 팩 선택 칸 `desc`·`source` |
| `packages/sim/src/tuningPages.ts`(새)·`tuningPages.test.ts`(새)·`index.ts` | 칸 → 페이지 규칙, 시험(페이지 매핑·새 칸 출발값 = 옛 상수·칸이 계수표에 듦) |
| `packages/sim/src/npc/coefficients.ts`·`tuningNpc.ts` | NPC 점수 29칸 + 중앙은행 4칸 열기 |
| `packages/sim/src/economy/centralBank.ts`·`simulator/economy.ts`·`simulator/economyRun.ts` | `centralBankRuleOf`, `bankDay`가 규칙을 받음 |
| `packages/sim/src/society/coefficients.ts`·`simulator/society.ts`·`tuning.ts` | 발전도 식·지분 팔기 칸 |
| `content/core/tuning.json`·`manifest.json` | 새 칸 40개, 480칸 풀이·출처, core@56 |
| `apps/server/src/tuning/services.ts`·`tuning.db.test.ts` | 목록에 페이지·풀이·출처 |
| `apps/game/src/editor/tuning/TuningPageTabs.tsx`(새)·`TuningPanelScreen.tsx`·`TuningRow.tsx`·`tuningModel.ts`(+시험)·`tuningMessages.ts`·`tuningPanel.css` | 탭·탭 판·풀이·단위·출처 |
| `apps/game/messages/ko.json`·`en.json` | 페이지 이름·한 줄 풀이·이름표(19키씩) |
| `e2e/tuning.spec.ts` | 분야 페이지 시험·페이지마다 사진(테마 2 × 언어 2 × 390·1440) |
| ADR·PLAN 14장·질문 830~831 | 기록 |

## 함께 바꿔야 하는 파일
- 새 설정 칸을 더하면: 팩 항목에 `desc`·`source`도 적는다(검사는 막지 않는다 — 없으면 이름만 보인다). 새 묶음 파일(`tuningXxx.ts`)을 만들면 `packages/sim/src/tuningPages.ts` `GROUP_PAGES`에 넣지 않는 한 경로 규칙으로 고른다(대개 "기타").
- 페이지를 더하면: `@terra/shared/tuning` `TUNING_PAGES`, `tuningModel.ts` `pageCounts`(타입 검사가 알림), `tuningMessages.ts` `PAGE_TEXT`, 메시지 둘.

## 건드리지 말 것
- 팩 기존 칸의 `unit`·`min`·`max`(바꾸면 켤 때 그 칸 덮어쓰기가 `unit_changed`·`out_of_range`로 지워진다).

## 검사 결과
- `pnpm vitest run packages/sim` 90 파일·710 통과. 패널·콘텐츠·서버 설정 칸 시험 16 파일 149 통과(DB 시험은 아래 전체 검사에서).
- `pnpm e2e e2e/tuning.spec.ts` 29 통과(3.8분). 사진 64장(페이지 8 × 네온·라이트 × ko·en × 390·1440)을 보고 확인: 탭은 390px에서 세 줄로 접히고 가로 넘침 없음, 풀이·출처는 이름 칸 안에서 줄을 바꿈. 사진을 보고 단위 없는 칸의 "단위 단위 없음" 겹침을 고쳤다(단위가 있을 때만 보임).
- 단위 숨김을 고친 뒤 `pnpm e2e e2e/tuning.spec.ts --grep "분야 페이지"` 9 통과(1.6분), 사진 다시 확인.
- `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어·대비·콘텐츠, 단위 시험 542 파일·4,097 통과 — DB 시험 포함). `pnpm check:docs origin/main`·`pnpm check:content origin/main` 통과.

## 미검증·TODO·알려진 문제
- 새 칸 40개는 반영 범위 sim: 서버 NPC 사회 런타임은 켤 때 받은 계수표로 돌아 바꾼 값은 다음 켤 때 서버에 든다(기존 NPC 칸과 같다). 서버가 판정마다 읽게 하려면 런타임의 `rules()`를 판단마다 다시 부르게 고친다(이 줄기 밖).
- 풀이는 기술 세션이 쓴 글이다(기획 원문 아님). 출처는 묶음 규칙으로 만든 것이라 칸마다 정확한 절은 아니다.
- 49 칸 목록에서 E5·S1이 "연결됨"이 된다(질문 830).

## 사용자 결정 대기
- 질문 830(중앙은행 칸 ↔ E5·S1), 831(발전도 식 계수를 49 칸으로).
