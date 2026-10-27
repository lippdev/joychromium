# Estado do alpha Windows

Retrato de 27/10/2026, na publicação da **0.1.0-alpha**: a primeira versão pública, uma pre-release no GitHub com instaladores Windows x64 e arm64, gerada pelo `release.yml`.

## Escopo atual

O alpha destina-se somente ao Windows 10/11, x64 e arm64. macOS, Linux, Steam Deck, Flathub, Wayland, Orca e VoiceOver são itens futuros e não bloqueiam o alpha Windows. Acompanhe-os em [ROADMAP.md](ROADMAP.md).

## O que a 0.1.0-alpha tem de prova

- CI Windows (`electron (windows-latest)`) verde no commit da release: typecheck, unitários, teste do script de versão, e2e com o Electron real e o smoke test do instalador, que instala o `.exe` e confirma que o app abre.
- Motor castLabs ECS `v44.9.3+wvcus`, que corrige o alerta de certificados eMudhra (Electron < 44.9.1).
- CDM assinada pela conta EVS no build da release (o log do job `build` registra a assinatura VMP).

## O que ainda fecha o alpha

- Sessão em TV com controle físico, registrada pelo [roteiro](CONTROLLER-TEST.md).
- Widevine/DRM em serviço real no Windows. Até haver reprodução verificada, streaming pago não está pronto nem prometido.
- Atualização: abaixo da 1.0 o app não se atualiza sozinho; Configurações → Sobre leva à página de releases.

A ausência de assinatura do instalador pode mostrar o aviso do SmartScreen. Ela não substitui nenhuma das validações acima.

## Evidência histórica anterior à mudança de escopo

O registro anterior descrevia typecheck, unitários, e2e, CI multiplataforma, pacotes Linux/macOS, Wayland e Orca. Esses resultados pertencem à revisão então testada e servem apenas como histórico. Não os use para afirmar que a branch atual passou, nem que macOS/Linux são plataformas suportadas pelo alpha.

Os guias [RELEASE](RELEASE.md), [INSTALL](INSTALL.md), [WAYLAND](WAYLAND.md), [SCREEN-READER](SCREEN-READER.md), [DRM-UAS](DRM-UAS.md) e [DRM-EVS](DRM-EVS.md) preservam informações técnicas e gates de trabalho futuro.
