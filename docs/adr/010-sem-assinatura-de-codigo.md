# ADR-010: sem assinatura de código por enquanto

**Status:** aceito (out/2026), decidido pelo dono do produto.

## Contexto
Assinar exige contas pagas (Apple Developer, Azure Trusted Signing) e manutenção de segredos no CI.

## Decisão
Não assinar. No macOS os builds recebem apenas assinatura ad-hoc (`scripts/after-pack.mjs`), sem a qual o Apple Silicon recusa o app como "danificado".

## Consequências
- Windows mostra o SmartScreen; macOS exige "Abrir Assim Mesmo" em Ajustes → Privacidade e Segurança.
- O auto-update do macOS não funciona (Squirrel.Mac exige Developer ID): o app lê `latest-mac.yml`, avisa e abre a página da release.
- `docs/INSTALL.md` explica os dois casos.
- Voltar atrás é uma decisão de produto: as tarefas congeladas estão no PRD (E9-01 a E9-03).
