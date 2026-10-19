# ADR-009: DRM (Widevine) com castLabs Electron for Content Security

**Status:** aceito (out/2026), decidido pelo dono do produto. Implementação com uma ressalva de verificação.

## Contexto
Electron padrão não inclui a CDM do Widevine, então Netflix, Prime Video e Disney+ — atalhos padrão da tela inicial — não tocam.

## Decisão
Trocar `electron` pelo build **ECS** da castLabs (`github:castlabs/electron-releases#v44.5.1+wvcus`), que instala a CDM no primeiro uso via API `components`, e manter o motor atualizado por um workflow agendado (`.github/workflows/engine-update.yml`), já que o ECS não está no npm.

## Como o empacotamento encontra o motor
`build.electronDownload` aponta para as releases da castLabs, com `customDir` literal no tag (`v44.5.1+wvcus`). O versionamento do ECS precisa ser atualizado em dois lugares: `devDependencies.electron` e `build.electronDownload.customDir`.

## VMP
Widevine de produção no Windows e no macOS exige assinatura VMP pelo serviço EVS (gratuito, com conta castLabs). O Linux não usa VMP. Um passo de `afterPack` com `castlabs-evs` entra quando a conta existir; até lá os builds servem para desenvolvimento.

## Ressalva verificada no spike
Neste ambiente de CI o `components.whenReady()` resolve sem baixar a CDM (`components.status()` vazio) e `requestMediaKeySystemAccess('com.widevine.alpha')` responde *Unsupported keySystem*. Ou seja: **a troca do motor está feita e o app roda igual, mas a instalação da CDM não pôde ser confirmada aqui** (o download depende de um serviço do Google que não respondeu). O status aparece em Configurações → Sobre, na linha “Widevine (DRM)”, para ser conferido numa máquina com rede aberta antes de prometer streaming pago.
