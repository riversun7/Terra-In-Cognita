// 셰이더 측정 화면(/dev/gpu-bench)의 지연 로딩 진입 — shell/routeViews.tsx가 import()한다.
// 조각 이름은 진입 파일 이름을 따른다(ADR 2026-10-29-planet-editor-stage1 1절 "진입 파일 이름 앞머리를 지킨다").
// 이 파일 이름이 gpuBench로 시작해서 화면 조각(GpuBenchPage.tsx와 그 CSS·문구)이 서비스 워커 미리 캐시에서 빠진다
// (scripts/pwa-build.mjs DEV_ONLY_CHUNK, apps/game/vite.config.ts workbox.globIgnores).
// 화면 파일 GpuBenchPage.tsx를 바로 import()하면 조각이 GpuBenchPage-*.js(대문자 G)가 되어 모든 플레이어가 설치 때 받는다.
export { default } from "../GpuBenchPage.tsx";
