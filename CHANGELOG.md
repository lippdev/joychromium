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
