import app from '@adonisjs/core/services/app'
import SkillsEvents from '#app/skills/services/skills-events'

/*
|--------------------------------------------------------------------------
| Skills catalog live updates
|--------------------------------------------------------------------------
|
| One `SkillsEvents` per process, so the server holds a single Redis
| subscription whatever the number of open Skills screens.
*/
app.container.singleton(SkillsEvents, () => new SkillsEvents())

// Open streams would keep the HTTP server from closing.
app.terminating(async () => {
  const events = await app.container.make(SkillsEvents)
  events.close()
})
