# Widevine de produção: a assinatura VMP (EVS)

O JoyChromium distribui o motor castLabs ECS, que instala a CDM Widevine, e no Linux isso basta: a CDM do Linux não usa VMP. Em **Windows e macOS** o caminho é outro — o Netflix, o Prime Video e os demais serviços só entregam licença para um app cuja CDM esteja com uma assinatura VMP válida. Quem emite essa assinatura é o serviço **EVS** da castLabs: gratuito, mas exige conta.

Este documento é o procedimento inteiro. Ele é a parte do E10-02 que sobra depois do código, que já está no repositório.

## O que já está pronto

- O motor é o ECS (`devDependencies.electron` e `build.electronDownload.customDir`, os dois apontando para a mesma versão `+wvcus`).
- `app/scripts/after-pack.mjs` chama o cliente EVS em todo build empacotado de Windows e macOS, **antes** da assinatura ad-hoc do macOS (a ordem importa: no macOS o VMP entra antes do `codesign`, no Windows depois; como aqui não há assinatura de código no Windows, ADR-010, o hook serve aos dois).
- `app/scripts/evs.mjs` decide o que fazer e tem teste unitário (`app/tests/unit/evs.test.ts`): Linux não assina, Windows e macOS assinam quando há conta, e sem conta o build **não falha** — ele segue e escreve no log, com o motivo, que a CDM saiu sem assinatura.
- `.github/workflows/release.yml` instala o cliente (`pip install castlabs-evs`) nos runners de Windows e macOS, imprime se a conta está presente (nunca o valor) e passa `EVS_ACCOUNT_NAME`/`EVS_PASSWD` para o build pelo ambiente, não pela linha de comando.
- `.github/workflows/evs-account.yml` cria a conta pelo próprio GitHub Actions: não é preciso instalar Python em máquina nenhuma.

## O que falta: a conta

Três segredos no repositório, em **Settings → Secrets and variables → Actions**:

| Segredo | O que é |
|---|---|
| `EVS_ACCOUNT_NAME` | o nome da conta, curto e sem espaços (o mesmo que o hook usa) |
| `EVS_PASSWD` | a senha dessa conta |
| `EVS_EMAIL` | o e-mail que recebe o código de confirmação |

Depois, em **Actions → EVS account → Run workflow**:

1. `mode = help` — imprime a interface exata do cliente instalado (útil se os argumentos mudarem).
2. `mode = signup` — cria a conta; a castLabs manda um código para o `EVS_EMAIL`.
3. `mode = confirm` com o código — a conta fica confirmada e o cliente já guarda os tokens.

A partir daí, toda release de Windows e macOS assina a CDM no `afterPack`. A prova está no log do job `build`: a linha `VMP signed …` no lugar de `VMP signing skipped: …`.

Regras de conduta do serviço, do próprio wiki da castLabs: uma conta basta (use redefinição de senha se perder o acesso), não force assinatura nova quando a existente vale, e a assinatura correta para este app é `streaming` — o `sign-pkg` usa esse tipo por padrão, e o suporte a licença persistente saiu da CDM do navegador a partir do ECS v42.

## Como conferir depois de assinar

Na máquina, com o app instalado:

```bash
python3 -m castlabs_evs.vmp verify-pkg "/caminho/para/JoyChromium.app"   # macOS
python -m castlabs_evs.vmp verify-pkg "C:\Program Files\JoyChromium"      # Windows
```

Um `ok` aqui ainda não é a prova final: a prova é o serviço entregar licença. Abra o Netflix e o Prime Video na máquina e veja se o vídeo toca — é o critério de aceite do E10-02.

## Por que o build não falha sem a conta

Um build que assina a CDM só quando o segredo existe precisa dizer em voz alta quando não assinou; o contrário — falhar — travaria todo PR de terceiros, onde segredo não chega, e todo build local de quem não é da castLabs. Por isso o hook registra o motivo e o workflow imprime `EVS account: present/missing` antes de construir. O que não pode acontecer é o silêncio: uma release com a CDM sem assinatura é exatamente o caso que estraga o DRM sem ninguém notar.

## Referências

- Wiki do EVS (regras, interface do cliente, ordem da assinatura): <https://github.com/castlabs/electron-releases/wiki/EVS>
- Decisão de DRM do projeto: [ADR-009](adr/009-drm-com-castlabs.md)
- Sem assinatura de código da Apple no momento: [ADR-010](adr/010-sem-assinatura-de-codigo.md)
- UA de TV × DRM: [DRM-UAS.md](DRM-UAS.md)
