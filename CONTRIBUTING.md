# Contribuindo

## Fluxo de branches (GitHub Flow)
- `main` está sempre estável e é protegida: exige o check `electron (windows-latest)`. Windows é a plataforma atual do produto; macOS e Linux ficam no roadmap. Sem push direto.
- Crie branches curtas a partir da `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`, `ci/…`. Ajustes do backlog usam o id da história: `feat/e1-03-menu-macos`.
- Abra PR para a `main`; merge com **squash**. O título do PR vira o commit, então siga Conventional Commits.
- Branches são apagadas automaticamente após o merge.

## Commits (Conventional Commits)
`tipo(escopo): descrição no imperativo`

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
Mudança incompatível: `feat(scope)!: ...` com `BREAKING CHANGE:` no corpo.
Escopos sugeridos: `electron`, `shell`, `controller`, `security`, `adblock`, `policy`, `release`, `ci`, `deps`.

## Código
- TypeScript estrito (`app/tsconfig.json`). Lógica pura em `src/shared/` com teste unitário (vitest); o que toca o Electron é coberto pelo e2e (Playwright).
- O build é um script com esbuild (`app/scripts/build.mjs`): empacota main, preloads, shell e copia `src/assets`. Não há passo `tsc` de emissão; o typecheck é `npm run typecheck`.
- Preloads são sandboxed, mas, como são empacotados, **podem importar `src/shared`** (é assim que o contrato de IPC deixa de ser duplicado).
- Páginas internas conversam com o processo principal só por `{type, ...}` via `window.joy`.

## Checks locais (em `app/`)
```bash
npm run typecheck
npm test
npm run test:e2e
```

## Plataformas
- Toda decisão por sistema operacional passa por `src/shared/platform.ts` (parte pura, com teste) e `src/main/platform.ts` (o único módulo que lê `process.platform`). Não espalhe `process.platform` pelo código.
- Rótulos de atalho saem do modificador da plataforma (`Ctrl` fora do macOS, `Cmd` no macOS); não escreva "Ctrl+" fixo em HTML.
- Caminhos de usuário saem de `app.getPath(...)`, nunca de `homedir()` com pastas montadas à mão.
- Plataforma atual: Windows. `npm run dist` gera os instaladores Windows x64 e arm64. Os adaptadores e targets de macOS/Linux permanecem como referência para o roadmap, sem suporte ou validação atuais.

## Releases e atualizações automáticas
- O motor é o castLabs Electron for Content Security (`github:castlabs/electron-releases#v…+wvcus`), que não está no npm: `engine-update.yml` abre o PR de bump todo dia. A versão aparece em dois lugares no `package.json` (`devDependencies.electron` e `build.electronDownload.customDir`) e os dois precisam mudar juntos.
- Dependabot cuida das demais dependências; `auto-merge.yml` mantém o check Windows exigido pela proteção. O `release.yml` aceita uma versão SemVer exata no disparo manual; sem ela, avança da release publicada mais recente ou usa o `package.json` quando não há releases. Tags históricas não determinam o próximo número. O workflow cria a tag e os instaladores Windows x64 e arm64 sem fazer commit na `main`. A primeira alpha é `0.1.0-alpha`; pré-releases não alimentam o canal estável de atualização.
- Release manual: Actions → Release → *Run workflow* com o nível do bump.
- Rollback: adicione a versão a `blockedAppVersions` em `policy/policy.json`, assine e faça merge; o updater pula a versão.
