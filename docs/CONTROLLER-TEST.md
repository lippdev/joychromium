# Roteiro de teste com controle físico (E6-07)

Este é o roteiro da seção 3 do [PRD](PRD.md) para rodar em uma TV de verdade, com o controle na mão. O e2e cobre o mesmo caminho com um gamepad sintético, mas só o controle real mostra o que o navegador não consegue simular: latência, pontuação da navegação espacial, velocidade do cursor e o que cada botão faz em cada serviço.

## Antes de começar

- Instale a versão que quer testar (veja o [INSTALL.md](INSTALL.md)) e abra o app uma vez para a CDM do Widevine baixar; o DRM só funciona a partir da segunda execução.
- Tenha à mão o controle que você usa no sofá (Xbox, DualSense, Switch Pro ou 8BitDo) e o teclado físico, para comparar.
- Anote a versão: aparece em Configurações → Sobre e no log em `logs/` da pasta de dados.
- Comece com um perfil limpo (apague `settings.json` do diretório de dados, ou use outro usuário do sistema), para o onboarding aparecer.

## O que registrar em cada passo

Para cada cenário: **passou / falhou**, quantos segundos demorou a primeira resposta e qualquer momento em que você precisou do teclado ou do mouse. Se algo falhar, diga qual botão apertou e o que esperava ver.

1. **Primeiro boot.** Abre em tela cheia, onboarding na tela, o app mostra qual controle detectou e quais botões chegaram. Escolha o idioma e o buscador só com o D-pad e o A.
2. **Tela inicial → YouTube TV.** Abra o app de TV pelo D-pad, entre num vídeo, veja se a barra se esconde sozinha sobre o conteúdo e se o B volta ao estado anterior. Anote se o foco "pula" algum card (pontuação do `spatial`).
3. **Digitar sem teclado físico.** Pesquise "previsão do tempo" com o teclado virtual (incluindo uma palavra com acento, como "ação"), navegue pelas sugestões e abra o resultado. Marque se o cursor virtual (modo Spatial) chegou em tudo.
4. **Três abas.** Abra três abas, alterne pelo seletor em grade e feche uma, só com o controle. Veja se as miniaturas aparecem e se o foco começa na aba ativa.
5. **Permissão de microfone.** Abra um site que peça o microfone (ou o teste do WebRTC), percorra o prompt com o D-pad e escolha "permitir sempre". Confirme em Configurações que a permissão ficou salva para o site.
6. **Atualização.** Em Windows/Linux: com uma versão nova publicada, deixe o download acontecer, feche o app e reabra; no `.deb`/`.rpm` use **Reiniciar e instalar** em Configurações → Sobre e confirme o pedido de senha. No macOS, o app deve avisar e abrir a página da release.
7. **Streaming com DRM.** Abra a Netflix, entre na conta e toque um título. Registre a resolução que o player mostra e o que a linha "Widevine (DRM)" diz em Configurações → Sobre.

Leitor de tela é o outro lado da mesma sessão: o roteiro de Orca, Narrator e VoiceOver está em [SCREEN-READER.md](SCREEN-READER.md).

## Onde ajustar o quê

- **Foco pulando ou preso:** a pontuação está em `spatial.js` (`score`), injetado em toda página; o ajuste vale para o app inteiro, então anote o site e o elemento.
- **Cursor muito rápido ou lento:** velocidade máxima em `MAX_CURSOR_SPEED` (`src/shared/controllerInput.ts`), e o modo de entrada de cada site em Configurações → Entrada.
- **Botão sem função:** o mapeamento está em `src/shared/controllerInput.ts` e `src/shared/shortcuts.ts`; o rótulo por família de controle em `src/shared/controllerGlyphs.ts`.
- **Vibração:** `vibrationActuator` não está implementado (E6-09, Could). Se fizer falta, é o item do backlog a puxar.

## Resultado

Registre o resultado em uma issue com o título `teste com controle: <versão> · <SO> · <controle>` e, para cada cenário que falhou, um item com o passo e o comportamento observado. Os ajustes de pontuação e velocidade viram PRs pequenos com o número do cenário no título.
