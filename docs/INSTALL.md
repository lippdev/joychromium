# Instalando o JoyChromium no Windows

O alpha atual destina-se ao Windows 10/11. macOS e Linux estão no [roadmap](ROADMAP.md); os guias antigos dessas plataformas não são instruções de instalação do alpha atual.

## Windows

1. Baixe o instalador Windows x64 ou arm64 apropriado na [página de releases](https://github.com/lippdev/joychromium/releases).
2. Execute o arquivo `.exe` e siga o instalador. A instalação é feita para seu usuário.
3. Se o SmartScreen mostrar **O Windows protegeu o seu PC**, confira que baixou da página oficial de releases; para prosseguir, escolha **Mais informações → Executar assim mesmo**.
4. Abra o JoyChromium pelo menu Iniciar. Na primeira execução, conclua o onboarding e conecte o controle que pretende usar.

Depois de instalado, o JoyChromium se atualiza sozinho: a cada abertura ele verifica se há versão nova (pré-releases 0.x incluídas), baixa em segundo plano e instala em silêncio. Quem está numa versão anterior à 0.1.5 precisa instalar uma vez à mão a primeira versão com atualização automática. O instalador está sem assinatura de código, então o aviso do SmartScreen é esperado. DRM e streaming pago ainda não têm validação suficiente para serem anunciados como prontos.

## Primeira execução

O app inicia em tela cheia no modo TV. O onboarding permite escolher idioma e buscador e testar o controle. `F11` alterna entre tela cheia e janela; `Esc` também sai da tela cheia quando não há diálogo ou overlay aberto.

## Resolução de problemas

| Sintoma | Ação |
|---|---|
| “O Windows protegeu o seu PC” | Confirme a origem do instalador; se quiser continuar, **Mais informações → Executar assim mesmo**. |
| Controle não aparece | Reconecte-o, confirme que o Windows o reconhece e reinicie o app. O mapeamento depende do controle e do driver. |
| Nova versão não chega sozinha | Versões até a 0.1.4 não se atualizam: instale a mais recente pela página de releases uma vez. Depois disso, confira o status em Configurações. |

Para plataformas futuras, consulte os documentos técnicos a partir de [ROADMAP.md](ROADMAP.md).
