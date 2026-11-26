# 셀케어와 공통으로 사용하는 글꼴

- 제목: Gowun Batang, 700
- 본문: IBM Plex Sans KR, 400 / 500 / 600
- Google Fonts 공식 배포본을 WOFF 1.0으로 무손실 압축했다. 글리프·이름은 변경하지 않았다.
- 각 글꼴의 SIL Open Font License를 이 폴더에 함께 보관한다.
- 새 TTF 원본은 Google Fonts에서 받고 `node scripts/compress-fonts.mjs <원본.ttf> ...`로 변환할 수 있다. 최종 WOFF만 배포한다.

공식 출처:

- https://github.com/google/fonts/tree/main/ofl/gowunbatang
- https://github.com/google/fonts/tree/main/ofl/ibmplexsanskr

## 2026-11 개편 이후 사용하는 글꼴

- 본문: Pretendard 400 / 500 / 600 / 700 — `pretendard/` (KS X 1001 한글 2,350자 묶음 woff2, 원본 npm `pretendard@1.3.9`). 묶음에 없는 드문 글자는 기기 글꼴로 보인다.
- 제목: Noto Serif KR 700 — `noto-serif-kr/` (Fontsource `@fontsource/noto-serif-kr` 유니코드 구간별 woff2, `src/app/fonts-serif.css`). 화면에 나온 글자 구간 파일만 내려받는다.
- 두 글꼴 모두 SIL Open Font License 1.1 (각 폴더의 `OFL.txt`).
- 예전 Gowun Batang · IBM Plex Sans KR 파일은 셀케어와 공통이라 지우지 않고 남겨 두었다(이 앱 화면에서는 더 쓰지 않음).
