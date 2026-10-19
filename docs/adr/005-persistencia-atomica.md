# ADR-005: persistência em JSON com escrita atômica

**Status:** aceito (out/2026)

## Contexto
`settings.json`, `session.json` e `history.jsonl` eram gravados diretamente. Uma queda de energia no meio da escrita deixava o arquivo pela metade, e duas instâncias podiam se sobrescrever.

## Decisão
- Escrita atômica: arquivo temporário, `fsync` e `rename`.
- A versão anterior de `settings.json` fica como `settings.backup.json`.
- `schemaVersion` com migrações puras em `src/shared/settings.ts`.
- Um marcador `running.json` detecta fechamento inesperado.
- Instância única por perfil via `requestSingleInstanceLock`.

## Alternativas
SQLite exigiria um módulo nativo recompilado por sistema e arquitetura — peso desproporcional para três arquivos pequenos.

## Consequências
Nenhuma configuração corrompida em teste de kill; migrações versionadas; uma única instância escrevendo.
