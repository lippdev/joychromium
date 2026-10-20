# Roteiro de teste com leitor de tela (E7-03)

O critério do item é o fluxo de busca utilizável com leitor de tela — Orca no Linux, Narrator no Windows e VoiceOver no macOS. O e2e cobre o que dá para provar sem áudio: os nomes, os papéis e a ordem que o app publica na árvore de acessibilidade. O que só se ouve está neste roteiro, que precisa de uma pessoa com fones.

## O que o e2e já prova

`app/tests/e2e/screen-reader.spec.ts` roda junto com o resto do e2e e verifica duas camadas:

- **Papéis e nomes na DOM**, pelo Playwright, na janela do shell e, pelo bridge de teste, nas páginas internas: o campo de endereço é um `textbox` chamado "Endereço" (e "Address" em inglês), o teclado do controle é um `dialog` chamado "Teclado do controle" com as teclas como botões, o campo de busca da nova aba se chama "Pesquisar" e está dentro de uma região de busca, e os cards de aplicativos, favoritos e histórico são listas com itens nomeados.
- **A árvore AT-SPI**, no Linux, que é exatamente o que o Orca lê: `app/tests/e2e/atspi-tree.py` fala D-Bus com o app e devolve o que ele publica. É essa camada que pega um nome que a DOM inventa e a tecnologia assistiva não vê.

Para rodar a camada AT-SPI fora do CI são precisos os pacotes e um barramento de sessão; o teste sobe um `dbus-daemon` próprio e se marca como *skipped* com o motivo quando não consegue:

```bash
sudo apt-get install -y python3-pyatspi python3-gi gir1.2-atspi-2.0 at-spi2-core dbus
cd app && xvfb-run --auto-servernum --server-args="-screen 0 1600x900x24" npx playwright test tests/e2e/screen-reader.spec.ts
```

O que nenhum dos dois prova: a fala. Nome curto demais, ordem estranha, dois nomes repetidos seguidos, o tom do leitor — só a passada manual abaixo mostra.

## Antes de começar

- Use um perfil limpo (apague `settings.json` do diretório de dados ou use outro usuário do sistema) e conclua o onboarding; a tela inicial precisa ter histórico e favoritos para as listas aparecerem.
- Escolha o idioma em Configurações antes de começar e anote qual usou: os nomes mudam com ele.
- Deixe o leitor no padrão de fábrica (velocidade e verbosidade incluídas) e **não** olhe a tela no primeiro passo de cada cenário: o que vale é o que ele fala.
- Tenha o teclado físico e, se possível, o controle à mão: o mesmo caminho é feito duas vezes, uma por cada entrada.

## O que registrar em cada passo

Para cada cenário: **passou / falhou**, o que o leitor falou (texto literal, entre aspas) e o que você esperava ouvir. Se um controle não for anunciado como deveria, diga qual tecla apertou e qual elemento estava em foco. Uma gravação de áudio do cenário que falhou ajuda mais do que a descrição.

## Cenário 1 — barra de endereço e teclado do controle

1. Abra o app e navegue até a barra de endereço com Tab (fora do modo TV) ou com o D-pad (no modo TV).
   Deve ser anunciado: **"Endereço, campo de texto"** (Orca e NVDA) ou **"Endereço, campo de edição de texto"** (VoiceOver), seguido do conteúdo atual e da dica do campo.
2. Com o campo focado, o teclado virtual abre. A digitação física continua funcionando.
   Deve ser anunciado: o teclado **não** deve roubar a fala do campo; o foco tem de continuar no endereço.
3. Feche o teclado, aperte **Y** no controle (ou Tab até o teclado, sem focar o campo).
   Deve ser anunciado: **"Teclado do controle, diálogo"** e, ao percorrer com Tab, cada tecla pelo próprio nome ("q, botão", "espaço, botão", "apagar, botão", "OK, botão").
4. Digite uma busca com acento — "ação", por exemplo — usando só o teclado do controle e confirme com OK.
   Deve ser anunciado: o resultado da navegação e o novo título da página.

## Cenário 2 — busca na tela inicial

1. Abra uma aba nova (a tela inicial) e vá até o campo de busca.
   Deve ser anunciado: **"Pesquisar, campo de texto"**, dentro de uma região de busca chamada "Pesquisar".
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

## O que ainda não existe

As **sugestões de busca** da barra de endereço são calculadas no processo principal (`src/shared/suggestion.ts`) e chegam ao shell no estado, mas nenhuma tela as desenha: não há lista para o leitor anunciar. O roteiro registra isso como falha conhecida, e o item que fecha o buraco é a parte de "sugestões navegáveis" do E6-05.

## Por leitor

**Orca (Linux).** `orca` no terminal, ou `orca --replace` se já estiver aberto; `orca -s` abre as preferências. Fora do modo TV, o foco é o do teclado; no modo TV, o Orca segue o cursor virtual do `spatial.js`, então use o D-pad e confirme que o foco acompanha. Para ouvir a árvore sem depender do foco, `orca -t` (modo de teste) imprime o que ele recebe.

**Narrator (Windows).** Win+Ctrl+Enter liga e desliga. Ative o modo de exame (seta para baixo com o Narrator) para percorrer as listas, e Win+Ctrl+O para o modo de leitura. O Narrator anuncia "região de busca" e "lista com N itens" no Windows 11; anote se a contagem bate com o número de cards na tela.

**VoiceOver (macOS).** Cmd+F5 liga e desliga; VO é Ctrl+Option. Para as listas, use o rotor (VO+U) e escolha "Listas": o app deve aparecer com Aplicativos, Favoritos e Continuar assistindo. No WebContentsView das abas, confirme que o VoiceOver entra na página (VO+seta direita) e não fica preso na barra.

## Onde ajustar o quê

- **Nome de um controle do shell:** a chave de tradução em `src/shared/i18n.ts` (bloco `a11y.*`) e o `aria-label` em `src/renderer/shell/app.tsx` ou `keyboard.tsx`.
- **Nome de um campo ou lista de página interna:** o `data-i18n-aria-label` no HTML (`src/assets/newtab.html`, `history.html`, `favorites.html`), aplicado pelo `src/assets/i18n.js`; os itens de lista saem do `src/assets/list.js` e do `card()` da nova aba.
- **Ordem de foco:** o foco dos overlays é do `src/renderer/shell/gamepad.ts` (`moveOverlayFocus`) e do foco inicial de cada diálogo.
- **O que a árvore publica:** `app/tests/e2e/atspi-tree.py` imprime a árvore inteira; rode `python3 tests/e2e/atspi-tree.py dump` com o app aberto para ver o que o leitor vê antes de mexer em qualquer coisa.

## Resultado

Registre em uma issue com o título `teste com leitor de tela: <versão> · <SO> · <leitor>` e, para cada cenário que falhou, o passo, o que foi falado e o que se esperava. Ajuste de nome ou papel vira PR pequeno com o cenário no título; um elemento que não existe (as sugestões) vira item de backlog, não correção deste.
