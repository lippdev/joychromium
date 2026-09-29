# JoyChromium

Navegador Windows controller-first (WPF + WebView2) com marcador de user-agent de TV. Não é fork do Chromium.

## Comandos
- Build: `dotnet build JoyChromium.csproj -c Release`
- Testes unitários (xUnit): `dotnet test tests/JoyChromium.Tests -c Release`
- Teste de UI (FlaUI, abre o app): `dotnet run --project tests/UiSmoke -c Release -- bin/Release/net8.0-windows10.0.19041.0/JoyChromium.exe`
- Formatação: `dotnet format JoyChromium.csproj --verify-no-changes`
- Rodar: `dotnet run --project JoyChromium.csproj`

## Regras
- Siga `CONTRIBUTING.md`: GitHub Flow, branch `tipo/descricao`, PR com squash, sem push direto na `main`.
- Commits em Conventional Commits.
- Nunca commitar direto na `main`; criar branch antes.
- Warnings são erros; não suprimir sem justificativa em comentário.
- Lógica nova em classes separadas e testáveis (ex.: `Settings.cs`, `SecurityPolicy.cs`, `History.cs`, `ControllerInput.cs`), cobertas em `tests/JoyChromium.Tests`.
- `MainWindow` é uma classe parcial dividida por responsabilidade: `MainWindow.xaml.cs` (ctor, start, chrome da janela), `.Tabs`, `.Navigation`, `.Keyboard`, `.PageTools`, `.Security`, `.Bridge` (mensagens das páginas internas), `.Controller`, `.Maintenance`. Código novo vai no arquivo do tema certo; P/Invoke fica em `NativeInput.cs`.
- Antes de concluir uma tarefa: build + `dotnet test` + format passando (e o UI smoke quando mexer no shell).
- Não subir `bin/`, `obj/`, `.vs/`.

## Migração para Electron (em andamento)
- O shell novo vive em `app/` (Electron + TypeScript). O C# na raiz é o app legado até a migração terminar.
- Comandos em `app/`: `npm run build`, `npm test` (vitest), `npm run test:e2e` (Playwright abre o Electron de verdade), `npm run typecheck`.
- Lógica pura fica em módulos sem dependência do Electron (ex.: `src/main/tvIdentity.ts`) e ganha teste unitário; o que toca o Electron é coberto pelo e2e.
- Arquitetura do app Electron: `src/shared/` (regras puras, testadas com vitest), `src/main/` (processo principal: `shell.ts` janela+comandos, `tabs.ts` abas, `pageBridge.ts` mensagens das páginas internas, `protocol.ts` esquema `joychromium://`), `src/preload/` (bridges sandboxed — não podem importar módulos; constantes inline), `src/renderer/chrome.ts` (UI do shell + Gamepad API), `src/assets/` (HTML das páginas internas + `spatial.js`).
- Testes e2e leem o estado por `globalThis.joy` (`tabs()`, `command()`, `pageEval()`), porque as views das abas não são alcançáveis pelo Playwright.
- Fluxo de release do Electron: Dependabot abre PR (`chore(deps): bump electron …`) → `ci.yml` (Windows + Linux, e2e real) → `auto-merge.yml` mergeia → `release.yml` faz bump de patch, cria a tag e publica instaladores (nsis, AppImage, deb) na GitHub Release → `electron-updater` entrega. Release manual: `workflow_dispatch` em `release.yml` com o nível do bump. `policy.json` é assinado com `node app/scripts/policy-sign.mjs sign <keyfile> policy/policy.json`.
