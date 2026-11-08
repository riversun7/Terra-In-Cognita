# 식품 포장·포장 풀기(D-524: 포장된 식품만 스택, 풀면 낱개·신선도 하락 시작)

- 일시: 2026-11-08 20:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-03-item-holdings.md` "바뀜 (D-524, 2026-11-08)"(상태 확정), 질문 `docs/questions/2026-11-08-food-pack.md`(840~844), 기획 D-524(`docs/design/02_Decision_Log.md`, 50 §5.3, 49 N49), D-285·D-289·D-512, 가지 `work/food-pack`(바탕 main `ba40a27`)

## 한 일
- 사용자 결정 D-524(원문 "음식은 포장된것만 스택. 포장 해제시 신선도 하락시작")를 넣었다. 지금까지는 신선도 묶음이 "같은 숙성 상태끼리" 쌓이고 늘 썩었다.
- 판정(`@terra/sim` 새 파일 `items/foodPack.ts`): `lotPreserve`(포장이면 보존 배율 0 = 멈춤), `planUnpack`(1 ≤ 푸는 수 ≤ min(수량, 100 [임시]), 낱개 숙성 = 멈춘 값에서 푼 시각부터), `exchangeListable`(포장 ∧ 신선도 ≥ 문턱 — 보유 칸 → 거래소 입고 길이 열릴 때 쓸 고리). 시뮬레이터는 보유 물건을 읽지 않아 `SIM_VERSION` 그대로(21).
- 서버(`apps/server/src/holdings/`): 칸 `packed`. 얻은 식품은 포장 칸(숙성 0)으로 들어와 포장 칸끼리 쌓인다. 새 명령 `unpack`(낱개 칸을 푸는 수만큼 만들고 포장 칸을 줄이거나 지움, `not_packed`·`busy`·`unknown_*`). 썩은 낱개가 신선도 없는 아이템이 되면 포장 상태를 지운다. 포장 칸도 바로 먹는다(효과 × 멈춘 신선도). D-524 전 묶음(`packed` 빈 줄)은 부팅 때 `packLegacy`가 옛 규칙으로 그 시각까지 숙성한 뒤 멈춘 포장 칸으로 바꾼다(`holdings/world.ts`가 부름). 조회 `holdings.list`에 `packed`.
- 파일 상한: `service.ts`(926줄)에서 팩 항목 → 보유 판정 칸·찾기 표·쿨 종류를 새 `holdings/defs.ts`로 나눴다(`heldDefOf`는 `service.ts`가 다시 내보낸다).
- DB: `item_holdings.packed boolean`(빈 칸 허용) + 검사 `item_holdings_unpacked_single`, 마이그레이션 `20261108111527_food_pack`(더하기만). 쓰기 대기열 표 칸에 `packed`.
- 프로토콜 19(최소 18): `item_unpack {holding, quantity?}` → `item_result`(새 낱개 칸 ID들), 결과 코드 `not_packed`. 세션은 19판 아래 연결의 `item_unpack`을 `invalid_message`로.
- 화면(인벤토리 카드): "포장"·"낱개" 표, 포장 칸은 "포장 중이라 신선도가 줄지 않습니다…"(썩는 때 숨김), [포장 풀기](한 번 1개). 문구 6개 ko·en.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/items/foodPack.ts`·`foodPack.test.ts`, `packages/sim/src/index.ts`(한 줄 `export *`) | 포장 판정 한 벌과 시험 7개 |
| `packages/protocol/src/items.ts`·`items.test.ts`·`index.ts`·`version.ts` | `item_unpack`·`not_packed`·`UNPACK_PROTOCOL_VERSION` 19, 판 19·최소 18 |
| `packages/shared/src/holdings.ts` | `HoldingView.packed` |
| `apps/server/src/holdings/defs.ts`(새), `service.ts`, `serviceTypes.ts` | 정의 나누기, 포장 칸 보존 배율·쌓기·`unpack`·`packLegacy` |
| `apps/server/src/holdings/state.ts`, `db/holdingsSchema.ts`, `world/persist/tables.ts`, `drizzle/20261108111527_food_pack/` | `packed` 칸 저장·읽기·D-524 전 줄 목록, 표 칸·검사 |
| `apps/server/src/holdings/world.ts` | 부팅 때 `packLegacy` |
| `apps/server/src/holdings/gateway.ts`, `session.ts` | `item_unpack` 처리·판 확인 |
| `apps/server/src/holdings/reads.ts` | 조회 `packed` |
| `apps/server/src/holdings/service.test.ts`·`gateway.test.ts`·`holdings.db.test.ts` | 썩기·보존 배율·신선도 효과량 시험은 먼저 풀고 보도록 고침, 포장·풀기·not_packed·포장 칸 먹기·D-524 전 묶음(메모리·DB) 시험 |
| `apps/game/src/holdings/HoldingParts.tsx`·`holdingsModel.ts`·`holdingsText.ts`·`itemCommands.ts`·`useHoldings.ts`·`holdingsModel.test.ts` | 포장 표·안내·[포장 풀기]·`not_packed` 문구 |
| `apps/game/messages/{ko,en}.json` | 새 키 6개 |
| `e2e/inventory.spec.ts` | 흐름 끝에 스튜 포장 풀기, 사진에 포장 칸 |
| ADR(상태 확정 + 바뀜)·질문 840~844·PLAN 14장 | 결정과 확인 대기 |

## 함께 바꿔야 하는 파일
- 포장 규칙을 바꾸면 `packages/sim/src/items/foodPack.ts` → `apps/server/src/holdings/service.ts`(`preserveOf`·`stackable`·`unpack`) → 시험.
- 보유 칸 → 거래소 입고 길을 열 때 `exchangeListable`로 거르고(풀린 낱개는 올리지 못함), 문턱 E14 설정 칸을 더한다.
- 식품을 보유 칸으로 내는 새 길(채집·요리·전리품)은 `acquire`를 부르면 포장 칸으로 들어온다(낱개로 낼지는 질문 844).
- 프로토콜 판: 다른 줄기도 19를 올리면 합칠 때 판 하나로 묶는다(`version.ts` 주석 19 항목에 함께 적는다).

## 건드리지 말 것
- 마이그레이션 `20261108111527_food_pack`(올라간 뒤에는 고치지 않는다). `packed` 빈 칸 = D-524 전 줄이라는 뜻을 바꾸지 않는다(부팅 변환이 그 뜻을 쓴다).
- 썩기 사슬·보관 곳 배율(D-512) 판정 — 포장은 배율만 0으로 바꾼다.

## 미검증·TODO·알려진 문제
- 검사 결과: 아래 "검사" 참고.
- NAS 세계: 다음 배포의 첫 부팅에 기존 신선도 묶음이 그 시각까지 숙성된 포장 칸으로 바뀐다(실제 NAS에서는 확인하지 않음 — Unknown).
- 옮기기(유닛 ↔ 창고, `moveCarried`)는 풀린 낱개의 숙성을 옮기기 전에 정산하지 않는다(전부터 그랬고, 보관 곳 배율이 모두 ×1이라 지금은 같은 값). 냉장 시설 줄기에서 고친다.
- 풀린 낱개는 칸 하나하나라 많이 풀면 카드가 그만큼 늘어난다(같은 낱개를 화면에서 묶어 보이기는 하지 않았다).

## 검사
- 단위: `pnpm --filter @terra/sim`(foodPack 7), `@terra/protocol` 116, 서버 holdings 46(DB 포함), 게임 holdings 12 — 모두 통과.
- 전체 `pnpm check`·`check:docs`·`check:content`·화면 시험은 아래 줄에 적는다.

## 사용자 결정 대기
- 질문 840~844(풀 수, 포장 칸 먹기, D-524 전 묶음, 다시 포장, 얻는 길마다 포장).
