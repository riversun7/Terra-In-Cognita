# 인벤토리 화면·2차맵 가방·채집 진행바·휘두르기 자세

- 일시: 2026-11-14 18:25 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-14-inventory-screen.md`(새로 씀), `2026-10-29-app-shell.md`(상태 줄에 일부 대체 표시), `2026-11-07-gather-objects.md`, `2026-11-03-item-holdings.md`

## 한 일

사용자 요청(2026-11-14, NAS 사진과 함께):

- "채집시 진행바 ui표시"
- "채집 모션추가"
- "인벤토리 시스템 추가. 하단 메뉴에도 유닛이 보유한 아이템 리스트 볼수있는 버튼. 첫 페이지에도 통합으로 유닛별, 창고별, 건물별, 전체적으로 보유한 아이템을 볼수있게해라"

사용자 답: 새 화면으로 만들고 옛 창고 칸은 이전 후 제거, 경제 화면에는 자산 가치 합계를 보인다. 아래 버튼은 고른 유닛의 물건을 보인다. 범위는 보기 + 옮기기·장착.

- **채집 진행바**
  - 서버 채집 줄 보기(`GatherLoopView`)에 `phaseAt`(지금 단계 시작 시각)을 더했다.
  - 화면은 캐는 중이면 [시작, 끝] 막대를 그린다. 머리 위 이름표 아래와 아래 판 채집 줄([이번 캐기]·[화물 kg/상한])에 있다.
  - 막대는 CSS 움직임이다(길이 = 전체 시간, 음수 지연 = 지난 시간). 엔진 프레임을 깨우지 않는다.
- **휘두르기 자세**
  - 캐릭터 자세에 `chop`(일하는 팔)을 더했다. 1.1초에 한 번, 70% 들고 30% 내려친다.
  - 엔진 API `setWorkingUnits`를 더했다. 채집 덧그림이 캐는 중인 내 유닛을 넘긴다.
  - 서 있고 모델로 그리는 유닛만 이 자세이고, 그동안 엔진은 계속 그린다.
- **인벤토리 화면** `/inventory`: 전체·유닛별·창고별·건물별.
  - 전체: 지갑, 한눈에(종류·자리·추정 가치), 합계.
  - 유닛별: 펼친 유닛 하나의 화물과 장비 판(장착·해제·사용).
  - 창고별: 도시 창고 + 내 창고 시설(넣기·꺼내기 폼), 자리 없는 물건.
  - 건물별: 그 밖의 건물 창고.
- **옛 경제 [창고] 칸 제거**
  - 화면 파일을 지우고 칸 띠에서 뺐다.
  - `/economy/warehouse`는 인벤토리 [창고별]로 주소를 바꾼다.
  - 경제 한눈에의 [창고] 카드는 [자산] 카드(추정 가치·자리·종류 → 인벤토리)로 바꿨다.
- **2차맵 아래 탭 [가방]**: 고른 유닛의 화물·장비 판, [인벤토리에서 보기].
- **홈 [자산] 카드**: 경제 원장 잔고로 추정 가치·종류를 보이고 [인벤토리 열기]가 있다.
- 서버·프로토콜·DB는 `GatherLoopView.phaseAt`(선택 칸, tRPC 조회 모양) 하나만 바꿨다. WebSocket 프로토콜 판·마이그레이션은 없다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/shared/src/gather.ts`, `apps/server/src/gather/service.ts`(+ `gather.db.test.ts`) | `phaseAt`(단계 시작 시각) — 캐기·걷기 단계를 시작할 때 적는다 |
| `apps/game/src/map/gather/gatherProgress.ts`(+ 시험)·`GatherMeters.tsx`·`GatherPanel.tsx`·`gatherOverlay.ts`·`gather.css` | 진행바 계산·판 막대·머리 위 막대, 캐는 중 유닛을 엔진에 넘김 |
| `packages/engine/src/characters/characterCompile.ts`·`characterLayer.ts`·`workingUnits.ts`(새, + 시험)·`characterPreview.ts`·`unitBodies.test.ts` | 휘두르기 자세(`chop`, `chopShape`), 일하는 유닛 칸 표시 |
| `packages/engine/src/secondMapEngine.ts`·`engineTypes.ts`·`engineParts.ts` | `setWorkingUnits` API, 일하는 유닛이 그려지는 동안 계속 그림 |
| `apps/game/src/inventory/`(새: `InventoryScreen.tsx`·`UnitsTab.tsx`·`PlaceCard.tsx`·`inventoryModel.ts`(+ 시험)·`inventoryValue.ts`·`inventory.css`) | 인벤토리 화면 |
| `apps/game/src/economy/WarehouseView.tsx`(지움)·`EconomyScreen.tsx`·`OverviewView.tsx` | 창고 칸 제거·옛 주소 바꾸기, [자산] 카드 |
| `packages/shared/src/routes.ts`(+ `routes.test.ts`)·`apps/game/src/shell/routeViews.tsx`·`sections/ComingSoon.tsx` | `inventory` 주소 |
| `apps/game/src/map/BagSheet.tsx`(새)·`bag.css`(새)·`MapBottomNav.tsx`·`useBottomSheet.ts`·`anchorUnit.ts`(+ 시험)·`SecondaryMapScreen.tsx` | [가방] 탭·판 |
| `apps/game/src/home/cards/AssetsCard.tsx`(새)·`registry.tsx`·`ServerCard.tsx` | 홈 자산 카드 |
| `apps/game/messages/{ko,en}.json` | 화면 문구(ko·en 함께) |
| `e2e/inventory.spec.ts`(새)·`gather.spec.ts`·`map-hud.spec.ts`·`economy.spec.ts`·`helpers/mapHud.ts` | 인벤토리·가방·홈 카드 시험, 채집 진행바 확인, 아래 탭 5개, 창고 주소 바꿈 |
| `docs/adr/2026-11-14-inventory-screen.md`(새)·`2026-10-29-app-shell.md`(상태 줄) | 결정 기록 |

## 함께 바꿔야 하는 파일

- 원장 자리 코드(`@terra/shared/goodsPlaces`)나 `economy.holdings` 자리 모양을 바꾸면 `inventory/inventoryModel.ts`(자리 나누기)를 같이 본다.
- `CharacterPose`에 칸을 더하면 자세를 만드는 곳(`characterLayer.ts`·`characterPreview.ts`·시험)을 같이 바꾼다.
- 아래 판 종류(`BottomSheet`)를 더하면 `useBottomSheet.ts`의 모든 여는 함수가 다른 판을 닫는지 본다.

## 건드리지 말 것

- `economy_warehouse` 주소 줄은 옛 링크·책갈피용으로 남겨 둔다(인벤토리로 바꿈). 지우면 옛 주소가 "없는 화면"이 된다.

## 미검증·TODO·알려진 문제

- 추정 가치는 [임시] 규칙이다. 기준 도시 마지막 체결가, 없으면 시작 시세를 쓰고, 화폐마다 따로 더한다. 기획 가치 규칙이 정해지면 바꾼다.
- 휘두르기 자세는 헤드리스 시험에서 사진으로 보지 않았다(움직임이라 사진 한 장으로 확인하기 어렵다). 단위 시험(자세 행렬·모양·칸 표시)만 통과했다. 휴대폰에서 보지 않았다(미검증).
- 다른 플레이어 유닛의 채집 자세는 보이지 않는다(채집 줄은 자기 것만 받는다).
- 앱 메뉴(사이드·하단 탭)에 인벤토리 항목은 없다. 메뉴 항목은 서버 설정 검사와 묶여 있어 사용자 결정이 필요하다.
- `packages/engine/src/secondMapEngine.ts` 998줄(1,000줄 CI 상한 직전), `apps/game/src/map/SecondaryMapScreen.tsx` 787줄(600줄 경고). 다음 기능 전에 나눈다.

## 사용자 결정 대기

- 앱 메뉴에 인벤토리를 넣을지.
- 추정 가치 규칙(기획).

## 검사
