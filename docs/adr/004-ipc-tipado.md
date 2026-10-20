# ADR-004: contrato de IPC tipado e validado

**Status:** aceito (out/2026)

## Contexto
Os comandos do renderer chegavam ao main sem validação, e os nomes de canal eram repetidos nos preloads porque eles não podiam importar nada.

## Decisão
- Um único módulo `src/shared/ipc.ts` declara os canais e os tipos.
- Todo comando é validado em `src/shared/commands.ts` antes de rodar; um comando malformado é registrado no log e descartado.
- O preload, agora empacotado, importa o contrato em vez de repetir nomes.

## Consequências
Um renderer com defeito não injeta comando inválido, e um erro de digitação aparece no log em vez de virar um `switch` que não faz nada.

## Emenda (out/2026, E3-03)
O estado deixou de ir como snapshot completo a cada mudança (D15). O renderer avisa que está ouvindo (`shell:ready`); o main responde uma vez com o snapshot (`shell:state`) e, dali em diante, manda só as áreas que mudaram (`shell:patch`): `tabs`, `status`, `chrome`, `overlay`, `keyboard`, `find`, `suggestions` e `settings`. A divisão fica em `src/shared/statePatch.ts`, que também aplica o patch sobre o estado que o renderer já tem; um campo novo em `ShellState` não compila até ser colocado numa área. Como o snapshot só sai depois do `ready`, um patch nunca chega antes dele.
