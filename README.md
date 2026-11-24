# Aninda Sarker Rahul — Portfolio Website

Personal developer portfolio website showcasing professional experience, technical skills, featured microservices & AI projects, certifications, and contact details.

## 🚀 Built With
- **HTML5 & CSS3** — vanilla CSS with design tokens, light/dark themes (follows system preference), bento grid, glass nav
- **JavaScript (ES2020+)** — theme switcher, mobile menu, scroll-spy, reveal animations, project filters, clipboard copy
- **Font Awesome 6** (CDN) and **Geist** / **Noto Sans Bengali** fonts

## ✍️ Blog (Brain Dump)
`blog.html` renders Markdown posts straight from [Rahul108/brain_dump](https://github.com/Rahul108/brain_dump):

- Any `.md` file in that repo is a post (except README/LICENSE). Its folder becomes the topic, its first `# heading` the title.
- Publishing = pushing a Markdown file to brain_dump. No rebuild of this site needed.
- Mermaid diagrams, code highlighting, tables, relative images/links and Bangla text are supported.
- Post URLs look like `blog.html?p=under_the_hood/observer_pattern_and_nestJs`.
- The post list is cached in the visitor's browser for 6 hours, so new posts can take that long to show for repeat visitors.
- Repo/branch are configured at the top of `blog.js`.

## 📁 File Structure
```
portfolio/
├── assets/
│   ├── profile.jpg                  # Hero profile picture (800×800)
│   ├── updated_cv_content.md        # CV reference content
│   └── updated_github_profile_info.md
├── index.html                       # Portfolio page
├── blog.html                        # Blog index + post reader
├── styles.css                       # Design tokens, themes & components
├── blog.css                         # Blog/article styles
├── script.js                        # Shared interactions
├── blog.js                          # Fetches & renders posts from brain_dump
└── README.md
```

## 🛠️ Local Development
To serve locally, run any HTTP server in the repository root:
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your web browser.
