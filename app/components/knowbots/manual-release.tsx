'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  fetchManualRelease,
  fetchManualReleases,
  decideManualRelease,
} from '@/lib/knowbots/manual-release'
import { KEY } from './shared'
export function ManualReleaseQueue({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbots.manualRelease')
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const queue = useQuery({
    queryKey: [...KEY, 'manual-releases'],
    queryFn: fetchManualReleases,
    enabled: open,
  })
  return (
    <details className="my-4 rounded border p-4" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">{t('queue')}</summary>
      {queue.isError ? <p role="alert">{t('failed')}</p> : null}
      {queue.data?.length === 0 ? <p>{t('empty')}</p> : null}
      <ul className="my-2 space-y-2">
        {queue.data?.map((r) => (
          <li key={r.id}>
            <button className="secondary-button" onClick={() => setPicked(r.id)}>
              {t(r.status)} · {r.reason} · {t('inspect')}
            </button>
          </li>
        ))}
      </ul>
      {picked ? <Decision key={picked} id={picked} csrfToken={csrfToken} /> : null}
    </details>
  )
}
function Decision({ id, csrfToken }: { id: string; csrfToken: string }) {
  const t = useTranslations('knowbots.manualRelease')
  const cache = useQueryClient()
  const record = useQuery({
    queryKey: [...KEY, 'manual-release', id],
    queryFn: () => fetchManualRelease(id),
  })
  const [reason, setReason] = useState('')
  const [agree, setAgree] = useState(false)
  const decide = useMutation({
    mutationFn: (approved: boolean) => decideManualRelease(id, approved, reason, csrfToken),
    onSuccess: () => cache.invalidateQueries({ queryKey: KEY }),
  })
  if (record.isError) return <p role="alert">{t('failed')}</p>
  if (!record.data) return null
  const { request, manifest } = record.data
  return (
    <section className="space-y-3 border-t pt-3">
      <p>{t('notice')}</p>
      <p>{request.reason}</p>
      {(['change_summary', 'verification', 'limitations'] as const).map((key) => (
        <p key={key}>
          <strong>{t(key)}: </strong>
          {request.evidence[key]}
        </p>
      ))}
      <p>
        {t('digest')}: <code className="break-all">{request.manifest_sha256}</code>
      </p>
      <details>
        <summary>{t('package')}</summary>
        <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      </details>
      {request.status === 'pending' ? (
        <>
          <label className="block">
            {t('decision')}
            <textarea
              className="block w-full rounded border p-2"
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="flex gap-2">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            {t('reviewAck')}
          </label>
          <div className="flex gap-2">
            {[true, false].map((approved) => (
              <button
                key={String(approved)}
                className="secondary-button"
                disabled={!agree || !reason.trim() || decide.isPending}
                onClick={() => decide.mutate(approved)}
              >
                {t(approved ? 'agree' : 'reject')}
              </button>
            ))}
          </div>
          {decide.isError ? <p role="alert">{t('failed')}</p> : null}
        </>
      ) : (
        <p>
          {t(request.status)} · {request.decided_by} · {request.decision_reason}
        </p>
      )}
    </section>
  )
}
