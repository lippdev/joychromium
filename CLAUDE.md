# JoyChromium

Navegador Windows controller-first (WPF + WebView2) com marcador de user-agent de TV. Não é fork do Chromium.

## Comandos
- Build: `dotnet build JoyChromium.csproj -c Release`
- Testes unitários (xUnit): `dotnet test tests/JoyChromium.Tests -c Release`
- Teste de UI (FlaUI, abre o app): `dotnet run --project tests/UiSmoke -c Release -- bin/Release/net8.0-windows10.0.19041.0/JoyChromium.exe`
- Formatação: `dotnet format JoyChromium.csproj --verify-no-changes`
- Rodar: `dotnet run --project JoyChromium.csproj`

## Regras
- Siga `CONTRIBUTING.md`: GitHub Flow, branch `tipo/descricao`, PR com squash, sem push direto na `main`.
- Commits em Conventional Commits.
- Nunca commitar direto na `main`; criar branch antes.
- Warnings são erros; não suprimir sem justificativa em comentário.
- Lógica nova em classes separadas e testáveis (ex.: `Settings.cs`, `SecurityPolicy.cs`, `History.cs`, `ControllerInput.cs`), cobertas em `tests/JoyChromium.Tests`.
- `MainWindow` é uma classe parcial dividida por responsabilidade: `MainWindow.xaml.cs` (ctor, start, chrome da janela), `.Tabs`, `.Navigation`, `.Keyboard`, `.PageTools`, `.Security`, `.Bridge` (mensagens das páginas internas), `.Controller`, `.Maintenance`. Código novo vai no arquivo do tema certo; P/Invoke fica em `NativeInput.cs`.
- Antes de concluir uma tarefa: build + `dotnet test` + format passando (e o UI smoke quando mexer no shell).
- Não subir `bin/`, `obj/`, `.vs/`.
