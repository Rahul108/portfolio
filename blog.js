/* Blog engine: reads Markdown posts straight from the GitHub repo
   Rahul108/brain_dump, so publishing = pushing a .md file there.

   - Listing: GitHub tree API (fallback: jsDelivr), cached in localStorage
   - Content:  raw.githubusercontent.com (no API rate limit)
   - Rendering: marked + DOMPurify + highlight.js, Mermaid loaded only when needed

   Used by index.html (#latest-posts) and blog.html (#blog-app). */
;(() => {
  const CONFIG = {
    owner: 'Rahul108',
    repo: 'brain_dump',
    branch: 'main',
    // Markdown files that are not posts
    exclude: /(^|\/)(readme|license|contributing|code_of_conduct|changelog)\.md$/i,
  }

  const CDN = {
    marked: 'https://cdn.jsdelivr.net/npm/marked@15/marked.min.js',
    purify: 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js',
    hljs: 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/highlight.min.js',
    mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
  }

  const CACHE_KEY = `braindump:${CONFIG.owner}/${CONFIG.repo}:v2`
  const CACHE_TTL = 6 * 60 * 60 * 1000 // 6h
  const CACHE_TTL_PARTIAL = 20 * 60 * 1000 // 20m when dates could not be fetched

  const { owner, repo, branch } = CONFIG
  const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')
  const rawUrl = (p) => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodePath(p)}`
  const blobUrl = (p) => `https://github.com/${owner}/${repo}/blob/${branch}/${encodePath(p)}`
  const repoUrl = `https://github.com/${owner}/${repo}`
  const postHref = (slug) => `blog.html?p=${encodeURIComponent(slug)}`

  /* ---------------- utils ---------------- */
  const esc = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  const SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'vs'])
  const prettify = (s) =>
    s
      .replace(/\.md$/i, '')
      .split(/[_\-\s]+/)
      .filter(Boolean)
      .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
      .join(' ')

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  const stripInline = (s) =>
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/(\*\*|__|\*|_|~~|`)/g, '')
      .trim()

  const fetchJSON = async (url) => {
    const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    return r.json()
  }
  const fetchText = async (url) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    return r.text()
  }

  const scriptCache = {}
  const loadScript = (src) =>
    (scriptCache[src] ||= new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = resolve
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    }))

  /* ---------------- data ---------------- */
  const isPost = (p) => /\.md$/i.test(p) && !CONFIG.exclude.test(p) && !p.startsWith('.')

  async function listMarkdownFiles() {
    try {
      const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
      return data.tree.filter((t) => t.type === 'blob').map((t) => t.path).filter(isPost)
    } catch (e) {
      // GitHub API rate-limited or down: jsDelivr mirrors the repo file list
      const data = await fetchJSON(`https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${branch}?structure=flat`)
      return data.files.map((f) => f.name.replace(/^\//, '')).filter(isPost)
    }
  }

  async function fetchDates(paths) {
    const out = {}
    await Promise.all(
      paths.map(async (p) => {
        try {
          const commits = await fetchJSON(
            `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1&path=${encodeURIComponent(p)}`
          )
          if (commits[0]) out[p] = commits[0].commit.author.date
        } catch {}
      })
    )
    return out
  }

  function parsePost(md, path) {
    const slug = path.replace(/\.md$/i, '')
    const parts = slug.split('/')
    const titleMatch = md.match(/^#\s+(.+)$/m)
    const title = titleMatch ? stripInline(titleMatch[1]) : prettify(parts[parts.length - 1])

    const prose = md.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '')
    const paras = prose.split(/\n\s*\n/)
    let excerpt = ''
    for (const block of paras) {
      const line = block.trim()
      if (!line || /^(#|[-*+]\s|\d+\.\s|>|\||---|\*\*\*|<|!\[)/.test(line)) continue
      const txt = stripInline(line.replace(/\n/g, ' '))
      if (txt.length < 40) continue
      excerpt = txt
      break
    }
    if (!excerpt) {
      // Diagram/code-heavy posts: summarise by their section headings
      const heads = [...md.matchAll(/^##\s+(.+)$/gm)].map((m) => stripInline(m[1]).replace(/^\d+[.)]\s*/, ''))
      if (heads.length) excerpt = 'Covers ' + heads.slice(0, 4).join(', ') + (heads.length > 4 ? ', and more.' : '.')
    }
    if (excerpt.length > 200) excerpt = excerpt.slice(0, 197).replace(/\s+\S*$/, '') + '…'

    // Code and diagrams are skimmed, so they count at half weight
    const count = (s) => s.split(/\s+/).filter(Boolean).length
    const proseWords = count(prose)
    const words = proseWords + (count(md) - proseWords) * 0.5
    // Tag as Bangla only when it is a substantial share of the text
    const bengali = (md.match(/[ঀ-৿]/g) || []).length
    const latin = (md.match(/[A-Za-z]/g) || []).length

    return {
      path,
      slug,
      title,
      excerpt,
      category: parts.length > 1 ? prettify(parts[0]) : 'Notes',
      categoryKey: parts.length > 1 ? parts[0] : '_root',
      minutes: Math.max(1, Math.round(words / 200)),
      lang: bengali / (bengali + latin || 1) > 0.15 ? 'bn' : 'en',
    }
  }

  let postsPromise
  function getPosts() {
    return (postsPromise ||= (async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
        if (cached && Date.now() - cached.at < cached.ttl) return cached.posts
      } catch {}

      const files = await listMarkdownFiles()
      const [texts, dates] = await Promise.all([
        Promise.all(files.map((p) => fetchText(rawUrl(p)).catch(() => null))),
        fetchDates(files),
      ])

      const posts = files
        .map((p, i) => (texts[i] == null ? null : { ...parsePost(texts[i], p), date: dates[p] || null }))
        .filter(Boolean)
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title))

      const complete = posts.every((p) => p.date)
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ at: Date.now(), ttl: complete ? CACHE_TTL : CACHE_TTL_PARTIAL, posts })
        )
      } catch {}
      return posts
    })())
  }

  /* ---------------- cards ---------------- */
  const cardHTML = (p) => `
    <article class="post-card reveal">
      <div class="post-card__meta">
        <span class="post-card__cat">${esc(p.category)}</span>
        ${p.date ? `<time datetime="${esc(p.date)}">${fmtDate(p.date)}</time><span aria-hidden="true">·</span>` : ''}
        <span>${p.minutes} min read</span>
        ${p.lang === 'bn' ? '<span class="post-card__lang" title="Written in Bangla">বাংলা</span>' : ''}
      </div>
      <h3><a href="${postHref(p.slug)}">${esc(p.title)}</a></h3>
      <p>${esc(p.excerpt)}</p>
      <span class="post-card__more" aria-hidden="true">Read post <i class="fas fa-arrow-right"></i></span>
    </article>`

  const emptyHTML = (msg) => `
    <div class="posts__empty">
      <p>${msg}</p>
      <p><a href="${repoUrl}" target="_blank" rel="noopener noreferrer">Browse the posts on GitHub <i class="fas fa-arrow-up-right-from-square"></i></a></p>
    </div>`

  const reveal = (el) => window.Site?.observeReveal(el)

  /* ---------------- homepage: latest posts ---------------- */
  async function renderLatest(container) {
    const limit = Number(container.dataset.limit) || 3
    try {
      const posts = await getPosts()
      container.innerHTML = posts.length
        ? posts.slice(0, limit).map(cardHTML).join('')
        : emptyHTML('No posts yet — check back soon.')
    } catch (e) {
      console.warn('[blog]', e)
      container.innerHTML = emptyHTML('Posts could not be loaded right now.')
    }
    reveal(container)
  }

  /* ---------------- blog.html: index ---------------- */
  async function renderIndex(app) {
    app.innerHTML = `
      <header class="blog-hero container">
        <span class="section__kicker">Brain Dump</span>
        <h1 class="blog-hero__title">Notes from under the hood</h1>
        <p class="blog-hero__lead">Long-form notes on backend systems, security, design patterns and performance — some in English, some in বাংলা.</p>
        <div class="blog-tools">
          <label class="search">
            <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" placeholder="Search posts…" aria-label="Search posts" id="post-search" />
          </label>
          <div class="segmented" role="tablist" aria-label="Filter by topic" id="post-cats"></div>
        </div>
      </header>
      <section class="container blog-list">
        <div class="posts" id="post-grid" aria-live="polite">
          <div class="post-card post-card--skeleton"></div>
          <div class="post-card post-card--skeleton"></div>
          <div class="post-card post-card--skeleton"></div>
        </div>
      </section>`

    const grid = app.querySelector('#post-grid')
    const catsEl = app.querySelector('#post-cats')
    const search = app.querySelector('#post-search')

    let posts
    try {
      posts = await getPosts()
    } catch (e) {
      console.warn('[blog]', e)
      grid.innerHTML = emptyHTML('Posts could not be loaded right now.')
      return
    }

    const cats = [...new Map(posts.map((p) => [p.categoryKey, p.category])).entries()]
    let activeCat = new URLSearchParams(location.search).get('topic') || 'all'
    if (activeCat !== 'all' && !cats.some(([k]) => k === activeCat)) activeCat = 'all'

    catsEl.innerHTML = [['all', 'All'], ...cats]
      .map(
        ([k, label]) =>
          `<button type="button" role="tab" class="segmented__btn${k === activeCat ? ' is-active' : ''}" aria-selected="${k === activeCat}" data-cat="${esc(k)}">${esc(label)}</button>`
      )
      .join('')
    if (cats.length < 2) catsEl.hidden = true

    const draw = () => {
      const q = search.value.trim().toLowerCase()
      const list = posts.filter(
        (p) =>
          (activeCat === 'all' || p.categoryKey === activeCat) &&
          (!q || `${p.title} ${p.excerpt} ${p.category}`.toLowerCase().includes(q))
      )
      grid.innerHTML = list.length ? list.map(cardHTML).join('') : emptyHTML('No posts match your search.')
      reveal(grid)
    }

    catsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]')
      if (!btn) return
      activeCat = btn.dataset.cat
      catsEl.querySelectorAll('[data-cat]').forEach((b) => {
        const on = b === btn
        b.classList.toggle('is-active', on)
        b.setAttribute('aria-selected', String(on))
      })
      const url = new URL(location.href)
      activeCat === 'all' ? url.searchParams.delete('topic') : url.searchParams.set('topic', activeCat)
      history.replaceState(null, '', url)
      draw()
    })
    search.addEventListener('input', draw)
    draw()
  }

  /* ---------------- blog.html: single post ---------------- */
  const resolvePath = (base, rel) => {
    const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : ''
    return decodeURIComponent(new URL(rel, 'https://x.invalid/' + dir).pathname.slice(1))
  }

  const slugify = (text, used) => {
    let id = text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
    let n = id
    for (let i = 2; used.has(n); i++) n = `${id}-${i}`
    used.add(n)
    return n
  }

  let mermaidMod
  async function renderMermaid(scope) {
    const blocks = [...scope.querySelectorAll('.mermaid-block')]
    if (!blocks.length) return
    mermaidMod ||= import(CDN.mermaid).then((m) => m.default)
    const mermaid = await mermaidMod
    const dark = document.documentElement.dataset.theme === 'dark'
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: getComputedStyle(document.body).fontFamily,
    })
    for (const [i, block] of blocks.entries()) {
      try {
        const { svg } = await mermaid.render(`mmd-${Date.now()}-${i}`, block.dataset.src)
        block.innerHTML = svg
        block.classList.remove('is-error')
      } catch (e) {
        block.classList.add('is-error')
        block.innerHTML = `<pre><code>${esc(block.dataset.src)}</code></pre>`
      }
    }
  }

  function enhanceArticle(body, post) {
    // Links & images: make repo-relative paths work from the portfolio
    body.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href')
      if (href.startsWith('#')) return
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        return
      }
      const [pathPart, hash = ''] = href.split('#')
      const target = resolvePath(post.path, pathPart)
      if (/\.md$/i.test(target)) a.href = postHref(target.replace(/\.md$/i, '')) + (hash ? '#' + hash : '')
      else {
        a.href = blobUrl(target)
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      }
    })
    body.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src')
      if (!/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//')) img.src = rawUrl(resolvePath(post.path, src))
      img.loading = 'lazy'
      img.decoding = 'async'
    })

    // Tables scroll horizontally on small screens
    body.querySelectorAll('table').forEach((t) => {
      const wrap = document.createElement('div')
      wrap.className = 'table-wrap'
      t.replaceWith(wrap)
      wrap.appendChild(t)
    })

    // Code blocks: mermaid diagrams, syntax highlight, copy button
    body.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement
      const lang = (code.className.match(/language-([\w+#-]+)/) || [])[1] || ''
      if (lang === 'mermaid') {
        const div = document.createElement('div')
        div.className = 'mermaid-block'
        div.dataset.src = code.textContent
        div.innerHTML = '<div class="mermaid-block__loading">Rendering diagram…</div>'
        pre.replaceWith(div)
        return
      }
      if (window.hljs && lang && hljs.getLanguage(lang)) hljs.highlightElement(code)
      const wrap = document.createElement('div')
      wrap.className = 'code-block'
      wrap.innerHTML = `<div class="code-block__bar"><span>${esc(lang || 'text')}</span><button type="button" class="code-block__copy" aria-label="Copy code"><i class="far fa-copy" aria-hidden="true"></i> Copy</button></div>`
      pre.replaceWith(wrap)
      wrap.appendChild(pre)
      wrap.querySelector('button').addEventListener('click', async (e) => {
        const ok = await window.Site?.copyText(code.textContent)
        const btn = e.currentTarget
        btn.innerHTML = ok ? '<i class="fas fa-check" aria-hidden="true"></i> Copied' : 'Failed'
        setTimeout(() => (btn.innerHTML = '<i class="far fa-copy" aria-hidden="true"></i> Copy'), 1800)
      })
    })

    // Headings: anchors + table of contents
    const used = new Set()
    const toc = []
    body.querySelectorAll('h2, h3').forEach((h) => {
      const text = h.textContent.trim()
      h.id = slugify(text, used)
      const a = document.createElement('a')
      a.className = 'heading-anchor'
      a.href = '#' + h.id
      a.setAttribute('aria-label', 'Link to this section')
      a.textContent = '#'
      h.appendChild(a)
      toc.push({ id: h.id, text, level: h.tagName === 'H2' ? 2 : 3 })
    })
    return toc
  }

  async function renderPost(app, slug) {
    if (!slug || slug.includes('..') || slug.startsWith('/')) return renderNotFound(app)
    const path = slug + '.md'

    app.innerHTML = `
      <div class="read-progress" aria-hidden="true"><span></span></div>
      <div class="container post-layout">
        <article class="post" id="post">
          <a href="blog.html" class="back-link"><i class="fas fa-arrow-left" aria-hidden="true"></i> All posts</a>
          <div class="post__skeleton"><span></span><span></span><span></span><span></span></div>
        </article>
      </div>`

    let md
    try {
      ;[md] = await Promise.all([
        fetchText(rawUrl(path)),
        loadScript(CDN.marked),
        loadScript(CDN.purify),
        loadScript(CDN.hljs).catch(() => null),
      ])
    } catch (e) {
      console.warn('[blog]', e)
      return renderNotFound(app)
    }

    // Metadata from the listing when available (dates, prev/next); otherwise parse locally
    let all = []
    try {
      all = await getPosts()
    } catch {}
    const meta = all.find((p) => p.path === path) || { ...parsePost(md, path), date: null }
    const idx = all.findIndex((p) => p.path === path)
    const newer = idx > 0 ? all[idx - 1] : null
    const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null

    document.title = `${meta.title} | Brain Dump — Aninda Sarker Rahul`
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.excerpt || meta.title)

    // Title is rendered in the header, so drop the first H1 from the body
    const bodyMd = md.replace(/^\s*#\s+.+\n/, '')
    const html = DOMPurify.sanitize(marked.parse(bodyMd, { gfm: true }))

    const layout = app.querySelector('.post-layout')
    layout.innerHTML = `
      <article class="post" id="post" ${meta.lang === 'bn' ? 'lang="bn"' : ''}>
        <a href="blog.html" class="back-link"><i class="fas fa-arrow-left" aria-hidden="true"></i> All posts</a>
        <header class="post__header">
          <a class="post-card__cat" href="blog.html?topic=${encodeURIComponent(meta.categoryKey)}">${esc(meta.category)}</a>
          <h1 class="post__title">${esc(meta.title)}</h1>
          <div class="post__meta">
            <span class="post__author"><img src="./assets/IMG_4800.jpg" alt="" width="28" height="28" /> Aninda Sarker Rahul</span>
            ${meta.date ? `<span><i class="far fa-calendar" aria-hidden="true"></i> <time datetime="${esc(meta.date)}">${fmtDate(meta.date)}</time></span>` : ''}
            <span><i class="far fa-clock" aria-hidden="true"></i> ${meta.minutes} min read</span>
            ${meta.lang === 'bn' ? '<span class="post-card__lang">বাংলা</span>' : ''}
          </div>
        </header>
        <div class="prose" id="post-body">${html}</div>
        <footer class="post__footer">
          <div class="post__share">
            <a class="btn btn--ghost btn--sm" href="${blobUrl(path)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-github" aria-hidden="true"></i> View on GitHub</a>
            <button type="button" class="btn btn--ghost btn--sm" id="copy-link"><i class="fas fa-link" aria-hidden="true"></i> Copy link</button>
            <a class="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}"><i class="fab fa-linkedin-in" aria-hidden="true"></i> Share</a>
          </div>
          <nav class="post-nav" aria-label="More posts">
            ${newer ? `<a class="post-nav__item" href="${postHref(newer.slug)}"><small><i class="fas fa-arrow-left" aria-hidden="true"></i> Newer</small>${esc(newer.title)}</a>` : '<span></span>'}
            ${older ? `<a class="post-nav__item post-nav__item--next" href="${postHref(older.slug)}"><small>Older <i class="fas fa-arrow-right" aria-hidden="true"></i></small>${esc(older.title)}</a>` : ''}
          </nav>
        </footer>
      </article>
      <aside class="toc" aria-label="Table of contents"></aside>`

    const body = layout.querySelector('#post-body')
    const toc = enhanceArticle(body, meta)

    // TOC
    const tocEl = layout.querySelector('.toc')
    if (toc.length > 2) {
      const wide = window.matchMedia('(min-width: 1101px)')
      tocEl.innerHTML = `
        <details class="toc__box" ${wide.matches ? 'open' : ''}>
          <summary>On this page</summary>
          <ol>${toc.map((t) => `<li class="toc__l${t.level}"><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol>
        </details>`
      const links = new Map([...tocEl.querySelectorAll('a')].map((a) => [a.getAttribute('href').slice(1), a]))
      const spy = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return
            links.forEach((a) => a.classList.remove('is-active'))
            links.get(e.target.id)?.classList.add('is-active')
          }),
        { rootMargin: '-15% 0px -75% 0px' }
      )
      body.querySelectorAll('h2[id], h3[id]').forEach((h) => spy.observe(h))

      // Sidebar on wide screens; collapsible box under the post header on narrow ones
      const header = layout.querySelector('.post__header')
      const placeToc = () => {
        if (wide.matches) layout.appendChild(tocEl)
        else header.after(tocEl)
      }
      placeToc()
      wide.addEventListener('change', placeToc)
      tocEl.addEventListener('click', (e) => {
        if (!wide.matches && e.target.closest('a')) tocEl.querySelector('details').open = false
      })
    } else {
      tocEl.remove()
      layout.classList.add('post-layout--single')
    }

    layout.querySelector('#copy-link').addEventListener('click', async () => {
      const ok = await window.Site?.copyText(location.href)
      window.Site?.showToast(ok ? 'Link copied ✓' : 'Could not copy link')
    })

    // Reading progress
    const bar = app.querySelector('.read-progress span')
    const article = layout.querySelector('.post')
    const onScroll = () => {
      const r = article.getBoundingClientRect()
      const total = r.height - window.innerHeight
      const pct = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1
      bar.style.transform = `scaleX(${pct})`
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    // Jump to hash after content exists
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()

    await renderMermaid(body)
    window.addEventListener('themechange', () => renderMermaid(body))
  }

  function renderNotFound(app) {
    document.title = 'Post not found | Brain Dump'
    app.innerHTML = `
      <section class="container blog-hero blog-hero--center">
        <span class="section__kicker">404</span>
        <h1 class="blog-hero__title">That post wandered off.</h1>
        <p class="blog-hero__lead">It may have been renamed or moved in the repository.</p>
        <div class="hero__actions" style="justify-content:center">
          <a class="btn btn--primary" href="blog.html"><i class="fas fa-arrow-left" aria-hidden="true"></i> All posts</a>
          <a class="btn btn--ghost" href="${repoUrl}" target="_blank" rel="noopener noreferrer"><i class="fab fa-github" aria-hidden="true"></i> Repository</a>
        </div>
      </section>`
  }

  /* ---------------- boot ---------------- */
  const latest = document.getElementById('latest-posts')
  if (latest) renderLatest(latest)

  const app = document.getElementById('blog-app')
  if (app) {
    const slug = new URLSearchParams(location.search).get('p')
    slug ? renderPost(app, slug) : renderIndex(app)
  }
})()
