# 세력 관리: 세력 정체성·화폐 표시, 운영자 콘솔 세력 관리·화폐 탭

- 일시: 2026-11-09 15:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-09-faction-profiles.md`(새), 가지 `claude/trusting-carson-fr2yv7`

## 한 일
- 사용자 요청 "세력 관리 페이지 추가"와 저장 위치 답("세력 생성시 결정하고 npc나 일부는 프리셋이나 기본값 제공, 관리자가 수정도 가능")을 구현했다.
- 표 `faction_profiles`·`currency_profiles`(마이그레이션 `20261109055107_faction_profiles`), 처음 정하기·읽기·고치기(`apps/server/src/ops/factionProfiles.ts`), 운영 권한 `faction_edit`, tRPC `ops.npcs.updateProfile`·`ops.currencies.*`.
- 팩 국가 프리셋 선택 칸 `shortName`·`color`·`currency.symbol`·`currency.ticker`, 16개 나라 임시 값(core@58).
- 운영자 콘솔: "세력" 탭을 관리 표로(요약 띠·거르기·정렬·CSV), 세력 상세에 정체성 띠·[정체성 고치기], 새 "화폐" 탭(줄에서 고치기), 감사 기록 문구 둘.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/factionProfile.ts`(새), `package.json` | 정체성·화폐 표시 규칙·기본 색 |
| `packages/shared/src/ops.ts` | `faction_edit`, 세력 줄 칸(약어·색·화폐·국고·봉신·불가침·만족도·주거), 화폐 줄 |
| `packages/content/src/schema/economy.ts`, `content/core/nation_presets.json`·`manifest.json` | 프리셋 칸·임시 값 |
| `apps/server/src/npc/nations.ts`·`presets.ts` | 프리셋 타입에 약어·색·화폐 |
| `apps/server/src/db/opsSchema.ts`·`schema.ts`, `drizzle/20261109055107_faction_profiles/`(새) | 표 둘 |
| `apps/server/src/ops/factionProfiles.ts`(새)·`factionProfiles.db.test.ts`(새)·`reads.ts`·`services.ts`, `trpc/ops.ts`, `app.ts`(프리셋 넘기기 한 줄) | 정하기·조회·고치기 |
| `apps/game/src/ops/FactionsTab.tsx`(새)·`CurrenciesTab.tsx`(새)·`FactionProfileEdit.tsx`(새)·`FactionDetail.tsx`·`NpcTabs.tsx`·`OpsConsole.tsx`·`opsUi.tsx`·`auditText.ts`·`ops.css`, `messages/*.json` | 화면 |
| `e2e/ops.spec.ts` | 탭 8개, 세력 정체성 고치기·화폐 약어 겹침 거절·사진, 체크박스 수 15 |

## 함께 바꿔야 하는 파일
- 정체성 규칙을 바꾸면: `@terra/shared/factionProfile`과 DB 검사 조건(`opsSchema.ts` → 새 마이그레이션)을 같이.
- 세력이 따르는 나라 차례를 바꾸면: `npc/currency.ts presetOfFaction`과 `ops/factionProfiles.ts followedPreset`(같은 규칙 두 벌 — DB 행으로 다시 셈).

## 건드리지 말 것
- 이미 올라간 마이그레이션(`ops_grants`·`ops_switches`)은 그대로.

## 검증
- `pnpm check` 통과(시험 3,974 통과 / 274 건너뜀).
- 서버 DB 시험 전체(이 컨테이너 PostgreSQL 16, `pnpm vitest run apps/server`): 186파일 / 1,197개 통과. 새 `factionProfiles.db.test.ts`(정하기·다시 정하지 않음·약어/티커 겹침 거절·콘솔 목록·감사 기록).
- 화면 시험 `e2e/ops.spec.ts` 11개 통과(세력 정체성 고치기 → 표 반영, 화폐 약어 겹침 거절 → 새 약어 저장, 1440 사진 네온·라이트). 사진은 저장소 밖.

## 미검증·TODO·알려진 문제
- 게임 화면(세력 화면·지도·랭킹·경제 화면)은 아직 정체성·화폐 표시 표를 읽지 않는다(프리셋 이름·화폐 코드 그대로). 다음 단계.
- 정체성은 서버가 켤 때가 아니라 운영자 콘솔이 처음 읽을 때 정한다(`app.ts` 979줄로 상한 근처). 세력이 생기는 코드에 붙이는 것은 다음 단계.
- 프리셋 약어·색·기호·티커는 [임시] 값이다(기획 값 없음).

## 사용자 결정 대기
- 없음.
