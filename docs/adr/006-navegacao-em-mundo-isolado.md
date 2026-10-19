# ADR-006: scripts de página em mundo isolado

**Status:** aceito (out/2026)

## Contexto
`spatial.js` e o cursor virtual eram injetados com `executeJavaScript`, no mesmo mundo da página, e só no frame principal. A página podia ler, substituir ou quebrar `window.__joy`.

## Decisão
Injetar em um mundo isolado (`executeJavaScriptInIsolatedWorld`, world 73) e conversar com esse mundo por `runInPageWorld`.

## Consequências
A página não vê nem altera a navegação espacial. O e2e prova: `typeof window.__joy` é `object` no mundo isolado e `undefined` na página. Subframes ficam para quando um player embutido precisar (registrado no PRD).
