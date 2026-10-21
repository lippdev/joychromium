# ADR-010: sem assinatura de código

**Status:** aceito (out/2026), decidido pelo dono do produto. **Revisto em 21/10/2026:** deixou de ser "por enquanto" e passou a ser uma decisão de custo — o projeto não paga nada, em nenhum ponto.

## Contexto
Assinar exige contas pagas (Apple Developer Program, US$ 99/ano; Azure Trusted Signing ou certificado OV/EV no Windows) e manutenção de segredos de assinatura no CI. Nada do que o app entrega depende disso: o que depende de conta — a assinatura VMP do Widevine, pelo EVS da castLabs — é gratuito, e o resto da distribuição (GitHub Actions em repositório público, GitHub Releases, Flathub) também.

## Decisão
Não assinar. No macOS os builds recebem apenas assinatura ad-hoc (`scripts/after-pack.mjs`), sem a qual o Apple Silicon recusa o app como "danificado".

## Consequências
- Windows mostra o SmartScreen; macOS exige "Abrir Assim Mesmo" em Ajustes → Privacidade e Segurança.
- **No macOS 15 (Sequoia) o instalador da imagem de disco recusa a instalação automática**: "Este Mac não conseguiu verificar o app, então nada foi instalado". Medido no build 0.1.1: `codesign --verify --deep --strict` diz *valid on disk, satisfies its Designated Requirement* (a assinatura ad-hoc está íntegra), e `spctl -a -vvv -t exec` diz *rejected* — o que falta é o Developer ID e a notarização, não a assinatura.
- Por isso a imagem de disco leva um `LEIA-ME.txt` e um `install-macos.command`: arrastar o app para Aplicativos (ou rodar o script) e abrir uma vez com o botão direito → Abrir, ou `xattr -dr com.apple.quarantine /Applications/JoyChromium.app`. Depois disso o app abre normalmente.
- **Não existe caminho de dois cliques no macOS neste projeto**: ele exigiria a conta de desenvolvedor Apple (US$ 99/ano), `notarytool` com senha de app e `mac.identity` no CI, e a decisão de custo corta isso. Não é uma pendência com data; é uma consequência aceita.
- O auto-update do macOS não funciona (Squirrel.Mac exige Developer ID): o app lê `latest-mac.yml`, avisa e abre a página da release.
- `docs/INSTALL.md` explica os dois casos, e a release leva o caminho do macOS no rodapé das notas.
- Voltar atrás é uma decisão de produto que envolve gastar dinheiro: as tarefas congeladas estão no PRD (E9-01 e E9-02).
