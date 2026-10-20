# Instalando o JoyChromium

O app funciona nas três plataformas, mas ainda não é assinado com um certificado de código (ver `docs/PRD.md`, ADR-010). Por isso o sistema avisa na primeira abertura. Este guia mostra o que fazer.

## Windows

1. Baixe o `JoyChromium-<versão>-win-x64.exe` (ou `win-arm64` em máquinas ARM) na [última release](https://github.com/lippdev/joychromium/releases/latest).
2. Execute o instalador. O SmartScreen mostra *O Windows protegeu o seu PC*.
3. Clique em **Mais informações** e depois em **Executar assim mesmo**.
4. O app instala só para o seu usuário (sem senha de administrador) e se atualiza sozinho daqui para frente.

## macOS

1. Baixe o `JoyChromium-<versão>-mac-arm64.dmg` (Apple Silicon) ou `-mac-x64.dmg` (Intel) e abra.
2. **Se aparecer "Não foi possível instalar — Este Mac não conseguiu verificar o app"**, isso é o instalador da imagem de disco recusando um app sem notarização. A assinatura do app é válida (`codesign --verify --deep --strict` passa); o que falta é o Developer ID, que o ADR-010 deixou de fora. Feche o aviso e use um destes caminhos:
   - arraste o **JoyChromium** para a pasta Aplicativos, ou
   - dê dois cliques em **install-macos.command**, que copia o app para Aplicativos e limpa a marca de quarentena.
3. Abra o app uma vez com o botão direito → **Abrir** (ou, se o macOS não oferecer essa opção, rode no Terminal `xattr -dr com.apple.quarantine /Applications/JoyChromium.app`). Depois disso ele abre normalmente.
4. O app **não se atualiza sozinho** no macOS enquanto não houver assinatura. Quando sair uma versão nova, a tela *Sobre e atualizações* avisa e o botão **Download** abre a página da release.

Se o macOS disser que o app está **danificado**, ele foi baixado por um navegador que removeu a assinatura ad-hoc. Baixe de novo pela release e, se precisar, rode no Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/JoyChromium.app
```

## Linux

**AppImage** (qualquer distribuição):

```bash
chmod +x JoyChromium-<versão>-linux-x86_64.AppImage
./JoyChromium-<versão>-linux-x86_64.AppImage
```

Se aparecer um erro de sandbox (comum no Ubuntu 24.04, que restringe *user namespaces*), instale o `.deb` ou o `.rpm` em vez do AppImage — eles não usam o sandbox do AppImage.

**Debian/Ubuntu:**

```bash
sudo apt install ./JoyChromium-<versão>-linux-amd64.deb
```

**Fedora/RHEL:**

```bash
sudo dnf install ./JoyChromium-<versão>-linux-x86_64.rpm
```

**Flatpak** (o app ainda não está publicado no Flathub; o bundle sai do CI como artefato):

```bash
flatpak install --user ./JoyChromium.flatpak
flatpak run dev.lipp.joychromium
```

Dentro do Flatpak o app **não se atualiza sozinho**: o bundle é atualizado pelo Flatpak, junto com o runtime, e a tela
*Sobre e atualizações* diz isso em vez de oferecer um download. Quando sair uma versão nova, instale o bundle novo
(`flatpak install --user ./JoyChromium-<versão>.flatpak`) ou, depois que o app estiver no Flathub, rode
`flatpak update dev.lipp.joychromium`.

O app só enxerga `~/Downloads` (os downloads e o zip de diagnóstico caem em `~/Downloads/JoyChromium`); o resto da sua
pasta pessoal fica fora do sandbox. Os dados do app ficam em `~/.var/app/dev.lipp.joychromium/`.

Sem `--device=all`, o sandbox não entrega `/dev/input`, então o controle não aparece para o app (teclado, mouse e
controle remoto funcionam). Num Flatpak 1.15.6 ou mais novo, libere só os dispositivos de entrada:

```bash
flatpak override --user --device=input dev.lipp.joychromium
```

Em Flatpak mais antigo — o 1.14 do Ubuntu 24.04, por exemplo — só existe a opção ampla:

```bash
flatpak override --user --device=all dev.lipp.joychromium
```

Instalações `.deb` e `.rpm` se atualizam pelo próprio app: quando a versão nova termina de baixar, Configurações → Sobre mostra **Reiniciar e instalar**, e o sistema pede a senha do seu usuário ali mesmo. O AppImage e as versões de Windows se atualizam ao fechar o app, sem senha.

Em Raspberry Pi e outras máquinas ARM, use os artefatos `arm64`.

## Primeira execução

O app abre em tela cheia, no modo TV. Na primeira vez aparece o onboarding: escolha o idioma, teste o controle (o app mostra quais botões ele detectou), escolha o buscador e o tema. Para sair da tela cheia a qualquer momento, pressione `F11` (ou `Esc` quando nada está aberto); a escolha fica salva para a próxima vez.

## Problemas conhecidos sem assinatura

| Sintoma | Plataforma | O que fazer |
|---|---|---|
| "O Windows protegeu o seu PC" | Windows | Mais informações → Executar assim mesmo |
| "Não é possível abrir porque é de um desenvolvedor não identificado" | macOS | Ajustes → Privacidade e Segurança → Abrir Assim Mesmo |
| "Não foi possível instalar — Este Mac não conseguiu verificar o app, então nada foi instalado" | macOS 15 | Arrastar o app para Aplicativos (ou `install-macos.command`) e abrir com o botão direito → Abrir; se não houver a opção, `xattr -dr com.apple.quarantine /Applications/JoyChromium.app` |
| "O app está danificado" | macOS | Baixar de novo; `xattr -dr com.apple.quarantine` |
| Sem atualização automática | macOS | Usar o botão Download na tela de atualizações |
| Erro de sandbox ao abrir o AppImage | Linux (Ubuntu 24.04+) | Instalar o `.deb`/`.rpm` |
