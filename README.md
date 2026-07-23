# Cobrar — Bot de Cobrança via WhatsApp

Sistema de cobrança automática por WhatsApp. Cadastre grupos de cobrança, clientes e deixe o bot disparar as mensagens mensalmente no horário configurado.

## Stack

- **Next.js 16** (App Router) — dashboard web
- **PostgreSQL + Drizzle ORM** — banco de dados
- **Better Auth** — autenticação email/senha
- **Baileys** — integração WhatsApp (sem API oficial)
- **shadcn/ui + Tailwind CSS 4** — interface

---

## Rodando localmente

### Pré-requisitos

- Node.js 20+ e pnpm (`npm i -g pnpm`)
- PostgreSQL acessível publicamente (ex: [Supabase](https://supabase.com) — plano gratuito funciona)
  - Use o **connection pooler** do Supabase (porta 6543) — o host direto usa só IPv6 e pode não funcionar em algumas redes

### 1. Clone e instale

```bash
git clone https://github.com/JoaoBarreto13/sistema-de-cobrancaz.git
cd sistema-de-cobrancaz
pnpm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com seus valores:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string do PostgreSQL (use o pooler do Supabase, porta 6543) |
| `SESSION_SECRET` | String longa e aleatória para assinar sessões |
| `BETTER_AUTH_SECRET` | Segredo explícito do Better Auth; pode reutilizar o mesmo valor de `SESSION_SECRET` |
| `BETTER_AUTH_URL` | URL onde o app roda — localmente `http://localhost:5000` |
| `BAILEYS_AUTH_DIR` | Pasta para salvar a sessão do WhatsApp (padrão: `.baileys-auth`) |

### 3. Crie as tabelas

```bash
pnpm db:setup
```

### 4. Inicie os dois processos

Em terminais separados:

```bash
# Terminal 1 — dashboard web (porta 5000)
pnpm dev

# Terminal 2 — worker WhatsApp
node --import tsx/esm worker/index.ts
```

Se preferir, o comando `pnpm worker` executa o mesmo worker via Node.

### 5. Crie sua conta e pareie o WhatsApp

1. Acesse `http://localhost:5000` e crie uma conta
2. Vá em **WhatsApp** no menu e escaneie o QR code com seu celular
3. Após parear, volte ao dashboard e comece a cadastrar grupos e clientes

---

---

## Estrutura do projeto

```
app/
  actions/billing.ts   — server actions (grupos, clientes, jobs)
  page.tsx             — dashboard principal
  sign-in/             — página de login
  whatsapp/            — página de pareamento WhatsApp
components/dashboard/  — painéis de grupos, clientes e fila de mensagens
lib/
  auth.ts              — configuração Better Auth
  db/
    index.ts           — conexão PostgreSQL (Drizzle)
    schema.ts          — schema das tabelas
worker/
  index.ts             — worker Baileys: QR, scheduler mensal, fila de envio
scripts/
  setup-db.ts          — cria as tabelas se não existirem
```

## Variáveis de template nas mensagens

Use estas variáveis ao criar o template de mensagem de um grupo:

- `{{nome}}` — nome do cliente
- `{{valor}}` — valor da cobrança formatado (ex: R$ 150,00)
- `{{vencimento}}` — dia de vencimento configurado no grupo
