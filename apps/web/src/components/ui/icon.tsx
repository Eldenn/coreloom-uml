import {
  ActivityIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BellIcon,
  BlocksIcon,
  BookOpenIcon,
  ChartColumnIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  CommandIcon,
  CopyIcon,
  CreditCardIcon,
  DownloadIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  GlobeIcon,
  HouseIcon,
  InfoIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  LifeBuoyIcon,
  ListFilterIcon,
  LogOutIcon,
  type LucideProps,
  MenuIcon,
  MoonIcon,
  PackageIcon,
  PaletteIcon,
  PlusIcon,
  RocketIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  StarIcon,
  SunIcon,
  TerminalIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TypeIcon,
  UserIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react'

/** GitHub mark, drawn in the Lucide line style (Lucide no longer ships brand icons). */
function GithubIcon({ size = 24, strokeWidth = 2, ...props }: Omit<LucideProps, 'ref'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  )
}

/**
 * The Coreloom icon names, mapped to Lucide. In app code you can also import
 * Lucide icons directly (`import { ZapIcon } from "lucide-react"`); this map
 * keeps the names used across the design system's docs and previews.
 */
const icons = {
  search: SearchIcon,
  terminal: TerminalIcon,
  copy: CopyIcon,
  check: CheckIcon,
  x: XIcon,
  sun: SunIcon,
  moon: MoonIcon,
  chevronRight: ChevronRightIcon,
  chevronDown: ChevronDownIcon,
  zap: ZapIcon,
  blocks: BlocksIcon,
  package: PackageIcon,
  palette: PaletteIcon,
  arrowRight: ArrowRightIcon,
  command: CommandIcon,
  menu: MenuIcon,
  externalLink: ExternalLinkIcon,
  star: StarIcon,
  github: GithubIcon,
  sliders: SlidersHorizontalIcon,
  bookOpen: BookOpenIcon,
  layoutGrid: LayoutGridIcon,
  type: TypeIcon,
  bell: BellIcon,
  info: InfoIcon,
  alertTriangle: AlertTriangleIcon,
  alertCircle: AlertCircleIcon,
  checkCircle: CheckCircleIcon,
  home: HouseIcon,
  folder: FolderIcon,
  rocket: RocketIcon,
  barChart: ChartColumnIcon,
  settings: SettingsIcon,
  users: UsersIcon,
  user: UserIcon,
  plus: PlusIcon,
  moreHorizontal: EllipsisIcon,
  logOut: LogOutIcon,
  chevronsUpDown: ChevronsUpDownIcon,
  creditCard: CreditCardIcon,
  arrowUpRight: ArrowUpRightIcon,
  arrowLeft: ArrowLeftIcon,
  gitBranch: GitBranchIcon,
  clock: ClockIcon,
  filter: ListFilterIcon,
  download: DownloadIcon,
  activity: ActivityIcon,
  trendingUp: TrendingUpIcon,
  trendingDown: TrendingDownIcon,
  lifeBuoy: LifeBuoyIcon,
  key: KeyRoundIcon,
  globe: GlobeIcon,
  shield: ShieldCheckIcon,
  fileText: FileTextIcon,
} as const

type IconName = keyof typeof icons

function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  ...props
}: Omit<LucideProps, 'ref'> & { name: IconName; size?: number }) {
  const Glyph = icons[name]
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the name can come from data at runtime; an unknown one renders nothing.
  if (!Glyph) return null
  return <Glyph data-slot="icon" aria-hidden size={size} strokeWidth={strokeWidth} {...props} />
}

export { Icon, type IconName, icons }
