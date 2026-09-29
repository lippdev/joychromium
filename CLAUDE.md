# JoyChromium

Navegador controller-first para TV, em Electron (Chromium) + TypeScript. Windows e Linux com o mesmo código. Todo o app vive em `app/`.

## Comandos (em `app/`)
- Build: `npm run build`
- Rodar: `npm start`
- Typecheck: `npm run typecheck`
- Testes unitários (vitest): `npm test`
- Teste e2e (Playwright abre o Electron real com perfil descartável): `npm run test:e2e`
- Instalador local (sem publicar): `npm run dist`

## Regras
- Siga `CONTRIBUTING.md`: GitHub Flow, branch `tipo/descricao`, PR com squash, sem push direto na `main` (protegida; exige os checks `electron (windows-latest)` e `electron (ubuntu-latest)`).
- Commits em Conventional Commits.
- Antes de concluir uma tarefa: `npm run typecheck`, `npm test` e `npm run test:e2e` passando.
- Lógica pura fica em `src/shared/` (ou módulos de `src/main/` sem Electron, como `history.ts`, `store.ts`, `log.ts`) e ganha teste unitário; o que toca o Electron é coberto pelo e2e.
- Testes e2e leem o estado por `globalThis.joy` (`tabs()`, `command()`, `pageEval()`), porque as views das abas não são alcançáveis pelo Playwright.

## Arquitetura
- `src/shared/`: regras puras (settings, segurança, policy, sugestões, controle, páginas).
- `src/main/`: processo principal — `shell.ts` (janela, layout das views, comandos, permissões, downloads), `tabs.ts` (uma `WebContentsView` por aba + hooks de segurança), `pageBridge.ts` (mensagens das páginas internas), `protocol.ts` (esquema `joychromium://`), `adblock.ts`, `policyService.ts`, `updater.ts`, `history.ts`, `store.ts`, `log.ts`.
- `src/preload/`: bridges sandboxed — **não podem importar módulos**; constantes de canal ficam inline.
- `src/renderer/chrome.ts`: UI do shell (abas, toolbar, teclado, prompts) e Gamepad API.
- `src/assets/`: páginas internas (HTML) e `spatial.js` (navegação espacial + cursor virtual, injetado em toda página).

## Atualizações e release
- Dependabot abre PR (`chore(deps): bump electron …`) → `ci.yml` → `auto-merge.yml` mergeia → `release.yml` deriva a versão da última tag, cria a tag, gera nsis/AppImage/deb e publica na GitHub Release → `electron-updater` instala no usuário. Release manual: `workflow_dispatch` em `release.yml`.
- `policy/policy.json` é assinado com `node app/scripts/policy-sign.mjs sign <keyfile> policy/policy.json` (chave em `%USERPROFILE%\.joychromium\policy-signing.key`, fora do repo).
- Não subir `node_modules/`, `dist/`, `release/`.
