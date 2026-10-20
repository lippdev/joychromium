# Release

O app se distribui sozinho: o CI constrói os instaladores dos três sistemas, publica na GitHub Release e as instalações existentes se atualizam. Este arquivo explica o caminho inteiro e o que fazer quando algo quebra.

## Quando uma release acontece

Só dois gatilhos, ambos em `.github/workflows/release.yml`:

1. **Push na `main` cujo commit começa com `chore(deps): bump electron `** — o motor mudou, então sai uma versão patch. É o PR que o Dependabot abre e o `auto-merge.yml` mergeia quando os três checks passam.
2. **`workflow_dispatch`** com o nível de bump (`patch`, `minor` ou `major`) — para uma release de funcionalidade.

Qualquer outro commit na `main` roda o CI e para por aí: nada é publicado.

## O que o workflow faz

1. `decide` lê a última tag `v*`, aplica o bump e calcula a versão (nada é commitado de volta na `main`, que é protegida).
2. `tag` cria e envia a tag anotada.
3. `build` roda nos três runners com a tag marcada, roda os testes unitários, carimba a versão no `package.json` (`npm version`, sem commit) e chama `electron-builder --publish always`.
4. `notes` gera as notas da release a partir dos Conventional Commits entre a tag anterior e esta (`app/scripts/release-notes.mjs`, com teste unitário) e substitui o corpo da release: novidades, correções, desempenho, por dentro, documentação, empacotamento, CI e manutenção, com as mudanças que quebram na frente. `chore(deps): bump …` e merges ficam de fora — quem lê a release quer saber o que mudou no app, não que o motor subiu de versão.

Os artefatos publicados na release:

| Plataforma | Arquivos | Auto-update |
|---|---|---|
| Windows | `JoyChromium-<versão>-win-x64.exe`, `…-win-arm64.exe`, `latest.yml` | sim, ao fechar (NSIS instala sozinho) |
| macOS | `JoyChromium-<versão>-mac-x64.dmg` / `…-mac-arm64.dmg`, `…-mac-x64.zip` / `…-arm64.zip`, `latest-mac.yml` | não (ADR-010): o app avisa e abre a página da release |
| Linux | `JoyChromium-<versão>-linux-amd64.deb`, `…-linux-aarch64.rpm`, `…-linux-x86_64.AppImage` (e os arm64), `latest-linux.yml`, `latest-linux-arm64.yml` | AppImage sim; `.deb`/`.rpm` com **Reiniciar e instalar** em Configurações → Sobre |

O motor vem do build **castLabs ECS** (`github:castlabs/electron-releases#v44.5.1+wvcus`), apontado em dois lugares no `app/package.json`: `devDependencies.electron` e `build.electronDownload.customDir`. Os dois precisam mudar juntos; `.github/workflows/engine-update.yml` faz isso todo dia quando a castLabs publica uma versão nova.

## Antes de uma release de funcionalidade

- `main` verde nos três sistemas, com os checks obrigatórios (`electron (windows-latest)`, `electron (ubuntu-latest)`, `electron (macos-latest)`).
- Se mexeu em empacotamento, rode o caminho de instalação pelo menos no seu sistema: o CI instala e abre o pacote de cada runner, mas não substitui um teste na máquina onde o app vai rodar.
- Se mexeu na policy (`policy/policy.json`), assine de novo — veja [POLICY.md](POLICY.md) — e faça o push da assinatura junto, senão a policy remota é ignorada.

## Depois de publicada

- Confira que os três primeiros itens do `latest*.yml` apontam para os arquivos certos: uma release com `latest.yml` vazio deixa quem já tem o app sem atualização.
- A instalação existente recebe a versão nova na próxima checagem (o app checa no boot e a cada 6 horas).
- Versão quebrada publicada: coloque a versão em `blockedAppVersions` na policy assinada; o updater passa a pular essa versão e mantém quem já está nela.

## Versões e tags

- A tag é a fonte da verdade (`v<maior>.<menor>.<patch>`); o `package.json` do repositório fica em `1.0.0` de propósito, e o workflow carimba a versão do build.
- Tag publicada não é reaproveitada. Se um build saiu quebrado, publique o próximo patch com a correção em vez de mover a tag.
