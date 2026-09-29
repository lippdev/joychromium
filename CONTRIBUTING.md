# Contribuindo

## Fluxo de branches (GitHub Flow)
- `main` está sempre estável e é protegida: exige os checks `electron (windows-latest)` e `electron (ubuntu-latest)`. Sem push direto.
- Crie branches curtas a partir da `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`, `ci/…`.
- Abra PR para a `main`; merge com **squash**. O título do PR vira o commit, então siga Conventional Commits.
- Branches são apagadas automaticamente após o merge.

## Commits (Conventional Commits)
`tipo(escopo): descrição no imperativo`

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
Mudança incompatível: `feat(scope)!: ...` com `BREAKING CHANGE:` no corpo.
Escopos sugeridos: `electron`, `shell`, `controller`, `security`, `adblock`, `policy`, `release`, `ci`, `deps`.

## Código
- TypeScript estrito (`app/tsconfig.json`). Lógica pura em `src/shared/` com teste unitário (vitest); o que toca o Electron é coberto pelo e2e (Playwright).
- Preloads são sandboxed e não podem importar módulos.
- Páginas internas conversam com o processo principal só por `{type, ...}` via `window.joy`.

## Checks locais (em `app/`)
```bash
npm run typecheck
npm test
npm run test:e2e
```

## Releases e atualizações automáticas
- Dependabot propõe cada Electron novo diariamente; `auto-merge.yml` mergeia quando o CI passa; `release.yml` cria a tag `vX.Y.Z` (derivada da última tag — nunca faz commit na `main`), gera os instaladores e publica na GitHub Release. Apps instalados atualizam sozinhos.
- Release manual: Actions → Release → *Run workflow* com o nível do bump.
- Rollback: adicione a versão a `blockedAppVersions` em `policy/policy.json`, assine e faça merge; o updater pula a versão.
