# Odre

> **Make Folder Sexy Again**

Windows 환경에서 지정한 폴더를 실시간으로 감시하고, 파일 확장자 및 파일명 패턴에 따라 자동으로 분류·정리하는 데스크탑 앱.

Tauri 2.0 + Rust 백엔드 기반.

---

## 개발 환경 설정

### 사전 요구사항

- [Rust (rustup)](https://rustup.rs)
- [Node.js LTS](https://nodejs.org)
- [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — "Desktop development with C++" 선택

### 실행

```powershell
npm install
npm run dev
```

### 빌드 (배포용 exe)

```powershell
npm run build
```

빌드 결과물: `src-tauri/target/release/bundle/`

---

## 프로젝트 구조

```
odre/
├── src/
│   └── index.html        # UI (CSS + JS 단일 파일)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       # 진입점
│   │   └── lib.rs        # 파일 감시, 규칙 엔진, invoke 핸들러
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── package.json
└── README.md
```

---

## 주요 기능

- 감시 폴더 실시간 파일 감지 (`notify` crate)
- 확장자 / 파일명 패턴 기반 규칙 엔진
- 이동 지연, 중복 처리 설정
- 설정 자동 저장 (`%APPDATA%/odre/settings.json`)
- Windows 자동 시작
- 다국어 지원 (한국어, English, 日本語, 中文, Français, Español)
- 다크 / 라이트 모드

---

## 라이선스

MIT
