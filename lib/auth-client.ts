'use client'
import { createAuthClient } from 'better-auth/react'
import { usernameClient, adminClient } from 'better-auth/client/plugins'
export const authClient = createAuthClient({ plugins: [usernameClient(), adminClient()] })
