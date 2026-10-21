# Onde o app está

Retrato de 21/10/2026, com a `main` em `c7add78` e a release **0.1.3** publicada. Este documento é o resumo executivo: o que está pronto, o que está provado, o que ainda não está, e de quem é cada pendência. O detalhe de arquitetura e o backlog completo continuam no [PRD](PRD.md).

## Em uma frase

Navegador de TV multiplataforma (Windows, macOS e Linux) que abre em tela cheia com o controle como entrada principal, com abas, busca com teclado virtual e sugestões, bloqueio de anúncios e rastreadores por nível, Widevine para streaming pago, PT-BR e EN, e atualização automática — instalável por `.exe`, `.dmg`, AppImage, `.deb`, `.rpm` e Flatpak, sem custo de assinatura nem de serviço.

## Cobertura do PRD

| Épico | Must | Should | Could |
|---|---|---|---|
| E1 Correções multiplataforma | 9/9 | 1/1 | — |
| E2 Empacotamento e CI | 5/5 | 4/4 | 1/1 |
| E3 Fundação de arquitetura | 5/5 | 3/3 | — |
| E4 Robustez e desempenho | 1/1 | 1/1 | 2/2 |
| E5 Design system e redesign | 4/4 | 3/3 | — |
| E6 Experiência com controle | 4/5 | 2/2 | 2/2 |
| E7 Internacionalização e a11y | 1/1 | 1/1 | 1/1 |
| E8 Privacidade e observabilidade | 2/2 | 1/1 | 1/1 |
| E9 Distribuição | — | — | 2/2 |
| E10 Mídia e DRM | 2/3 | 2/2 | 1/1 |
| E11 Documentação | 2/2 | 1/1 | — |

**35 de 37 Must, 19 de 19 Should, 10 de 10 Could.** Os dois Must que faltam são E6-07 (sessão com controle físico na TV) e E10-02 (conta gratuita da castLabs para assinar a CDM no Windows e no macOS). Nenhum dos dois é código.

## O que está provado, e como

| Prova | Onde | Resultado |
|---|---|---|
| Tipos, unitários e build | `npm run typecheck`, `npm test`, `npm run build` | limpos; **100 testes em 11 arquivos** |
| Fluxo completo do app | `npm run test:e2e` (Playwright com o Electron real) | **48 passando, 2 pulados** (os dois que precisam de pacote do sistema: árvore AT-SPI e Orca) |
| CI nos três SOs | `.github/workflows/ci.yml` | `electron (ubuntu/windows/macos)` verdes em todo PR, com e2e em cada um |
| Boot até a tela inicial | `metrics.spec.ts` em todo PR | **1,01–1,18 s** (meta 2 s; falha acima de 4 s) |
| D-pad até o foco | idem | **p95 de 16–33 ms** (meta 50 ms; falha acima de 100 ms) |
| Instalação e abertura | smoke do pacote no CI | `.deb` instalado e aberto no Linux; `.exe` instalado e aberto no Windows |
| Wayland nativo | `npm run test:wayland` no CI | o app sobe em compositor Wayland sem XWayland e as duas views pintam |
| Leitor de tela | `orca.spec.ts` + `atspi-tree.py` no CI Linux | o Orca fala o fluxo de busca de ponta a ponta, com o texto de cada elemento conferido |
| Segurança | `security.spec.ts` | popup vira aba, rajada é cortada, `javascript:` não roda, download perigoso é cancelado |
| DRM (Linux) | app instalado com Widevine | CDM 4.10.3112.0 baixada, EME responde `ok` |
| Assinatura do mac | `ci.yml`, job de macOS | assinatura ad-hoc válida (`codesign --verify --deep --strict` passa); `spctl` recusa, como esperado sem notarização |
| Empacotamento Flatpak | `bundle (flatpak)` no CI | bundle construído a cada PR que toca `flatpak/` ou `app/` |

## O que **não** está provado

Vale tratar como desconhecido, não como pronto:

- **Instalação e abertura no macOS de verdade.** O `.dmg` é construído e tem `LEIA-ME.txt` e `install-macos.command`, e a assinatura ad-hoc foi medida num runner, mas ninguém abriu o app num Mac e registrou o resultado.
- **DRM em produção no Windows e no macOS.** A CDM sem assinatura VMP não é aceita pelos serviços. Medido só no Linux.
- **Controle físico, TV, latência na mão e a pontuação real da navegação espacial.** O e2e usa um gamepad sintético.
- **Narrator e VoiceOver.** O Orca está automatizado; os outros dois não têm como ser capturados sem uma pessoa.
- **Steam Deck e o modo Gaming** (gamescope, HDR).
- **Resolução entregue por Netflix e Prime** com o UA de TV: a tabela de [DRM-UAS.md](DRM-UAS.md) segue "a medir".
- **Flathub**: o bundle é construído no CI, mas não há publicação nem revisão.

## Pendências, por dono

### Só o dono do repositório resolve

1. **E10-02 — conta da castLabs (gratuita).** Cadastrar `EVS_ACCOUNT_NAME`, `EVS_PASSWD` e `EVS_EMAIL` em Settings → Secrets and variables → Actions; rodar **Actions → EVS account** com `mode=signup` e depois `mode=confirm` com o código que chega por e-mail. Procedimento e verificação em [DRM-EVS.md](DRM-EVS.md). Depois disso, o log do job `build` passa a dizer `VMP signed …` em vez de `VMP signing skipped …`.
2. **E6-07 — sessão com controle físico na TV.** Roteiro em [CONTROLLER-TEST.md](CONTROLLER-TEST.md); o que falhar vira issue, e o ajuste de `spatial` e da velocidade do cursor é código.
3. **E2-03 — check obrigatório no macOS.** Settings → Branches → adicionar `electron (macos-latest)` aos required checks (a API de branch protection recusa com 403 para o token do app).
4. **E9-05 — publicação no Flathub.** Conta, repositório `flathub/dev.lipp.joychromium` e revisão de terceiros ([flatpak/README.md](../flatpak/README.md)).
5. **Passadas manuais restantes:** Narrator e VoiceOver ([SCREEN-READER.md](SCREEN-READER.md)), Steam Deck ([WAYLAND.md](WAYLAND.md)) e a tabela de resolução ([DRM-UAS.md](DRM-UAS.md), com `npm run measure:ua`).

### Do lado do agente, quando aparecer

- Corrigir o que a sessão na TV revelar — é o único trabalho de produto que ainda pode nascer de um teste.
- Acompanhar a primeira release depois da conta EVS e confirmar a assinatura nos logs.
- Preparar os arquivos da submissão ao Flathub quando houver conta (a origem `type: dir` vira `type: git` pinada no commit, e as dependências npm viram fontes offline com `flatpak-node-generator`).
- Publicar versões novas a pedido, e a 1.0 quando o produto estiver no ponto.

## Versões e releases

A versão vem da última tag `v*`, nunca do `package.json` (que fica em 0.1.0 de propósito: `main` é protegida e nada é commitado de volta). Publicado até agora: **0.1.1, 0.1.2 e 0.1.3**, todas marcadas como *Pre-release* — abaixo de 1.0 o build não alimenta o canal `latest`, e o app avisa que a novidade vem da página de releases. A **0.1.0 foi apagada** (release e tag) porque o updater dela registrava `HttpError: 406`; quem baixar hoje pega a 0.1.3.

O que cada versão traz está nas notas geradas a partir dos Conventional Commits (`app/scripts/release-notes.mjs`). A 0.1.3 tem Windows x64 e arm64, macOS x64 e arm64 (dmg + zip), Linux AppImage, `.deb` e `.rpm` em x86_64 e aarch64.

Quando sair a 1.0, duas coisas mudam: a release deixa de ser pré-release (o updater instalado passa a enxergar versões novas) e quem estiver em 0.1.x precisa baixar a 1.0 uma vez à mão.

## Custo

Zero, por decisão registrada no [ADR-010](adr/010-sem-assinatura-de-codigo.md): repositório público (runners e Releases gratuitos, inclusive os de macOS), EVS da castLabs, Flathub, listas da Ghostery e a policy no próprio repositório. O que fica de fora por ser pago: Developer ID e notarização no macOS, certificado no Windows e qualquer SaaS de telemetria. As consequências estão aceitas: SmartScreen no Windows, Gatekeeper no macOS e sem auto-update no macOS.

## Como rodar tudo

```bash
cd app
npm run typecheck && npm test && npm run build
xvfb-run --auto-servernum --server-args="-screen 0 1600x900x24" npx playwright test   # Linux; nos outros SOs, sem o xvfb-run
npm run test:wayland                    # compositor Wayland headless
npm run measure:ua -- --url "<página de vídeo>" --seconds 120
```

Instaladores locais: `npm run dist` (sem publicar).
