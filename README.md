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

Integração com GitHub (opcional)
--------------------------------
Você pode configurar o servidor para, em vez de escrever localmente, atualizar o arquivo `itens.json` diretamente no repositório GitHub usando a API. Para isso, defina as seguintes variáveis de ambiente antes de iniciar o servidor:

```bash
export GITHUB_TOKEN="<seu_personal_access_token_com_perm_repo>"
export GITHUB_OWNER="seu_usuario_ou_organizacao"
export GITHUB_REPO="nome_do_repositorio"
# branch opcional (default: main)
export GITHUB_BRANCH="main"
```

Requisitos/observações:
- O token precisa ter permissão para escrever no repositório (scope: repo).
- Quando essas variáveis estiverem definidas, o servidor usará a API do GitHub para ler/escrever `itens.json` (commitando as mudanças). Se a operação via GitHub falhar, o servidor tentará escrever localmente como fallback.
- Isso é útil se você estiver hospedando a lista apenas via GitHub Pages e quiser registrar as reservas no próprio repositório.

Integração via Cloudflare Worker (opcional)
-------------------------------------------
Se preferir que a gravação no repositório seja feita por uma Cloudflare Worker (por exemplo para manter o token GitHub fora do servidor), você pode configurar o servidor para enviar o conteúdo para a sua Worker, que então fará o commit no GitHub.

Defina antes de iniciar o servidor:

```bash
export CF_WORKER_URL="https://dawn-sun-d829.raragao803.workers.dev/"
# (opcional) um segredo compartilhado entre seu servidor e a worker
export CF_WORKER_SECRET="um_valor_secreto"
```

O servidor enviará um POST para `CF_WORKER_URL` com JSON:

```json
{
	"path": "itens.json",
	"content": "...conteúdo JSON completo como string..."
}
```

Se `CF_WORKER_SECRET` estiver definido, o servidor inclui o header `X-Worker-Secret` com esse valor — a sua Worker deve validar o secret antes de executar o commit.

Espera-se que a Worker responda com status 200/2xx em caso de sucesso; caso contrário o servidor tentará a integração direta pelo GitHub (se configurada) e por fim gravará localmente.

Segurança:
- Coloque o token GitHub apenas em um local seguro. Se usar a Worker para fazer commits, coloque o token no ambiente da Worker (e não no servidor). A Worker será responsável por autenticar com o GitHub e por aplicar o commit.
- Proteja a worker verificando `X-Worker-Secret` ou outro mecanismo de autenticação.


Fluxo recomendado (preserva envio direto ao webhook):

1. O frontend envia a reserva diretamente para o `WEBHOOK_URL` (como antes).
2. Se o webhook responder com `{ "success": true }`, o frontend faz uma chamada POST para `/api/marcar` com `{ "id": <itemId> }`.
3. O backend atualiza `itens.json` definindo `reservado: true` para o item.

Observação: esse fluxo mantém o comportamento anterior (envio ao webhook pelo navegador). Garanta que o `WEBHOOK_URL` use HTTPS para evitar bloqueio de conteúdo misto quando a página for servida em HTTPS.

