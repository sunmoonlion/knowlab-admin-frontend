'use client'
import {
  manualReleaseSchema,
  manualReleasesSchema,
  manualReleaseDetailSchema,
} from '@/contracts/manual-release'
import { requestJson } from '@/lib/api/client'
const base = '/api/admin/v1/knowbot-manual-releases'
export async function fetchManualReleases() {
  return manualReleasesSchema.parse(await requestJson(base)).items
}
export async function fetchManualRelease(id: string) {
  return manualReleaseDetailSchema.parse(await requestJson(`${base}/${encodeURIComponent(id)}`))
}
export async function decideManualRelease(
  id: string,
  approved: boolean,
  reason: string,
  csrfToken: string,
) {
  return manualReleaseSchema.parse(
    await requestJson(`${base}/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      csrfToken,
      body: { approved, reason, acknowledge_unretested: true },
    }),
  )
}
