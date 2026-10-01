# hoon-ch/skills

Codex와 Claude Code에서 함께 쓰는 개인용 skill registry입니다.

이 저장소는 여러 프로젝트에서 반복해서 쓰는 작업 흐름을 작고 설치 가능한
skill로 정리합니다. 공개되는 skill은 `skills/<name>` 아래에 있으며,
[`skills.sh`](https://skills.sh/)로 설치할 수 있습니다.

[English README](README.md)

## `skills.sh`로 설치하기

모든 공개 skill을 전역으로 설치합니다.

```bash
npx skills add hoon-ch/skills -g \
  --agent codex claude-code \
  --skill '*' \
  --yes
```

필요한 skill만 골라 설치할 수도 있습니다.

```bash
npx skills add hoon-ch/skills -g \
  --agent codex claude-code \
  --skill plane-api \
  --skill diverging-ui \
  --skill repo-web-fsd \
  --skill nestjs-best-practices \
  --skill harbor \
  --skill proxmox-post-install \
  --skill apply-diataxis \
  --skill technical-writing \
  --skill design-taste-frontend \
  --skill explain-me \
  --yes
```

설치하지 않고 목록만 확인합니다.

```bash
npx skills add hoon-ch/skills -g --list
```

## Plugin으로 설치하기

이 저장소는 agent plugin 설치를 위한 메타데이터도 함께 제공합니다.

- Claude plugin manifest: `.claude-plugin/marketplace.json`
- Codex plugin marketplace: `.agents/plugins/marketplace.json`
- Codex plugin package: `plugins/hoon-ch-skills/`

세 설치 경로는 모두 `skills/` 아래의 같은 공개 skill을 노출합니다.

## 공개 Skill

| Skill | 언제 쓰나 |
| --- | --- |
| `plane-api` | Plane Cloud나 self-hosted Plane에서 REST API를 직접 호출하거나, route probing, project scan, workflow helper가 필요할 때 씁니다. |
| `diverging-ui` | frontend UI를 만들거나 다시 설계할 때 가장 흔한 첫 번째 디자인으로 수렴하지 않도록 방향을 넓힐 때 씁니다. |
| `repo-web-fsd` | `apps/web` 배치, FSD boundary, design-system ownership을 판단할 때 씁니다. |
| `nestjs-best-practices` | NestJS module, controller, service, dependency injection, guard, DTO, validation, database access, testing, microservice, deployment, security 코드를 작성하거나 리뷰/리팩터링할 때 씁니다. |
| `harbor` | Kubernetes/GitOps 환경에서 Harbor registry 운영, scanner, robot account, replication, ArgoCD drift를 다룰 때 씁니다. |
| `proxmox-post-install` | Proxmox VE homelab에서 no-subscription repository, subscription popup suppression, APT verification baseline이 필요할 때 씁니다. |
| `apply-diataxis` | Diátaxis로 문서 유형을 분류하고, 혼합된 유형을 분리하거나, 품질을 감사하고 사용자 필요 중심의 문서 구조를 설계할 때 씁니다. |
| `technical-writing` | README, tutorial, troubleshooting, reference, architecture explanation 같은 개발자/사용자 문서를 작성하거나 다듬을 때 씁니다. Korean-first technical writing에도 맞춰져 있습니다. |
| `design-taste-frontend` | landing page, portfolio, 리디자인 작업에서 템플릿처럼 보이는 뻔한 AI 결과물을 피해야 할 때 씁니다. |
| `explain-me` | 기술 주제, 코드베이스, API 호출, 데이터 흐름, 상태 전이를 ELI5식 한 문장·큰 그림·핵심 요약으로 설명하고 Archify의 typed diagram·validation·standalone HTML delivery를 적용할 때 씁니다. |

## Maintainer Workflow

이 섹션은 skill을 설치하는 사용자가 아니라, 이 registry 자체를 수정하는
maintainer를 위한 절차입니다.

### Skill 추가 또는 수정

새 skill은 저장소 root에서 scaffold를 만듭니다.

```bash
python3 scripts/create_skill.py my-skill --with agents,references,scripts
```

그다음 `skills/<name>/SKILL.md`와 필요한 보조 파일을 수정합니다.

- `skills/<name>/references/`: 긴 절차, prompt template, troubleshooting note
- `skills/<name>/scripts/`: setup, doctor, validation 같은 반복 가능한 helper
- `skills/<name>/agents/`: agent-facing metadata

`SKILL.md`는 짧고 바로 실행 가능한 entrypoint로 유지합니다. 긴 설명과
반복 가능한 절차는 `references/`나 `scripts/`로 옮깁니다.

### Publish Surface 검증

`skills/`를 수정한 뒤에는 Codex plugin mirror를 갱신하고 모든 설치 표면을
검증합니다.

```bash
python3 scripts/sync_codex_plugin_skills.py
python3 scripts/validate_repo.py
npx skills add . -g --list
```

기대 결과는 다음과 같습니다.

- `validate_repo.py`가 `Repository is valid!`를 출력합니다.
- `npx skills add . -g --list`가 `skills/` 아래의 공개 skill만 표시합니다.
- `plugins/hoon-ch-skills/skills`가 `skills/`의 skill 폴더와 byte-for-byte로 일치합니다.

### 직접 수정하면 안 되는 곳

- `plugins/hoon-ch-skills/skills`는 직접 수정하지 않습니다. 이 디렉터리는
  `skills/`에서 생성되는 mirror입니다.
- template-only 파일은 `SKILL.md`로 만들지 않습니다. `SKILL.md.template`를
  사용해야 합니다.
- maintainer policy는 `README.ko.md`보다 `AGENTS.md`에 둡니다. 이 문서는
  설치, 공개 skill 목록, 자주 쓰는 maintainer 절차만 다룹니다.

## 저장소 구조

이 저장소는 installable agent skill의 source입니다. prompt dump가 아닙니다.

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── plugins/
│   └── hoon-ch-skills/
│       ├── .codex-plugin/
│       └── skills/
├── skills/
│   └── <skill-name>/
├── scripts/
│   ├── create_skill.py
│   ├── sync_codex_plugin_skills.py
│   └── validate_repo.py
├── spec/
│   ├── quality-bar.md
│   └── repository-layout.md
└── template/
    └── SKILL.md.template
```

agent용 저장소 유지보수 규칙은 `AGENTS.md`에 있습니다. Claude Code entrypoint
규칙은 `CLAUDE.md`에 있습니다.
