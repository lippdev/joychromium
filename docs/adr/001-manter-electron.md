# ADR-001: continuar no Electron

**Status:** aceito (out/2026)

## Contexto
O protótipo original era WPF + WebView2, que só existe no Windows. A migração para Electron (PRs #21–#28) trouxe Chromium atualizado em qualquer sistema.

## Decisão
Manter Electron como base.

## Alternativas
- **Tauri**: binário pequeno, mas usa o WebView do sistema (WebKit no macOS e no Linux). Perderia o Chromium igual nas três plataformas, o bloqueio por sessão do Ghostery e o comportamento uniforme do Gamepad API.
- **CEF em C++ ou .NET + CefSharp**: controle total, porém meses de trabalho, e o CefSharp é só Windows — o problema que acabamos de resolver.

## Consequências
Pacote de ~100 MB e uso de memória maior que um app nativo. Em troca, um único código e o motor atualizado por Dependabot (hoje pelo workflow do engine).
