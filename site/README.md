# Site do JoyChromium

Página de apresentação com inscrição no beta. `web/` é a página em React (Vite, Motion, Lenis), compilada em `dist/`; `server.mjs` (Node, sem dependências) serve `dist/` e guarda os e-mails em `/data/subscribers.jsonl`.

A página também responde a um gamepad: analógico esquerdo move o cursor, D-pad pula entre links e botões, A clica, analógico direito rola.

## Rodar local

```bash
cd site/web && npm ci && npm run build   # gera site/dist
node site/server.mjs                     # http://localhost:3000
node site/test.mjs                       # autoteste da inscrição
# desenvolvendo: node site/server.mjs + (cd site/web && npm run dev)
```

## Dokploy

1. **Create Application** → provider GitHub, repositório `lippdev/joychromium`, branch `main`.
2. **Build Type: Dockerfile**, *Build Path* `site`, *Dockerfile Path* `Dockerfile`.
3. **Environment:** `ADMIN_TOKEN=<uma senha longa>` (só ela baixa a lista).
4. **Advanced → Volumes:** volume (ou bind mount) com *Mount Path* `/data`. Sem isso os e-mails somem a cada deploy.
5. **Domains:** seu domínio, *Container Port* `3000`, HTTPS ligado.

## Baixar a lista de inscritos

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://SEU-DOMINIO/api/subscribers.csv
```

## Imagens

`web/public/img/watch.png` (imagem de compartilhamento) sai do motion em `docs/assets/motion/`; o app na TV é recriado ao vivo em `web/src/components/BrowserMock.tsx`.
