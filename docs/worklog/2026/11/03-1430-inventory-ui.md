# 인벤토리 화면: 사이보그·유닛 상세의 보유 물건(장착·해제·사용·쿨·교체 확인·개발 받기)

- 일시: 2026-11-03 14:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-03-item-holdings.md` "바뀜 (2026-11-03, 화면)", `2026-10-28-design-system.md`, `2026-11-01-cyborg-sheet-old-look.md`, 직전 기록 `03-0940-item-holdings.md`(결과 "사이보그 화면 인벤토리·장비 칸에 보유 물건 보이기"), 기획 D-501·D-507·D-509·D-510·N49, 가지 `work/inventory-ui`

## 한 일
- **옛 화면 대조(D-507)**: 옛 저장소(읽기 전용 클론 FETCH_HEAD `0ea5299`)의 `terra-client/src/components/character/` `CyborgProfile.tsx`(그림 양옆 인공장기·장비 칸 `EquipmentSlot`, 누르면 `onSlotClick`), `EquipmentSelectionModal.tsx`(지금 장착 + [해제], 그 칸에 맞는 물건, 내구도 막대 60%·30% 문턱 색 + "현재/최대", 파손이면 누를 수 없고 "내구도 0 — 수리 필요"), `LocationInventory.tsx`(사이보그·미니언·창고 묶음, 카드: 분류 색 왼쪽 띠·수량 "x3"·착용 표·블루프린트 +초록/−빨강 스탯 표, 분류 거르기·정렬·격자/목록, 나누기·합치기·옮기기 창), `components/ItemTooltip.tsx`(스탯·내구도 막대·소모품 효과와 지속). 옛 화면에는 소모품 쓰기·버프 목록 화면이 없었다.
- **따라 한 것**: 칸을 누르면 칸 고르기 창(옛 모달 구성 그대로), 인벤토리 카드(분류 색 띠 = 장비 primary·쓰는 물건 success·그 밖 muted, "×n", 착용 표, 굴린 스탯 표 +/−색, 내구도 막대·"현재/최대", 파손 장착 막음), 분류 거르기(전체·장비·소모품), 정렬(장비 → 쓰는 물건 → 그 밖, 이름 차례 — 옛 묶음 차례). **더한 것**: [사용](D-501) + 교체 확인 창 "지금 버프가 사라집니다"(confirm_replace → confirm), 걸린 효과(이름·효과량·남은 시간), 쓰기 쿨 칩(물약·요리, D-509·D-510)과 [사용] 버튼의 "m:ss 뒤", 신선도 막대·"n시간 후 상함"(N49), 점수 %(D-5006), 결과 알림(성공 status·실패 alert, 결과 코드 21개 모두 문구). **넣지 않은 것**: 나누기·합치기·옮기기·끌어 놓기·무게·칸 수(서버 명령 없음), 격자/목록 바꾸기(한 가지 카드 격자로).
- **사이보그 화면**: 만든 사이보그(시안 아님)면 `holdings.list`를 받아 머리 판 인공장기 3·장비 6칸이 누르는 칸이 되고(칸 종류·물건 이름·굴린 스탯·내구도), 인벤토리 판이 보유 물건 판 + 개발 받기 판이 된다. 시안 자료를 켜면 예전처럼 시안 칸·인벤토리(곧 열림). 사이보그 유닛이 아직 세계에 없으면 그 문구.
- **유닛 상세**: 세계 유닛(`w…`)의 "장비" 판이 "장비·지닌 물건" 판(휴먼 칸 6, 같은 카드·창·개발 받기 — 받기는 그 유닛으로).
- **개발 시험 받기(dev·admin)**: 접힌 판을 펴면 `items.list`(아이템 편집기 실효 목록, 켜진 것)를 보유 모양으로 묶어(장비·쓰는 물건·신선도 묶음·원장 물자) 고르고 수량(1~1,000)으로 `dev_grant_item`. 원장 물자는 `not_holdable` 확인용으로 남겼다.
- **서버 조회 칸(더하기만, 선택 칸)**: `HoldingView.equipSlot`·`useCooldown`·`uses`, `UnitEffectView.valueMode`, 응답 `cyborgUnit`·`units`(내 사이보그 + 물건을 든 유닛의 칸 배치). 서비스 `unitLayout`·`useCooldownOf`. 화면은 이 값으로 버튼만 고르고 판정은 명령이 한다.
- **서버 고침**: `HoldingService.list`가 쿨을 효과가 걸린 유닛에서만 찾았다 → 효과 없이 쿨만 남은 유닛의 쿨도 보인다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/holdings/itemCommands.ts`(새)·`.test.ts`(새) | item_equip·unequip·use·dev_grant_item 보내고 item_result 기다리기(끊김 offline·답 없음 timeout), 시험 4개 |
| `apps/game/src/holdings/holdingsModel.ts`(새)·`.test.ts`(새) | 순수 다듬기: 유닛 칸·든 물건·효과·쿨 나누기, 입을 칸 고르기(빈 칸 먼저), 칸의 고를 거리, 거르기, 막대 색 단계, 시계 글자, 시험 7개 |
| `apps/game/src/holdings/holdingsText.ts`(새) | 결과 코드 → 문구 표, 칸·쿨 이름, 효과량(‰ → %)·쓰는 효과 글자 |
| `apps/game/src/holdings/useHoldings.ts`(새) | 목록 받기(유닛 화면 규칙) + 명령·알림·교체 확인·칸 창 상태, 효과·쿨이 돌 때만 1초 시계(서버 시각) |
| `apps/game/src/holdings/HoldingParts.tsx`·`HoldingsPanel.tsx`·`HoldingsDialogs.tsx`·`DevGrant.tsx`·`UnitHoldings.tsx`·`holdings.css`(새) | 카드·막대·효과/쿨·누르는 칸, 판, 칸 고르기·교체 확인 창(`<dialog>`), 개발 받기, 유닛 상세 판, 토큰만 쓴 스타일 |
| `apps/game/src/cyborg/CyborgScreen.tsx` | 만든 사이보그면 보유 물건 칸·판·창, 시안이면 그대로 |
| `apps/game/src/units/UnitDetail.tsx` | 세계 유닛의 장비 판 → 장비·지닌 물건 판 |
| `apps/game/messages/{ko,en}.json` | `holdings_*` 78개(한국어·영어 함께) |
| `packages/shared/src/holdings.ts` | 조회 칸 더함(선택 칸) |
| `apps/server/src/holdings/service.ts`·`reads.ts` | `unitLayout`·`useCooldownOf`, 칸 배치·입는 칸·쿨 종류·쓰는 효과·값 단위 보냄, 쿨 목록 고침 |
| `apps/server/src/holdings/service.test.ts`·`holdings.db.test.ts` | 칸 배치·쿨 종류·쿨만 남은 유닛 시험 2개, DB 시험에 조회 칸 확인 |
| `e2e/inventory.spec.ts`(새) | 흐름·내구도 0·유닛 상세·사진 8조합(11개) |
| `docs/adr/2026-11-03-item-holdings.md` | "바뀜 (화면)" |
| `docs/PLAN.md` | 14장 "보유 물건(화면)" 줄 |

## 검사·시험 (Verified, 개발 컨테이너, main `f2dd7b1` 위)
- 단위 시험: `apps/game/src/holdings` 2파일 11개, `apps/server/src/holdings` 3파일(DB 포함, `TEST_DATABASE_URL`) 통과.
- `TEST_DATABASE_URL=… pnpm check` 통과(시험 408파일 3,384개, DB 시험 포함 — main `de836bb` 합친 뒤, `f2dd7b1`은 PWA 목록만 바뀜), `pnpm check:contrast` 통과(대비 738쌍).
- CI 검사: `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle` 통과. 첫 화면 JS 105,921 B / 상한 131,416 B. 보유 물건 코드는 첫 화면 파일 8개에 없다(빌드 결과에서 `holding`·`item_use` 글자 검색): 사이보그·유닛 화면이 같이 쓰는 지연 공용 조각 `PreviewSwitch-*.js` 33,915 B·gzip 10,351 B와 `.css` 17,827 B·gzip 2,718 B, `CyborgScreen-*.js` 34,555 B, `UnitsScreen-*.js` 27,030 B. 새 지연 화면 조각은 없다(PWA 미리 캐시 목록 그대로). main `378852d` 위에서 잰 첫 화면은 105,577 B(main 기록 105,572 B → +5 B, 공용 조각 나눔이 바뀐 몫).
- 화면 시험 `e2e/inventory.spec.ts` 11개 통과(작업자 하나): 흐름(받기 → 목록 → 카드 장착 → 칸 창 해제 → 칸 창 고르기 → 카드 해제 → 물약 사용·효과·쿨·버튼 남은 시간 → 연고 실패(battle_only) → 원장 물자 not_holdable → 스튜 교체 확인 그만두기·그래도 사용 → 거르기), 내구도 0(응답 고침: 카드·칸 창 장착 막음·"수리 필요"), 유닛 상세(시험 일꾼 6칸·받기·장착), 사진 8조합 모두 넘침·작은 누르는 곳 없음. 같이 돈 `e2e/cyborg.spec.ts`·`units.spec.ts`(플레이어 사이보그 화면의 칸 수 인공장기 3·장비 6, 작은 누르는 곳 없음, 시안 자료 화면 그대로)와 합쳐 41개 통과(3.2분).
- 연고 단계는 전투 밖 회복이 열리면(지속 HP 줄기, 조율자 공지) `battle_only` 대신 `cooldown`(막 쓴 물약과 같은 물약 쿨)이 되므로 둘 다 받는다. 화면은 성공·실패 모두 같은 알림이라 그 줄기가 들어와도 그대로다(지속 0 효과는 "전투 중" 표시 없이 이름만).
- 사진(세션 임시 폴더 `inventory-ui/shots`, 저장소 밖): `inventory-{panel,slots,sheet,confirm}-{390,1440}-{pastel,dark}-{ko,en}.png` 32장 + `inventory-unit-390-pastel-ko.png`. 파스텔·다크 둘에서 눈으로 확인.

## 함께 바꿔야 하는 파일
- 결과 코드(`@terra/protocol` `ITEM_RESULT_CODES`)가 늘면 `holdingsText.ts` `FAILURES` 표(타입이 빠진 코드를 알린다)와 메시지 두 파일.
- 칸 종류(`EQUIP_SLOTS`)가 늘면 `roster/rosterText.ts` `SLOT_LABELS`(보유 물건 칸 이름도 이것을 쓴다).
- 서버가 세계 유닛 종류 → 칸 배치를 바꾸면(`holdings/world.ts`) 유닛 상세의 대체 칸 배치(`RosterUnit.slots`, 휴먼)도 본다 — 물건을 든 유닛은 서버 `units`를 쓴다.

## 건드리지 말 것
- 전투 판정(`packages/sim/src/combat/`) — 스태미나 줄기가 고치는 중. 전투 중 쓰기·탄약은 ADR 6절 다음 줄기.

## 미검증·TODO·알려진 문제
- 장착해도 사이보그 스탯 판·전투 스펙은 그대로다: `cyborg.get`(`realCyborgBody`)이 보유 물건 장비를 읽지 않는다(빈 장비로 셈). 다음 줄기(전투 시작 자료에 입은 물건 넣기와 같이).
- 인공장기 칸도 [장착]으로 바로 넣는다(서버가 칸 종류만 본다). 시술 시설·비용(D-5031)은 시설 줄기.
- 창고(위치 > 0) 물건은 보이지 않는다(사이보그·유닛이 든 것만). 옮기기·버리기·분해·수리·탄약 보충 버튼 없음(서버 명령 없음).
- 실제 휴대폰에서 재지 않았다(헤드리스 Chromium 390·1440만).

## 사용자 결정 대기
- 없음
