import { useState, type FormEvent } from 'react'
import type { Person, Sex } from '../lib/types'
import type { PersonInput } from '../lib/queries'
import { toSortDate } from '../lib/dates'

export default function PersonForm({
  initial, onSubmit, onCancel, submitting,
}: { initial?: Partial<Person>; onSubmit: (p: PersonInput) => void; onCancel: () => void; submitting?: boolean }) {
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
        <div><label className="label">Given names</label><input className="input" value={f.given_names} onChange={set('given_names')} autoFocus /></div>
        <div><label className="label">Surname</label><input className="input" value={f.surname} onChange={set('surname')} /></div>
        <div><label className="label">Maiden name</label><input className="input" value={f.maiden_name} onChange={set('maiden_name')} /></div>
        <div><label className="label">Nickname</label><input className="input" value={f.nickname} onChange={set('nickname')} /></div>
        <div>
          <label className="label">Sex</label>
          <select className="input" value={f.sex} onChange={set('sex')}>
            <option value="U">Unknown</option><option value="M">Male</option><option value="F">Female</option><option value="X">Other</option>
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_living} onChange={(e) => setF({ ...f, is_living: e.target.checked })} /> Living</label>
        </div>
        <div><label className="label">Birth date</label><input className="input" placeholder="e.g. 12 Mar 1921 or abt 1921" value={f.birth_date} onChange={set('birth_date')} /></div>
        <div><label className="label">Birth place</label><input className="input" value={f.birth_place} onChange={set('birth_place')} /></div>
        {!f.is_living && (<>
          <div><label className="label">Death date</label><input className="input" value={f.death_date} onChange={set('death_date')} /></div>
          <div><label className="label">Death place</label><input className="input" value={f.death_place} onChange={set('death_place')} /></div>
        </>)}
      </div>
      <div><label className="label">Notes / biography</label><textarea className="input min-h-24" value={f.bio} onChange={set('bio')} /></div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
