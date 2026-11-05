// Applies the saved theme, accent and language before the first paint (no flash of the wrong
// theme). Same as the coreloom-ui starter's inline script in index.html.
try {
  var t = localStorage.getItem('theme')
  if (t === 'light' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches))
    document.documentElement.dataset.theme = 'light'
  var a = localStorage.getItem('accent')
  if (a) document.documentElement.dataset.accent = a
  var l = localStorage.getItem('locale')
  if (l) document.documentElement.lang = l
} catch (e) {}
