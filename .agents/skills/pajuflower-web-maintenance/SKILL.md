---
name: pajuflower-web-maintenance
description: Maintain the Paju Flower Church Vite/Vercel static website, including HTML, CSS, metadata, routing, and generated-page verification, while preserving the existing design and content publishing boundaries.
---

# Paju Flower 웹 유지보수

## 적용 범위

이 Skill은 파주꽃동산교회 웹사이트의 기존 Vite/Vercel 정적 구조를 조사하거나 최소 범위로 수정할 때 사용한다.

적용 대상:

- `dist/index.html` 및 기존 홈페이지 영역
- `dist/content.css`와 관련 레이아웃
- `templates/content-shell.html`
- `scripts/generate-static-content.mjs`
- title, description, canonical, Open Graph, JSON-LD, sitemap, robots
- PC·모바일 반응형과 내부 링크

콘텐츠의 사실성·공개 승인 판단은 이 Skill의 책임이 아니다. 새 설교·주보 등록은 `church-content-publishing`을 사용한다.

## 작업 원칙

1. 작업 전에 헌법, `PAJU_FLOWER_WORKFLOW.md`, Brief, 현재 소스와 Git 상태를 확인한다.
2. `dist/`가 실제 Vite root이라는 현재 구조를 보존한다.
3. 기존 로고·색상·타이포그래피·URL·콘텐츠·배포 설정을 우선 보존한다.
4. 필요한 파일만 최소 수정하고, 다른 영역의 리팩터링을 함께 수행하지 않는다.
5. 확인되지 않은 교회 정보나 SEO 정보를 새로 만들지 않는다.
6. `REFERENCE/` 원본과 `drafts/` 비공개 자료를 공개 HTML이나 생성 결과에 포함하지 않는다.

## 구현 전 확인

- 현재 HTML 구조와 실제 적용 CSS
- 공통 템플릿과 생성기 호출 관계
- 기존 canonical·Open Graph·JSON-LD·sitemap·robots
- 변경 전후 내부 링크와 이미지 경로
- 현재 Git 변경 사항 및 사용자 승인 범위

## 검증

코드 또는 템플릿을 변경한 경우 변경 범위에 맞게 다음을 실행한다.

```text
npm run generate
npm run build
git diff --check
```

콘텐츠 데이터가 함께 변경되면 `npm run validate`와 관련 테스트도 실행한다. 빌드 성공, 브라우저 화면, 운영 배포 성공은 각각 별도로 보고한다.

## 금지 사항

- Next.js 등 프레임워크 교체
- CMS·DB·API 서버·로그인 추가
- 전체 zoom 또는 임의 scale로 레이아웃 문제 은폐
- 승인되지 않은 콘텐츠를 최신 영역·사이트맵에 노출
- 사용자 승인 없는 commit, push, 배포
- 관련 없는 파일 수정
