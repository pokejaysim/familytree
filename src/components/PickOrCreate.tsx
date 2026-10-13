import { useState } from 'react'
import type { Person } from '../lib/types'
import type { PersonInput } from '../lib/queries'
import Modal from './Modal'
import PersonPicker from './PersonPicker'
import PersonForm from './PersonForm'

/**
 * Modal that yields a Person either picked from the tree or newly described. A new person is only a draft here
 * (`draftPerson` gives it an id); the caller submits it together with the relationship in one change request.
 */
export default function PickOrCreate({
  title, people, exclude, onClose, onPick, draftPerson, defaults, submitLabel,
}: {
  title: string
  people: Person[]
  exclude: string[]
  onClose: () => void
  onPick: (p: Person, isNew: boolean) => Promise<void> | void
  draftPerson: (input: PersonInput) => Person
  defaults?: Partial<Person>
  submitLabel?: string
}) {
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = async (p: Person, isNew: boolean) => { setBusy(true); try { await onPick(p, isNew); onClose() } finally { setBusy(false) } }
  return (
    <Modal title={title} onClose={onClose}>
      {creating ? (
        <PersonForm initial={defaults} submitting={busy} submitLabel={submitLabel} onCancel={() => setCreating(false)} onSubmit={(input) => done(draftPerson(input), true)} />
      ) : (
        <PersonPicker people={people} exclude={exclude} onPick={(p) => done(p, false)} onCreateNew={() => setCreating(true)} />
      )}
    </Modal>
  )
}
