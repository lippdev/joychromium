# ADR-004: contrato de IPC tipado e validado

**Status:** aceito (out/2026)

## Contexto
Os comandos do renderer chegavam ao main sem validação, e os nomes de canal eram repetidos nos preloads porque eles não podiam importar nada.

## Decisão
- Um único módulo `src/shared/ipc.ts` declara os canais e os tipos.
- Todo comando é validado em `src/shared/commands.ts` antes de rodar; um comando malformado é registrado no log e descartado.
- O preload, agora empacotado, importa o contrato em vez de repetir nomes.

## Consequências
Um renderer com defeito não injeta comando inválido, e um erro de digitação aparece no log em vez de virar um `switch` que não faz nada. O estado completo continua indo como snapshot; patches por área ficam para quando o volume justificar (E3-03).
