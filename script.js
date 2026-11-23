/* Shared site behaviour: theme, navigation, reveal animations, helpers.
   Loaded by index.html and blog.html. */
;(() => {
  const root = document.documentElement
  root.classList.add('js')

  /* ---------- Theme ---------- */
  const THEME_KEY = 'portfolio-theme'
  const setTheme = (theme) => {
    root.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }))
  }
  document.querySelectorAll('.theme-toggle').forEach((btn) =>
    btn.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'))
  )

  /* ---------- Navigation ---------- */
  const navWrap = document.querySelector('.nav-wrap')
  const navToggle = document.querySelector('.nav__toggle')

  const setMenu = (open) => {
    if (!navWrap || !navToggle) return
    navWrap.classList.toggle('is-open', open)
    navToggle.setAttribute('aria-expanded', String(open))
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  }
  navToggle?.addEventListener('click', () => setMenu(!navWrap.classList.contains('is-open')))
  document.querySelectorAll('.nav__link').forEach((l) => l.addEventListener('click', () => setMenu(false)))
  document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false))
  document.addEventListener('click', (e) => {
    if (navWrap?.classList.contains('is-open') && !navWrap.contains(e.target)) setMenu(false)
  })

  /* ---------- Scroll state: glass nav + back-to-top ---------- */
  const toTop = document.querySelector('.to-top')
  const onScroll = () => {
    const y = window.scrollY
    navWrap?.classList.toggle('is-scrolled', y > 12)
    toTop?.classList.toggle('is-visible', y > 600)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  toTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))

  /* ---------- Active section highlight in nav ---------- */
  const navLinks = [...document.querySelectorAll('.nav__link[href^="#"]')]
  const sections = navLinks.map((l) => document.querySelector(l.getAttribute('href'))).filter(Boolean)
  if (sections.length) {
    let ticking = false
    const updateActive = () => {
      ticking = false
      const line = window.innerHeight * 0.35
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let current = atBottom ? sections[sections.length - 1] : null
      if (!current) for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s
      navLinks.forEach((l) => l.classList.toggle('is-active', !!current && l.getAttribute('href') === '#' + current.id))
    }
    window.addEventListener('scroll', () => {
      if (!ticking) (ticking = true), requestAnimationFrame(updateActive)
    }, { passive: true })
    updateActive()
  }

  /* ---------- Reveal on scroll ---------- */
  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries, obs) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible')
                obs.unobserve(entry.target)
              }
            })
          },
          { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
        )
      : null
  const observeReveal = (scope = document) => {
    scope.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      if (revealObserver) revealObserver.observe(el)
      else el.classList.add('is-visible')
    })
  }
  observeReveal()

  /* ---------- Bento cursor glow ---------- */
  document.querySelectorAll('.bento__card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    })
  })

  /* ---------- Project filter ---------- */
  const filterBtns = document.querySelectorAll('.segmented__btn[data-filter]')
  const projects = document.querySelectorAll('.project[data-cat]')
  filterBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter
      filterBtns.forEach((b) => {
        const on = b === btn
        b.classList.toggle('is-active', on)
        b.setAttribute('aria-selected', String(on))
      })
      projects.forEach((p) => {
        p.hidden = f !== 'all' && p.dataset.cat !== f
      })
    })
  )

  /* ---------- Toast + copy email ---------- */
  let toastTimer
  const showToast = (msg) => {
    const toast = document.getElementById('toast')
    if (!toast) return
    toast.textContent = msg
    toast.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500)
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text })
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {}
      ta.remove()
      return ok
    }
  }

  document.querySelectorAll('.copy-email').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.preventDefault()
      const ok = await copyText(el.dataset.email)
      showToast(ok ? 'Email copied to clipboard ✓' : 'Could not copy email')
    })
  )

  document.querySelectorAll('.js-year').forEach((el) => (el.textContent = new Date().getFullYear()))

  // Expose a few helpers for blog.js
  window.Site = { showToast, copyText, observeReveal }
})()
