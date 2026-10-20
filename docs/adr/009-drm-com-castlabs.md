# ADR-009: DRM (Widevine) com castLabs Electron for Content Security

**Status:** aceito (out/2026), decidido pelo dono do produto. Implementado e verificado no Linux; VMP no Windows e no macOS em aberto.

## Contexto
Electron padrão não inclui a CDM do Widevine, então Netflix, Prime Video e Disney+ — atalhos padrão da tela inicial — não tocam.

## Decisão
Trocar `electron` pelo build **ECS** da castLabs (`github:castlabs/electron-releases#v44.5.1+wvcus`), que instala a CDM no primeiro uso via API `components`, e manter o motor atualizado por um workflow agendado (`.github/workflows/engine-update.yml`), já que o ECS não está no npm.

## Como o empacotamento encontra o motor
`build.electronDownload` aponta para as releases da castLabs, com `customDir` literal no tag (`v44.5.1+wvcus`). O versionamento do ECS precisa ser atualizado em dois lugares: `devDependencies.electron` e `build.electronDownload.customDir`.

## VMP
Widevine de produção no Windows e no macOS exige assinatura VMP pelo serviço EVS (gratuito, com conta castLabs). O Linux não usa VMP. Um passo de `afterPack` com `castlabs-evs` entra quando a conta existir; até lá os builds servem para desenvolvimento.

## UA por site (E10-05)
O UA de TV pode custar resolução em um serviço e ajudar em outro, e não há garantia em nenhuma direção. A medição e a tabela por serviço ficam em [`docs/DRM-UAS.md`](../DRM-UAS.md); a regra que decide o UA por host está em `app/src/shared/streamingUa.ts` e chega pela opção *Mídia e DRM → UA de desktop nos serviços de streaming*, desligada por padrão até uma linha da tabela mostrar ganho.

## Verificação (20/10/2026, Linux x64)
A ressalva do spike caiu em parte: a CDM **baixa e o EME funciona** numa máquina com rede aberta.

- `components.whenReady()` resolve e, em menos de um segundo, `components.status()` traz o componente `oimompecagnajdejgnnjijobebaeigek` com a versão `4.10.3112.0`; os arquivos ficam em `<userData>/WidevineCdm/<versão>/_platform_specific/linux_x64/libwidevinecdm.so`.
- Com a CDM instalada, `navigator.requestMediaKeySystemAccess("com.widevine.alpha", …)` responde **ok** num contexto seguro (`https://`), com `SW_SECURE_DECODE`.
- A primeira execução baixa a CDM em segundo plano; o EME só a enxerga a partir da execução seguinte. O status em Configurações → Sobre é atualizado quando a versão aparece.

O que continua em aberto: VMP (EVS) para produção no Windows e no macOS, e a mesma verificação nessas duas plataformas. No Linux não há VMP.

## Adendo (20/10/2026)

O lado de código da assinatura VMP está no repositório: `app/scripts/after-pack.mjs` chama o cliente EVS em todo build empacotado de Windows e macOS, `app/scripts/evs.mjs` decide quando fazê-lo (e o teste unitário cobre os três casos), o `release.yml` instala o cliente e passa a conta por segredo, e um workflow dedicado cria a conta. O que falta é só a conta gratuita na castLabs, que é do dono do repositório; até ela existir, os builds de Windows e macOS saem com a CDM sem assinatura e assim o dizem no log. Procedimento em [DRM-EVS.md](../DRM-EVS.md).
