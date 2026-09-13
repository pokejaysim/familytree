/** Illustrated empty state using the botanical asset pack. */
export default function EmptyState({ art, title, text, action, wide }: {
  art: 'first-branch' | 'family-archive' | 'heritage-tree'
  title: string
  text: string
  action?: { label: string; onClick: () => void }
  wide?: boolean
}) {
  const base = import.meta.env.BASE_URL
  return (
    <div className="card flex flex-col items-center bg-paper px-6 py-8 text-center">
      <img src={`${base}art/${art}-640.webp`} alt="" width={640} height={480} className={`art-fade ${wide ? 'w-[300px]' : 'w-[220px]'} -my-4`} />
      <h3 className="mt-2 text-2xl">{title}</h3>
      <p className="mt-1 max-w-sm text-ink-mute">{text}</p>
      {action && <button className="mt-4 text-[12px] uppercase tracking-[.12em] text-brass underline underline-offset-4 hover:text-moss" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}
