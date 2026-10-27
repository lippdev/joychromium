# UA de TV × DRM: resolução por serviço (E10-05)

> **Escopo:** medição por serviço é trabalho futuro. DRM/streaming não está validado para o alpha Windows e não deve ser anunciado como pronto. Veja [STATUS.md](STATUS.md).

O JoyChromium se identifica como TV em toda requisição (`JoyChromiumTV/1.0 (TV; SmartTV)`, ver
`app/src/main/tvIdentity.ts`, ADR-009). Alguns serviços escolhem o player, a variante do manifesto ou o nível de
DRM a partir desse cabeçalho — para melhor (interface de 10 pés) ou para pior (resolução menor). Este documento
guarda a medição e a regra que decide o UA por host.

**Estado:** o mecanismo está pronto e testado; **nenhuma medição foi feita ainda** (não há conta nos serviços neste
repositório). Toda linha da tabela está como *a medir*.

## Como a regra funciona

- Lista curada em `app/src/shared/streamingUa.ts` (`STREAMING_HOSTS`): host exato ou subdomínio. Um domínio que só
  *parece* um da lista (`netflix.com.exemplo`) não casa.
- **Configurações → Mídia e DRM → "UA de desktop nos serviços de streaming"** (`streamingDesktopUa` em
  `settings.json`, **ligado por padrão** desde 27/10/2026). Ligado, um host da lista carrega com o UA do Chrome, sem os tokens `Electron/` e `JoyChromium/` e **sem** o marcador de
  TV; todo o resto continua com o UA de TV.
- A decisão é por documento: vale para o carregamento que o shell inicia e para um link clicado dentro da página.
  Outras abas e outros hosts da mesma sessão não mudam.
- A lista é a política: um host só entra com uma linha desta tabela mostrando ganho, e sai se uma medição posterior
  não confirmar.

## Procedimento de medição

O que se mede é a resolução que o player realmente decodifica — `video.videoWidth` × `video.videoHeight` —, não o
que a interface do serviço anuncia. Numa stream por MSE, esses valores acompanham a representação ativa, mas um
serviço pode decodificar abaixo do que anuncia; o número medido é o que vale.

Pré-requisitos: build com Widevine instalado (ADR-009), conta no serviço e rede. O nível de DRM, o codec e o HDCP
influenciam a resolução tanto quanto o UA, então cada linha registra os dois lados (TV e desktop) na mesma máquina,
no mesmo dia.

1. Abra o app uma vez (`cd app && npm start`), faça login no serviço e feche. A sessão fica no perfil
   (`~/.config/JoyChromium` no Linux, `%APPDATA%\JoyChromium` no Windows, `~/Library/Application Support/JoyChromium`
   no macOS).
2. Com a regra **desligada**, rode o script abaixo apontando para um título do serviço e anote a maior resolução que
   aparecer em 2 minutos. Repita para cada serviço.
3. Ligue a regra em Configurações e repita exatamente os mesmos títulos, no mesmo horário do dia.
4. Preencha a tabela com data, SO, versão do app (Chromium) e quem mediu.

O script fica no repositório e imprime, no fim, a linha pronta para a tabela:

```sh
cd app
npm run build
npm run measure:ua -- --url "https://www.netflix.com/watch/<id>" --seconds 120
```

Ele abre o app, navega até o título, amostra `video.videoWidth × video.videoHeight` a cada 2 s durante o tempo pedido,
mostra o maior valor e o UA que a página recebeu (`JoyChromiumTV/` presente = identidade de TV), e termina com a linha
de markdown preenchida com o lado medido, a data e o host. Em Windows e macOS rode com o mesmo perfil do app
(`JOYCHROMIUM_DATA` é herdado do ambiente quando definido).

Se o progresso parar de andar, o script avisa: dê play pelo controle (A) e a medição continua.

O UA que a página recebeu pode ser conferido no mesmo perfil com
`globalThis.joy.pageEval("navigator.userAgent")`; com a regra ligada ele não contém `JoyChromiumTV/`.

## Tabela de resolução por serviço

Todas as linhas estão **a medir**. `—` significa que ninguém mediu ainda.

| Serviço | Host | Máx. com UA de TV | Máx. com UA desktop | Ganho? | Data | Quem mediu | Notas |
|---|---|---|---|---|---|---|---|
| Netflix | `netflix.com` | a medir | a medir | — | — | — | |
| Prime Video | `primevideo.com` | a medir | a medir | — | — | — | |
| Disney+ | `disneyplus.com` | a medir | a medir | — | — | — | |
| Max | `max.com` | a medir | a medir | — | — | — | |
| Globoplay | `globoplay.globo.com` | a medir | a medir | — | — | — | |
| Apple TV | `tv.apple.com` | a medir | a medir | — | — | — | |
| Hulu | `hulu.com` | a medir | a medir | — | — | — | |
| Paramount+ | `paramountplus.com` | a medir | a medir | — | — | — | |
| Crunchyroll | `crunchyroll.com` | a medir | a medir | — | — | — | |
| YouTube (controle) | `www.youtube.com` | a medir | não se aplica | — | — | — | Fora da lista de propósito: o app abre `youtube.com/tv`, que existe por causa do UA de TV. |

## Decisão

- **27/10/2026:** com a CDM assinada (0.1.1-alpha), o Prime Video recusou tocar com o UA de TV: erro 7132, "versão
  antiga ou incompatível deste navegador". Por isso `streamingDesktopUa` passou a `true` por padrão, a migração 5 → 6
  liga a regra nos perfis existentes, e o UA de desktop passou a ser o do Chrome, sem os tokens do Electron e do app.
- Fora de `STREAMING_HOSTS`, o UA de TV continua valendo: é o que entrega a interface de 10 pés (`youtube.com/tv`).
- Uma linha com ganho mantém o host na lista, com data e autor registrados. Se o ganho valer para todo mundo, o
  padrão de `defaultSettings()` passa a `true` no mesmo PR que atualiza a tabela.
- Um host sem ganho sai de `STREAMING_HOSTS`; a tabela registra que os dois lados empataram.

## O que este item não prova

Nenhuma resolução foi medida: não há conta nos serviços aqui. O teste e2e
(`app/tests/e2e/streaming-ua.spec.ts`) prova só o mecanismo — um host da lista recebe `navigator.userAgent` sem o
marcador de TV, um host fora dela (e um domínio que apenas imita um da lista) recebe o UA de TV, inclusive quando a
navegação vem de um link dentro da página, e desligar a regra devolve o UA de TV ao host da lista. Se cada serviço
ganha ou perde resolução com o UA de desktop continua em aberto até a tabela acima ser preenchida.
