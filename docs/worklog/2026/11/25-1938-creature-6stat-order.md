# 크리쳐 편집기 6스탯 순서를 공식 화면 순서(STR·VIT·INT·WIS·DEX·AGI)로 수정

- **일시 (KST)**: 2026-11-25 19:38
- **작업 도구**: Antigravity

## 한 일

- `packages/shared/src/creatureEditor.ts`의 `CREATURE_PRIMARY_CODES`를 판정 내부 순서(`STR·DEX·AGI·VIT·INT·WIS`)에서 공식 화면 6스탯 순서(`STR·VIT·INT·WIS·DEX·AGI`, `roster.ts PRIMARY_STATS`)로 바로잡았다.
- 가중치 표(`TENDENCY_WEIGHTS`, `SIZE_MODIFIERS`)를 인덱스 기반 튜플에서 스탯 키 기반 `Record<CreaturePrimaryCode, number>`로 바꿔 순서 변경 시에도 자동 배분·랜덤 분포 계산이 정확히 유지되도록 했다.
- 도감 표·6스탯 분포 막대·스탯 편집 탭·요약 탭·전투 탭 전체가 `CREATURE_PRIMARY_CODES`를 공유하므로 일괄 반영된다.

## 바꾼 파일과 이유

- `packages/shared/src/creatureEditor.ts` — `CREATURE_PRIMARY_CODES`를 `["str", "vit", "int", "wis", "dex", "agi"]`로 변경, 가중치 표를 키 기반 객체로 전환
- `packages/shared/src/creatureEditor.test.ts` — 6스탯 공식 순서 단언 및 동점 기대값 갱신
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 없음

## 건드리지 말 것

- `packages/shared/src/roster.ts`의 `RULE_STAT_ORDER` (서버 판정·가중치 인덱스용)

## 검증

- `pnpm docs:index`, `biome format`, `pnpm --filter @terra/shared typecheck`, `pnpm --filter @terra/game typecheck`, `pnpm vitest run packages/shared/src/creatureEditor.test.ts apps/game/src/editor/creatures/creatureModel.test.ts`, `oxlint --type-aware --deny-warnings`, `pnpm --filter @terra/game build` 실행 — **Verified**

## 미검증 · TODO

- 없음

## 관련 ADR

- `docs/adr/2026-11-25-creature-codex-groups.md`
