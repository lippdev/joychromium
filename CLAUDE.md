# JoyChromium

Navegador Windows controller-first (WPF + WebView2) com marcador de user-agent de TV. Não é fork do Chromium.

## Comandos
- Build: `dotnet build JoyChromium.csproj -c Release`
- Testes (smoke): `dotnet run --project tests/TvIdentity.Smoke.csproj -c Release`
- Formatação: `dotnet format JoyChromium.csproj --verify-no-changes`
- Rodar: `dotnet run --project JoyChromium.csproj`

## Regras
- Siga `CONTRIBUTING.md`: GitHub Flow, branch `tipo/descricao`, PR com squash, sem push direto na `main`.
- Commits em Conventional Commits.
- Nunca commitar direto na `main`; criar branch antes.
- Warnings são erros; não suprimir sem justificativa em comentário.
- Lógica nova em classes separadas e testáveis (ex.: `Settings.cs`, `SecurityPolicy.cs`, `History.cs`, `ControllerInput.cs`), cobertas em `tests/Program.cs`.
- `MainWindow` é uma classe parcial dividida por responsabilidade: `MainWindow.xaml.cs` (ctor, start, chrome da janela), `.Tabs`, `.Navigation`, `.Keyboard`, `.PageTools`, `.Security`, `.Bridge` (mensagens das páginas internas), `.Controller`, `.Maintenance`. Código novo vai no arquivo do tema certo; P/Invoke fica em `NativeInput.cs`.
- Antes de concluir uma tarefa: build + smoke test + format passando.
- Não subir `bin/`, `obj/`, `.vs/`.
