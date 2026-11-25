# 개발자 시안 모음(/dev/mockups) 캐릭터 탭 — 게임형 3D 캐릭터 스튜디오(V2) 구현

- **일시 (KST)**: 2026-11-25 16:38
- **작업 도구**: Antigravity

## 한 일

1. **게임형 3D 캐릭터 빌더·스튜디오 엔진(V2) 구현** (`packages/engine/src/characters/hero/`)
   - 기존 `CharacterLook(v2)` 스키마의 모든 다양성(체형 4·키 90~110%·머리 8·얼굴 8·머리 장식 13·몸통 8·팔 5·다리 5·등 장식 8·덧장식 8·겉 장갑 0~3·5색 × 20색·프리셋 24종)을 100% 호환하면서 5.3등신 계층형 관절 리깅(`pelvis → torso → head`, `shoulder → elbow`, `hip → knee`, 망토·날개·포니테일 피벗)과 PBR 멀티 재질(피부/사이버 쉘·의상·아머·브러시드 메탈·바이저 글래스·네온 발광)로 업그레이드했다.
   - `CharacterStudio`에 프로시저럴 스튜디오 환경 반사(`RoomEnvironment` + `PMREMGenerator`), `ACESFilmicToneMapping`, `PCFSoftShadowMap`, 3점 시네마틱 조명(`스튜디오`·`낮`·`밤`), 홀로그램 턴테이블 받침대, 4종 카메라 포커스(`전신`·`상반신`·`얼굴`·`뒷모습`), 4종 게임 포즈(`대기`·`전투`·`걷기`·`점검`)와 **기존 V1 로우폴리 모델 즉시 비교 토글**을 넣었다.
   - `@terra/engine/characterStudio` 별도 진입점으로 내보내 기존 2차맵·기존 생성 화면·첫 화면 번들 크기에 영향이 없다.
2. **개발자 시안 모음(`/dev/mockups?tab=character`) 캐릭터 탭 구현** (`MockupsGalleryCharacterTab.tsx`, `mockupsCharacter.css`, `MockupsGalleryScreen.tsx`)
   - 데스크톱 2단 스튜디오(좌측 sticky 3D 뷰포트 + 우측 커스터마이징 콘솔) 및 모바일 반응형 레이아웃으로 구성했다.
   - `< ›` 화살표 연타 대신 한눈에 선택하는 칩 그리드, V2 3D 프리셋 24종 썸네일 갤러리, 탭별 카메라 자동 포커스, 부위별 잠금/굴리기, 6종 SF 컬러 테마 프리셋, `CharacterLook` JSON 복사 기능을 넣었다.
3. **단위 시험 추가** (`packages/engine/src/characters/hero/heroRig.test.ts`): 프리셋 24종, 전 부위 ID 조합, 4종 포즈 및 보조 피벗, `dispose` 검증.

## 바꾼 파일과 이유

- `packages/engine/src/characters/hero/heroMaterials.ts`, `heroRig.ts`, `characterStudio.ts`, `studioEntry.ts`, `heroRig.test.ts` — V2 게임형 3D 캐릭터 빌더·스튜디오·단위 시험
- `packages/engine/package.json` — `./characterStudio` 진입점 export 추가
- `apps/game/src/editor/mockups/MockupsGalleryCharacterTab.tsx`, `mockupsCharacter.css` — 캐릭터 탭 테스트 생성 페이지
- `apps/game/src/editor/mockups/MockupsGalleryScreen.tsx` — `캐릭터` 탭 추가 및 지연 로딩 연결
- `apps/game/messages/ko.json`, `apps/game/messages/en.json` — 캐릭터 스튜디오 문구 39쌍 추가
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 추후 V2 테스트 확정 후 기존 캐릭터 생성 화면을 대체할 때 `apps/game/src/start/LooksStep.tsx`, `CharacterPreviewPane.tsx`, `packages/engine/src/characters/characterPreview.ts`를 V2 엔진으로 전환한다.

## 건드리지 말 것

- `packages/engine/src/characters/characterModel.ts`, `characterMeshes.ts` — 2차맵 대량 인스턴싱 렌더링 및 V1 비교 기준선

## 검증

- `pnpm docs:index`, `biome format`, `pnpm --filter @terra/engine typecheck`, `pnpm --filter @terra/game typecheck`, `oxlint --type-aware --deny-warnings`, `check-boundaries.mjs`, `check-i18n.mjs`, `check-contrast.mjs`, `pnpm vitest run packages/engine/src/characters/hero/heroRig.test.ts`, `pnpm --filter @terra/game build`, `check-pwa.mjs`, `check:bundle` 실행 — **Verified**

## 미검증 · TODO

- 실제 브라우저에서 `/dev/mockups?tab=character` 시각 검토 후 기존 생성 화면 대체 여부 결정

## 관련 ADR

- `docs/adr/2026-11-11-character-3d.md`
