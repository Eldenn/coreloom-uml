// Coreloom's mark (from the coreloom-ui starter) with the Coreloom UML wordmark.
export function Brand({ className }: { className?: string }) {
  return (
    <span className={'inline-flex items-center gap-2 ' + (className ?? '')}>
      <CatMark className="size-7 shrink-0" />
      <span className="font-display text-[19px] font-bold tracking-[-0.03em] text-foreground">
        Core<span className="text-primary-text">loom</span> UML
      </span>
    </span>
  )
}

/** The symbol alone. Orange with cyan pupils on dark; a deeper orange with graphite pupils on light. */
export function CatMark({ className }: { className?: string }) {
  return (
    <svg viewBox="36 26 184 204" aria-hidden className={className}>
      <path
        fillRule="evenodd"
        className="fill-[#EF9140] [[data-theme=light]_&]:fill-[#C9611A]"
        d="M40 132 L60 30 L110 72 C120 70 136 70 146 72 L196 30 L216 132 C216 190 178 226 128 226 C78 226 40 190 40 132 Z M70.89 143.27 A36 36 0 0 1 121.11 156.73 A36 36 0 0 1 70.89 143.27 Z M134.89 156.73 A36 36 0 0 1 185.11 143.27 A36 36 0 0 1 134.89 156.73 Z"
      />
      <path
        className="fill-[#1CE0D3] [[data-theme=light]_&]:fill-[#15171C]"
        d="M96 139 A5 11 0 0 1 96 161 A5 11 0 0 1 96 139 Z M160 139 A5 11 0 0 1 160 161 A5 11 0 0 1 160 139 Z"
      />
    </svg>
  )
}
