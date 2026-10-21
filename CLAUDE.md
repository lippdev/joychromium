# JoyChromium

Navegador controller-first para TV, em Electron (Chromium) + TypeScript. Windows, macOS e Linux com o mesmo código; abre em tela cheia (modo TV) por padrão. Todo o app vive em `app/`.

## Comandos (em `app/`)
- Build: `npm run build` (esbuild empacota main, preloads e shell, e copia `src/assets`)
- Rodar: `npm start`
- Typecheck: `npm run typecheck`
- Testes unitários (vitest): `npm test`
- Teste e2e (Playwright abre o Electron real com perfil descartável): `npm run test:e2e`
- Instalador local (sem publicar): `npm run dist`

## Regras
- Siga `CONTRIBUTING.md`: GitHub Flow, branch `tipo/descricao`, PR com squash, sem push direto na `main` (protegida; exige os checks `electron (windows-latest)`, `electron (ubuntu-latest)` e `electron (macos-latest)`).
- Commits em Conventional Commits.
- Antes de concluir uma tarefa: `npm run typecheck`, `npm test` e `npm run test:e2e` passando (no Linux, o e2e roda sob `xvfb-run`).
- Decisão por sistema operacional só em `src/shared/platform.ts` (puro, testado) ou `src/main/platform.ts` (único lugar que lê `process.platform`).
- Lógica pura fica em `src/shared/` (ou módulos de `src/main/` sem Electron, como `history.ts`, `store.ts`, `log.ts`) e ganha teste unitário; o que toca o Electron é coberto pelo e2e.
- Testes e2e leem o estado por `globalThis.joy` (`tabs()`, `command()`, `pageEval()`), porque as views das abas não são alcançáveis pelo Playwright.

## Arquitetura
- `src/shared/`: regras puras (settings, segurança, policy, sugestões, controle, páginas, plataforma).
- `src/main/`: processo principal — `platform.ts` (opções de janela, menu, caminhos e extensões por SO), `shell.ts` (janela, layout das views, comandos, permissões, downloads), `tabs.ts` (uma `WebContentsView` por aba + hooks de segurança), `pageBridge.ts` (mensagens das páginas internas), `protocol.ts` (esquema `joychromium://`), `adblock.ts`, `policyService.ts`, `updater.ts`, `history.ts`, `store.ts`, `log.ts`.
- `src/preload/`: bridges sandboxed, empacotados pelo esbuild — **podem importar `src/shared`** (use o contrato de `shared/ipc.ts`, não repita nomes de canal).
- `src/renderer/shell/`: UI do shell em Preact (barra, teclado, menu rápido, seletor de abas, toasts) e Gamepad API; `src/assets/design/tokens.css` é o design system de todas as páginas.
- `src/assets/`: páginas internas (HTML) e `spatial.js` (navegação espacial + cursor virtual, injetado em toda página).

## Atualizações e release
- O motor é o castLabs ECS (`github:castlabs/electron-releases#v…+wvcus`), fora do npm: `engine-update.yml` abre o PR de bump. A versão fica em `devDependencies.electron` e em `build.electronDownload.customDir`, e as duas precisam mudar juntas.
- PR de bump (`chore(deps): bump electron …`) → `ci.yml` → `auto-merge.yml` mergeia → `release.yml` deriva a versão da última tag, cria a tag, gera nsis/dmg-zip/AppImage/deb/rpm e publica na GitHub Release → `electron-updater` instala no usuário. Release manual: `workflow_dispatch` em `release.yml`.
- Sem assinatura de código, por decisão de custo (ver `docs/PRD.md`, ADR-010): no macOS o build recebe assinatura ad-hoc via `scripts/after-pack.mjs` e o updater só avisa da versão nova. Nada no projeto pode depender de conta ou serviço pago — a assinatura VMP do Widevine (EVS) é gratuita e é a única conta do caminho.
- `policy/policy.json` é assinado com `node app/scripts/policy-sign.mjs sign <keyfile> policy/policy.json` (chave em `~/.joychromium/policy-signing.key` no Linux e no macOS, `%USERPROFILE%\.joychromium\policy-signing.key` no Windows, sempre fora do repo — procedimento e backup em `docs/POLICY.md`).
- Flatpak: `flatpak/dev.lipp.joychromium.yml` (runtime freedesktop 26.08 + `org.electronjs.Electron2.BaseApp`, Electron do `node_modules`) e `.github/workflows/flatpak.yml`, que só constrói o bundle como artefato. Dentro do Flatpak o updater não baixa nada: a tela de atualizações diz que quem atualiza é o Flathub (`FLATPAK_UPDATE_STATUS`). Publicar no Flathub depende de conta e revisão — o que falta está em `flatpak/README.md`.
- Release e instaladores: `docs/RELEASE.md`. Roteiro de teste com controle na TV: `docs/CONTROLLER-TEST.md`. Wayland nativo (smoke do CI) e Steam Deck: `docs/WAYLAND.md`.
- Não subir `node_modules/`, `dist/`, `release/`.
