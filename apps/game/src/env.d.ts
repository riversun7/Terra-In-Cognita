// 빌드 시 vite.config.ts의 define으로 주입되는 값
declare const __APP_BUILD__: string;
/** CI 실행 번호(차례로 늘어난다). 개발 실행·손으로 만든 이미지는 빈 글 */
declare const __APP_BUILD_NUMBER__: string;
/** 빌드 시각 ISO(UTC, vite.config.ts buildStamp). 개발 서버는 빈 글 */
declare const __APP_BUILD_TIME__: string;
/** 빌드 커밋 앞 7자(vite.config.ts buildStamp). 모르면 빈 글 */
declare const __APP_BUILD_COMMIT__: string;
