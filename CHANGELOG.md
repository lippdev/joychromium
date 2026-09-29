# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/) e SemVer.

## [Unreleased]
- Convenções de repositório (fluxo de branches, commits, editorconfig, analisadores).
- Titlebar estilo Edge com abas; perfil persistente do WebView2.
- Tema com cores personalizáveis e página interna `joychromium://settings`.
- uBlock Origin embutido, provedor de busca configurável (Google padrão) e onboarding no primeiro uso.
- Página de nova aba com busca e atalhos; configuração de início, nova aba e home; restauração de sessão.
- Segurança base: HTTPS-only, bloqueio de erro de certificado, esquemas não-web bloqueados, prompt de permissões, downloads em pasta própria com bloqueio de executáveis, tracking prevention, DoH, abas privadas, limpar dados, DevTools off.
- Auto-update: app via Velopack/GitHub Releases, uBlock Origin via releases oficiais, e `policy.json` remoto assinado (ECDSA P-256) que só aperta regras.
- Robustez: recuperação de crash de renderer/engine, abas dormindo após 10 min, sessão salva a cada 30 s, logs com rotação e exportação de diagnóstico, teste de UI (FlaUI) no CI.
- Favoritos (★, Ctrl+D, LB+Y), histórico (`joychromium://history`), sugestões na barra de endereço, favicon nas abas, find in page (Ctrl+F), zoom (Ctrl +/-/0), fullscreen de vídeo esconde o chrome, reabrir aba fechada (Ctrl+Shift+T).
- Modos de controle por site: Spatial (foco entre elementos via script), Cursor (mouse virtual no stick esquerdo, scroll no direito) e Arrows (setas); clique no stick direito alterna e lembra por host.
- Refactor: `MainWindow` dividido em arquivos parciais por responsabilidade; P/Invoke em `NativeInput.cs`.
- Ícone do app, mute por aba com indicador de áudio (Ctrl+M), menu de contexto da aba (duplicar, fechar outras, reabrir), clique do meio fecha, tela não apaga durante mídia.
- Testes migrados para xUnit (`tests/JoyChromium.Tests`); cache de NuGet e do uBO no CI.
- Migração para Electron, fase 0: app/ com Electron 44 (Chromium 152), UA de TV, bloqueio via motor Ghostery, testes vitest + Playwright.
- Migração para Electron, fase 1: shell completo em `app/` — abas, titlebar, teclado do controle, páginas internas, segurança (https-only, permissões, downloads, popups), histórico/favoritos/sugestões, modos de controle (Spatial/Cursor/Arrows via Gamepad API + sendInputEvent), policy assinada, logs/diagnóstico, updater; e2e Playwright.
- Migração para Electron, fase 2: robô de atualização — Dependabot diário para o Electron, auto-merge quando o CI (Windows+Linux, e2e real) passa, release automática com instaladores Windows/Linux em GitHub Releases e auto-update via electron-updater; `policy-sign.mjs` substitui o signer .NET.
