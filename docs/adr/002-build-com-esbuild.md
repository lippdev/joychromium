# ADR-002: build com esbuild

**Status:** aceito (out/2026). Substitui a ideia original de usar `electron-vite`.

## Contexto
O build era `tsc` mais um script que copiava arquivos. Preloads sandboxed não podem importar módulos, então os nomes de canal de IPC eram duplicados à mão em cada preload, e o renderer não podia usar nenhuma biblioteca.

O PRD previa `electron-vite`. Ao implementar, ele se mostrou desalinhado com a arquitetura de páginas internas: o app serve o shell e as páginas por um protocolo próprio (`joychromium://`), com vários HTMLs independentes e sem hashing de assets, enquanto o `electron-vite` assume um único `index.html` por bundle e um servidor de desenvolvimento separado.

## Decisão
Um script de build com esbuild (`app/scripts/build.mjs`) empacota três alvos:
- processo principal (CommonJS, `electron`, `electron-updater` e o bloqueador como externos);
- preloads (CommonJS), que assim importam o contrato de `src/shared`;
- shell UI (ESM, Preact embutido) e cópia de `src/assets` para `dist/assets`.

`tsc --noEmit` continua sendo o typecheck.

## Consequências
- O contrato de IPC deixou de ser duplicado nos preloads.
- O renderer pode usar Preact e o design system.
- Sem servidor de desenvolvimento nem hot reload: `npm start` recompila tudo em menos de um segundo.
- O layout de `dist/` continua o mesmo, então o protocolo e o empacotamento não mudaram.
