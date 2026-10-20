# ADR-006: scripts de página em mundo isolado

**Status:** aceito (out/2026); atualizado em out/2026 com a cobertura de subframes (E3-06)

## Contexto
`spatial.js` e o cursor virtual eram injetados com `executeJavaScript`, no mesmo mundo da página, e só no frame principal. A página podia ler, substituir ou quebrar `window.__joy`. Um player embutido (D16) roda o conteúdo num iframe, e o D-pad precisa atravessar a borda do frame — muitas vezes um player de outra origem, que a página hospedeira não controla.

## Decisão
O script roda em `executeJavaScriptInIsolatedWorld`, no mundo 73, e o shell conversa com esse mundo por `runInPageWorld`.

A injeção passou a ser feita pelo preload da aba. Com `nodeIntegrationInSubFrames` (Node continua desligado) o preload roda em todo frame: ele pede o texto do script ao main por `ipcMain.handle` e o avalia com `webFrame.executeJavaScriptInIsolatedWorld(73)` no próprio frame. O frame principal continua no mesmo mundo 73 que `runInPageWorld` consulta; cada subframe ganha o seu.

O foco entre frames segue esta regra:
- o D-pad age no frame que tem o foco;
- uma direção pressionada com o foco num `<iframe>` entra no documento dele e foca o primeiro controle a partir da borda por onde a direção veio (`down`/`right` entram pelo canto superior esquerdo, `up`/`left` pelo inferior direito);
- um frame sem candidato naquela direção devolve a direção ao pai, que continua a partir do `<iframe>`; só o frame de topo rola;
- a travessia usa `postMessage` nos dois sentidos, então vale para um player same-origin e para um de outra origem: o e2e serve um frame de outra origem localmente (`127.0.0.1`), sem depender da rede.

## Consequências
A página não vê nem altera a navegação espacial. O e2e prova, no frame principal, `typeof window.__joy` igual a `object` no mundo isolado e `undefined` na página; dentro do iframe, prova que a página do frame vê `undefined` e que o script age mesmo assim — o foco real e o anel `__joy-focus` aparecem num elemento do frame, o que só o mundo isolado dele pode fazer.

Limites aceitos:
- a página pode postar as mesmas mensagens (`enter`, `exit`, `call`); o efeito máximo é mover o foco ou responder no lugar de um frame filho;
- um frame em que o preload não rode não é alcançado: o `<iframe>` recebe o foco, a chamada não responde e a próxima direção segue no frame de cima. Não foi observado nos frames de aba testados;
- um frame `sandbox` sem `allow-same-origin` (origem opaca) ficou fora do e2e: no Linux o script rodou nele, no macOS não, e a causa não foi investigada. Por isso o caso cross-origin provado é o de um frame servido por outra origem, sem `sandbox`;
- um site de terceiros remoto, por rede, não está no e2e (a suíte roda offline). O que está provado é a travessia de um frame de outra origem servido localmente, não de um host externo nem da separação de processo que ele pode ter;
- o cursor virtual continua desenhado pelo frame de topo. Os cliques são eventos de mouse reais na mesma coordenada, então acertam o iframe sem precisar de um cursor por frame.
