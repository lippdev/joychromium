# JoyChromium — checklist do essencial

Estado em 2026-09-29 (após os PRs #12–#19). ✅ feito · 🔶 parcial · ⬜ falta · 🚫 precisa de algo externo (certificado, conta, hardware).

## 0. Como manter o usuário seguro sem lançar update toda hora

A ideia central: **o que muda rápido não pode viver no nosso executável**. Cada camada se atualiza sozinha:

| Camada | Quem atualiza | Estado |
|---|---|---|
| Motor Chromium (rede, JS, sandbox, TLS, CVEs) | **Microsoft**, via WebView2 Evergreen Runtime | ✅ Nunca fixamos o runtime; o app avisa se estiver abaixo de `SecurityPolicy.MinimumRuntimeVersion` (ou do mínimo da policy remota). |
| Listas de bloqueio (ads, malware, phishing) | **uBlock Origin** baixa listas sozinho | ✅ |
| Extensão uBO em si | **Nós, sem release**: `AdBlock.CheckForUpdateAsync` consulta a release oficial 1×/dia, baixa o zip, valida o manifest, troca no próximo start, mantém 2 versões | ✅ |
| Shell (nosso código C#) | **Velopack** via GitHub Releases; `release.yml` empacota em tag `v*`; baixa em background e instala ao fechar | ✅ código · 🚫 assinatura de código (precisa de certificado / Azure Trusted Signing) |
| Política de segurança remota | `policy/policy.json` + `.sig` (ECDSA P-256, `tools/PolicySigner`), buscada do `main`, verificada, cacheada, só aperta | ✅ Chave privada em `%USERPROFILE%\.joychromium\policy-signing.key` — **faça backup**. |

## 1. Segurança e privacidade

- ✅ uBlock Origin embutido e ligado por padrão; perfil isolado em `%LocalAppData%\JoyChromium`.
- ✅ Mensagens de páginas internas validadas por origem.
- ✅ Versão mínima do runtime com aviso.
- ✅ Erro de certificado = bloqueio, sem bypass.
- ✅ HTTPS-only com página interna de fallback por host/sessão.
- ✅ Só `http(s)` e `joychromium://` navegam; `file:`, `javascript:`, `edge:` viram busca ou são bloqueados.
- ✅ Permissões negadas por padrão com prompt navegável por controle e memória por site.
- ✅ Downloads em `Downloads\JoyChromium`, SmartScreen (`IsReputationCheckingRequired`), executáveis/scripts recusados, progresso no status.
- ✅ DevTools e menu de contexto off em Release.
- ✅ Popups limitados (3/s).
- ✅ Tracking prevention (Basic/Balanced/Strict).
- ✅ DNS-over-HTTPS opcional (Cloudflare/Quad9/Google).
- ✅ Abas privadas (`Ctrl+Shift+N`).
- ✅ Limpar dados de navegação.
- ✅ Senhas/autofill off por padrão, opt-in.
- ✅ Onboarding lista o que vem ligado.
- ✅ `policy.json` remoto assinado.

## 2. Robustez

- ✅ `ProcessFailed`: renderer → reload; engine → recria abas; travado → aviso.
- ✅ Página de erro interna (`error.html`).
- ✅ Abas dormindo após 10 min (não se tocando áudio), resume ao ativar.
- ✅ Logs diários com rotação de 7 dias + exportar diagnóstico.
- ✅ Sessão salva a cada 30 s e ao fechar.
- ✅ Teste de UI (FlaUI) no CI — já achou 3 bugs reais.

## 3. Navegação básica

- ✅ Abas, back/forward/reload/home, barra de endereço com busca, provedor configurável, nova aba interna, sessão.
- ✅ Favoritos (★, `Ctrl+D`, `LB+Y`), página `joychromium://favorites`, tiles na nova aba.
- ✅ Histórico (`history.jsonl`, `joychromium://history`, busca, remover, limpar).
- 🔶 Sugestões na barra: só com teclado/mouse. Falta integrar ao teclado do controle.
- ✅ Find in page (`Ctrl+F`).
- 🔶 Zoom por aba com teclado (`Ctrl +/-/0`); falta atalho no controle.
- ✅ Fullscreen de vídeo/F11 esconde o chrome.
- ✅ Menu de aba: duplicar, fechar outras, reabrir (`Ctrl+Shift+T`), mute; clique do meio fecha.
- ⬜ Arrastar aba para reordenar; fixar aba.
- ✅ Favicon na aba; ícone do app.

## 4. Controle e TV (o diferencial)

- ✅ Três modos por site (Spatial / Cursor / Arrows), lembrados por host, clique no stick direito alterna.
- ✅ Navegação espacial por script (`Assets/spatial.js`) com foco real.
- ✅ Cursor virtual com stick esquerdo, D-pad, A clica, stick direito rola.
- 🔶 **Precisa de teste com controle físico em sites reais** — o algoritmo espacial nunca foi usado de verdade.
- ⬜ Teclado do controle: layout por idioma, `.com`/`www.`, sugestões.
- ⬜ Glifos por tipo de controle (Xbox/PS/Switch), vibração.
- ⬜ Múltiplos controles; validar Gamepad API dentro da página.
- 🔶 Modo TV: F11 existe; falta overscan e escala global.
- ⬜ Pausar polling do controle quando minimizado.

## 5. Mídia

- 🚫 Widevine/DRM (Netflix, Prime, Disney+): precisa de conta para testar; a política de UA de TV pode limitar a 720p.
- ⬜ Media keys → `navigator.mediaSession`.
- ✅ Manter tela ligada durante mídia.
- ✅ Indicador de áudio e mute por aba.
- ⬜ Picture-in-picture; silenciar abas em background por opção.

## 6. Distribuição e atualização

- ✅ Velopack + `release.yml` (tag `v*`).
- 🚫 Assinatura de código (certificado).
- ⬜ Bootstrapper do WebView2 Runtime no instalador (Velopack suporta via `--runtime`/hook; não configurado).
- ⬜ Changelog gerado dos Conventional Commits na release.
- ⬜ Telemetria de crash opt-in.
- ✅ Checagem periódica de uBO e policy.

## 7. Acessibilidade e idioma

- ⬜ PT-BR/EN (`.resx`) — strings hoje em inglês, hardcoded.
- 🔶 `AutomationProperties.Name` nos botões principais (abas, novo, settings, ★); faltam os demais.
- ⬜ Alto contraste / escala de fonte.

## 8. Qualidade de código

- ✅ `MainWindow` dividido em parciais por responsabilidade; P/Invoke em `NativeInput.cs`.
- ✅ xUnit (`tests/JoyChromium.Tests`, 59 testes) + UI smoke no CI.
- ✅ Cache do NuGet e do uBO no CI.

---

## Próximos passos sugeridos

1. **Sessão com controle na mão** em YouTube TV, um site comum (ex.: Wikipedia) e um app de streaming — ajustar o score do `spatial.js` e a velocidade do cursor com base no uso.
2. Certificado de assinatura + `vpk` assinando → primeira release `v0.3.0` pela tag.
3. Bootstrapper do runtime WebView2 no instalador.
4. i18n PT-BR/EN.
5. Reordenar/fixar abas; media keys; overscan.
