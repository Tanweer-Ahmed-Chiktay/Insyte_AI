'use client'

import { useEffect, useCallback } from 'react'

interface UseKeyboardShortcutsProps {
  onSpacebarHold: () => void
  onSpacebarRelease: () => void
  onEscape: () => void
  isEnabled: boolean
}

export function useKeyboardShortcuts({
  onSpacebarHold,
  onSpacebarRelease,
  onEscape,
  isEnabled
}: UseKeyboardShortcutsProps) {
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isEnabled) return
    
    // Ignore if user is typing in an input field
    const activeElement = document.activeElement
    if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
      return
    }
    
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        if (!event.repeat) { // Only on first press, not repeated presses
          onSpacebarHold()
        }
        break
      case 'Escape':
        event.preventDefault()
        onEscape()
        break
    }
  }, [isEnabled, onSpacebarHold, onEscape])
  
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!isEnabled) return
    
    // Ignore if user is typing in an input field
    const activeElement = document.activeElement
    if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
      return
    }
    
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        onSpacebarRelease()
        break
    }
  }, [isEnabled, onSpacebarRelease])
  
  useEffect(() => {
    if (!isEnabled) return
    
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isEnabled, handleKeyDown, handleKeyUp])
}