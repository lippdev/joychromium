# Contribuindo

## Fluxo de branches (GitHub Flow)
- `main` está sempre estável; o CI precisa passar. Sem push direto.
- Crie branches curtas a partir da `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`.
- Abra PR para a `main`; merge com **squash**. O título do PR vira o commit, então siga Conventional Commits.
- Apague a branch depois do merge.

## Commits (Conventional Commits)
`tipo(escopo): descrição no imperativo`

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
Mudança incompatível: `feat(scope)!: ...` com `BREAKING CHANGE:` no corpo.
Escopos sugeridos: `controller`, `keyboard`, `tv-identity`, `shell`, `ci`, `deps`.

## Código
- C# com `Nullable` ligado. Warnings são erros (`Directory.Build.props`).
- Estilo definido em `.editorconfig`; rode `dotnet format` antes do PR.
- Lógica nova vai em classes testáveis, não em `MainWindow.xaml.cs`.
- Toda lógica pura nova precisa de cobertura no projeto de testes.

## Checks locais
```powershell
dotnet build .\JoyChromium.csproj --configuration Release
dotnet test .\tests\JoyChromium.Tests --configuration Release
dotnet format JoyChromium.csproj --verify-no-changes
```

## Releases
SemVer com tags `vMAJOR.MINOR.PATCH`; mudanças notáveis em `CHANGELOG.md`.

## Proteção da `main` (configuração do repositório)
`main` exige os checks `electron (windows-latest)` e `electron (ubuntu-latest)` verdes; auto-merge está habilitado e branches são apagadas após o merge. O `auto-merge.yml` depende disso: sem checks obrigatórios, `gh pr merge --auto` mergearia na hora. O `release.yml` nunca faz commit na `main` — só cria a tag `vX.Y.Z` (derivada da última tag) e publica.
