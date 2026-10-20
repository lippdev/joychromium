# Instalando o JoyChromium

O app funciona nas três plataformas, mas ainda não é assinado com um certificado de código (ver `docs/PRD.md`, ADR-010). Por isso o sistema avisa na primeira abertura. Este guia mostra o que fazer.

## Windows

1. Baixe o `JoyChromium-<versão>-win-x64.exe` (ou `win-arm64` em máquinas ARM) na [última release](https://github.com/lippdev/joychromium/releases/latest).
2. Execute o instalador. O SmartScreen mostra *O Windows protegeu o seu PC*.
3. Clique em **Mais informações** e depois em **Executar assim mesmo**.
4. O app instala só para o seu usuário (sem senha de administrador) e se atualiza sozinho daqui para frente.

## macOS

1. Baixe o `JoyChromium-<versão>-mac-arm64.dmg` (Apple Silicon) ou `-mac-x64.dmg` (Intel) e abra.
2. Arraste o JoyChromium para a pasta Aplicativos.
3. Na primeira abertura, o macOS diz que o app é de um desenvolvedor não identificado. Abra **Ajustes do Sistema → Privacidade e Segurança**, role até a mensagem sobre o JoyChromium e clique em **Abrir Assim Mesmo**. Confirme com a senha ou o Touch ID.
   - Se essa opção não aparecer, clique com o botão direito no app em Aplicativos, escolha **Abrir** e confirme em **Abrir**.
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

Instalações `.deb` e `.rpm` se atualizam pelo próprio app: quando a versão nova termina de baixar, Configurações → Sobre mostra **Reiniciar e instalar**, e o sistema pede a senha do seu usuário ali mesmo. O AppImage e as versões de Windows se atualizam ao fechar o app, sem senha.

Em Raspberry Pi e outras máquinas ARM, use os artefatos `arm64`.

## Primeira execução

O app abre em tela cheia, no modo TV. Na primeira vez aparece o onboarding: escolha o idioma, teste o controle (o app mostra quais botões ele detectou), escolha o buscador e o tema. Para sair da tela cheia a qualquer momento, pressione `F11` (ou `Esc` quando nada está aberto); a escolha fica salva para a próxima vez.

## Problemas conhecidos sem assinatura

| Sintoma | Plataforma | O que fazer |
|---|---|---|
| "O Windows protegeu o seu PC" | Windows | Mais informações → Executar assim mesmo |
| "Não é possível abrir porque é de um desenvolvedor não identificado" | macOS | Ajustes → Privacidade e Segurança → Abrir Assim Mesmo |
| "O app está danificado" | macOS | Baixar de novo; `xattr -dr com.apple.quarantine` |
| Sem atualização automática | macOS | Usar o botão Download na tela de atualizações |
| Erro de sandbox ao abrir o AppImage | Linux (Ubuntu 24.04+) | Instalar o `.deb`/`.rpm` |
