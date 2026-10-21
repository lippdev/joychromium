# Integrações

Como outro programa abre o JoyChromium — um launcher de console como o [ConsoleMode](https://github.com/lippdev/consolemode), o Playnite, a Steam ou um atalho — e devolve o controle quando ele fecha.

## Linha de comando

```
JoyChromium.exe [--tv | --window] [--new-tab] [URL]
```

| Argumento | Efeito |
|---|---|
| `--tv` (ou `--kiosk`, `--fullscreen`) | Abre em tela cheia, no modo TV, **só nesta execução**: a preferência salva não muda. |
| `--window` | Abre em janela, também só nesta execução. |
| `--new-tab` | Abre uma nova aba. |
| `https://…` | Abre o site. |
| `joychromium://history`, `…/favorites`, `…/settings`, `…/newtab` | Abre a página interna. |
| `joychromium://open?url=<URL https codificada>` | Abre o site. Serve para launchers que só aceitam URI. |

`--tv` e `--window` juntos são ignorados. Qualquer outro esquema (`file:`, `javascript:`, `joychromium://chrome`) é descartado.

Código: `app/src/shared/launchArgs.ts` (testado em `tests/unit/shared.test.ts`). O e2e `tests/e2e/launch.spec.ts` faz o caminho de um launcher: abre com flags e uma URL e lança uma segunda vez com o app aberto.

## Instância única

O app roda uma instância só. Uma segunda execução (do launcher, de um atalho, de um link) **sai na hora** e entrega os argumentos para a que está aberta, que:

- restaura e foca a janela;
- aplica `--tv`/`--window`;
- abre a URL numa **aba nova**, sem trocar o que estava tocando (ou abre a nova aba, com `--new-tab`).

Para quem vigia o processo: o processo da segunda execução morre logo. Quem continua vivo é a instância original.

## Protocolo `joychromium://`

O instalador registra o esquema no sistema: `protocols` em `app/package.json`, gravado pelo NSIS no Windows, pelo `Info.plist` no macOS e pelo `.desktop` no Linux. `start joychromium://newtab` (Windows), `open joychromium://newtab` (macOS) ou `xdg-open joychromium://newtab` abre o app ou entrega o link para a instância aberta. No macOS o link chega pelo evento `open-url`, tratado em `app/src/main/main.ts`.

## Detectar a instalação no Windows

- **Caminho padrão:** `%LOCALAPPDATA%\Programs\joychromium\JoyChromium.exe` (o NSIS instala por usuário, sem admin).
- **Registro:** `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\1fc20e06-e3c1-52c5-9ba1-fcb355e6851d`. `DisplayName` é `JoyChromium <versão>` e `DisplayIcon` aponta para o `.exe`. `InstallLocation` vem vazio, então use o caminho do `DisplayIcon` (sem o `,0`). A chave é um UUID derivado do `appId` (`dev.lipp.joychromium`) e não muda entre versões.

## Vigiar o processo e voltar

- O Electron sobe **vários** `JoyChromium.exe` (principal, GPU, renderers). Só um tem janela: escolha o processo com `MainWindowHandle != 0` em vez do primeiro de `GetProcessesByName`, que pode ser um auxiliar.
- A sessão termina quando esse processo sai. Com o controle, o usuário fecha pelo **menu rápido (Start) → "Fechar o JoyChromium"**. Fechar a janela também fecha o app.
- Código de saída: sempre 0 num fechamento normal.

## Atalhos rápidos no Windows

A lista de atalhos do ícone (botão direito na barra de tarefas ou no Menu Iniciar) tem **Nova aba**, **Modo TV** e **Modo janela**. Eles usam as mesmas flags acima.

## ConsoleMode

Hoje, sem mudar nada no ConsoleMode, use o modo **Aplicativo personalizado**:

- **Caminho:** `%LOCALAPPDATA%\Programs\joychromium\JoyChromium.exe`
- **Argumentos:** `--tv`
- **Processo a vigiar:** em branco (`JoyChromium`)

Para virar alvo de primeira classe no ConsoleMode faltam três coisas, do lado de lá:

1. Um modo `joychromium` ao lado de `bigPicture`, `xboxMode` e `playnite`.
2. A detecção pela chave de registro acima.
3. A escolha do processo com janela ao mover para a TV.
