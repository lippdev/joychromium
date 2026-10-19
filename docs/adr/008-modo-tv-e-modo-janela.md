# ADR-008: modo TV como padrão, modo janela como alternativa

**Status:** aceito (out/2026), decidido pelo dono do produto.

## Contexto
O app é feito para TV e controle, mas também é usado numa mesa.

## Decisão
O app abre em tela cheia, no modo TV, com tipografia grande, barra que se esconde sobre o conteúdo e foco desenhado para o D-pad. `F11` (ou `Esc` quando nada está aberto) alterna para o modo janela, que usa os mesmos componentes com densidade menor e é lembrado entre execuções.

## Consequências
Toda tela é desenhada e testada primeiro no modo TV. O modo janela não pode depender de interação que só existe com mouse.
