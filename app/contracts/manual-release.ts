import { z } from 'zod'

export const manualReleaseSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  draft_id: z.string().uuid(),
  owner_subject: z.string(),
  manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  baseline_test_id: z.string().uuid(),
  reason: z.string(),
  evidence: z.object({
    change_summary: z.string(),
    verification: z.string(),
    limitations: z.string(),
  }),
  requested_at: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  decision_reason: z.string().nullable(),
  expert_id: z.string().uuid().nullable(),
})
export const manualReleasesSchema = z.object({ items: z.array(manualReleaseSchema) })
export const manualReleaseDetailSchema = z.object({
  request: manualReleaseSchema,
  manifest: z.record(z.string(), z.unknown()),
})
export type ManualRelease = z.infer<typeof manualReleaseSchema>
export type ManualReleaseInput = {
  baseline_test_id: string
  manifest_sha256: string
  reason: string
  change_summary: string
  verification: string
  limitations: string
  authorize_reviewer: true
  acknowledge_unretested: true
}
