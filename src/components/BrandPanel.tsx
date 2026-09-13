import treeMark from '../assets/tree-mark.svg'

/** Left-hand welcome panel for sign-in style pages (wide screens only). */
export default function BrandPanel() {
  const base = import.meta.env.BASE_URL
  return (
    <div className="hidden w-[420px] shrink-0 flex-col items-center text-center lg:flex">
      <div className="flex items-center gap-2 self-start text-[22px] font-medium text-moss"><img src={treeMark} alt="" width={34} height={34} />Sim Family Tree</div>
      {/* The illustration's tree sits right of centre in its file; over-size and shift it so the trunk lands mid-panel. */}
      <div className="art-fade my-2 w-full overflow-hidden">
        <img src={`${base}art/heritage-tree-640.webp`} srcSet={`${base}art/heritage-tree-640.webp 640w, ${base}art/heritage-tree-1200.webp 1200w`} sizes="480px" alt="" width={640} height={427} className="w-[115%] max-w-none -translate-x-[16%]" />
      </div>
      <p className="text-[12px] uppercase tracking-[.12em] text-brass">Connected through generations</p>
    </div>
  )
}
