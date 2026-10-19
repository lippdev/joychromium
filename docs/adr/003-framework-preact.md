# ADR-003: Preact no renderer

**Status:** aceito (out/2026), decidido pelo dono do produto.

## Contexto
O shell era um único arquivo TypeScript que montava DOM à mão. O redesign cria várias telas com componentes repetidos (barra, abas, teclado, diálogos, cards) e estados que mudam junto com o processo principal.

## Decisão
Preact + TypeScript, com o estado vindo do main em um snapshot e o polling do controle em um hook.

## Alternativas
- **React**: mesma API, ~10x o tamanho; o shell fica aberto o tempo todo, então o custo importa.
- **Sem framework**: o que existia; não escala para as telas do PRD.

## Consequências
- ~4 KB de runtime no shell.
- Bibliotecas feitas para React (como a de navegação espacial da Norigin) só entram via `preact/compat`, se valerem a pena.
