# Policy remota e a chave de assinatura (E8-04)

O app busca `policy/policy.json` na `main` do repositório, verifica a assinatura com a chave pública embutida em `src/shared/policy.ts` e só aplica o que for válido. A policy só aperta o padrão: mínimo de Chromium, hosts bloqueados, extensões perigosas extras, versões do app marcadas como quebradas e um recado na tela.

Se a assinatura não bater, o app mantém a policy em cache e continua funcionando — nada quebra, mas a policy nova é ignorada.

## Onde fica a chave privada

A chave é sua, não do repositório. **Nunca comite** (`~/.joychromium/` não está no repo e nunca deve entrar).

| Sistema | Caminho |
|---|---|
| Linux | `~/.joychromium/policy-signing.key` |
| macOS | `~/.joychromium/policy-signing.key` |
| Windows | `%USERPROFILE%\.joychromium\policy-signing.key` |

O formato é PKCS#8 em base64, uma linha. O gerador cria o diretório sozinho:

```bash
node app/scripts/policy-sign.mjs keygen ~/.joychromium/policy-signing.key
# imprime a chave pública (base64) para colar em POLICY_PUBLIC_KEY
```

Só existe uma chave em uso: a que corresponde à `POLICY_PUBLIC_KEY` em `src/shared/policy.ts`. Se você gerar outra, atualize a constante no mesmo PR e publique uma versão nova do app **antes** de assinar policies com a chave nova — install edições antigas continuam confiando na chave antiga.

## Assinar uma mudança de policy

```bash
# 1. edite policy/policy.json
# 2. assine (grava policy/policy.json.sig)
node app/scripts/policy-sign.mjs sign ~/.joychromium/policy-signing.key policy/policy.json
# 3. confira antes de commitar: o teste unitário verifica a assinatura do arquivo versionado
cd app && npm test
```

O `verify` do script também serve, desde que receba a chave pública em base64 — a mesma constante `POLICY_PUBLIC_KEY` de `src/shared/policy.ts`:

```bash
node app/scripts/policy-sign.mjs verify "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE688oKNR0DZE1Nz6kr3x35Ebd+CkNp5YK/FuYO9+Q33IQE8nLC+/NRnCzQ+9rwPUuCztcReMP51ges5UUKUT1Zg==" policy/policy.json
```

`npm test` é o caminho mais confiável: `tests/unit/shared.test.ts` lê `policy/policy.json` e `policy.json.sig` do repositório e falha se a assinatura não fechar.

O `.sig` vai no mesmo commit do `policy.json`: assinatura de um conteúdo e arquivo de outro é rejeitada pelo app.

## Backup

Perder a chave privada significa gerar outra e publicar uma versão do app com a chave pública nova — as instalações antigas param de aceitar policy nova até atualizarem. Guarde uma cópia fora do computador (gerenciador de senhas ou armazenamento cifrado) e confirme que o backup abre:

```bash
head -c 16 ~/.joychromium/policy-signing.key   # deve ser base64, não vazio
```

## Rotação

1. Gere a chave nova em outro arquivo e guarde a antiga.
2. Publique um app com `POLICY_PUBLIC_KEY` nova, e espere a maior parte das instalações atualizar.
3. Passe a assinar com a chave nova. Durante a transição, uma policy podem não valer para quem ainda está na versão antiga — o app segue com o padrão e com a policy anterior em cache, que é o comportamento seguro.
