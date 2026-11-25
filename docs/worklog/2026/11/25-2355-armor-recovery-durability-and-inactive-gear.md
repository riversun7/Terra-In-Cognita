# 기본 아머 재생 0 · 전투 후 아머 회복 방어구 내구도 차감 · 내구도 0 비활성 표시

- 일시: 2026-11-25 23:55 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-10-31-combat-core.md`, `docs/adr/2026-11-03-item-holdings.md`

## 한 일

- 기본 아머 자동 회복(`n54_armor_regen`)을 `100‰ → 0`으로 변경하고, 특수 방어구의 `equip.combat.armorRegen` 옵션을 스키마·판정·생명 수치 계산에 연결했다.
- 전투 종료 후 승·패·퇴각과 무관하게 잃은 아머 HP를 회복시키며 `회복 아머 HP ÷ n54_armor_restore_per_dur(기본 10)` 반올림(`1~4 → 0`, `5~14 → 1` …)만큼 착용 중인 활성 방어구 내구도를 무작위 1씩 차감하는 `planArmorRestoreWear` 및 서버 `applyArmorRecovery`를 구현했다. 활성 방어구(내구도 > 0)가 없으면 아머가 회복되지 않는다. 기존 전투 확률 닳기는 별도로 유지했다.
- 내구도 0 장비의 강제 탈착(`slot = null`)을 제거해 장착 칸에 남긴 채 비활성(탈착과 동일 효과)으로 처리하고, 슬롯·인벤토리·사이보그 상세·홈 카드에 `비활성` 뱃지와 경고 알림 인디케이터를 추가했다.

## 바꾼 파일과 이유

- `packages/content/src/schema/combat.ts`: 장비 전투 옵션에 `armorRegen` 추가
- `content/core/tuning.json`, `content/core/manifest.json`: `n54_armor_regen` 기본값 `0`, 신규 설정 칸 `n54_armor_restore_per_dur`(기본 `10`) 추가, 팩 판 `156 → 157`
- `packages/sim/src/combat/coefficients.ts`, `equipment.ts`, `packCatalog.ts`, `unitSpec.ts`, `combatLife.test.ts`: 기본 `armorRegenPm: 0` 및 장비 옵션 `armorRegen` 합산
- `packages/sim/src/society/coefficients.ts`, `tuningVitals.ts`, `items/holding.ts`, `items/holdingExports.ts`, `items/holding.test.ts`: `planArmorRestoreWear` 순수 판정 함수·설정 칸·단위 시험 추가
- `apps/server/src/tuning/scope.ts`, `roster/unitBody.ts`, `battleLab/build.ts`, `vitals/config.ts`: `armorRegen` 배선 및 `n54_armor_restore_per_dur` 범위 등록
- `apps/server/src/holdings/serviceTypes.ts`, `service.ts`, `service.test.ts`, `world/battleApply.ts`: `applyArmorRecovery` 연결, 내구도 0 강제 탈착 폐지, 전투 종료 시 기존 확률 닳기와 별도로 아머 회복 반영
- `apps/game/messages/ko.json`, `en.json`, `src/holdings/HoldingParts.tsx`, `UnitHoldings.tsx`, `holdings.css`, `src/cyborg/CyborgSheet.tsx`, `src/home/cards/CyborgCard.tsx`: 내구도 0 장비 `비활성` 뱃지·취소선·경고 알림 배너·홈 상태 경고 칩 추가
- `docs/adr/2026-10-31-combat-core.md`: 규칙 변경 바뀜 절 추가

## 함께 바꿔야 하는 파일

- `docs/WORKLOG.md` (`pnpm docs:index`)
- 추후 기획 문서(`docs/design/`) 동기화 시 D-514 아머 자동 회복 변경 사항 반영 필요(미러 문서라 기술 세션에서 직접 편집하지 않음).

## 건드리지 말 것

- `apps/server/src/holdings/service.ts`에서 내구도 0 장비의 `slot`을 다시 `null`로 지우지 않는다(장착 칸 유지 + 비활성).
- `docs/design/` 원본 미러 파일은 직접 고치지 않는다.

## 미검증 · TODO

- `apps/server` DB 통합 테스트 중 로컬 PostgreSQL이 필요한 `*.db.test.ts`는 DB 미기동 환경에서 제외하고 단위 시험(`@terra/content`, `@terra/sim`, `@terra/server` 비-DB 시험, `@terra/game`) + `check-content --no-compat` + `oxlint --type-aware` + `check-contrast` + `vite build` + `check-pwa` + `check:bundle`로 검증함.
