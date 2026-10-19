# ADR-007: adaptador de plataforma

**Status:** aceito (out/2026)

## Contexto
Decisões por sistema estavam espalhadas: glifos de fonte do Windows para os botões da janela, `homedir()/Downloads`, lista de downloads só com extensões de Windows e Linux, atalhos com `ctrlKey` fixo.

## Decisão
- `src/shared/platform.ts`: regras puras (modificador de atalho, controles nativos, extensões perigosas por sistema, URL da linha de comando), com teste unitário.
- `src/main/platform.ts`: único módulo que lê `process.platform`; monta opções da janela, menu de aplicação e caminhos.

## Consequências
Nenhum `process.platform` fora de `platform/`. Um sistema novo é um arquivo novo, não uma varredura pelo código.
