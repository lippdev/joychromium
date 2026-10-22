# Site do JoyChromium

Página de apresentação com inscrição no beta. Um container Node sem dependências: serve `public/` e guarda os e-mails em `/data/subscribers.jsonl`.

## Rodar local

```bash
node site/server.mjs        # http://localhost:3000
node site/test.mjs          # autoteste da inscrição
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

`public/img/*.png` e `demo.mp4` saem do motion em `docs/assets/motion/` (veja o cabeçalho de `render.cjs`).
