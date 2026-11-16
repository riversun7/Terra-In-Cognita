# 영토 판정 3 — 새 도시 자리·시가지·건설 땅도 지도대로, 칸 표 나눠 셈 (기획 답 1922·1923·1927·1930)

- 일시: 2026-11-16 09:10 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-568(답 2026-11-16: 1922·1923·1927 지도 판정, 1925·1928·1930 기술 추천), ADR `docs/adr/2026-11-16-territory-judgement-map.md`·`2026-11-14-second-map-build.md`·`2026-11-07-world-layout.md` "바뀜", 질문 `docs/questions/2026-11-16-territory-2.md`(답 반영)·`docs/questions/2026-11-16-territory-3.md`(새, 1981~1990), 가지 `work/territory-3`(바탕 406f299)

## 한 일
- **1922 새 도시·마을 자리**: 공용 `foundingClaimConflict`(@terra/shared/territory) = 그 점의 1차맵 지도 주인이 같은 편이 아니면 막는다(겹친 곳은 영향력 비율).
  - NPC 마을·가문 마을(`npc/townSites.ts` `ForeignClaim`): 영토 서비스 마지막 배치(`provinceAt`)의 주인(세력 행 ID → 거울 세력 ID, `npc/persist.ts`). 지도를 모르면 옛 영향권 닿기. 런타임 고리는 `territory/npcHooks.ts`(world.ts 1,000줄 상한 때문에 비콘 따라가기와 묶음).
  - 세계 배치 시작 도시(`world/worldLayout.ts` 머리 주석 6): 입력 `territory`(설정 칸 `planet_territory_*`)가 있으면 계획 도시들로 만든 지도(비콘 없음, 원 바탕 = 계획 배후지)로 본다. 폐허 자리는 옛 영향권 띄우기. `worldBoot.ts`·`tierPlan.ts`·`placementService.ts`·`app.ts`가 값을 넘긴다.
- **1923 시가지**: `urbanCityAt` = 영토 원 ÷ 3, 겹치면 영향력 비율이 작은 도시. 개발 영토 화면 점선 원 = 시가지, 범례·안내 문구(ko·en).
- **1927 건설 땅**: `facilities/landRule.ts` — 내 도시 2차맵은 짓는다, 남의 도시 2차맵 `foreign_city`, 그 밖은 짓는 기준 칸의 지도 주인이 남이면 `foreign_territory`(짓기 명령은 `forbidden` 그대로). `facilities.landRule`에 선택 입력 `x`·`y`, 까닭 `foreign_territory`(옛 기기는 `allowed`만 봄). 건축 모드 화면이 누른 자리를 묻고 까닭 문구를 나눈다(ko·en).
- **1930 칸 표**: 판정 질의는 칸 표 없이 — 영토 서비스 `claimsAt`(땅 규칙·이동 위험 구간). 이동 위험의 전쟁 영토 = 지나는 2차맵 가운데 점의 지도 주인. 칸 표(개발 영토 화면만)는 `startTerritoryRaster`(@terra/planet/territory)로 8ms 조각마다 `setImmediate` 양보하며 나눠 셈(같은 결과 — 시험), 응답 `rasterSliceMs`.
- 가문 마을 실패 문구 `fid_city_error_foreign_influence`: "다른 세력의 영토 안입니다"(코드 이름 그대로).
- 질문 문서: territory-2에 답 반영 표, territory-3(1981~1990) 새로.

## 성능 (Verified, vitest Node 24.22.1, 부하 평균 약 3.7, 측정 파일은 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/territory-3/tmpSliceBench.test.ts` — 서버 `cellsOf`와 같은 조각 셈)
| 세계(F9) | 배치 셈 | 칸 표 CPU 합 | 칸 수 | 가장 긴 조각 | 이벤트 루프 지연 최대 | `claimAt` |
|---|---|---|---|---|---|---|
| 국가 16 × 도시 3, 비콘 0 (NAS 규모 — 세력 16·도시 49) | 2.3ms | 102ms | 3,215 | 8.2ms | 9.0ms | 0.7µs |
| 국가 16 × 도시 3, 비콘 144 | 3.8ms | 358ms | 6,729 | 8.4ms | 8.7ms | 1.4µs |
| 국가 16 × 도시 6, 비콘 480 | 37ms | 1,747ms | 9,859 | 12.4ms | 12.5ms | 7.2µs |
| 국가 64 × 도시 4, 비콘 1,024 | 26ms | 3,411ms | 32,709 | 19.9ms | 16.8ms | 5.0µs |
- 목표(NAS 규모에서 메인 스레드를 한 번에 50ms 넘게 잡지 않음): 가장 긴 조각 약 8ms로 맞음. 나누기 전에는 한 번에 102~358ms(같은 측정의 `rasterizeTerritory` 148·358ms).
- 실제 NAS 서버에서는 재지 않았다(Unknown) — 배포 뒤 개발 영토 화면 응답의 `rasterSliceMs`로 본다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/territory.ts`·`territory.test.ts` | `urbanCityAt` 영토 원 ÷ 3, `foundingClaimConflict` 새로, 주석 |
| `packages/shared/src/territoryApi.ts` | `rasterSliceMs`, 주석 |
| `packages/shared/src/facilities.ts` | landRule 까닭 `foreign_territory` |
| `packages/planet/src/territory.ts`·`territory.test.ts` | `startTerritoryRaster`(나눠 셈), 같은 결과 시험 |
| `apps/server/src/territory/service.ts` | 칸 표 나눠 셈, `claimsAt`, `TerritoryPlace` |
| `apps/server/src/territory/npcHooks.ts`(새) | NPC 런타임 ↔ 영토(비콘 따라가기·마을 자리 지도) |
| `apps/server/src/territory/gateway.test.ts`·`territory.db.test.ts` | 가짜 서비스·`claimsAt`·`rasterSliceMs` 시험 |
| `apps/server/src/facilities/landRule.ts`·`landRule.test.ts`·`world.ts`·`service.ts`·`screen.ts`, `trpc/facilities.ts` | 건설 땅 지도 판정, 자리 입력 |
| `apps/server/src/facilities/attack.ts` | 주석(시가지) |
| `apps/server/src/facilities/facilities.db.test.ts` | 도시를 비운 2차맵도 남의 영토면 `foreign_territory` |
| `apps/server/src/facilities/attack.db.test.ts`·`factionIdentity/houseCity.db.test.ts` | 시험 세계 영토 원을 작게(시가지 안·밖, 독립 가문 마을 자리를 한 2차맵에서 보려고) |
| `apps/server/src/npc/townSites.ts`·`townSites.test.ts`·`persist.ts`·`runtime.ts` | 마을 자리 지도 판정 |
| `apps/server/src/world/worldLayout.ts`·`worldLayout.test.ts`·`worldBoot.ts`·`tierPlan.ts`·`placementService.ts`, `app.ts`(991줄), `world.ts`(996줄) | 시작 도시 자리 지도 판정, 값 넘기기 |
| `apps/server/src/worldMap/travelDanger.ts`·`reads.ts` | 이동 위험이 칸 표 대신 `claimsAt` |
| `apps/game/src/map/construction/BuildSheet.tsx`·`buildModel.ts`·`buildModel.test.ts`, `economy/queries.ts` | 누른 자리 땅 묻기, `foreign_territory` 문구 |
| `apps/game/src/editor/territory/TerritoryMap.tsx` | 점선 원 = 시가지 |
| `apps/game/messages/{ko,en}.json` | 새 문구·바뀐 문구 |
| `docs/adr/…`(바뀜 셋), `docs/questions/…` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 영토 모양은 여전히 `packages/shared/src/territoryMap.ts` 한 곳. 시가지 나눗수 `URBAN_RADIUS_DIVISOR`는 서버 판정·개발 화면이 같이 쓴다.
- 땅 규칙 까닭을 더하면 `packages/shared/src/facilities.ts` `FacilityLandRuleResponse`·`landRule.ts`·`buildModel.ts`·`BuildSheet.tsx` 문구.

## 건드리지 말 것
- 이미 선 도시·지은 건물·놓인 비콘은 새 규칙으로 옮기거나 지우지 않는다(판정은 새 행동부터).

## 버전·마이그레이션·리셋
- 프로토콜 그대로(결과 코드 `forbidden`·`foreign_influence` 그대로, landRule은 tRPC). 팩 그대로(core 판 안 올림 — 설정 칸 추가·변경 없음). SIM 판 그대로(`packages/sim`은 바꾸지 않았다 — 영토 판정을 쓰지 않는다).
- 마이그레이션 없음.
- **리셋 필요 없음**: 판정은 저장하지 않고 그때 셈한다. 옛 도시·건물·비콘은 그대로 남고, 켜면 새 행동부터 새 규칙.

## 미검증·TODO·알려진 문제
- 시가지가 넓어져(마을 0.03칸 → 1.33칸 이상) 도시 2차맵의 건물·가까운 비콘은 공성 선포가 생길 때까지 늘 공격받지 않는다(질문 1987).
- 세력 없는 플레이어는 영토 밖에서만 짓는다 — 2026-11-14 사용자 답 "알박기"와 부딪침(질문 1983).
- 마을 자리 지도는 최대 30초 묵은 배치(질문 1986). 세계 배치 지도에는 비콘이 없다(질문 1985).
- 세계 배치에 지도 판정이 들어가 새 세계·모자란 시작 도시의 자리가 옛 계획과 달라질 수 있다(Assumed: 피할 도시 둘레가 넓어짐). NAS 세계 배치 결과(모자란 도시 수 `short`)는 재지 않았다.

## 사용자 결정 대기
- 질문 1981~1990.

## 확인
- Verified 고친 꾸러미 시험: shared `territory.test.ts` 11, planet `territory.test.ts` 6(나눠 셈 = 한 번에 셈), 서버 `landRule`·`townSites`·`travelDanger`·`gateway`·`worldLayout` 단위, 게임 `buildModel.test.ts` 3.
- Verified 서버 DB 시험(`TEST_DATABASE_URL`) 54파일 302개 중 처음 4개 실패 → 고침: 도시를 비운 2차맵도 남의 영토(`facilities.db`), 시가지가 넓어져 시험 2차맵 전체가 safe_zone(`attack.db` — 시험 영토 원을 작게), 독립 가문 마을 자리 없음(`houseCity.db` — 같은 방법). 고친 뒤 그 파일들과 `territory.db`(claimsAt·rasterSliceMs) 통과.
- Verified 전체 `pnpm check`(DB 포함): 시험 파일 744·시험 5,602개 통과(첫 번째 실행은 새 시험의 타입 오류 하나로 typecheck에서 멈춤 → 고친 뒤 다시 돌려 통과). 파일 크기 경고: `apps/server/src/territory/service.ts` 736줄(600 초과 경고, 1,000 아래).
- Verified 화면 시험 `pnpm e2e e2e/territory.spec.ts e2e/build-mode.spec.ts`: 11개 통과(빌드 포함 4.6분, 부하 큼).
- Verified `pnpm build`(e2e 준비)·`pnpm check:bundle`: 첫 화면 JS 110,078 B / 상한 131,416 B.
- 팩을 바꾸지 않아 `pnpm check:content` 호환 검사는 따로 돌리지 않았다(`pnpm check`의 `--no-compat` 검증 통과, core@113).
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/territory-3-shots/` — 개발 영토 화면 `territory-{neon,light}-ko-{390,1440}`(점선 = 시가지)·`territory-tables-*`, 건축 모드 `build-{list,place}-390-{pastel,dark}`.
