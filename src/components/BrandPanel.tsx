import treeMark from '../assets/tree-mark.svg'

/** Left-hand welcome panel for sign-in style pages (wide screens only). */
export default function BrandPanel() {
  const base = import.meta.env.BASE_URL
  return (
    <div className="hidden w-[420px] shrink-0 flex-col items-start lg:flex">
      <div className="flex items-center gap-2 text-[22px] font-medium text-moss"><img src={treeMark} alt="" width={34} height={34} />Sim Family Tree</div>
      <img src={`${base}art/heritage-tree-640.webp`} srcSet={`${base}art/heritage-tree-640.webp 640w, ${base}art/heritage-tree-1200.webp 1200w`} sizes="420px" alt="" width={640} height={427} className="-my-4 w-full" />
      <p className="text-[12px] uppercase tracking-[.12em] text-brass">Connected through generations</p>
      <h2 className="mt-1 text-[34px] leading-tight">Every family has a story.</h2>
      <p className="mt-2 text-ink-soft">Keep the people, memories, and connections that make our family ours.</p>
    </div>
  )
}
