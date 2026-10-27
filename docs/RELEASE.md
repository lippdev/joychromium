# Release do alpha Windows

Este documento descreve o processo de release destinado ao alpha Windows. Builds para macOS/Linux, Flathub e suas atualizações são trabalho futuro listado em [ROADMAP.md](ROADMAP.md).

## Quando uma release acontece

O workflow de release tem dois gatilhos: push na `main` de um commit `chore(deps): bump electron ...` para atualizar o motor, ou execução manual (`workflow_dispatch`) com nível de bump `patch`, `minor` ou `major`. A execução manual também aceita uma versão SemVer exata. Sem uma versão exata, o workflow avança da release publicada mais recente; se não houver releases publicadas, usa a versão do `package.json`. Tags históricas sem uma release correspondente não definem o próximo número. A primeira versão alpha é `0.1.0-alpha`; versões alpha ficam fora do canal `latest`.

## Artefatos Windows

As releases Windows publicam instaladores x64 e arm64 (`.exe`) e o metadado do atualizador (`latest.yml`). Consulte a [página de releases](https://github.com/lippdev/joychromium/releases) e confirme os nomes efetivamente publicados. Versões abaixo de 1.0 são pré-releases e não alimentam o canal `latest`: quem está no alpha 0.x precisa baixar manualmente. A partir da 1.0, versões estáveis podem ser oferecidas pelo atualizador e aplicadas ao fechar.

O instalador não tem certificado de assinatura; o SmartScreen pode exibir um aviso. A presença do instalador não prova DRM funcional: Widevine e reprodução em serviços pagos continuam gates de validação do alpha.

## Antes de publicar uma versão de alpha

- Valide a branch e os workflows ativos; a proteção atual exige `electron (windows-latest)`.
- Gere e instale o `.exe` Windows; confirme que abre e que a atualização funciona no sistema-alvo.
- Confirme a tag e o número de versão do build; não reutilize uma tag já publicada. Versões 0.x e versões SemVer com sufixo de pré-release permanecem fora do canal `latest`.
- Complete a sessão de TV com controle físico descrita em [CONTROLLER-TEST.md](CONTROLLER-TEST.md).
- Registre separadamente o resultado de DRM no Windows. Não declare streaming pronto sem uma reprodução real verificada.
- Confirme que os arquivos e notas da release correspondem aos artefatos realmente gerados.

## Plataformas futuras

Os procedimentos anteriores de macOS, Linux, DRM/EVS multiplataforma e Flatpak permanecem nos guias especializados como referência. Eles não são gates do alpha Windows. Veja [ROADMAP.md](ROADMAP.md).
