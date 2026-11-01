# Release do alpha Windows

Este documento descreve o processo de release destinado ao alpha Windows. Builds para macOS/Linux, Flathub e suas atualizações são trabalho futuro listado em [ROADMAP.md](ROADMAP.md).

## Quando uma release acontece

O workflow de release tem dois gatilhos: push na `main` de um commit `chore(deps): bump electron ...` para atualizar o motor, ou execução manual (`workflow_dispatch`) com nível de bump `patch`, `minor` ou `major`. A execução manual também aceita uma versão SemVer exata. Sem uma versão exata, o workflow avança da release publicada mais recente; se não houver releases publicadas, usa a versão do `package.json`. Tags históricas sem uma release correspondente não definem o próximo número. A primeira versão alpha é `0.1.0-alpha`. Pré-releases também chegam pelo atualizador automático (ver abaixo).

## Artefatos Windows

As releases Windows publicam instaladores x64 e arm64 (`.exe`) e o metadado do atualizador (`latest.yml`). Consulte a [página de releases](https://github.com/lippdev/joychromium/releases) e confirme os nomes efetivamente publicados. No Windows, o app se atualiza sozinho, inclusive nas pré-releases 0.x (o `electron-updater` lê o feed de releases com `allowPrerelease`): a cada abertura ele verifica, baixa em segundo plano e instala em silêncio; se o download fica pronto nos primeiros 45 s, instala e reabre na hora, senão instala ao fechar. Uma build estável (1.0 sem sufixo) só segue releases estáveis.

O instalador não tem certificado de assinatura; o SmartScreen pode exibir um aviso. A presença do instalador não prova DRM funcional: Widevine e reprodução em serviços pagos continuam gates de validação do alpha.

## Antes de publicar uma versão de alpha

- Valide a branch e os workflows ativos; a proteção atual exige `electron (windows-latest)`.
- Gere e instale o `.exe` Windows; confirme que abre e que a atualização funciona no sistema-alvo.
- Confirme a tag e o número de versão do build; não reutilize uma tag já publicada. Toda release publicada, pré-release incluída, chega automaticamente aos usuários Windows: publique só o que pode ser instalado sem ninguém pedir.
- Complete a sessão de TV com controle físico descrita em [CONTROLLER-TEST.md](CONTROLLER-TEST.md).
- Registre separadamente o resultado de DRM no Windows. Não declare streaming pronto sem uma reprodução real verificada.
- Confirme que os arquivos e notas da release correspondem aos artefatos realmente gerados.

## Plataformas futuras

Os procedimentos anteriores de macOS, Linux, DRM/EVS multiplataforma e Flatpak permanecem nos guias especializados como referência. Eles não são gates do alpha Windows. Veja [ROADMAP.md](ROADMAP.md).
