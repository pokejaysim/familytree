import { useSignedUrl } from '../lib/queries'
import type { Person } from '../lib/types'

export default function Avatar({ person, size = 40 }: { person: Pick<Person, 'photo_path' | 'given_names' | 'surname' | 'sex'>; size?: number }) {
  const { data: url } = useSignedUrl(person.photo_path)
  const initials = `${person.given_names[0] ?? ''}${person.surname[0] ?? ''}`.toUpperCase() || '?'
  const tone = person.sex === 'F' ? 'bg-rose-100 text-rose-800' : person.sex === 'M' ? 'bg-sky-100 text-sky-800' : 'bg-line text-ink/60'
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-medium ${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials}</div>
  )
}
