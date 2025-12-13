# lista-Presentes
Site de lista de presentes.

Nota: Em dezembro de 2025 os valores dos presentes foram removidos da exibição e do payload enviado pelo formulário, conforme solicitação do usuário.

Servidor local/API
------------------
Adicionei um pequeno servidor Express que fornece os itens via `/api/itens` e permite reservar com `POST /api/reservar`.

Como usar (desenvolvimento):

1. Instale dependências:

```bash
npm install
```

2. (Opcional) Configure seu webhook externo (n8n) via variável de ambiente ao iniciar o servidor:

```bash
# exporte a variável no Linux/macOS
export WEBHOOK_URL="https://seu-dominio.com/webhook/reservar-presente"
npm start
```

Se `WEBHOOK_URL` estiver definido, o servidor encaminhará a solicitação para ele e só marcará o item como reservado se o webhook responder com `{ "success": true }` ou retornar status 2xx.

3. Abra `http://localhost:3000/index.html` no navegador (ou sirva os arquivos conforme sua infra). A lista será carregada de `itens.json` via `/api/itens`.

Observações:
- O arquivo `itens.json` contém o campo `reservado` (boolean). Itens com `reservado: true` não são retornados por `/api/itens` e não aparecem na lista.
- O servidor atualiza `itens.json` no disco quando uma reserva é confirmada.

Fluxo recomendado (preserva envio direto ao webhook):

1. O frontend envia a reserva diretamente para o `WEBHOOK_URL` (como antes).
2. Se o webhook responder com `{ "success": true }`, o frontend faz uma chamada POST para `/api/marcar` com `{ "id": <itemId> }`.
3. O backend atualiza `itens.json` definindo `reservado: true` para o item.

Observação: esse fluxo mantém o comportamento anterior (envio ao webhook pelo navegador). Garanta que o `WEBHOOK_URL` use HTTPS para evitar bloqueio de conteúdo misto quando a página for servida em HTTPS.

