import { useState } from 'react'
import type { Person } from '../lib/types'
import type { PersonInput } from '../lib/queries'
import Modal from './Modal'
import PersonPicker from './PersonPicker'
import PersonForm from './PersonForm'

/** Modal that yields a Person either picked from the tree or newly created. */
export default function PickOrCreate({
  title, people, exclude, onClose, onPick, createPerson, defaults,
}: {
  title: string
  people: Person[]
  exclude: string[]
  onClose: () => void
  onPick: (p: Person) => Promise<void> | void
  createPerson: (input: PersonInput) => Promise<Person>
  defaults?: Partial<Person>
}) {
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = async (p: Person) => { setBusy(true); try { await onPick(p); onClose() } finally { setBusy(false) } }
  return (
    <Modal title={title} onClose={onClose}>
      {creating ? (
        <PersonForm initial={defaults} submitting={busy} onCancel={() => setCreating(false)} onSubmit={async (input) => { setBusy(true); const p = await createPerson(input); await done(p) }} />
      ) : (
        <PersonPicker people={people} exclude={exclude} onPick={done} onCreateNew={() => setCreating(true)} />
      )}
    </Modal>
  )
}
