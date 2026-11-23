# Releases do JoyChromium

O workflow de release publica os instaladores Windows. O CI gera o AppImage x64 experimental para validação no CachyOS como artefato separado. O AppImage alfa é atualizado manualmente.

## Quando uma release acontece

O workflow de release tem dois gatilhos: push na `main` de um commit `chore(deps): bump electron ...` para atualizar o motor, ou execução manual (`workflow_dispatch`) com nível de bump `patch`, `minor` ou `major`. A execução manual também aceita uma versão SemVer exata. Sem uma versão exata, o workflow avança da release publicada mais recente; se não houver releases publicadas, usa a versão do `package.json`. Tags históricas sem uma release correspondente não definem o próximo número. A primeira versão alpha é `0.1.0-alpha`. Pré-releases também chegam pelo atualizador automático (ver abaixo).

## Artefatos Windows

As releases Windows publicam instaladores x64 e arm64 (`.exe`) e o metadado do atualizador (`latest.yml`). A partir da 0.1.5-beta, o app verifica atualizações a cada abertura, baixa em segundo plano e instala em silêncio. Se o download fica pronto nos primeiros 45 s, instala e reabre na hora. Depois disso, instala ao fechar. Versões com sufixo alfa ou beta seguem pré-releases. Versões sem sufixo, como a 0.1.5, seguem o canal estável.

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
