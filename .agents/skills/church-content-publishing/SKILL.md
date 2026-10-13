---
name: church-content-publishing
description: Prepare, validate, and register approved Paju Flower Church sermon and bulletin content through the existing draft, approval, JSON, and static-generation workflow without exposing private source material.
---

# 교회 콘텐츠 등록

## 적용 범위

이 Skill은 새 설교·주보의 비공개 초안, 공개 승인 검토, 중복 검증, 승인된 JSON 등록, 정적 페이지 생성을 수행할 때 사용한다.

기존 웹사이트 레이아웃·CSS·SEO 구조를 바꾸는 작업은 `pajuflower-web-maintenance`의 범위로 분리한다.

## 데이터 경계

- 원본 주보와 사진은 `REFERENCE/`에서 읽기 전용으로 다룬다.
- 검토용 초안은 `drafts/`에만 저장하며 Git·정적 출력물에 포함하지 않는다.
- 공개 데이터는 `content/sermons.json`과 `content/bulletins.json`의 기존 스키마를 우선 사용한다.
- 공개 HTML에는 승인된 공개 필드만 포함한다.
- 원본 경로, 내부 메모, 검토 기록, 어린이 정보, 개인 연락처, 민감한 개인 사연은 공개 필드에서 제외한다.

## 운영 절차

1. 입력 자료와 원문 근거를 확인한다.
2. 설교·주보 필수 필드, 날짜, slug, 공개 범위를 구분한다.
3. 확인되지 않은 값은 추측하지 않고 `REVIEW_REQUIRED`로 남긴다.
4. `scripts/create-content-draft.mjs`로 비공개 초안을 만든다.
5. 사용자의 공개 승인이 초안 안에 명시되어 있는지 확인한다.
6. `scripts/register-approved-content.mjs`의 기존 검증을 사용한다.
7. 설교와 주보가 함께 승인된 경우에만 기본 동시 등록 경로를 사용한다.
8. 설교만 승인된 경우에만 다음 단독 경로를 사용한다.

```text
npm run register -- --input drafts/approved-sermon-YYYY-MM-DD.json --scope sermon
```

단독 경로는 `content/sermons.json`만 변경하며 `content/bulletins.json`을 생성·수정·공개하지 않는다.

## 필수 검증

- 승인 상태: `draftStatus`, `approval.approved`, `approvedBy`, `approvedAt`
- 공개 상태: `publicStatus: published`, `approvalStatus: approved`
- 필수 필드: ID, slug, 날짜, 제목, 성경 본문, 설교자
- 날짜·slug·ID·주보 호수 중복
- 설교와 주보의 연결 관계
- YouTube URL 형식
- 전화번호·이메일·원본 경로·내부 필드 유출
- 기존 콘텐츠 보존 여부
- 단독 등록 시 주보 파일 불변 여부

승인 여부를 단순 CLI 옵션으로 우회하지 않는다. 등록 함수와 검증기를 통과하지 못하면 파일을 쓰지 않는다.

## 검증 명령

```text
npm run validate
npm run draft:test
npm run register:test
npm run e2e:test
npm run generate
npm run build
```

실패한 검증을 성공으로 보고하지 않는다. Windows에서 `spawn EPERM`이 발생하면 실행 환경 문제와 코드 오류를 구분해 보고하고, 필요할 때만 권한 제한 없는 환경에서 같은 명령을 재실행한다.

## Git과 배포

- 실제 주보 등록과 공개 배포는 분리한다.
- commit, push, Vercel 배포는 사용자 승인이 없으면 수행하지 않는다.
- 승인 후에도 명시된 관련 파일만 staging한다.
- `REFERENCE/`, `drafts/`, 원본 이미지·PDF, 개인정보는 Git에 추가하지 않는다.
