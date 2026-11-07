# 사이보그 유닛 융합과 유전자 조각: 같은 유닛이 사이보그가 됨, 조각은 장부 물자, 사망 조각·유전자 환생, 프로토콜 9

- 상태: 제안
- 날짜: 2026-11-07
- 관련: docs/PLAN.md 4.3(조회는 tRPC·바꾸는 명령은 WebSocket)·14장(질문 370~378), ADR `2026-10-31-faction-society-core.md`(인구·수명·상속, "바뀜 (D-469 구인 카드)", 유닛 종류), `2026-11-01-first-login-cyborg.md`(사이보그 본체·환생·K), `2026-11-03-item-holdings.md`(보유 물건 = 개체·묶음, 쌓이는 물자 = 원장), `2026-10-31-economy-core.md`(원장 3절), `2026-10-31-s3-server-stage.md`(쓰기 대기열·커밋 뒤 답 U2), `2026-10-28-time-and-session-protocol.md`(프로토콜 판), 기획 D-470·D-478·D-481·D-469·D-507·D-515·49 N46·N47, 질문 `docs/questions/2026-11-07-fusion-genes.md`(370~378)

## 배경
- D-470: 휴먼을 바탕으로 안드로이드·기계 부품을 융합해 사이보그 유닛을 만든다(수명 없음, 유지비 비쌈, 유닛 종류에 사이보그). D-478·D-481: 수명이 다한 휴먼·크리쳐에서 스탯 유전자(속성 포함)·스킬 유전자가 남고, 한 번 쓰면 사라지며, 크리쳐 교배는 없다. 49 N46·N47이 옛 코드를 짚었다.
- 사용자 지시(2026-11-07, 기획 D-515): "정확한 수치는 밸런싱 단계에서 하는거고 빠르게 시스템을 구축해라" → 수치는 모두 설정 칸 [임시], 모양이 없으면 옛 규칙(D-507)이나 가장 단순한 기본안으로 넣고 질문(370~378)으로 남긴다.
- 옛 규칙(AntiGravt01 main `0ea5299`, 읽기만 — Verified, 줄 번호는 그 커밋):
  - 융합 `terra-server/repositories/CharacterRepository.js:512~610` craftCyborg: 휴먼 + 안드로이드(둘 다 지움) + 금화 5,000 + 티타늄 50 + 마이크로칩 20(템플릿이 없으면 그 재료는 건너뜀). STR·DEX·AGI = ⌊안드로이드 × 0.7 + 휴먼 × 0.3⌋, VIT·INT·WIS = ⌊휴먼 × 0.7 + 안드로이드 × 0.3⌋, 보너스 1 + (5~15)/100을 칸마다 곱해 반올림, 레벨 1·속성 0. 건물 = 고급 연구소·사이보그 공장(`routes/building/building_production_routes.js:494~535`).
  - 사망 조각 `terra-server/game/LifeEngine.js:163~222` _processDeath: 그 종의 `GENE_FRAG_{종 코드}` 1개를 소유자에게(템플릿이 없으면 보상 없이 사망).
  - 환생 `terra-server/routes/character/character_routes.js:930~1068` reincarnate: 수명이 다한 미니언 + 신앙도 100 + 종교 시설, 조각 max(1, ⌈레벨 ÷ 10⌉)개(그 종, 없으면 아무 조각), 조각 1개마다 무작위 스탯 +1, 레벨 1·수명 다시(2~3달)·K 리롤(잠근 칸 빼고)·환생 횟수 +1.

## 선택지
| 무엇 | 선택지 | 고른 것 |
|---|---|---|
| 부품 쪽 | 1. 안드로이드 유닛(옛) / 2. 기계 부품 스탯(설정 칸) / 3. 둘 다 | 2(서버에 안드로이드 유닛이 없다 — 판정 함수는 아무 스탯이나 받아 3으로 넓힐 수 있다, 질문 370) |
| 사이보그 유닛 | 1. 새 유닛(옛) / 2. 바탕 휴먼의 유닛 종류만 바꿈 | 2(지닌 물건·화물·생명 수치·노동 계약이 따라온다, 질문 371) |
| 사이보그 유닛 자료 | 1. `world_humans` 재사용 / 2. 새 표 `cyborg_units` | 2(수명 칸이 필요 없고 융합 기록을 둔다) |
| 조각 | 1. 보유 물건(묶음) / 2. 원장 물자(쌓이는 물자) | 2(같은 종 조각은 모두 같다 — 옛 코드 길, 거래소에서 사고팖, 보유 물건 ADR 1절 "쌓이는 물자는 원장") |
| 유전자 종류·얻는 길 | 1. 코드 이름 규칙(옛 `GENE_FRAG_{종}`) / 2. 팩 아이템 칸 `gene` | 2("얻는 길은 데이터", 편집기가 넘긴다) |
| 환생 | 1. 옛 코드(조각마다 무작위 +1) / 2. 옛 문서 D안(경향 표시·K 하나 이식) | 1(D-507, 질문 374) |
| 명령 | 1. tRPC / 2. WebSocket 프로토콜 9 | 2(AGENTS 4장) |

## 결정
### 1. 판정(`@terra/sim` `society/fusion.ts`, 정수·시드 굴림만)
- `fuseStats(휴먼, 부품, 보너스‰)`: 칸마다 ⌊(부품 × 몫 + 휴먼 × (1000 − 몫)) ÷ 1000⌋ → ⌊(값 × 보너스‰ + 500) ÷ 1000⌋(옛 Math.round). 몸 쪽(STR·DEX·AGI)은 부품 몫 `physicalDonorPm`, 마음 쪽(VIT·INT·WIS)은 휴먼 몫 `mentalHumanPm`. `fusionBonusPm` = [최소, 최대]‰ 균등(옛 1% 걸음을 ‰ 걸음으로). `fuseStatRange`는 화면 미리 보기(보너스 최소·최대).
- `geneRebirthCost(레벨)` = max(최소, ⌈레벨 ÷ 나눗수⌉), `geneRebirthBonus(스탯, 조각 수, 굴림)` = 조각마다 무작위 칸 + `genePoints`. `deathGeneDrops(유전자, 종)`·`rebirthGeneOf(유전자, 종)`(아이템 ID 차례 첫 스탯 유전자). `upkeepWeightPm(보통, 사이보그)`.
- 계수 = 세력·사회 계수표 `fusion` 칸(팩 tuning 경로 `fusion.*`, 아래 5절). 시뮬은 읽지 않는다.
- 판정 코드에 더한 고리 둘(시뮬레이터는 넘기지 않아 출력이 같다): `attachSociety` 선택 칸 `onDeath(유닛, 시각)`(수명 사망 — 환생·신격화가 아닌 것, 상속 뒤), 소유 주체 정산 선택 칸 `upkeepWeightPm`(무게 합 ‰, 유지비 = ⌊유닛당 × 무게 ÷ 1000⌋, 없으면 유닛 수 × 1000).

### 2. 팩(core@38)
- 아이템 칸 `gene`(선택, `@terra/content` `geneSchema`): `kind`(stat·skill), `species`(unit_kinds 참조), `drops`(얻는 길 목록, 지금 `death` 하나). 아이템 편집기 JSON(`ItemJson.gene`)은 그대로 넘긴다(편집 칸은 다음).
- 새 중분류 `gene`(부품), 새 아이템 `microchip`(부품·회로, 옛 마이크로칩), `gene_stat_human`·`gene_stat_creature`(얻는 길 death), `gene_skill_human`·`gene_skill_creature`(얻는 길 없음, 질문 376). 모두 쌓이는 물자(장비·신선도·사용 효과 없음) → 보유 물건 표가 아니라 원장.
- 시설은 더하지 않았다: 팩에 시설을 더하면 시뮬 경제(econ16)가 그 시설을 고를 수 있어 출력이 바뀐다. 만드는 곳은 [임시] 공방(`workshop`)으로 화면에 적고, 서버는 시설 배치를 보지 않는다(질문 378).

### 3. 서버(`apps/server/src/fusion/`)
- 유닛 종류 코드 5 = 사이보그 유닛(`world/unitKinds.ts` `UNIT_KIND_CYBORG_UNIT`, 저장 값이라 번호를 다시 쓰지 않는다). 2차맵 `setKind`(봇 ↔ 봇 아닌 것은 바꾸지 않음). 유닛 화면 종류 `cyborg`, 보유 물건 칸 배치 = 사이보그(인공장기 칸, 휴먼 칸 앞 여섯과 차례가 같아 입은 칸 번호가 그대로 맞다).
- 표 `cyborg_units`(`db/fusionSchema.ts`, 마이그레이션 `20261107033018_cyborg_units` — 표 더하기만): `unit_id`(→ `world_units`, 지우면 함께), `level`(≥ 1), `stats`(6칸 ≥ 0), `elements`(12칸 0~10 또는 null), `human_stats`(6칸), `donor`(parts·android), `bonus_pm`, `fused_at_ms`. 쓰기 대기열 표 `cyborgUnits`(휴먼 다음).
- 원장 물자 자산 = 아이템 ID(DB 검사 `ledger_accounts_asset_format`이 쌍점을 받지 않아 시안 자료의 `item:` 앞머리를 쓰지 않는다), 위치 없음(장부 계정). 처음 나오는 물자 = 시스템 계정 `issue:<ID>`, 쓴 물자 = `sink:<ID>`.
- 서비스(`service.ts`): 명령 하나 = 읽기(쓰기 대기열이 따라잡은 뒤 DB 휴먼 행) → 메모리로 다시 확인(소유·종류·포로) → 한 번의 동기 처리 → 커밋 뒤 답(U2).
  - `fuse(휴먼, 본 값)`: 사이보그 있음·내 유닛·종류 4·포로 아님·본 값 = 지금 `n46_currency`·화폐(시험 화폐 [임시])·재료(티타늄 괴·마이크로칩, 팩에 없거나 꺼진 재료는 옛 코드처럼 건너뜀) → 화폐 소각·재료 소각·종류 5·휴먼 행 지움·사이보그 유닛 행. 휴먼 지갑은 서버에 아직 없어 상속할 것이 없다(D-470 "지갑은 상속처럼" — 지갑이 생기면 이 자리에서 `inherit`).
  - `rebirth(유닛, 본 조각 수)`: 내 휴먼·수명 끝(태어난 시각 + 수명 ≤ 지금)·본 조각 수 = 지금 비용·그 종(휴먼) 스탯 유전자가 팩에 있음·조각 잔고 → 조각 소각·휴먼 행(레벨 1·수명 다시(T4 굴림)·환생 +1·스탯 + 조각 보너스, 도시·만족도·속성은 그대로). [임시] 신앙도·종교 시설 조건은 보지 않는다(서버에 휴먼 신앙·시설 배치가 없다). K는 휴먼 행에 없어 리롤하지 않는다.
  - `devGrant(아이템 | "currency", 수)`: dev·admin(secondMap dev-spawn, 보유 물건 `dev_grant_item`과 같은 권한). 쌓이는 물자만(장비·신선도·사용 효과가 있으면 `unknown_item`).
  - `dropOnDeath(주체, 종, 시각)`: 얻는 길에 death가 있는 그 종의 조각을 `n47_death_drop`개(동기, 같은 저장 묶음). NPC 사회 런타임의 `onHumanDied`가 부른다(NPC 휴먼 종 = 휴먼). 유저 휴먼의 수명은 서버가 아직 돌리지 않아 유저 유닛 사망 조각은 그 줄기에서 같은 함수를 부른다.
  - `overview`: 비용·내 잔고·재료 보유·비율·부품 스탯·유지비 배율·내 휴먼(스탯, 융합 뒤 범위, 수명 끝 시각, 포로, 환생 조각 수)·내 사이보그 유닛·유전자 조각 보유(켜진 gene 아이템 모두, 0도).
- 유지비: 소유 주체 정산이 유닛 종류마다 무게를 읽는다(`createSettlement` `upkeepWeightPm`: 종류 5 = `n46_upkeep`, 그 밖 1000). 본체 + 사이보그 유닛 하나 = 유닛당 유지비 × 4(DB 시험).
- 설정 칸 반영 범위: N46·N47 열세 칸 모두 live(명령·조회·정산마다 읽는다, `tuning/scope.ts`).

### 4. 프로토콜 9(`packages/protocol/src/fusion.ts`)
- 기기 → 서버: `cyborg_fuse {human, cost}`·`unit_rebirth {unit, shards}`·`dev_grant_goods {item, quantity ≤ 1,000,000}`. 서버 → 기기: `fusion_result {ok, unitId?, stats?, bonusPm?, shards?}` 또는 `{ok: false, code}`(코드 16개).
- 더하기만 했다: `PROTOCOL_VERSION` 8 → 9, `MIN_SUPPORTED_PROTOCOL_VERSION` 7 → 8(현재 + 직전 1개). 8판 기기는 그대로 받는다. 사용자별 속도 제한(순간 10·분당 30), 연결마다 차례대로(`fusion/gateway.ts`).
- 조회 tRPC `fusion.overview`(로그인한 본인, 세계 준비 전이면 PRECONDITION_FAILED `world_not_ready`). 모양은 `@terra/shared/fusion`.

### 5. 설정 칸(팩 core@38, 49 N46·N47)
| 칸 | 계수표 | 출발값 |
|---|---|---|
| `n46_currency` | `fusion.currency` | 5,000(옛 금화) |
| `n46_titanium`·`n46_microchip` | `fusion.titaniumQty`·`microchipQty` | 50·20(옛) |
| `n46_physical_donor`·`n46_mental_human` | `fusion.physicalDonorPm`·`mentalHumanPm` | 700·700‰(옛 0.7) |
| `n46_bonus_min`·`n46_bonus_max` | `fusion.bonusMinPm`·`bonusMaxPm` | 1,050·1,150‰(옛) |
| `n46_parts_stat` | `fusion.partsStat` | 10 [임시](옛 안드로이드 기본값) |
| `n46_upkeep` | `fusion.upkeepPm` | 3,000‰ [임시](D-470 "비싸다", 값 없음) |
| `n47_rebirth_divisor`·`n47_rebirth_min` | `fusion.geneLevelDivisor`·`geneMin` | 10·1(옛) |
| `n47_gene_points` | `fusion.genePoints` | 1(옛) |
| `n47_death_drop` | `fusion.geneDeathDrop` | 1(옛) |

### 6. 화면(유닛 화면 [융합] 칸, `apps/game/src/units/FusionPanel.tsx`)
- 기술 기본 화면(옛 융합 화면이 없다): 비용(화폐·재료와 내 보유)·섞는 비율·부품 스탯·유지비 배율 → 내 휴먼 카드(지금 스탯, 융합 뒤 범위, 수명, [융합]·[유전자 환생(조각 n)] — 수명이 남으면 막힘) → 내 사이보그 유닛(스탯, 바탕 휴먼 스탯, 보너스) → 유전자 조각(종·종류·얻는 길·보유). dev·admin은 [시험 재료 받기]·[시험 유전자 조각 받기]. 디자인 시스템 토큰만, 390px 먼저(스탯 3 × 2, 넓으면 한 줄). 문구 58개 ko·en.
- 유닛 목록 종류 거르기에 "사이보그"(D-470 "유닛 탭 종류에 사이보그도"). 유닛 화면 지연 조각 안(첫 화면 묶음·PWA 목록 그대로).

## 이유
- 같은 유닛이 사이보그가 되면 지닌 물건·화물·생명 수치·노동 계약을 옮기는 규칙이 필요 없다(D-479 "꼬이지 않고 오류 없게").
- 같은 종 조각은 모두 같으므로(옛 코드) 쌓이는 물자다. 원장에 두면 거래소·창고·운송이 쓰는 계정 하나로 남고(경제 ADR 이유), "거래 가능"(옛 문서)이 따로 일 없이 된다.
- 얻는 길을 팩 칸으로 두면 기획이 정하는 대로(크리쳐 종, 스킬 유전자 사망 드롭 등) 코드 없이 바꾼다(D-478 "데이터").
- 판정 고리(`onDeath`·`upkeepWeightPm`)를 선택 칸으로 두어 시뮬레이터 출력이 그대로다(Verified: 아래 결과).

## 결과
- 시뮬레이터: 판정 규칙은 그대로(`SIM_VERSION` 12). Verified(시드 1): main 팩(core@37)을 얹어 이 가지 코드로 돌리면 econ16 60일 해시 38524eb6·war16 30일 be74f1f5 = main 작업 기록 값. core@38 팩으로는 하루 줄(econ16 816줄, war16 235줄)이 모두 같고, 요약 줄만 팩 판·해시와 새 아이템 다섯의 시장(econ16 `economy.markets` 8,100 → 8,350, 원장 계정 26,755 → 27,515, 거래량 0)이 다르다(콘텐츠 몫).
- 하지 않은 것(다음 줄기): 안드로이드 유닛을 재료로(질문 370), 사이보그 유닛 레벨 오르기·인공장기(D-470 "본체처럼"), 사이보그 유닛의 저장된 스탯을 유닛 상세 스탯에(지금 유닛 상세는 [임시] 기본 몸 — 저장된 유닛 스탯 줄기, [융합] 칸에는 보인다), 유저 휴먼 수명(망령·사망 조각·상속), 스킬 유전자 얻는 길·주입(질문 376), 인큐베이터(D-469·D-478 스탯 유전자로 새 휴먼), 크리쳐 유전자 조합(D-481), 사이보그 시설과 시설 창고에서 재료 빼기(질문 378), 테라코인·생필품 유지비(질문 373), 유닛 경매소 거래(D-470·D-242).
- [임시]: 부품 스탯 10, 유지비 3배, 화폐 = 시험 화폐, 재료·조각 = 장부 계정(위치 없음), 시설 = 공방 표시만, 유전자 환생의 신앙도·시설 조건 없음, 크리쳐 조각은 크리쳐 종이 아니라 유닛 종류 하나.
