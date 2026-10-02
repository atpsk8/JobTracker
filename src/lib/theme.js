import { useEffect, useState } from 'react'

// Keep in sync with the inline script in index.html, which applies the theme before first paint
const STORAGE_KEY = 'job-tracker-theme'
const THEME_COLORS = { light: '#f7f4ee', dark: '#1a1916' }
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(preference) {
  const theme = preference === 'dark' || (preference === 'system' && systemDark()) ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

// Returns ['system' | 'light' | 'dark', setter]; "system" follows the OS setting live
export function useTheme() {
  const [preference, setPreference] = useState(readPreference)

  useEffect(() => {
    applyTheme(preference)
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Storage blocked (e.g. private window): the choice just won't be remembered
    }
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => applyTheme('system')
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [preference])

  return [preference, setPreference]
}
