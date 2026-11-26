import { useQuery } from '@tanstack/react-query'
import { call, pb } from './pb'

/** What GET /api/sft/health reports (pocketbase/pb_hooks/health.pb.js). Any part may be null when the server couldn't check it. */
export interface BackupFile { count: number; at: string | null; bytes: number }
export interface Disk { total: number; used: number; free: number }
export interface SiteHealth {
  checkedAt: string
  backups: { snapshot: BackupFile | null; snapshotLastRunFailed: boolean; builtIn: (BackupFile & { keep: number }) | null }
  storage: { used: number | null; site: Disk | null; backup: Disk | null }
  email: { ready: boolean; from: string | null; problems: { at: string; message: string }[] }
  totals: { people: number; media: number; sources: number; members: number }
}

export const useSiteHealth = (enabled: boolean) =>
  useQuery({ queryKey: ['siteHealth'], enabled, staleTime: 60_000, queryFn: () => call(pb.send<SiteHealth>('/api/sft/health', {})) })

export const sendTestEmail = () => call(pb.send<{ ok: boolean; to: string }>('/api/sft/test-email', { method: 'POST' }))
