# ADR-010: sem assinatura de código por enquanto

**Status:** aceito (out/2026), decidido pelo dono do produto.

## Contexto
Assinar exige contas pagas (Apple Developer, Azure Trusted Signing) e manutenção de segredos no CI.

## Decisão
Não assinar. No macOS os builds recebem apenas assinatura ad-hoc (`scripts/after-pack.mjs`), sem a qual o Apple Silicon recusa o app como "danificado".

## Consequências
- Windows mostra o SmartScreen; macOS exige "Abrir Assim Mesmo" em Ajustes → Privacidade e Segurança.
- **No macOS 15 (Sequoia) o instalador da imagem de disco recusa a instalação automática**: "Este Mac não conseguiu verificar o app, então nada foi instalado". Medido no build 0.1.1: `codesign --verify --deep --strict` diz *valid on disk, satisfies its Designated Requirement* (a assinatura ad-hoc está íntegra), e `spctl -a -vvv -t exec` diz *rejected* — o que falta é o Developer ID e a notarização, não a assinatura.
- Por isso a imagem de disco leva um `LEIA-ME.txt` e um `install-macos.command`: arrastar o app para Aplicativos (ou rodar o script) e abrir uma vez com o botão direito → Abrir, ou `xattr -dr com.apple.quarantine /Applications/JoyChromium.app`. Depois disso o app abre normalmente.
- Sem notarização não existe instalação de dois cliques no macOS. Quem quiser isso precisa da conta de desenvolvedor Apple (US$ 99/ano) e das credenciais no CI: `notarytool` com a senha de app, mais `mac.identity` apontando para o certificado Developer ID.
- O auto-update do macOS não funciona (Squirrel.Mac exige Developer ID): o app lê `latest-mac.yml`, avisa e abre a página da release.
- `docs/INSTALL.md` explica os dois casos.
- Voltar atrás é uma decisão de produto: as tarefas congeladas estão no PRD (E9-01 a E9-03).
