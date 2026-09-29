# JoyChromium — checklist do essencial

Estado em 2026-09-29. ✅ feito · 🔶 parcial · ⬜ falta. Ordem dentro de cada bloco é a prioridade sugerida.

## 0. Como manter o usuário seguro sem lançar update toda hora

A ideia central: **o que muda rápido não pode viver no nosso executável**. Cada camada se atualiza sozinha:

| Camada | Quem atualiza | Como garantir |
|---|---|---|
| Motor Chromium (rede, JS, sandbox, TLS, CVEs) | **Microsoft**, via WebView2 Evergreen Runtime, em background, sem ação nossa | Nunca fixar o runtime (não usar "Fixed Version"). Checar versão mínima no start e avisar se estiver muito atrás. |
| Listas de bloqueio (ads, malware, phishing) | **uBlock Origin** baixa listas sozinho (padrão: a cada poucos dias) | Ligar as listas de malware/phishing por padrão; não empacotar listas estáticas. |
| Extensão uBO em si | **Nós, mas sem release**: o app checa a release mais nova no GitHub do gorhill e atualiza a pasta em `%LocalAppData%` | Só aceitar zip por HTTPS do repositório oficial, validar `manifest.json`, manter a versão anterior para rollback. |
| Shell (nosso código C#) | **Auto-update do app** | MSIX + App Installer (checa um `.appinstaller` numa URL a cada N horas, delta, assinado) ou Velopack (GitHub Releases, delta, sem loja). Recomendo Velopack pelo custo zero de infra. |
| Política de segurança (flags, lista de esquemas bloqueados, sites forçados a HTTPS, versão mínima do runtime) | **Arquivo remoto** `policy.json` no GitHub Pages/raw, assinado com chave nossa (Ed25519), cache local com fallback | Permite apertar regras sem release. Nunca permite afrouxar além do default embutido. |

Com isso, um release do app passa a ser só para feature ou bug do shell. Segurança "de motor" chega pelo Windows Update do runtime, sem você fazer nada.

## 1. Segurança e privacidade

- ✅ uBlock Origin embutido, ligado por padrão.
- ✅ Perfil isolado em `%LocalAppData%\JoyChromium` (não compartilha com Edge).
- ✅ Mensagens de páginas internas validadas por origem (`Pages.IsInternal`).
- ⬜ **Versão mínima do runtime**: `CoreWebView2Environment.GetAvailableBrowserVersionString()` no start; abaixo do mínimo → aviso e link do runtime.
- ⬜ **Erro de certificado = bloqueio**: `ServerCertificateErrorDetected` → sempre `Cancel`, sem botão "continuar assim mesmo" (público é TV/família).
- ⬜ **HTTPS-only**: em `NavigationStarting`, `http://` → tenta `https://`; se falhar, mostra tela interna perguntando.
- ⬜ **Esquemas e destinos bloqueados**: `file://`, `ftp://`, `javascript:` em barra de endereço, `chrome://`, `edge://`, exceto `edge://` nunca. Só `http(s)` e `joychromium://`.
- ⬜ **Permissões**: `PermissionRequested` → câmera/mic/localização/notificações **negados por padrão**; prompt navegável por controle com "lembrar por site". Persistir em `settings.json`.
- ⬜ **Downloads**: `DownloadStarting` → pasta fixa `Downloads\JoyChromium`, `IsReputationCheckingRequired = true` (SmartScreen), bloquear executáveis (`.exe .msi .bat .ps1 .scr`) por padrão, UI de progresso no status bar.
- ⬜ **DevTools, menu de contexto e status bar desligados** em Release (`AreDevToolsEnabled`, `AreDefaultContextMenusEnabled`).
- ⬜ **Popups e novas janelas**: já viram aba; adicionar limite (máx. N por gesto) para evitar popup-bomb.
- ⬜ **Tracking prevention** do WebView2: `Profile.PreferredTrackingPreventionLevel = Balanced/Strict`.
- ⬜ **DNS-over-HTTPS** via `AdditionalBrowserArguments` (`--enable-features=DnsOverHttps --dns-over-https-templates=…`) com provedor escolhível.
- ⬜ **Modo privado**: perfil InPrivate (`IsInPrivateModeEnabled`) por aba, visual distinto na titlebar.
- ⬜ **Limpar dados**: `Profile.ClearBrowsingDataAsync` por categoria, com atalho na Settings.
- ⬜ **Senhas/autofill**: decidir política. Padrão sugerido: `IsPasswordAutosaveEnabled = false`, `IsGeneralAutofillEnabled = false` (TV compartilhada). Opt-in na Settings.
- ⬜ **Onboarding mostra o que está ligado** (adblock, tracking prevention, HTTPS-only) e o que precisa de opt-in.
- ⬜ **Fetch remoto de policy.json assinado** (ver bloco 0).

## 2. Robustez

- ⬜ `ProcessFailed` (renderer/browser crash) → recriar a aba com a mesma URL e aviso; não derrubar o app.
- ⬜ Timeout/erro de rede → página interna `joychromium://error` navegável por controle (hoje só muda o status bar).
- ⬜ Aba "dormindo": após N min em background, `TrySuspendAsync()`; acordar ao ativar.
- ⬜ Log estruturado em `%LocalAppData%\JoyChromium\logs` com rotação, e botão "exportar diagnóstico" na Settings.
- ⬜ Salvar sessão periodicamente (não só no `Closing`) para sobreviver a queda de energia.
- ⬜ Teste de UI automatizado em CI (FlaUI ou WinAppDriver) cobrindo: abrir, nova aba, settings, onboarding.

## 3. Navegação básica

- ✅ Abas, back/forward/reload/home, barra de endereço com busca, provedor configurável.
- ✅ Nova aba interna com atalhos; sessão salva/restaurada.
- ⬜ **Favoritos**: adicionar/remover (Y longo ou botão ★), lista em `joychromium://favorites`, aparecer como atalhos na nova aba.
- ⬜ **Histórico**: registrar `NavigationCompleted` (título, URL, data) em SQLite ou JSONL; página `joychromium://history` com busca; "limpar".
- ⬜ **Sugestões na barra de endereço** a partir de histórico + favoritos (sem enviar teclas ao provedor de busca por padrão).
- ⬜ **Find in page** (`Ctrl+F` / teclado do controle → `CoreWebView2.Find` na API atual, ou script fallback).
- ⬜ **Zoom** por aba (`ZoomFactor`) com atalho no controle (RT+D-pad?).
- ⬜ **Fullscreen** de vídeo: `ContainsFullScreenElementChanged` → esconder chrome; `B` sai.
- ⬜ **Downloads** UI (ver bloco 1).
- ⬜ Menu de aba: duplicar, fixar, fechar outras, reabrir fechada (`Ctrl+Shift+T`).
- ⬜ Arrastar aba para reordenar (mouse) e mover com controle (LT/RT + Y).
- ⬜ Favicon na aba (`FaviconChanged`).
- ⬜ Título da janela e ícone do app (hoje é o ícone padrão do .NET).

## 4. Controle e TV (o diferencial)

- 🔶 D-pad manda setas via `SendInput` — só funciona com a janela em foco e depende do site tratar setas.
- ⬜ **Navegação espacial**: tentar `--enable-spatial-navigation` / `--enable-blink-features=SpatialNavigation` em `AdditionalBrowserArguments` (verificar se ainda existe no Chromium atual); se não, script injetado que calcula o próximo elemento focável na direção.
- ⬜ **Cursor virtual**: modo alternável (clicar no stick) que move um cursor e envia `mouse_event`/`SendMouseInput` do WebView2 para sites sem foco decente. Scroll no stick direito.
- ⬜ **Perfis de controle por site** (ex.: YouTube TV usa setas; sites normais usam cursor virtual), salvos no `settings.json`.
- ⬜ Teclado do controle: layout por idioma, `.com`/`www.`, emoji, colar, sugestões.
- ⬜ Vibração/feedback e ícone do botão nos hints, detectar layout (Xbox/PlayStation/Switch) para mostrar os glifos certos.
- ⬜ Suporte a mais de um controle e a **Gamepad API** dentro da página (WebView2 já expõe; validar com jogos HTML5).
- ⬜ **Modo TV**: janela sem borda em fullscreen (F11 / Start longo), overscan configurável, fonte e escala maiores (`ZoomFactor` global).
- ⬜ Screensaver/idle: pausar polling do controle quando minimizado.

## 5. Mídia

- ⬜ Verificar **Widevine/DRM** (Netflix, Prime, Disney+) no WebView2 — funciona no Evergreen, mas alguns serviços checam UA e limitam a 720p; testar com o UA de TV.
- ⬜ Chaves de mídia do teclado/controle → `navigator.mediaSession` (play/pause, próximo).
- ⬜ Manter tela ligada durante vídeo (`SetThreadExecutionState`).
- ⬜ Picture-in-picture / aba de áudio com indicador na aba (`IsDocumentPlayingAudio`) e mute por aba.
- ⬜ Áudio: silenciar abas em background opcionalmente.

## 6. Distribuição e atualização

- ⬜ **Instalador + auto-update** (Velopack). Canal `stable` e `beta`. Checa a cada 6 h e no start; aplica na próxima abertura; nunca interrompe vídeo.
- ⬜ **Assinatura de código** (certificado ou Azure Trusted Signing) para evitar SmartScreen no instalador.
- ⬜ Instalar o WebView2 Runtime se faltar (bootstrapper da Microsoft no instalador).
- ⬜ Release automatizado no CI: tag `vX.Y.Z` → build → assina → cria Release com changelog gerado dos Conventional Commits.
- ⬜ Telemetria de crash **opt-in** (só stack + versão, sem URLs).
- ⬜ Verificar atualização do uBO (bloco 0) e do `policy.json` no mesmo timer.

## 7. Acessibilidade e idioma

- ⬜ Interface em PT-BR e EN (recursos `.resx`), idioma detectado do Windows, escolha no onboarding.
- ⬜ Leitor de tela: `AutomationProperties.Name` nos botões, foco visível já existe.
- ⬜ Alto contraste / escala de fonte.

## 8. Qualidade de código (dívidas conhecidas)

- ⬜ `MainWindow.xaml.cs` tem ~550 linhas: extrair `TabManager`, `ControllerInput`, `VirtualKeyboard`, `InternalPagesBridge`.
- ⬜ Testes: trocar o smoke test por xUnit; cobrir `Settings`, `Theme`, `SearchEngine`, `Pages`; adicionar teste de UI.
- ⬜ CI: cache do NuGet e do zip do uBO; job separado de `dotnet format`.

---

## Sugestão de ordem para os próximos PRs

1. **Segurança base** (bloco 1, itens de certificado, esquemas, permissões, downloads, DevTools off, tracking prevention) — um PR, sem UI nova além de prompts simples.
2. **Auto-update do app + do uBO + policy.json** (blocos 0 e 6) — resolve o problema de "não posso lançar update sempre".
3. **Robustez** (crash de renderer, página de erro, sessão periódica).
4. **Favoritos + histórico + sugestões**.
5. **Navegação espacial / cursor virtual** — o item mais difícil e o mais importante para a proposta do produto.
6. Refactor do `MainWindow` antes de crescer mais.
