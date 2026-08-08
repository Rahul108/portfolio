const body = document.body

const btnTheme = document.querySelector('#btn-theme')
const btnHamburger = document.querySelector('.nav__hamburger')

const addThemeClass = (bodyClass, btnClass) => {
  body.classList.add(bodyClass)
  if (btnTheme) {
    btnTheme.classList.add(btnClass)
  }
}

const getBodyTheme = localStorage.getItem('portfolio-theme') || 'light'
const getBtnTheme = localStorage.getItem('portfolio-btn-theme') || 'fa-moon'

addThemeClass(getBodyTheme, getBtnTheme)

const isDark = () => body.classList.contains('dark')

const setTheme = (bodyClass, btnClass) => {
  body.classList.remove(localStorage.getItem('portfolio-theme') || 'light')
  if (btnTheme) {
    btnTheme.classList.remove(localStorage.getItem('portfolio-btn-theme') || 'fa-moon')
  }

  addThemeClass(bodyClass, btnClass)

  localStorage.setItem('portfolio-theme', bodyClass)
  localStorage.setItem('portfolio-btn-theme', btnClass)
}

const toggleTheme = () =>
  isDark() ? setTheme('light', 'fa-moon') : setTheme('dark', 'fa-sun')

if (btnTheme) {
  btnTheme.parentElement.addEventListener('click', toggleTheme)
}

const displayList = () => {
  const navUl = document.querySelector('.nav__list')
  const icon = btnHamburger.querySelector('i')

  if (icon.classList.contains('fa-bars')) {
    icon.classList.remove('fa-bars')
    icon.classList.add('fa-times')
    navUl.classList.add('display-nav-list')
  } else {
    icon.classList.remove('fa-times')
    icon.classList.add('fa-bars')
    navUl.classList.remove('display-nav-list')
  }
}

if (btnHamburger) {
  btnHamburger.addEventListener('click', displayList)
}

document.querySelectorAll('.link--nav').forEach(link => {
  link.addEventListener('click', () => {
    const navUl = document.querySelector('.nav__list')
    const icon = btnHamburger ? btnHamburger.querySelector('i') : null
    if (navUl && navUl.classList.contains('display-nav-list')) {
      navUl.classList.remove('display-nav-list')
      if (icon) {
        icon.classList.remove('fa-times')
        icon.classList.add('fa-bars')
      }
    }
  })
})

const scrollUp = () => {
  const btnScrollTop = document.querySelector('.scroll-top')
  if (!btnScrollTop) return

  if (
    body.scrollTop > 400 ||
    document.documentElement.scrollTop > 400
  ) {
    btnScrollTop.style.display = 'block'
  } else {
    btnScrollTop.style.display = 'none'
  }
}

document.addEventListener('scroll', scrollUp)

// Copy Email to Clipboard Logic
let toastTimeout
const showToast = (message = 'Email copied to clipboard! ✓') => {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show')
  }, 2500)
}

const copyEmailToClipboard = (email) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email)
      .then(() => showToast())
      .catch(() => fallbackCopyText(email))
  } else {
    fallbackCopyText(email)
  }
}

const fallbackCopyText = (text) => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    showToast()
  } catch (err) {
    showToast('Failed to copy email')
  }
  document.body.removeChild(textarea)
}

document.querySelectorAll('.copy-email-btn, .copy-email-card').forEach(elem => {
  elem.addEventListener('click', (e) => {
    e.preventDefault()
    const email = elem.getAttribute('data-email') || 'rahul108sk@gmail.com'
    copyEmailToClipboard(email)
  })
})
