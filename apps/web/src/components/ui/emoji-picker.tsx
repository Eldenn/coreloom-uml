'use client'

// Coreloom UI — EmojiPicker. A small, built-in set of common emoji to react with or insert in a
// message, grouped by category and searchable by English name. `EmojiPicker` is a button that
// opens it; `EmojiPickerPanel` is the panel alone, to place in your own popover or toolbar. Arrows
// move through the grid, Enter picks, and typing in the search narrows it. Pass `emojis` for
// your own set (or one with names in your language).
import { SmileIcon } from 'lucide-react'
import * as React from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface Emoji {
  emoji: string
  /** Read to screen readers and searched ("thumbs up"). */
  name: string
  /** More words to find it by ("like", "yes"). */
  keywords?: string[]
  category: EmojiCategory
}

type EmojiCategory =
  'smileys' | 'people' | 'nature' | 'food' | 'activities' | 'travel' | 'objects' | 'symbols'

// "emoji name|keyword keyword", one category per string: short to ship, easy to edit.
const DATA: Record<EmojiCategory, string> = {
  smileys:
    '😀 grinning face|happy smile;😃 grinning face with big eyes|happy joy;😄 grinning face with smiling eyes|happy laugh;😁 beaming face|grin;😆 laughing face|lol;😅 grinning face with sweat|relief phew;🤣 rolling on the floor laughing|rofl lol;😂 face with tears of joy|lol laugh cry;🙂 slightly smiling face|smile;😉 winking face|wink;😊 smiling face with smiling eyes|blush happy;😇 smiling face with halo|angel innocent;🥰 smiling face with hearts|love;😍 smiling face with heart eyes|love crush;🤩 star struck|wow amazing;😘 face blowing a kiss|kiss love;😋 face savoring food|yum delicious;😛 face with tongue|tongue playful;😜 winking face with tongue|silly;🤪 zany face|crazy silly;🤔 thinking face|hmm think;🤨 face with raised eyebrow|skeptical doubt;😐 neutral face|meh;😑 expressionless face|blank;😶 face without mouth|silent;🙄 face with rolling eyes|eyeroll;😏 smirking face|smirk;😬 grimacing face|awkward oops;😌 relieved face|calm relief;😔 pensive face|sad;😴 sleeping face|sleep tired zzz;😷 face with medical mask|sick mask;🤒 face with thermometer|sick ill;🤯 exploding head|mind blown shocked;🥳 partying face|party celebrate;😎 smiling face with sunglasses|cool;🤓 nerd face|geek;😕 confused face|confused;😟 worried face|worried;😮 face with open mouth|surprised wow;😲 astonished face|shocked;😳 flushed face|embarrassed;🥺 pleading face|please puppy;😢 crying face|sad tear;😭 loudly crying face|sob sad;😱 face screaming in fear|scream scared;😤 face with steam from nose|frustrated;😡 enraged face|angry mad;🤬 face with symbols on mouth|swear angry;💀 skull|dead lol;👻 ghost|boo halloween;🤖 robot|bot ai',
  people:
    '👍 thumbs up|like yes approve +1;👎 thumbs down|dislike no -1;👌 ok hand|okay perfect;✌️ victory hand|peace;🤞 crossed fingers|luck hope;🤝 handshake|deal agreement;👏 clapping hands|applause bravo;🙌 raising hands|hooray celebrate;👐 open hands|hug;🙏 folded hands|please thanks pray;💪 flexed biceps|strong;👋 waving hand|hello hi bye;🤙 call me hand|shaka;👉 backhand index pointing right|point right;👈 backhand index pointing left|point left;👆 backhand index pointing up|point up;👇 backhand index pointing down|point down;☝️ index pointing up|one point;✋ raised hand|stop high five;🤚 raised back of hand|hand;🖐️ hand with fingers splayed|five;🫶 heart hands|love;👀 eyes|look see watching;🧠 brain|smart think;🫡 saluting face|salute respect;🤷 person shrugging|shrug dunno;🤦 person facepalming|facepalm;🙋 person raising hand|question me;🙆 person gesturing ok|ok yes;🙅 person gesturing no|no stop;🧑‍💻 technologist|developer coder;🧑‍🎨 artist|designer;🧑‍🚀 astronaut|space;🧑‍🍳 cook|chef;🧑‍🏫 teacher|school;👶 baby|child',
  nature:
    '🐶 dog face|puppy pet;🐱 cat face|kitten pet;🐭 mouse face|mouse;🦊 fox|fox;🐻 bear|bear;🐼 panda|panda;🐨 koala|koala;🐯 tiger face|tiger;🦁 lion|lion;🐮 cow face|cow;🐷 pig face|pig;🐸 frog|frog;🐵 monkey face|monkey;🙈 see no evil monkey|monkey oops;🐔 chicken|chicken;🐧 penguin|penguin;🐦 bird|bird;🦄 unicorn|magic;🐝 honeybee|bee;🦋 butterfly|butterfly;🐢 turtle|slow;🐍 snake|snake;🐙 octopus|octopus;🐳 spouting whale|whale;🌵 cactus|desert;🌲 evergreen tree|tree pine;🌳 deciduous tree|tree;🌴 palm tree|beach;🌱 seedling|plant grow;🍀 four leaf clover|luck;🍁 maple leaf|autumn fall;🌸 cherry blossom|flower spring;🌹 rose|flower love;🌻 sunflower|flower;🌞 sun with face|sun;🌙 crescent moon|moon night;⭐ star|star;🌈 rainbow|rainbow;☀️ sun|sunny weather;⛅ sun behind cloud|cloudy;🌧️ cloud with rain|rain;❄️ snowflake|snow cold winter;🔥 fire|hot lit;💧 droplet|water;🌊 water wave|wave ocean sea',
  food: '🍎 red apple|apple fruit;🍐 pear|fruit;🍊 tangerine|orange fruit;🍋 lemon|fruit;🍌 banana|fruit;🍉 watermelon|fruit summer;🍇 grapes|fruit;🍓 strawberry|fruit;🍒 cherries|fruit;🍑 peach|fruit;🥭 mango|fruit;🍍 pineapple|fruit;🥥 coconut|fruit;🥑 avocado|fruit;🍅 tomato|vegetable;🥕 carrot|vegetable;🌽 ear of corn|corn;🌶️ hot pepper|spicy;🥦 broccoli|vegetable;🍞 bread|bread;🥐 croissant|bread breakfast;🥖 baguette bread|bread french;🧀 cheese wedge|cheese;🥚 egg|egg breakfast;🍳 cooking|egg breakfast;🥞 pancakes|breakfast;🥓 bacon|breakfast;🍔 hamburger|burger;🍟 french fries|fries;🍕 pizza|pizza;🌭 hot dog|hotdog;🥪 sandwich|lunch;🌮 taco|mexican;🍝 spaghetti|pasta;🍜 steaming bowl|ramen noodles;🍣 sushi|japanese;🍦 soft ice cream|dessert;🍩 doughnut|donut dessert;🍪 cookie|biscuit;🎂 birthday cake|cake birthday;🍰 shortcake|cake dessert;🍫 chocolate bar|chocolate;🍿 popcorn|movie;☕ hot beverage|coffee tea;🍵 teacup without handle|tea;🍺 beer mug|beer;🍷 wine glass|wine;🥂 clinking glasses|cheers toast;🍾 bottle with popping cork|champagne celebrate',
  activities:
    '⚽ soccer ball|football;🏀 basketball|sport;🏈 american football|sport;⚾ baseball|sport;🎾 tennis|sport;🏐 volleyball|sport;🏉 rugby football|sport;🎱 pool 8 ball|billiards;🏓 ping pong|table tennis;🏸 badminton|sport;⛳ flag in hole|golf;🏹 bow and arrow|archery;🎣 fishing pole|fishing;🥊 boxing glove|boxing;🛹 skateboard|skate;⛷️ skier|ski snow;🏂 snowboarder|snowboard;🏋️ person lifting weights|gym;🚴 person biking|bike cycling;🏃 person running|run;🧘 person in lotus position|yoga meditate;🏆 trophy|win prize;🥇 1st place medal|gold first;🥈 2nd place medal|silver second;🥉 3rd place medal|bronze third;🎯 direct hit|target goal;🎮 video game|gaming controller;🎲 game die|dice;🧩 puzzle piece|puzzle;♟️ chess pawn|chess;🎨 artist palette|art paint;🎬 clapper board|movie film;🎤 microphone|sing karaoke;🎧 headphone|music;🎸 guitar|music;🎹 musical keyboard|piano;🎉 party popper|party celebrate tada;🎊 confetti ball|celebrate;🎈 balloon|party;🎁 wrapped gift|present gift',
  travel:
    '🚗 automobile|car;🚕 taxi|car;🚌 bus|bus;🚑 ambulance|emergency;🚒 fire engine|firetruck;🚓 police car|police;🚚 delivery truck|delivery shipping;🚲 bicycle|bike;🛴 kick scooter|scooter;🏍️ motorcycle|motorbike;🚂 locomotive|train;🚆 train|train;🚇 metro|subway;✈️ airplane|plane flight travel;🚀 rocket|launch ship space;🛸 flying saucer|ufo;🚁 helicopter|helicopter;⛵ sailboat|boat;🚢 ship|boat cruise;⚓ anchor|ship;🗺️ world map|map;🧭 compass|direction;🏔️ snow capped mountain|mountain;🏕️ camping|tent;🏖️ beach with umbrella|beach holiday;🏝️ desert island|island;🏠 house|home;🏢 office building|office work;🏥 hospital|health;🏫 school|school;🏰 castle|castle;🗼 tokyo tower|tower;🗽 statue of liberty|new york;🌍 globe showing europe africa|world earth;🌎 globe showing americas|world earth;🌏 globe showing asia australia|world earth;🌃 night with stars|city night;🌅 sunrise|morning;🎡 ferris wheel|fair;⛽ fuel pump|gas station',
  objects:
    '⌚ watch|time;📱 mobile phone|phone;💻 laptop|computer;⌨️ keyboard|typing;🖥️ desktop computer|computer;🖨️ printer|print;🖱️ computer mouse|mouse click;💾 floppy disk|save;📷 camera|photo;🎥 movie camera|video;📺 television|tv;📞 telephone receiver|call phone;🔋 battery|power;🔌 electric plug|power plug;💡 light bulb|idea;🔦 flashlight|torch light;📚 books|library read;📖 open book|read;📝 memo|note write;✏️ pencil|write edit;🖊️ pen|write sign;📎 paperclip|attachment;📌 pushpin|pin;📍 round pushpin|location pin;✂️ scissors|cut;🗂️ card index dividers|folder;📁 file folder|folder;📅 calendar|date;📈 chart increasing|growth up trend;📉 chart decreasing|down trend;📊 bar chart|stats data;📋 clipboard|tasks list;🔒 locked|lock secure;🔓 unlocked|unlock;🔑 key|password;🔨 hammer|tool build;🛠️ hammer and wrench|tools settings;⚙️ gear|settings cog;🧪 test tube|experiment test;🔬 microscope|science;💊 pill|medicine;💰 money bag|money;💳 credit card|payment card;📦 package|box shipping delivery;✉️ envelope|email mail;📧 e-mail|email;🔔 bell|notification;🏷️ label|tag;🧲 magnet|magnet',
  symbols:
    '❤️ red heart|love;🧡 orange heart|love;💛 yellow heart|love;💚 green heart|love;💙 blue heart|love;💜 purple heart|love;🖤 black heart|love;🤍 white heart|love;💔 broken heart|sad heartbreak;💕 two hearts|love;💯 hundred points|100 perfect;✅ check mark button|done yes ok;☑️ check box with check|done;✔️ check mark|done yes;❌ cross mark|no wrong x;❎ cross mark button|no;⭕ hollow red circle|circle;❗ red exclamation mark|important;❓ red question mark|question;⚠️ warning|alert caution;🚫 prohibited|forbidden no;⛔ no entry|stop;🆕 new button|new;🆗 ok button|ok;🆙 up button|up;🔴 red circle|red;🟠 orange circle|orange;🟡 yellow circle|yellow;🟢 green circle|green;🔵 blue circle|blue;🟣 purple circle|purple;⚫ black circle|black;⚪ white circle|white;➕ plus|add;➖ minus|subtract;➡️ right arrow|next arrow;⬅️ left arrow|back arrow;⬆️ up arrow|arrow;⬇️ down arrow|arrow;🔄 counterclockwise arrows button|refresh sync;♻️ recycling symbol|recycle;✨ sparkles|magic new ai;💫 dizzy|star;💬 speech balloon|comment chat;💭 thought balloon|think;🔗 link|url;#️⃣ keycap number sign|hash;🏁 chequered flag|finish race;🚩 triangular flag|flag',
}

const CATEGORY_ICONS: Record<EmojiCategory, string> = {
  smileys: '😀',
  people: '👋',
  nature: '🌿',
  food: '🍎',
  activities: '⚽',
  travel: '✈️',
  objects: '💡',
  symbols: '❤️',
}

/** The built-in set: about 400 common emoji with English names and keywords. */
const defaultEmojis: Emoji[] = (Object.keys(DATA) as EmojiCategory[]).flatMap((category) =>
  DATA[category].split(';').map((entry) => {
    const [head = '', words = ''] = entry.split('|')
    const space = head.indexOf(' ')
    return {
      emoji: head.slice(0, space),
      name: head.slice(space + 1),
      keywords: words.split(' ').filter(Boolean),
      category,
    }
  }),
)

const COLUMNS = 8

function EmojiPickerPanel({
  onSelect,
  emojis = defaultEmojis,
  className,
}: {
  onSelect: (emoji: Emoji) => void
  emojis?: Emoji[]
  className?: string
}) {
  const t = useCoreloomI18n().messages.inputs.emoji
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const gridRef = React.useRef<HTMLDivElement>(null)
  const searchId = React.useId()

  const q = query.trim().toLowerCase()
  const shown = q
    ? emojis.filter(
        (e) =>
          e.name.includes(q) ||
          (e.keywords?.some((k) => k.startsWith(q)) ?? false) ||
          e.emoji === q,
      )
    : emojis
  const categories = (Object.keys(CATEGORY_ICONS) as EmojiCategory[]).filter((c) =>
    shown.some((e) => e.category === c),
  )

  const focusAt = (index: number) => {
    const i = Math.max(0, Math.min(shown.length - 1, index))
    setActive(i)
    const button = gridRef.current?.querySelector<HTMLElement>(`[data-index="${String(i)}"]`)
    button?.focus()
    button?.scrollIntoView({ block: 'nearest' })
  }

  // Each category's emoji, keeping their index in `shown` for keyboard moves.
  let index = 0
  const sections = categories.map((category) => ({
    category,
    items: shown.filter((e) => e.category === category).map((emoji) => ({ emoji, index: index++ })),
  }))
  // Flatten in display order so arrows follow what is on screen.
  const ordered = sections.flatMap((s) => s.items.map((i) => i.emoji))

  return (
    <div data-slot="emoji-picker" className={cn('flex w-[19rem] flex-col gap-2', className)}>
      <label htmlFor={searchId} className="sr-only">
        {t.search}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        placeholder={t.search}
        autoComplete="off"
        className="h-9 w-full rounded-md border border-input bg-inset px-2.5 font-sans text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring"
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && ordered.length) {
            e.preventDefault()
            focusAt(0)
          } else if (e.key === 'Enter' && ordered[0]) {
            e.preventDefault()
            onSelect(ordered[0])
          }
        }}
      />
      {!q && (
        <div className="flex justify-between">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              tabIndex={-1}
              title={t.categories[category]}
              aria-label={t.categories[category]}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-[16px] outline-none hover:bg-accent"
              onClick={() => {
                const first = sections.find((s) => s.category === category)?.items.at(0)
                if (first) focusAt(first.index)
                gridRef.current
                  ?.querySelector(`[data-category="${category}"]`)
                  ?.scrollIntoView({ block: 'start' })
              }}
            >
              <span aria-hidden>{CATEGORY_ICONS[category]}</span>
            </button>
          ))}
        </div>
      )}
      {/* Arrow keys move the focus between the emoji buttons inside (a roving tab stop). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the keys act on the buttons inside; the wrapper itself is never focused. */}
      <div
        ref={gridRef}
        className="flex h-60 flex-col gap-2 overflow-y-auto pr-1"
        onKeyDown={(e) => {
          const moves: Partial<Record<string, number>> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -COLUMNS,
            ArrowDown: COLUMNS,
          }
          const delta = moves[e.key]
          if (delta !== undefined) {
            e.preventDefault()
            focusAt(active + delta)
          } else if (e.key === 'Home') {
            e.preventDefault()
            focusAt(0)
          } else if (e.key === 'End') {
            e.preventDefault()
            focusAt(ordered.length - 1)
          }
        }}
      >
        {ordered.length === 0 && (
          <p className="m-0 py-8 text-center text-[13px] text-muted-foreground">{t.empty}</p>
        )}
        {sections.map((section) => (
          <div key={section.category} role="group" aria-label={t.categories[section.category]}>
            <div
              aria-hidden
              data-category={section.category}
              className="mb-1 font-mono text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase"
            >
              {t.categories[section.category]}
            </div>
            <div className="grid grid-cols-8">
              {section.items.map(({ emoji, index: i }) => (
                <button
                  key={emoji.emoji + emoji.name}
                  type="button"
                  data-index={i}
                  tabIndex={i === active ? 0 : -1}
                  title={emoji.name}
                  aria-label={emoji.name}
                  className="flex aspect-square cursor-pointer items-center justify-center rounded-md text-[20px] outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
                  onFocus={() => {
                    setActive(i)
                  }}
                  onClick={() => {
                    onSelect(emoji)
                  }}
                >
                  {emoji.emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span role="status" className="sr-only">
        {q ? t.results(ordered.length) : ''}
      </span>
    </div>
  )
}

function EmojiPicker({
  onSelect,
  emojis,
  label,
  disabled,
  className,
  children,
}: {
  onSelect: (emoji: Emoji) => void
  emojis?: Emoji[]
  /** The button's accessible name; defaults to the i18n "Add emoji". */
  label?: string
  disabled?: boolean
  className?: string
  /** Your own trigger (a Button); defaults to a smiley icon button. */
  children?: React.ReactNode
}) {
  const t = useCoreloomI18n().messages.inputs.emoji
  const [open, setOpen] = React.useState(false)
  // A fresh panel (empty search, first emoji) each time it opens.
  const [session, setSession] = React.useState(0)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setSession((n) => n + 1)
      }}
    >
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            disabled={disabled}
            aria-label={label ?? t.open}
            data-slot="emoji-picker-trigger"
            className={cn(
              'inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:bg-accent [&_svg]:size-[18px]',
              className,
            )}
          >
            <SmileIcon />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <EmojiPickerPanel
          key={session}
          emojis={emojis}
          onSelect={(emoji) => {
            onSelect(emoji)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { defaultEmojis, type Emoji, type EmojiCategory, EmojiPicker, EmojiPickerPanel }
