// 커밋 메시지 규칙 — Conventional Commits. 한국어 제목을 쓰므로 대소문자 규칙은 끈다.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
    "body-max-line-length": [1, "always", 120],
    "footer-max-line-length": [1, "always", 120],
  },
};
