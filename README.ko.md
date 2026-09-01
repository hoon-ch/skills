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
  --skill herdr \
  --skill proxmox-post-install \
  --skill apply-diataxis \
  --skill technical-writing \
  --skill transcript-lecture-notes \
  --skill claude-code-assist \
  --skill crabbox-proxmox \
  --skill gjc-fleet \
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
| `herdr` | Herdr session 안에서 실행 중일 때(`HERDR_ENV=1`) pane, tab, workspace, worktree workspace, background 명령, 다른 coding agent를 확인하거나 제어할 때 씁니다. |
| `proxmox-post-install` | Proxmox VE homelab에서 no-subscription repository, subscription popup suppression, APT verification baseline이 필요할 때 씁니다. |
| `apply-diataxis` | Diátaxis로 문서 유형을 분류하고, 혼합된 유형을 분리하거나, 품질을 감사하고 사용자 필요 중심의 문서 구조를 설계할 때 씁니다. |
| `technical-writing` | README, tutorial, troubleshooting, reference, architecture explanation 같은 개발자/사용자 문서를 작성하거나 다듬을 때 씁니다. Korean-first technical writing에도 맞춰져 있습니다. |
| `transcript-lecture-notes` | SRT/VTT/TXT/Markdown transcript를 보존하면서 강의나 영상 transcript를 blog-style Markdown note로 바꿀 때 씁니다. |
| `claude-code-assist` | Codex가 Claude Code CLI를 사용해 review, source-backed research, second opinion, bounded delegation, review evidence capture를 수행해야 할 때 씁니다. |
| `crabbox-proxmox` | Proxmox 기반 격리 VM에서 build, run, debug, browser proof를 수행하고 Compose·database·queue 같은 인프라까지 함께 띄워야 할 때 씁니다. |
| `design-taste-frontend` | landing page, portfolio, 리디자인 작업에서 템플릿처럼 보이는 뻔한 AI 결과물을 피해야 할 때 씁니다. |
| `gjc-fleet` | Herdr 세션(`HERDR_ENV=1`) 안에서 넓은 범위의 작업을 여러 GJC 워커 세션으로 나눠 오케스트레이션하고, 병렬 워커가 서로 충돌하지 않도록 분할해야 할 때 씁니다. |
| `explain-me` | 저장소 온보딩, 아키텍처 리뷰, 요청/데이터 흐름 추적, 배포 구조, 변경 전후를 근거가 추적되는 시각 설명으로 만들 때 씁니다. |

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
- `plugins/hoon-ch-skills/skills`가 `skills/`와 byte-for-byte로 일치합니다.

### 직접 수정하면 안 되는 곳

- `plugins/hoon-ch-skills/skills`는 직접 수정하지 않습니다. 이 디렉터리는
  `skills/`에서 생성되는 mirror입니다.
- template-only 파일은 `SKILL.md`로 만들지 않습니다. `SKILL.md.template`를
  사용해야 합니다.
- maintainer policy는 `README.ko.md`보다 `AGENTS.md`에 둡니다. 이 문서는
  설치, 공개 skill 목록, 자주 쓰는 maintainer 절차만 다룹니다.

## 문서와 Review Evidence

이 registry의 skill은 저장소 이력을 읽지 않아도 다른 agent가 바로 사용할 수
있을 만큼 문서화되어야 합니다. 특히 `claude-code-assist`처럼 다른 모델이나
CLI를 조율하는 orchestration skill은 evidence capture가 중요합니다.

review, research, delegation workflow를 문서화할 때는 다음을 남깁니다.

- 정확한 command shape, default model, permission mode, fallback
- `references/`에 보관한 prompt template
- 구현 판단에 영향을 준 review output
- git에 포함하면 안 되는 generated review artifact 처리 방식
- skill 또는 저장소 문서에 기록한 validation command

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
