/**
 * Cria o primeiro usuário administrador.
 * Uso: ADMIN_USERNAME=joao ADMIN_PASSWORD=minhasenha pnpm user:admin
 */
import 'dotenv/config'
import { auth } from '../lib/auth'

const username = (process.env.ADMIN_USERNAME ?? '').toLowerCase().trim()
const password = process.env.ADMIN_PASSWORD ?? ''

if (!username || username.length < 3) {
  console.error('Defina ADMIN_USERNAME (mínimo 3 caracteres)')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Defina ADMIN_PASSWORD (mínimo 8 caracteres)')
  process.exit(1)
}

async function main() {
  try {
    const ctx = await auth.$context
    const hash = await ctx.password.hash(password)

    const user = await ctx.internalAdapter.createUser({
      email: `${username}@ceifabot.local`,
      name: username,
      emailVerified: true,
      username,
      displayUsername: username,
      role: 'admin',
    })

    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: hash,
    })

    console.log(`✓ Admin "${username}" criado com sucesso.`)
  } catch (err) {
    console.error('Falha ao criar admin:', (err as Error).message)
    console.error('\nPlano B: abra o app, cadastre um usuário normalmente, então execute:')
    console.error(`  UPDATE "user" SET role = 'admin', username = '${username}', "displayUsername" = '${username}' WHERE email = '${username}@ceifabot.local';`)
    process.exit(1)
  }
}

main()
