# Contribuindo

## Fluxo de branches (GitHub Flow)
- `main` está sempre estável e é protegida: exige os checks `electron (windows-latest)`, `electron (ubuntu-latest)` e `electron (macos-latest)`. Sem push direto.
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

Para gerar todos os instaladores de Linux localmente é preciso `rpmbuild` (`sudo apt-get install rpm`); sem ele, use `npx electron-builder --linux AppImage deb`.

No Linux, o e2e precisa de um servidor X virtual: `xvfb-run --auto-servernum --server-args="-screen 0 1600x900x24" npm run test:e2e`.

## Plataformas
- Toda decisão por sistema operacional passa por `src/shared/platform.ts` (parte pura, com teste) e `src/main/platform.ts` (o único módulo que lê `process.platform`). Não espalhe `process.platform` pelo código.
- Rótulos de atalho saem do modificador da plataforma (`Ctrl` fora do macOS, `Cmd` no macOS); não escreva "Ctrl+" fixo em HTML.
- Caminhos de usuário saem de `app.getPath(...)`, nunca de `homedir()` com pastas montadas à mão.
- Empacotamento: `npm run dist` gera os instaladores da plataforma em que você está. Os targets de macOS e arm64 são construídos no CI.

## Releases e atualizações automáticas
- O motor é o castLabs Electron for Content Security (`github:castlabs/electron-releases#v…+wvcus`), que não está no npm: `engine-update.yml` abre o PR de bump todo dia. A versão aparece em dois lugares no `package.json` (`devDependencies.electron` e `build.electronDownload.customDir`) e os dois precisam mudar juntos.
- Dependabot cuida das demais dependências; `auto-merge.yml` mergeia quando o CI passa nos três sistemas; `release.yml` cria a tag `vX.Y.Z` (derivada da última tag — nunca faz commit na `main`), gera os instaladores de Windows, macOS e Linux e publica na GitHub Release. Windows e Linux se atualizam sozinhos; no macOS, sem assinatura, o app avisa e abre a página da release.
- Release manual: Actions → Release → *Run workflow* com o nível do bump.
- Rollback: adicione a versão a `blockedAppVersions` em `policy/policy.json`, assine e faça merge; o updater pula a versão.
