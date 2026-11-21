# 건물 티어별 재료 2의 제곱수 밸런스 및 유닛 공통 경험치 테이블·편집기

- 상태: 확정
- 날짜: 2026-11-20
- 관련: docs/PLAN.md 7장, docs/adr/2026-11-02-building-editor.md, docs/adr/2026-11-01-skill-editor.md

## 배경
1. `content/core/facilities.json`의 기존 건설 재료는 시설마다 `mulPm`(800·1000·1200·3000)이 섞여 있어 창고(10t, Lv1 28개)가 중앙창고(100t, Lv1 23개)보다 비싸거나 주방(Lv1 36개)이 제련소·공방·병원보다 비싼 티어 역전이 있었다(Verified: `content/core/facilities.json` 대조).
2. 사이보그·휴먼·크리쳐가 공통으로 쓰는 경험치 테이블(기획 48 §2.4 · 49 N8)이 아직 콘텐츠 팩에 없었고, `apps/server/src/roster/cyborgBody.ts`에 `[임시] floor(40 × Lv^1.9)` 식이 박혀 있었다(Verified: `cyborgBody.ts` 확인). 수명(T4: 2~3개월, 60~90일) 안에서 채집·NPC 활동만으로 1~2개월 내 Lv 50에 도달하고, Lv 50~60은 Lv 1~50 누적에 맞먹는 경험치로 난이도를 높이는 기준표와 개발자 시각화 편집기가 필요했다.

## 선택지
1. **건물 건설 재료**:
   - (A) 기존 레벨 제곱(`L²`: 1·4·9·16·25배) 공식을 유지하고, 모든 시설의 `mulPm`을 `1000`으로 통일한 뒤 티어별 기본 재료 합계를 2의 제곱수(`T0=2`, `T1=4`, `T2=8`, `T3=16`, `T4=32`, `T5=64`)로 맞춘다.
   - (B) 레벨 증가 공식 자체를 지수 곡선으로 바꾼다.
2. **유닛 공통 경험치 테이블 및 편집기**:
   - (A) 새 콘텐츠 분류 `exp_table`(`content/core/exp_table.json`)을 추가하고, 기존 `content_overrides` 덮어쓰기 층과 전용 개발자 화면 `/dev/exp-table`(곡선 생성기 + 수명 대비 도달 기간·누적·구간 막대 SVG 시각화 3종 + 레벨별 편집 표)을 둔다.
   - (B) 기존 `/dev/tuning`에 수치 칸 몇 개만 추가하고 서버에서 거듭제곱 식으로 계산한다.

## 결정
1. 건물 재료는 선택지 **1-A**를 채택한다(사용자 확인 2026-11-20 "기존의 레벨 제곱이 좋겠다"). 30개 시설 모두 `mulPm: 1000`으로 통일하고, T0(2) → T1(4) → T2(8) → T3(16) → T4(32) → T5(64)의 2의 제곱수 기준으로 기본 재료 합을 재배치하며 상위 레벨(제련소·T4~T5)에 철 주괴(`iron_ingot`) 단계를 둔다.
2. 경험치 테이블은 선택지 **2-A**를 채택한다(사용자 확인 2026-11-20, 전용 화면 `/dev/exp-table`).
   - 팩 분류 `exp_table`(`content/core/exp_table.json`)은 레벨 `L → L+1` 구간 필요 경험치 정수(`lv_01`..`lv_59`, Lv 1 → Lv 60)를 담는다.
   - 기본값은 **Lv 1 → Lv 50 누적 1,000,000 XP**(채집·NPC 기준 1,500 XP/h × 15h/일 = 22,500 XP/일일 때 약 44.4일, 1~2개월 목표 중앙), **Lv 50 → Lv 60 구간 합 1,000,000 XP**(1:1 비율, Lv 49→50 57,473 XP에서 Lv 50→51 61,093 XP로 매끄럽게 이어져 Lv 59→60 148,401 XP), **Lv 1 → Lv 60 총 누적 2,000,000 XP**로 둔다.
   - DB 마이그레이션(`content_overrides_exp_table`)으로 `content_overrides_category`·`content_retired_ids_category` CHECK 제약에 `'exp_table'`을 추가한다(넓히기만 하므로 직전 판 앱은 그대로 돈다).
   - 서버 `RosterCatalog`와 `cyborgBody.ts`의 `levelSpan`은 실효 `exp_table`을 읽는다.
   - 개발자 화면 `/dev/exp-table`은 새 런타임 의존성 없이 순수 SVG 차트 3종과 곡선 생성기·활동 속도 시뮬레이터·즉시 적용(`expTable.*` tRPC)·내보내기(`tuning.export`)를 제공한다.

## 이유
- 2의 제곱수 티어 기준(`2 / 4 / 8 / 16 / 32 / 64`)과 `mulPm = 1000` 통일로 건물 편집기에서 한눈에 티어 격차를 읽을 수 있고, 기존 `L²` 레벨 공식을 그대로 써서 `packages/shared/src/facilityBuild.ts`와 기존 경제 시뮬레이터 계약을 깨뜨리지 않는다(Verified).
- 경험치 테이블을 정수 조회표(`exp_table.json`)로 두면 판정·서버에서 초월함수(`Math.pow`, `**`) 없이 엔진·플랫폼과 무관하게 결정적으로 계산할 수 있고(기획 48 §2.4 · 49 N8, Verified), 기존 `content_overrides`·`tuning.export`·`pnpm tuning:apply` 파이프라인을 그대로 재사용한다.
- 차트 라이브러리를 추가하지 않고 순수 SVG + CSS 토큰(`tokens.css`)으로 구현해 번들 크기와 대비 검사(`check-contrast.mjs`)를 깔끔하게 지킨다.

## 결과
- 모든 30개 시설의 티어 역전이 해소되었고, 초기 물자(`pine_log 20`, `stone 10`)로 초반 필수 시설을 막힘없이 지을 수 있다.
- 개발자가 `/dev/exp-table`에서 수명(T4: 60~90일)과 활동 속도(채집·NPC·전투·훈련) 대비 레벨 도달 기간을 시각적으로 보면서 표를 즉시 조정·적용하고 팩 차이로 내보낼 수 있다.
- 향후 휴먼·크리쳐 레벨업 런타임이 붙을 때도 `@terra/shared/expTable`(`expSpanAt`, `cumulativeExpAt`, `levelFromTotalExp`, `applyExpGain`)과 `contentEdit.effective().expTable`을 그대로 공유한다.
