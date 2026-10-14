# PAJUFLOWER Codex 운영 규칙

## 적용 범위

- 작업 루트는 `D:\PAJUFLOWER`로 한정한다.
- 다른 프로젝트, 특히 복구 원본이나 별도 미디어 프로젝트는 접근하지 않는다.
- 기존 변경 사항은 먼저 확인하고, 작업 범위 밖의 변경은 보존한다.

## 규칙 우선순위

1. `파주꽃동산교회 프로젝트 헌법 v1.md`
2. 사용자 명시 지시
3. `PAJU_FLOWER_WORKFLOW.md`
4. `WEBSITE_BRIEF.md`
5. `썸네일 제작 규칙.md`
6. 이 문서와 선택된 Skill

하위 문서나 Skill은 상위 문서를 대체하거나 완화하지 않는다. 충돌이 해결되지 않으면 작업을 중지하고 보고한다.

## 기본 작업 방식

- 먼저 실제 파일·코드·생성 결과를 읽고 확인된 사실과 추정을 구분한다.
- 기존 Vite/Vercel 구조를 우선 유지하고 필요한 최소 범위만 수정한다.
- 원본, 비공개 초안, 공개 데이터, 생성 결과물을 서로 구분한다.
- 사용자가 승인하지 않은 구현·Git 반영·배포는 수행하지 않는다.
- 현재 없는 자료나 문서는 추정해 만들지 않는다.

## 콘텐츠 보호

- `REFERENCE/`는 원본 보관 영역으로 취급하고 이동·삭제·덮어쓰지 않는다.
- `drafts/`는 비공개 검토 영역으로 취급하며 공개 산출물과 Git에 포함하지 않는다.
- 승인된 공개 필드만 `content/*.json`에 등록한다.
- 개인정보, 내부 검토 기록, 원본 경로를 정적 HTML·사이트맵·메타데이터에 노출하지 않는다.
- 승인되지 않은 콘텐츠는 정적 페이지와 사이트맵에서 제외한다.

## 프로젝트 구조와 명령

- 콘텐츠 원본: `content/`
- 초안·승인 등록: `scripts/create-content-draft.mjs`, `scripts/register-approved-content.mjs`
- 콘텐츠 검증: `scripts/validate-content.mjs`
- 정적 생성: `scripts/generate-static-content.mjs`
- 공통 콘텐츠 셸: `templates/content-shell.html`
- Vite root 및 추적되는 정적 결과물: `dist/`
- Vercel 빌드 출력: `vercel-build/` (Git 제외)

주간 콘텐츠 작업에서는 현재 스크립트와 다음 검증 명령을 우선 재사용한다.

```text
npm run validate
npm run draft:test
npm run register:test
npm run e2e:test
npm run generate
npm run build
```

설교만 승인된 경우에는 기존 동시 등록 경로를 대신하지 않고, 검증된 `--scope sermon` 경로를 사용한다. 이 경로는 주보를 생성하거나 공개하지 않는다.

## Skill 선택 기준

- HTML·CSS·SEO·Vite·정적 생성 구조를 조사하거나 수정할 때: `pajuflower-web-maintenance`
- 설교·주보 초안, 승인, 중복 검증, 정적 등록을 처리할 때: `church-content-publishing`
- 주보 자동 편집·조판 모델, A4 배치, 인쇄·반응형 렌더링, 보존 검증을 설계하거나 구현할 때: `church-bulletin-layout-engine`
- 주보 전용 레이아웃 Skill은 일반 웹 유지보수나 콘텐츠 발행을 대신하지 않으며, 실제 레이아웃 엔진 작업에만 사용한다.

## Git과 배포

- 기본적으로 commit, push, Vercel 배포를 수행하지 않는다.
- 명시적 승인이 있을 때만 `git status`, `git diff`, 대상 파일 목록을 확인한 뒤 선택적으로 staging한다.
- `git add -A`로 전체 파일을 추가하지 않는다.
- `REFERENCE/`, `drafts/`, 환경변수, 인증 정보, 원본 개인정보는 staging 대상에서 제외한다.
- 코드 검증, 빌드, GitHub 반영, Vercel 배포, 운영 URL 확인은 서로 다른 결과로 보고한다.

## 보고

작업 종료 시 다음을 구분해 보고한다.

- 확인된 사실과 미확인 사항
- 변경 파일과 제외 파일
- 공개 데이터와 비공개 자료의 상태
- 테스트·빌드·브라우저·배포 결과
- 추가 승인 또는 확인이 필요한 사항
