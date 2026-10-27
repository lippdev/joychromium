# Wayland, X11 e Steam Deck

> **Escopo:** referência técnica para o roadmap Linux/Steam Deck. Wayland, Linux e Steam Deck não são alvos do alpha atual e não bloqueiam o alpha Windows. Veja [ROADMAP.md](ROADMAP.md).

O JoyChromium roda nas duas plataformas gráficas do Linux sem código condicional no app: quem escolhe é o Chromium, e o Electron expõe a escolha por `--ozone-platform`. O que o repositório garante é que o caminho Wayland é testado a cada PR, e não só quando alguém tem uma máquina com GNOME ou KDE.

## O que o CI prova em todo PR

O passo **Wayland smoke test (no XWayland)** do `ci.yml` sobe um Weston sem backend gráfico (`--backend=headless-backend.so`, 1600×900), tira o `DISPLAY` do ambiente e abre o app com `--ozone-platform=wayland`. Sem X11 sobrando, uma janela só pode existir pelo caminho Wayland. O script (`app/scripts/wayland-smoke.mjs`) verifica:

- o processo principal chega à primeira linha do log;
- a UI do shell e a página da aba sobem como duas views e medem 1600 px de largura;
- as duas pintam pixels de verdade — o screenshot de cada view é comparado com um limite, porque uma janela que nunca pintou comprime para quase nada;
- nada disso passa se o app cair no XWayland, porque não há servidor X no runner.

Rodar localmente, com `weston` instalado (`sudo apt-get install weston`):

```sh
cd app
npm run test:wayland
```

Saída esperada, em cerca de dez segundos:

```
OK: native Wayland, no X11 — page 1600x808 211kB, chrome 1600x900 25kB
```

## Em GNOME, KDE e Sway

Sessão Wayland com XWayland instalado: o Electron abre como cliente X11 por padrão em algumas versões. Para forçar o caminho nativo:

```sh
joychromium --ozone-platform=wayland
```

Também vale `--ozone-platform-hint=auto`, que segue a sessão quando o app é iniciado por um lançador. Se a janela abrir sem bordas ou com o cursor do controle deslocado, compare com `--ozone-platform=x11`: um dos dois vira a referência do seu computador, e um relatório com essa comparação é o que falta para eu fixar a escolha no adaptador de plataforma.

## Steam Deck (modo Gaming)

O Deck roda a sessão de jogos em Wayland sob o gamescope, e o desktop em KDE. O caminho que funciona lá é o mesmo de qualquer jogo que não vem da Steam:

1. Baixe o `.AppImage` (x86_64) da última release.
2. Modo Desktop: `chmod +x JoyChromium-*.AppImage` e rode uma vez para ele criar o perfil.
3. Volte ao modo Gaming → *Biblioteca* → *Adicionar um jogo não Steam* → aponte para o AppImage.
4. Em *Propriedades → Opções de inicialização*, use `--ozone-platform=wayland`.
5. O controle do Deck chega como gamepad padrão pelo Steam Input; os glifos aparecem como Xbox.

O modo Gaming também é o cenário onde a janela sempre abre em tela cheia, que é o padrão do modo TV.

**O que ainda não foi feito:** rodar isso num Steam Deck de verdade. O caminho Wayland está provado no CI em compositor headless, mas a combinação gamescope + HDR + troca de janela do Deck é hardware que não existe neste ambiente. O relatório dessa execução é o que fecha o item E2-08 do PRD por completo; o roteiro de teste com controle em [CONTROLLER-TEST.md](CONTROLLER-TEST.md) serve de base e vale rodar junto.
