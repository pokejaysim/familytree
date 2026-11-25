import { useState, type FormEvent } from 'react'
import type { Person, Sex } from '../lib/types'
import type { PersonInput } from '../lib/queries'
import { toSortDate } from '../lib/dates'

export default function PersonForm({
  initial, onSubmit, onCancel, submitting, submitLabel = 'Save',
}: { initial?: Partial<Person>; onSubmit: (p: PersonInput) => void; onCancel: () => void; submitting?: boolean; submitLabel?: string }) {
  const [f, setF] = useState({
    given_names: initial?.given_names ?? '',
    surname: initial?.surname ?? '',
    maiden_name: initial?.maiden_name ?? '',
    nickname: initial?.nickname ?? '',
    sex: (initial?.sex ?? 'U') as Sex,
    birth_date: initial?.birth_date ?? '',
    birth_place: initial?.birth_place ?? '',
    death_date: initial?.death_date ?? '',
    death_place: initial?.death_place ?? '',
    is_living: initial?.is_living ?? false,
    bio: initial?.bio ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const nz = (s: string) => (s.trim() ? s.trim() : null)
    onSubmit({
      given_names: f.given_names.trim(),
      surname: f.surname.trim(),
      maiden_name: nz(f.maiden_name),
      nickname: nz(f.nickname),
      sex: f.sex,
      birth_date: nz(f.birth_date),
      birth_date_sort: toSortDate(f.birth_date),
      birth_place: nz(f.birth_place),
      death_date: f.is_living ? null : nz(f.death_date),
      death_date_sort: f.is_living ? null : toSortDate(f.death_date),
      death_place: f.is_living ? null : nz(f.death_place),
      is_living: f.is_living,
      bio: nz(f.bio),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Given names</span><input className="input" required value={f.given_names} onChange={set('given_names')} autoFocus /></label>
        <label className="block"><span className="label">Surname</span><input className="input" value={f.surname} onChange={set('surname')} /></label>
        <label className="block"><span className="label">Maiden name</span><input className="input" value={f.maiden_name} onChange={set('maiden_name')} /></label>
        <label className="block"><span className="label">Nickname</span><input className="input" value={f.nickname} onChange={set('nickname')} /></label>
        <label className="block">
          <span className="label">Sex</span>
          <select className="input" value={f.sex} onChange={set('sex')}>
            <option value="U">Unknown</option><option value="M">Male</option><option value="F">Female</option><option value="X">Other</option>
          </select>
        </label>
        <div className="flex items-end pb-2">
          <label className="flex min-h-11 items-center gap-2 text-[16px]"><input type="checkbox" className="h-5 w-5 accent-moss" checked={f.is_living} onChange={(e) => setF({ ...f, is_living: e.target.checked })} /> Still living</label>
        </div>
        <label className="block"><span className="label">Birth date</span><input className="input" placeholder="e.g. 12 Mar 1921 or abt 1921" value={f.birth_date} onChange={set('birth_date')} /></label>
        <label className="block"><span className="label">Birth place</span><input className="input" value={f.birth_place} onChange={set('birth_place')} /></label>
        {!f.is_living && (<>
          <label className="block"><span className="label">Death date</span><input className="input" value={f.death_date} onChange={set('death_date')} /></label>
          <label className="block"><span className="label">Death place</span><input className="input" value={f.death_place} onChange={set('death_place')} /></label>
        </>)}
      </div>
      <label className="block"><span className="label">Notes / biography</span><textarea className="input min-h-24" value={f.bio} onChange={set('bio')} /></label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Sending…' : submitLabel}</button>
      </div>
    </form>
  )
}
