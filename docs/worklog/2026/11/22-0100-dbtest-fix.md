# DB 시험 고침: 광석 1g 기본 단위(팩 core@137) 뒤 시험 재료 수량

- 일시: 2026-11-22 01:00 (KST)
- 작업 도구: Claude Code
- 관련: 커밋 `5cf0d2d89a`(광석 1g·10kg 묶음, SIM_VERSION 71, 팩 137), ADR `docs/adr/2026-11-21-ore-grams-and-cleanup.md`, 작업 기록 `21-2355-ore-grams-and-cleanup.md`·`21-2308-batch-1116z-merge.md`

## 한 일
- `5cf0d2d89a`가 석재·잡석·철광석 기본 단위를 1kg(개)에서 1g으로 바꾸고 건물 재료 수량을 ×1,000 했는데, DB 시험(`*.db.test.ts`)은 그 커밋에서 돌리지 않아(미실행으로 기록됨) 시험이 주는 재료가 옛 단위(개 = kg) 그대로였다. 그래서 짓기가 `insufficient_materials`로 실패하거나, 지을 자리를 도는 도우미가 모든 자리에서 실패해 `no room for …`·`no place for the mine`이 났다.
- 고친 것은 모두 시험의 재료·기대값이다(분류 a). 앱 코드·콘텐츠 팩·SIM_VERSION·프로토콜은 바꾸지 않았다. 석재·잡석은 옛 kg 수를 그대로 g으로 옮겼다(물리량 유지: 옛 20개 = 20kg → 20,000g).
- 고치기 전(main `3ed55a4756`): 13개 파일 중 12개 실패, 시험 51개 중 24개 실패(`npc/cityBuild`는 그 회차에 통과, 흔들림). 고친 뒤: 13/13 파일·51/51 시험 통과. NPC 셋(`cityBuild`·`cityBuildUpgrade`·`npcClaims`)은 4번 더 돌려 4번 모두 통과, `governance.db.test.ts`는 2번 통과. `TEST_DATABASE_URL`을 준 `pnpm check` 1번 통과(862 파일·6,192 시험, 건너뜀 0).

### 파일마다 원인·고침
| 시험 파일 | 실패 | 원인 | 고침 |
|---|---|---|---|
| `business/business.db.test.ts` (4) | `no room for temple` | 도우미 `buildNear`가 석재 40(= 40g)을 줌, 신전 Lv1 석재 18,000g | 석재 40,000g |
| `temple/temple.db.test.ts` (3) | `no room for temple` | 같은 도우미 | 석재 40,000g |
| `hospital/hospital.db.test.ts` (2) | `no room for hospital` | 같은 도우미, 병원 Lv1 석재 16,000g | 석재 40,000g |
| `cyborg/cyborg.db.test.ts` (1) | `10000n ≠ 10n` | 시작 석재 `start_goods_stone`이 10 → 10,000(g)으로 바뀜 | 기대값 10,000n |
| `facilities/attack.db.test.ts` (1) | 비콘 수리 `ok: false` | 비콘 수리 재료(석재 2,000g 기준)에 석재 10을 줌 | 화물 50,000g·도시 창고 10,000g |
| `facilities/facilities.db.test.ts` (1) | 낚시터 짓기 실패 | 석재 20(낚시터 2,000g) | 20,000g, 남은 재고 기대값 20,000n |
| `gather/station.db.test.ts` (2) | `no place for the mine`, 낚시터 `insufficient_materials` | 석재 20·10·5 | 20,000·10,000·5,000g |
| `labor/produce.db.test.ts` (4) | 벌목장 `insufficient_materials` | 석재 20(벌목장 3,000g) | 20,000g |
| `labor/tradeDesk.db.test.ts` (1) | `insufficient_materials` | 석재 12(거래소 7,000g) | 12,000g |
| `travel/travel.db.test.ts` (2) | `insufficient_materials` | 석재 20 | 20,000g |
| `npc/cityBuildUpgrade.db.test.ts` (2) | 제재소·가마·행정 건물 수리 단계 `false` | NPC 도시 창고 채우기 `stock(400n)`이 석재·잡석도 400(= 400g) | 재료 표에 배율을 두어 석재·잡석은 × 1,000(400kg) |
| `npc/npcClaims.db.test.ts` (1) | 알박기 행정 건물 없음 | `stock(200n)`이 석재 200g, 행정 건물 Lv1 석재 28,000g | 석재 × 1,000(200kg) |
| `npc/cityBuild.db.test.ts` (흔들림) | `added.length > 0` 실패(고치기 전 4번 중 3번, 다음 5번 중 4번) | `stock(200n)`이 석재·잡석 200g. 석재가 드는 시설은 창고만으로 못 지어, 3시간 안에 도시 광산 산출이나 시장 매수로 석재가 3,000g까지 차야만 벌목장이 섰다(통과한 회차의 새 건물 = 벌목장 하나) | 석재·잡석 × 1,000(200kg) → 창고만으로 짓는다. 고친 뒤 5번 모두 통과 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/{business/business,temple/temple,hospital/hospital}.db.test.ts` | 짓기 도우미의 석재를 g 단위(40,000)로 |
| `apps/server/src/cyborg/cyborg.db.test.ts` | 시작 석재 기대값 10,000g |
| `apps/server/src/facilities/{attack,facilities}.db.test.ts` | 비콘 수리·낚시터 석재 g 단위 |
| `apps/server/src/gather/station.db.test.ts`, `labor/{produce,tradeDesk}.db.test.ts`, `travel/travel.db.test.ts` | 짓기 재료 석재 g 단위 |
| `apps/server/src/npc/{cityBuild,cityBuildUpgrade,npcClaims}.db.test.ts` | 창고 채우기 재료 표(`MATERIALS`)를 재료 → 배율 표로, 석재·잡석 × 1,000 |

## 함께 바꿔야 하는 파일
- 시험이 석재·잡석·광석을 줄 때는 g 단위다(팩 `items.json` `weight: 1`, `lotSize: 10000`). 건물 재료 수량이 바뀌면 위 시험의 재료도 함께 본다.

## 건드리지 말 것
- 앱 코드·팩 값은 `5cf0d2d89a`의 결정(ADR `2026-11-21-ore-grams-and-cleanup.md`)대로 둔다. 이 고침은 시험만 맞췄다.

## 미검증·TODO·알려진 문제
- `npc/cityBuild.db.test.ts`가 왜 회차마다 달랐는지(석재가 차는 시각)는 **Assumed**: 도시 광산 일꾼의 걷기(인라인 경로 서비스가 `performance.now()` 예산으로 나눈다)나 시장 체결 시각이 실제 CPU 시간에 따라 달라진다고 본다. 직접 재지는 않았다. 시험은 이제 그 경로에 기대지 않는다.
- `governance.db.test.ts`가 부하 중 한 번 실패한 원인은 **Unknown**(그때 오류 문구가 없다). 이번에 2번 돌려 통과했고, 광석 단위와는 상관없는 시험이다(석재·광석을 쓰지 않는다).
- 게임 쪽 영향(시험 밖): NPC 도시는 석재가 드는 시설마다 3,000~28,000g이 필요한데 광산은 한 사이클에 50~500g을 캔다. NPC 증축 속도가 옛 단위 때보다 느려질 수 있다(**Assumed**, 시뮬레이터로 재지 않음). 결정 범위라 고치지 않았다.

## 사용자 결정 대기
- 없음.
