---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Rule proposals from review feedback: `POST /agent-configs/:id/proposals` takes
`from: 'feedback'` with a `feedback` text (pull request review comments, notes on what the coding
assistant got wrong, up to 20,000 characters) and has your model turn the mistakes worth
preventing into rules, leaving out the ones already present. The text is sent to the model and
never stored or logged. The proposals panel gets a "Review feedback" source next to "My notes"
and "My diagrams"; an accepted proposal becomes a rule like any other.
