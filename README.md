# ⚡ CeifaBot — Sistema de Cobrança Automática via WhatsApp

Sistema completo e moderno para automação e gestão de cobranças mensais via WhatsApp. Cadastre grupos com datas de vencimento e horários pré-definidos, vincule clientes com seus respectivos valores e deixe o worker disparar as mensagens automaticamente.

---

## ✨ Funcionalidades

- 📱 **Conexão WhatsApp no Painel**: Escaneie o QR Code diretamente pela interface web (via Baileys).
- 👥 **Gestão de Grupos de Cobrança**: Defina horário de disparo, dia de vencimento e templates de mensagem personalizados.
- 👤 **Cadastro de Clientes**: Nome, número de telefone e valor da cobrança individual.
- 📝 **Templates Dinâmicos**: Mensagens automáticas com interpolação de variáveis (`{{nome}}`, `{{valor}}`, `{{vencimento}}`).
- ⏱️ **Disparo Agendado (Worker)**: Agendamento automático mensal e fila de envio para evitar bloqueios.
- 🔒 **Autenticação Segura**: Controle de acesso com email e senha via Better Auth.
- 📊 **Fila e Histórico de Envios**: Acompanhe em tempo real o status dos envios no dashboard.

---

## 🛠️ Tecnologias

- **Frontend / Framework**: [Next.js 16](https://nextjs.org/) (App Router, React 19)
- **Estilização**: [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Banco de Dados**: PostgreSQL com [Drizzle ORM](https://orm.drizzle.team/)
- **Autenticação**: [Better Auth](https://www.better-auth.com/)
- **Integração WhatsApp**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) (sem necessidade da API oficial)
- **Agendamento & Workers**: Node.js com TypeScript via `tsx`

---

## 🚀 Como Rodar o Projeto

### Pré-requisitos

- **Node.js 20+** instalado
- **pnpm** instalado (`npm install -g pnpm`)
- Instância do **PostgreSQL** acessível:
  - Recomendado: [Supabase](https://supabase.com) (plano gratuito).
  - *Dica*: Utilize a string de conexão do **Connection Pooler** (porta `6543`) para compatibilidade com redes IPv4.

---

### 1. Clonar o repositório

```bash
git clone https://github.com/JoaoBarreto13/sistema-de-cobrancaz.git
cd sistema-de-cobrancaz
```

### 2. Instalar as dependências

```bash
pnpm install
```

### 3. Configurar variáveis de ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e preencha as configurações:

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `DATABASE_URL` | String de conexão do PostgreSQL (Pooler Supabase) | `postgresql://postgres:senha@pooler.supabase.com:6543/postgres` |
| `SESSION_SECRET` | Chave secreta para assinar sessões | `uma_chave_longa_e_aleatoria` |
| `BETTER_AUTH_SECRET` | Segredo para o Better Auth (pode ser igual a `SESSION_SECRET`) | `uma_chave_longa_e_aleatoria` |
| `BETTER_AUTH_URL` | URL base da aplicação web | `http://localhost:5000` |
| `BAILEYS_AUTH_DIR` | Diretório para persistir os tokens do WhatsApp | `.baileys-auth` |

### 4. Preparar o banco de dados

Execute o script de inicialização para criar as tabelas:

```bash
pnpm db:setup
```

### 5. Iniciar os processos

Para o funcionamento completo, execute **ambos** os processos em terminais separados:

```bash
# Terminal 1: Servidor Web (Dashboard)
pnpm dev

# Terminal 2: Worker de envio do WhatsApp
pnpm worker
```

O dashboard estará disponível em: [`http://localhost:5000`](http://localhost:5000).

---

## 📱 Pareamento com o WhatsApp

1. Abra o navegador em `http://localhost:5000` e crie sua conta de administrador.
2. Acesse a aba **WhatsApp** no menu de navegação.
3. Abra o WhatsApp no seu smartphone, vá em **Aparelhos Conectados > Conectar um aparelho** e escaneie o QR Code exibido na tela.
4. Assim que a conexão for confirmada, acesse a aba **Grupos** e configure suas cobranças.

---

## 📝 Templates de Mensagem

Você pode personalizar o texto enviado para cada grupo utilizando as tags dinâmicas:

| Variável | Descrição | Exemplo Gerado |
| :--- | :--- | :--- |
| `{{nome}}` | Nome cadastrado do cliente | `João Silva` |
| `{{valor}}` | Valor da cobrança formatado em BRL | `R$ 150,00` |
| `{{vencimento}}` | Dia do vencimento do grupo | `10` |

*Exemplo de Template:*
```text
Olá, {{nome}}! Tudo bem?
Passando para lembrar que sua mensalidade no valor de {{valor}} vence no dia {{vencimento}}.
Segue chave Pix para pagamento: sua-chave-pix-aqui
```

---

## 📜 Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `pnpm dev` | Inicia o Next.js em modo de desenvolvimento na porta 5000 |
| `pnpm worker` | Inicia o worker do Baileys e scheduler de mensagens |
| `pnpm build` | Gera o build de produção do Next.js |
| `pnpm start` | Inicia o app em modo de produção |
| `pnpm db:setup` | Cria as tabelas do banco de dados |
| `pnpm db:push` | Sincroniza o schema do Drizzle com o banco |
| `pnpm db:studio` | Abre o Drizzle Studio para visualizar dados no navegador |

---

## ⚠️ Aviso Legal

Este projeto utiliza o Baileys para comunicação com o WhatsApp via Web. O uso deve respeitar os [Termos de Serviço do WhatsApp](https://www.whatsapp.com/legal/). Não utilize para spam ou envios em massa não solicitados.
