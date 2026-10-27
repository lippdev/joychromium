# Roteiro de teste com leitor de tela (E7-03)

> **Escopo:** documentação de validação histórica e futura. Orca (Linux) e VoiceOver (macOS) estão fora do alpha Windows e não são gates atuais. Qualquer validação Windows com Narrator também deve ser tratada como trabalho explícito, não como evidência já concluída. Veja [ROADMAP.md](ROADMAP.md).

O critério do item é o fluxo de busca utilizável com leitor de tela — Orca no Linux, Narrator no Windows e VoiceOver no macOS. Três camadas dão evidência disso, e cada uma prova uma coisa diferente:

| Camada | Onde | O que prova |
|---|---|---|
| DOM | `app/tests/e2e/screen-reader.spec.ts` | Que nomes, papéis e ordem o app publica; roda nos três SOs do CI |
| Árvore AT-SPI | `app/tests/e2e/atspi-tree.py`, chamado pelo mesmo spec | Que o Linux publica essa árvore de verdade, que é a que o Orca percorre |
| Fala | `app/tests/e2e/orca.spec.ts` | Que o Orca **diz** os nomes, na ordem certa, quando o foco anda |

As duas primeiras dizem o que o app declara. A terceira diz o que uma pessoa ouve, e é a única que pega o caso de um elemento com nome correto na árvore que o leitor nunca anuncia porque o foco da janela ficou em outra view. Foi exatamente esse o defeito que ela encontrou na barra de endereço (ver "O que o Orca fala", abaixo).

O que continua fora do alcance de qualquer automação — velocidade, verbosidade, voz, se a frase faz sentido no contexto, e os leitores de Windows e macOS — está no roteiro manual no fim deste documento.

## O que o Orca fala (captura)

Números desta captura: Ubuntu 24.04, Orca 46.1, speech-dispatcher 0.12.0~rc2, app em `language: "en"`, janela em modo Janela, perfil com um favorito (`Example`) e uma entrada de histórico (`Example 1`). O Orca fala com o `speech-dispatcher`, que roda com o módulo de saída `dummy` e `LogLevel 5`; o servidor registra o texto recebido de cada utterance, e é esse texto que o teste lê. Áudio nenhum é produzido.

Fala literal, entre aspas, na ordem em que sai:

| Passo | O que o Orca diz |
|---|---|
| Boot, campo de busca da nova aba com foco | "main content", "search Search", "Search entry Search or type an address." |
| **Y** no controle: teclado do controle | "ADDRESSD-PAD MOVES · A TYPES · B CLOSES · Y SWITCHES.", "Browse mode" |
| Tab dentro do teclado | "Close push button.", "q push button.", "w push button." |
| Teclado fecha e o foco volta para a página | a página se anuncia de novo: "main content", "search Search", "Search entry Search or type an address." |
| Foco na barra de endereço | "form", "Address entry joychromium://newtab selected." |
| Digitar "exam" e **seta para baixo** | "Controller keyboard dialog", "SUGGESTIONS List with 2 items", "Example https://example.com/" |
| Foco no primeiro card da nova aba | "List with 6 items.", "YouTube TV push button." |
| Página pede permissão de localização | "Permission dialog", "Deny push button." (às vezes o Orca entra em "Say All" na carga da página e só volta a anunciar o foco quando uma tecla o interrompe; aí a primeira fala é o botão seguinte, depois de um Tab) |

Quatro coisas que a captura mostrou e que a árvore sozinha não mostrava — três viraram correção neste item, uma ficou registrada como limitação:

- **A barra de endereço não era anunciada pelo nome.** Antes da correção, o mesmo passo dizia só "joychromium://newtab" e "selected": o valor, sem dizer que era o campo de endereço. O Chromium guarda o foco por view, e a view da aba seguia com o foco da janela enquanto o controle do shell recebia o foco do DOM; o Orca recebia os eventos de texto da barra e nenhum evento de foco. A correção está em `src/main/shell.ts` (`focusChrome`) com o aviso do renderer em `src/renderer/shell/app.tsx`: quando o foco entra em um controle do shell, o documento do shell assume o foco da janela.
- **O prompt de permissão não tomava o foco.** A página pede a permissão, então o foco está na view da aba, e o `autofocus` do diálogo não vale para um documento sem foco: o leitor não dizia nada. O diálogo agora foca o primeiro botão ao montar (`PermissionDialog` em `app.tsx`), o que também entrega o foco ao shell.
- **A estrela do favorito entrava no nome.** O título do favorito vinha como `★ Example` e o Orca lia "★ Example https://example.com/". A estrela virou decoração no chip (`aria-hidden`), como o selo do card no #67; o nome agora é "Example https://example.com/".
- **A lista de sugestões não é anunciada quando aparece.** O foco continua no campo, e o leitor só passa a falar da lista quando o campo entrega o foco a ela — seta para baixo ou D-pad. É o comportamento certo para quem digita, mas significa que quem digita sem descer não sabe que há sugestões. Fica registrado como limitação conhecida, não como correção deste item.

O nome do diálogo do teclado chega depois do conteúdo: no instante em que o teclado abre, o Orca lê a dica ("D-PAD MOVES…") e só diz "Controller keyboard dialog" quando o foco desce para a primeira tecla. A ordem é do Orca, não do app — o diálogo tem nome e papel na árvore, e o teste cobra os dois.

## Como rodar a captura

Pacotes, uma vez por máquina Linux:

```bash
sudo apt-get install -y orca speech-dispatcher speech-dispatcher-audio-plugins \
  python3-pyatspi python3-gi gir1.2-atspi-2.0 at-spi2-core dbus
```

O teste cuida do resto sozinho: um `dbus-daemon` próprio, o `speech-dispatcher` com um `speechd.conf` mínimo (`LogLevel 5`, `AudioOutputMethod "alsa"`, `AddModule "dummy" "sd_dummy"`, `DefaultModule dummy`), um `~/.asoundrc` que aponta o dispositivo ALSA padrão para `null` — o módulo dummy abre um dispositivo de áudio mesmo sem sintetizar nada —, e o Orca com `--replace --speech-system speechdispatcher`.

```bash
cd app
xvfb-run --auto-servernum --server-args="-screen 0 1600x900x24" npx playwright test tests/e2e/orca.spec.ts
```

Sem os pacotes, o spec se marca como *skipped* com o motivo, em vez de fingir que ouviu.

Para ver a fala com os próprios olhos, sem o Playwright, rode a mesma pilha à mão e leia o log do servidor:

```bash
export XDG_RUNTIME_DIR=/tmp/orca/run HOME=/tmp/orca/home   # HOME com o .asoundrc do ALSA null
speech-dispatcher -C /tmp/orca/conf -l 5 -t 0 &
orca --replace --speech-system speechdispatcher &
grep -o "Incoming text: |[^|]*|" "$XDG_RUNTIME_DIR/speech-dispatcher/log/speech-dispatcher.log"
```

Cada linha `Incoming text` é uma utterance; o `LogLevel 5` é o que a registra. As marcas `<mark name="..."/>` são do realce palavra a palavra do Orca e saem na leitura.

## O que a captura não diz

- **Velocidade, verbosidade e voz.** O texto é o mesmo em qualquer taxa; se a frase fica longa demais para o ouvido, se o leitor repete o nome do campo a cada tecla, se a voz sintética é compreensível à distância da TV — nada disso passa por um módulo que descarta o áudio.
- **Narrator (Windows) e VoiceOver (macOS).** Não há como capturar a fala deles em CI sem uma pessoa; os cenários no fim deste documento continuam valendo para os dois.
- **O áudio de verdade.** O `dummy` prova o que seria dito, não que o caminho de áudio funciona (dispositivo, volume, mistura).
- **Contexto.** O leitor pode dizer a coisa certa na hora errada: dois nomes iguais seguidos, uma região anunciada fora de propósito, o anúncio que chega atrasado. Só ouvindo.

## Antes de começar (passada manual)

- Use um perfil limpo (apague `settings.json` do diretório de dados ou use outro usuário do sistema) e conclua o onboarding; a tela inicial precisa ter histórico e favoritos para as listas aparecerem.
- Escolha o idioma em Configurações antes de começar e anote qual usou: os nomes mudam com ele — a captura automática usa inglês ("Address", "Search", "SUGGESTIONS").
- Deixe o leitor no padrão de fábrica (velocidade e verbosidade incluídas) e **não** olhe a tela no primeiro passo de cada cenário: o que vale é o que ele fala.
- Tenha o teclado físico e, se possível, o controle à mão: o mesmo caminho é feito duas vezes, uma por cada entrada.

## O que registrar em cada passo

Para cada cenário: **passou / falhou**, o que o leitor falou (texto literal, entre aspas) e o que você esperava ouvir. Se um controle não for anunciado como deveria, diga qual tecla apertou e qual elemento estava em foco. Uma gravação de áudio do cenário que falhou ajuda mais do que a descrição.

## Cenário 1 — barra de endereço e teclado do controle

1. Abra o app e navegue até a barra de endereço com Tab (fora do modo TV) ou com o D-pad (no modo TV).
   Deve ser anunciado: **"Endereço, campo de texto"** (Orca e NVDA) ou **"Endereço, campo de edição de texto"** (VoiceOver), seguido do conteúdo atual e da dica do campo. No Orca em inglês a captura diz **"Address entry joychromium://newtab selected."**
2. Com o campo focado, o teclado virtual abre. A digitação física continua funcionando.
   Deve ser anunciado: o teclado **não** deve roubar a fala do campo; o foco tem de continuar no endereço.
3. Feche o teclado, aperte **Y** no controle (ou Tab até o teclado, sem focar o campo).
   Deve ser anunciado: **"Teclado do controle, diálogo"** e, ao percorrer com Tab, cada tecla pelo próprio nome ("q, botão", "espaço, botão", "apagar, botão", "OK, botão"). A captura automática confirma as teclas ("q push button"); o nome do diálogo chega depois da dica, o que é ordem do Orca.
4. Digite algo que exista no histórico ou nos favoritos — "exam", por exemplo — e pare antes de confirmar.
   Deve ser anunciado: **"SUGESTÕES, caixa de lista"** e, ao descer com o D-pad ou com a seta para baixo a partir do campo, cada item pelo título e pela URL ("Example, item de lista"). O item em foco tem de ser anunciado como selecionado, e o A (ou Enter) abre o item em foco.
5. Digite uma busca com acento — "ação", por exemplo — usando só o teclado do controle e confirme com OK.
   Deve ser anunciado: o resultado da navegação e o novo título da página.

## Cenário 2 — busca na tela inicial

1. Abra uma aba nova (a tela inicial) e vá até o campo de busca.
   Deve ser anunciado: **"Pesquisar, campo de texto"**, dentro de uma região de busca chamada "Pesquisar" — no Orca em inglês, "search Search" e "Search entry Search or type an address."
2. Digite uma busca e envie.
   Deve ser anunciado: o carregamento e o resultado. A busca precisa ser possível sem enxergar a tela em nenhum momento.
3. Volte à tela inicial e percorra a lista de aplicativos, depois a de favoritos e a de "Continuar assistindo".
   Deve ser anunciado: **"Aplicativos, lista, N itens"** (o rótulo é o título da seção) e, em cada item, o nome do card sem a letra do selo — "YouTube TV, botão" e não "Y YouTube TV, botão".

## Cenário 3 — histórico e favoritos

1. Abra o histórico (rodapé da tela inicial) e vá até o campo de filtro.
   Deve ser anunciado: **"Pesquisar no histórico, campo de texto"**.
2. Filtre por uma palavra e percorra os resultados.
   Deve ser anunciado: **"Histórico, lista"** com a posição de cada item ("1 de 3"), o título, a URL e o botão de remover com nome próprio.
3. Repita nos favoritos: o campo deve ser anunciado como "Pesquisar nos favoritos" e a lista como "Favoritos".

## Por leitor

**Orca (Linux).** A captura automática é ele: `tests/e2e/orca.spec.ts`. Para ouvir com fones, `orca --replace` com a sessão normal (o `speech-dispatcher` do sistema, sem o módulo dummy). Fora do modo TV, o foco é o do teclado; no modo TV, o Orca segue o cursor virtual do `spatial.js`, então use o D-pad e confirme que o foco acompanha. Para ouvir a árvore sem depender do foco, `orca -t` (modo de teste) imprime o que ele recebe.

**Narrator (Windows).** Win+Ctrl+Enter liga e desliga. Ative o modo de exame (seta para baixo com o Narrator) para percorrer as listas, e Win+Ctrl+O para o modo de leitura. O Narrator anuncia "região de busca" e "lista com N itens" no Windows 11; anote se a contagem bate com o número de cards na tela.

**VoiceOver (macOS).** Cmd+F5 liga e desliga; VO é Ctrl+Option. Para as listas, use o rotor (VO+U) e escolha "Listas": o app deve aparecer com Aplicativos, Favoritos e Continuar assistindo. No WebContentsView das abas, confirme que o VoiceOver entra na página (VO+seta direita) e não fica preso na barra.

## Onde ajustar o quê

- **Nome de um controle do shell:** a chave de tradução em `src/shared/i18n.ts` (bloco `a11y.*`) e o `aria-label` em `src/renderer/shell/app.tsx` ou `keyboard.tsx`.
- **Nome de um campo ou lista de página interna:** o `data-i18n-aria-label` no HTML (`src/assets/newtab.html`, `history.html`, `favorites.html`), aplicado pelo `src/assets/i18n.js`; os itens de lista saem do `src/assets/list.js` e do `card()` da nova aba.
- **Ordem de foco:** o foco dos overlays é do `src/renderer/shell/gamepad.ts` (`moveOverlayFocus`) e do foco inicial de cada diálogo.
- **Foco da janela entre o shell e as abas:** `focusChrome` em `src/main/shell.ts`, avisado pelo `onFocusIn` do `App` em `src/renderer/shell/app.tsx`. Sem isso o leitor recebe o texto da barra e não o nome.
- **O que a árvore publica:** `app/tests/e2e/atspi-tree.py` imprime a árvore inteira; rode `python3 tests/e2e/atspi-tree.py dump` com o app aberto para ver o que o leitor vê antes de mexer em qualquer coisa.

## Resultado

A passada automática vive no CI: `tests/e2e/orca.spec.ts` roda no job de Linux junto com o resto do e2e e falha quando o Orca deixa de dizer um dos nomes. Para os leitores que precisam de uma pessoa, registre uma issue com o título `teste com leitor de tela: <versão> · <SO> · <leitor>` e, para cada cenário que falhou, o passo, o que foi falado e o que se esperava. Ajuste de nome ou papel vira PR pequeno com o cenário no título; um elemento que não existe (as sugestões) vira item de backlog, não correção deste.
