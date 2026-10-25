# 오운디(OWND) 소개 웹사이트

인천 연수구에서 시작하는 오운디를 소개하는 정적 사이트예요(Vite + TypeScript). 앱 원본 저장소(`poscoownd-hub/ownd-2`)와 따로 동작하고, 의존성도 이 폴더 안에만 있어요.

## 실행

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # 타입 검사 + dist/ 정적 파일
npm run verify     # 개발 서버가 떠 있는 상태에서 검증 → verify-output/report.md
```

## 구성

| 경로 | 역할 |
|---|---|
| `index.html` | 첫 화면: 왼쪽 로고만 있는 상단 바 + 흰 배경(외곽선 OWND·점 격자·동심원, 마우스를 따라 살짝 움직임) 위 84초 제품 데모. 휴대폰은 가운데, 설명은 휴대폰 옆 해당 위치(좁은 화면은 휴대폰 위). 맨 아래에 ‘아래 내용 있음’ 안내. 아래: OWND 로고 · Android 다운로드 · 자세히 보기 목차 7개 |
| `src/demo.ts` | 데모 무대. 실제 앱 캡처만으로 “검색 → 상세 → 신청 → 사장님 승인 → 확정 알림 → 이용 완료 → 후기 → 커뮤니티 → 운영 분석” 여정을 그려요. 화면 전환(밀기·시트·스크롤·펼침), 터치 점, 강조 테두리, 같은 예약을 따라가는 상태 칩, 필요한 곳만 확대하는 카메라. `seek(t)`는 시간만으로 모든 스타일을 다시 계산해요 |
| `src/timeline.ts` | 120비트 · 1비트 0.7초(84초, `SEC_PER_BEAT`로 빠르기 조절), 이징·닫힌 형태 스프링, 장(챕터)·자막 |
| `src/controller.ts` | 버튼 없이 항상 자동 재생. 탭이 숨으면 쉬고 돌아오면 이어서, 프레임이 0.5초 넘게 끊기면 감시 타이머가 다시 건다(크롬 절전 등). 세대 번호로 늦게 끝난 프레임 차단 |
| `src/backdrop.ts` | 배경이 마우스 이동을 따라 움직이도록 CSS 변수(--mx, --my)만 갱신 |
| `guide/*.html`, `src/guide.css` | 자세히 보기 글 페이지 7개(말로 찾기·신청과 승인·이용과 후기·소통과 커뮤니티·운동 생활·사장님 운영·데이터와 분석). 내용 근거: ~/Desktop/OWND_데이터_아키텍처_20261025.ipynb(기준 커밋 87171e1). `vite.config.ts`가 함께 빌드 |
| `tools/verify.mjs` | Playwright 검증(4개 화면 크기 · 설명/칩/휴대폰 잘림 · 설명-휴대폰 겹침 · 아래 안내 · 목차→글 페이지 · 결정론 · 루프 이음새 · 급변 · 자동 재생/멈춤 복구 · 다운로드 링크 · 외부 요청 · 비밀값 · 대비) |
| `ASSETS.md` | 캡처 목록(기능 ID·화면 상태·실제/샘플 구분·개인정보 처리·사용 장면)과 출처 |


## 장면 고치기

- 장면 사건(화면 바뀜·터치·강조·카메라)은 `src/demo.ts`의 `CONSUMER`, `OWNER`, `ROLE_KEYS`, `CAM`에 비트 단위로 있어요. 좌표는 앱 화면 기준(390×844 CSS px)이에요.
- 설명은 `src/timeline.ts`의 `CAPTIONS`예요. 구간마다 휴대폰 왼쪽/오른쪽(`side`)과 가리킬 높이(`at`, 앱 화면 y)를 정해요.
- Android 다운로드는 APK 파일(`.../ownd.apk`)로 바로 연결돼요.

## 앱 화면 다시 캡처하기

운영 데이터는 쓰지 않아요. 앱 원본을 작업 폴더에 복사해 임시 데이터 폴더로 서버를 띄우고(`OWND_DATA_DIR=<임시 폴더>`, 데모 시계 `POST /api/dev/clock`), Expo 웹(8081)을 Playwright로 조작해 찍었어요. 지도 영역은 찍을 때 가렸어요. 자세한 출처는 `ASSETS.md`에 있어요.

## 공개

GitHub `main`에 푸시하면 Vercel이 https://ownd-intro-site.vercel.app 에 자동 배포해요. 푸시 전에 `npm run build`와 `npm run verify`를 통과시켜 주세요.
