import { z } from 'zod'

const principalSchema = z
  .object({
    actor_id: z.uuid(),
    app: z.enum(['tpl', 'knowfeed', 'knowbase', 'research']),
    surface: z.literal('admin'),
    display_name: z.string().max(256).nullable().optional(),
    email: z.email().max(320).nullable().optional(),
    roles: uniqueClaimList(),
    scopes: uniqueClaimList(),
    // Python's datetime.isoformat() emits a valid RFC 3339 `+00:00` offset.
    // Accept explicit offsets as well as `Z`; the contract must not depend on
    // one language runtime's UTC serialization spelling.
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict()

export const browserSessionSchema = z
  .object({
    contract_version: z.literal(1),
    authenticated: z.literal(true),
    user: principalSchema,
    csrf_token: z.string().min(32).max(256),
  })
  .strict()

export type BrowserSession = z.infer<typeof browserSessionSchema>

function uniqueClaimList() {
  return z
    .array(z.string().min(1).max(128))
    .refine((items) => new Set(items).size === items.length, 'claims must be unique')
}
