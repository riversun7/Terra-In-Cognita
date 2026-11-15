# 경로 시야선 다듬기·텔레포트·정부 판·돈 표시·확대 4단계 유닛

- 일시: 2026-11-15 19:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-15-path-smoothing.md`(새로 씀), `2026-10-28-s1-second-map.md`(상태 줄에 일부 대체 표시), `2026-11-15-unloaded-second-maps.md`(건너뛰는 중), `2026-11-07-play-flow.md`(정부 판)

## 한 일

사용자 지적(2026-11-15, NAS 휴대폰 사진과 함께). 원문:

- "이곳으로 이동 바로옆에 텔레포트 버튼옮겨라. 그리고 지금은 이동불가라는 메세지가 왜 뜨냐?"
- "유닛이 이동시 직선거리를 두고도 엉망으로 이동하고 이동하는 선이 다 끊겨있고 엉망이다 수정하라"
- "시장 스탯은 보여줄 필요가 없다. 정보창 ui가 매우 허접하다 … 화폐는 돈처럼 … 유저이름 소유자나 시장같은것도 다르게 … 칸이나 정보구간 나누는것도"
- "확대 4단계도 유닛과 이름태그가 보이게 하라"
- "시험 화폐라는거 없애고 … 골드코인같은 아이콘을 화폐앞에 … 국고의 채권이나 주식도 제대로 보여라"
- "유닛이 건물에 들어갔다는데 달라진 기능도 없고 유닛은 밖에 있다" — 원인만 찾았다(아래 "사용자 결정 대기").

### 1. 1차맵 텔레포트

- **[텔레포트] 자리**: [이곳으로 이동] 바로 옆(누른 칸 안내 판)으로 옮겼다. 운영자 모드에서만 보인다. 1차맵 명령 판에서는 뺐다. 결과 한 줄은 그 칸을 누른 동안만 보인다.
- **"지금은 보낼 수 없습니다"의 원인**(Verified: 코드·시험 재현):
  - 내 사이보그가 띄우지 않은 2차맵을 건너뛰는 중이면 서버 `ownUnit`이 `in_transit`을 낸다. 이것을 `busy`로 바꿔 돌려주고, 기기는 "잠시 뒤 다시"로 보인다.
  - 일반 이동은 그대로 나타난 뒤에만 보낸다(ADR `2026-11-15-unloaded-second-maps.md`의 결정).
  - 운영자 텔레포트는 건너뛰는 중에도 받는다(`teleport.ts`): 길의 숨은 줄(`hidden.row`)을 꺼내 목적 칸에 놓고 가던 길을 버린다. 못 놓으면 사라진 변 자리에 좌표 유닛으로 세운다.

### 2. 2차맵 경로

- **시야선 다듬기**(`packages/sim/src/path/smooth.ts`, `planRoute`): A* 8방향 칸 경로를 임의 각도 직선으로 줄인다. 쓸고 가는 칸이 모두 설 수 있고, 직선 비용 추정이 A* 부분 비용을 넘지 않을 때만 줄인다. `SIM_VERSION` 47.
- **경로 표시**: 점선을 실선으로 바꿨다(`routeView.ts`).

### 3. 정부 판(대화상자)

- 시장 1차 스탯을 뺐다.
- 사실 줄을 두 구간으로 나눴다.
  - [다스리는 사람]: 나라·지도자·시장. 역할 색 띠·이름표가 있고(지도자 금색 왕관, 시장 파랑), 이름은 표시 글꼴로 크게 쓴다.
  - [도시 현황]: 큰 숫자 칸 셋.
- 하루 값에 색 막대를 더했다.

### 4. 돈 표시

- 공용 `ui/Money.tsx`: 동전 아이콘 + 금색 굵은 고정폭 숫자 + 작은 화폐 이름.
- 바꾼 곳:
  - 인벤토리 지갑·추정 가치.
  - 경제 한눈에·홈 [자산] 카드.
  - 세력 화면의 국고·내 잔고: `cur:코드` → 팩 화폐 이름, 큰 금액 차례.
  - 구인 카드 값.
- "시험 화폐" 이름을 "기준 통화"(en "Base currency")로 바꿨다. 서버 기준 통화(`s3_test_credit`)의 화면 이름이다. 개발 시험 단추 문구도 같이 바꿨다.

### 5. 확대 4단계

`UNIT_DETAIL_STAGE = 4`부터는 화면 크기와 상관없이 유닛을 모델로 그리고 다른 유닛 이름표도 띄운다(`secondMapEngine.ts` `chooseUnitMode`, `unitNames.ts`). 엔진 층 보기(`EngineLayerView`)에 `zoomStage`를 더했다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/teleport.ts`(+ `service.test.ts` 시험 하나) | 건너뛰는 중 유닛 텔레포트 |
| `apps/game/src/map/PlanetReadout.tsx`·`PlanetMapScreen.tsx`·`PlanetCommandPanel.tsx` | 텔레포트 단추 옮김 |
| `packages/sim/src/path/smooth.ts`(새, + 시험)·`waypoints.ts`(+ 시험 하나 고침)·`version.ts` | 시야선 다듬기, `SIM_VERSION` 47 |
| `packages/engine/src/units/routeView.ts` | 실선 경로 |
| `apps/game/src/government/`(`PersonFact.tsx` 새, `MayorFact.tsx`·`GovernmentDialog.tsx`·`GovernmentDay.tsx`·`government.css`)·`e2e/government.spec.ts` | 정부 판 다시 꾸밈, 시장 스탯 0개로 시험 고침 |
| `apps/game/src/ui/Money.tsx`·`money.css`(새)·`inventory/PlaceCard.tsx`·`InventoryScreen.tsx`·`inventoryValue.ts`(`valueParts`)·`economy/OverviewView.tsx`·`home/cards/AssetsCard.tsx`·`faction/FactionSide.tsx`·`economy/RecruitPanel.tsx`·`recruit.css` | 돈 표시 |
| `apps/game/messages/{ko,en}.json` | 기준 통화 이름, 정부 판 제목(ko·en 함께) |
| `packages/engine/src/camera/secondMapZoom.ts`·`render/engineLayers.ts`·`secondMapEngine.ts`·`index.ts`·`buildings/buildPreview.test.ts`·`apps/game/src/map/unitNames.ts` | 확대 4단계 모델·이름표 |
| `docs/adr/2026-11-15-path-smoothing.md`(새)·`2026-10-28-s1-second-map.md`(상태 줄) | 결정 기록 |

## 함께 바꿔야 하는 파일

- 경로 규칙(`astar.ts` 비용·모서리 규칙)을 바꾸면 `smooth.ts`의 통과 폭·비용 조건도 같이 본다.
- `EngineLayerView`에 칸을 더하면 시험 가짜 보기(`buildPreview.test.ts` 등)도 고친다.
- 새 화면에서 돈을 보이면 `ui/Money.tsx`를 쓴다.

## 건드리지 말 것

- `secondMapEngine.ts`는 999줄이다(1,000줄 상한). 더할 것은 층 모듈이나 `camera/`·`render/`로 뺀다.

## 미검증·TODO·알려진 문제

- 확대 4단계에서 모델은 휴대폰 세로 기준 사람 키 약 9px다(계산 — Assumed). 작아서 알아보기 어려우면 최소 화면 크기를 정해야 한다(다음 결정).
- 다듬은 경로는 욕심 탐색이라 가장 짧은 임의 각도 경로는 아니다. 섞인 땅에서는 가장 느린 칸 배율로 걷는다(ADR).
- "건물 안에 있습니다": 서버는 들어간 유닛을 기록만 하고 유닛 모델은 그 자리에 둔다. 무엇을 할 수 있게 할지는 정하지 않았다.
- 휴대폰에서 보지 않았다(미검증).

## 사용자 결정 대기

- 건물에 들어간 유닛: 화면에서 숨길지, 안에서 무엇을 할 수 있게 할지(건물 종류별 기능).

## 검사
- 단위 시험(Verified):
  - sim 904개(시야선 다듬기 새 시험 6개, 옛 꺾임 시험 하나를 곧은 선으로 고침).
  - 서버 전체 DB 포함 250개 파일·1,593개(건너뛰는 중 텔레포트 시험 포함).
  - 게임·엔진 1,832개.
  - 타입 검사·oxlint·`check:contrast` 통과.
- 실제 생성 2차맵 진단(임시 스크립트, 커밋 안 함):
  - 경로 길이 ÷ 곧은 거리 중앙값 1.065 → 1.000, 90% 1.082 → 1.011~1.059.
  - 긴 경로 한 개 p50 0.20 → 0.37ms, p95 1.37 → 1.69ms.
- 화면 시험(Playwright, 헤드리스, Verified):
  - `government.spec.ts` 9개, `faction.spec.ts` 28개, `inventory.spec.ts` 5개, `character-3d.spec.ts` 3개(측정 2개 건너뜀) 통과. 4단계 모델 확인과 사진을 더했다.
  - 처음엔 세력 화면 "긴 이름·큰 수(390px)"가 실패했다. 24자리 금액이 줄을 바꾸지 않아 옆 판이 탭을 가렸다. 돈 표시가 아주 큰 수·긴 이름에서 줄을 바꾸게 고친 뒤 통과했다.
- 사진(390, 눈으로 봄): 정부 대화상자 다크·구인 카드 파스텔, 인벤토리 파스텔, 세력 1440 다크(국고 = 동전 + 화폐 이름), 2차맵 4단계 파스텔(다른 유닛 모델·이름표).
- 합치기 전(Verified): `pnpm check` 통과(시험 5,137개 통과·351개 건너뜀 — DB 시험은 위에서 따로 통과), `pnpm build`·`check-pwa`(화면 주소 63개) 통과, `check:bundle` 첫 화면 JS 109,883B / 상한 131,416B.
