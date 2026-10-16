import { z } from 'zod'

const sameOriginPath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('://') &&
      !value.includes('\\'),
    'must be a same-origin absolute path',
  )

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default('knowlab-admin'),
  NEXT_PUBLIC_API_URL: sameOriginPath.default('/api'),
})

export type ClientEnv = z.infer<typeof clientEnvSchema>

export function parseClientEnv(input: Record<string, string | undefined>): ClientEnv {
  return clientEnvSchema.parse(input)
}

export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
})
