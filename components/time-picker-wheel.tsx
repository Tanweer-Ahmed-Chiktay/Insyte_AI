'use client'

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { cn } from '@/lib/utils'

interface TimePickerWheelProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label: string
  className?: string
}

export interface TimePickerWheelRef {
  handleSpin: (direction: 'up' | 'down') => void
}

export const TimePickerWheel = forwardRef<TimePickerWheelRef, TimePickerWheelProps>(function TimePickerWheel({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  className
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [lastHapticValue, setLastHapticValue] = useState<number | null>(null)
  const itemHeight = 40 // Height of each item in pixels

  // Generate values array (memoized)
  const values: number[] = React.useMemo(() => {
    const arr: number[] = []
    for (let i = min; i <= max; i += step) arr.push(i)
    return arr
  }, [min, max, step])

  // Create infinite scrolling array with more padding for seamless wrapping
  const paddingCount = Math.max(5, Math.ceil(values.length / 2))
  const paddedValues = React.useMemo(() => [
    ...Array(paddingCount).fill(null).map((_, i) => values[values.length - paddingCount + i]),
    ...values,
    ...Array(paddingCount).fill(null).map((_, i) => values[i])
  ], [values, paddingCount])

  const triggerHapticFeedback = useCallback((force = false) => {
    if (navigator.vibrate) {
      navigator.vibrate(8) // Vibrate for 8ms (works on mobile)
    }
  }, [])

  // Audio feedback for spinning with throttling to prevent stuttering
  const lastSoundTime = useRef(0)
  const playSpinSound = useCallback(() => {
    try {
      // Throttle sound to prevent stuttering during fast scrolling
      const now = Date.now()
      if (now - lastSoundTime.current < 50) { // Minimum 50ms between sounds
        return
      }
      lastSoundTime.current = now
      
      // Create a louder and smoother vibration sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Create a louder, smoother vibration-like sound (20% louder)
      oscillator.frequency.setValueAtTime(85, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(65, audioContext.currentTime + 0.08)
      
      // Cap maximum volume to prevent excessive loudness
        const maxVolume = 0.12 // Maximum safe volume level
        const baseVolume = Math.min(0.225, maxVolume) // 50% increase from 0.15 but capped
        const smoothStartVolume = Math.min(0.108, maxVolume * 0.9) // 50% increase smooth start but capped
       
       gainNode.gain.setValueAtTime(baseVolume, audioContext.currentTime)
       gainNode.gain.linearRampToValueAtTime(smoothStartVolume, audioContext.currentTime + 0.02)
       gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08) // Longer, smoother fade
      
      oscillator.type = 'sine' // Smooth sine wave
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.08) // Longer duration for smoothness
      
      // Clean up
      setTimeout(() => {
        try {
          audioContext.close()
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 150)
    } catch (error) {
      // Silently fail if Web Audio API is not supported
      console.debug('Audio feedback not available:', error)
    }
  }, [])

  const scrollToValue = useCallback((targetValue: number, smooth = true) => {
    if (!containerRef.current) return
    
    const index = values.indexOf(targetValue)
    if (index === -1) return
    
    const targetScrollTop = (index + paddingCount) * itemHeight - containerRef.current.clientHeight / 2 + itemHeight / 2
    
    if (smooth) {
      containerRef.current.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      })
    } else {
      containerRef.current.scrollTop = targetScrollTop
    }
  }, [values, itemHeight, paddingCount])

  const handleSpin = useCallback((direction: 'up' | 'down') => {
    navigator.vibrate?.(10) // Vibrate for 10ms (works on mobile)
    playSpinSound() // Play spinning sound effect
    
    // Update the value based on direction
    const currentIndex = values.indexOf(value)
    let newIndex
    
    if (direction === 'up') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : values.length - 1
    } else {
      newIndex = currentIndex < values.length - 1 ? currentIndex + 1 : 0
    }
    
    const newValue = values[newIndex]
    onChange(newValue)
    scrollToValue(newValue, true)
  }, [value, values, onChange, scrollToValue, playSpinSound])

  // Expose handleSpin function through ref
  useImperativeHandle(ref, () => ({
    handleSpin
  }), [handleSpin])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    
    const container = containerRef.current
    const scrollTop = container.scrollTop
    const centerY = scrollTop + container.clientHeight / 2
    const index = Math.round((centerY - itemHeight / 2) / itemHeight)
    
    // Handle infinite scrolling wrapping
    let actualIndex = index - paddingCount
    
    // Seamless wrapping logic
    if (actualIndex < 0) {
      actualIndex = values.length + (actualIndex % values.length)
    } else if (actualIndex >= values.length) {
      actualIndex = actualIndex % values.length
    }
    
    // Reset scroll position for infinite scrolling when near boundaries
    if (!isDragging) {
      if (index < paddingCount / 2) {
        // Near top, jump to bottom equivalent
        const newScrollTop = (values.length + paddingCount / 2) * itemHeight - container.clientHeight / 2 + itemHeight / 2
        container.scrollTop = newScrollTop
        return
      } else if (index >= paddedValues.length - paddingCount / 2) {
        // Near bottom, jump to top equivalent
        const newScrollTop = (paddingCount / 2) * itemHeight - container.clientHeight / 2 + itemHeight / 2
        container.scrollTop = newScrollTop
        return
      }
    }
    
    const newValue = values[actualIndex]
    if (newValue !== undefined && newValue !== value) {
      onChange(newValue)
      triggerHapticFeedback()
      playSpinSound() // Play spinning sound when value changes
      setLastHapticValue(newValue)
    } else if (newValue !== undefined && newValue !== lastHapticValue && isDragging) {
      // Provide haptic feedback during dragging even if value hasn't changed in parent
      triggerHapticFeedback()
      playSpinSound() // Play spinning sound during dragging
      setLastHapticValue(newValue)
    }
  }, [isDragging, value, onChange, values, triggerHapticFeedback, playSpinSound, itemHeight, paddingCount, paddedValues.length, lastHapticValue])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartY(e.clientY)
    setScrollTop(containerRef.current?.scrollTop || 0)
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    e.preventDefault()
    const deltaY = e.clientY - startY
    const newScrollTop = scrollTop - deltaY
    containerRef.current.scrollTop = newScrollTop
  }, [isDragging, startY, scrollTop])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    handleScroll()
  }, [handleScroll])

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    setStartY(e.touches[0].clientY)
    setScrollTop(containerRef.current?.scrollTop || 0)
  }

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !containerRef.current) return
    
    e.preventDefault()
    const deltaY = e.touches[0].clientY - startY
    const newScrollTop = scrollTop - deltaY
    containerRef.current.scrollTop = newScrollTop
  }, [isDragging, startY, scrollTop])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    handleScroll()
  }, [handleScroll])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

  useEffect(() => {
    // Initial scroll to current value
    scrollToValue(value, false)
  }, [scrollToValue, value])

  useEffect(() => {
    // Reset haptic feedback tracking when value changes externally
    setLastHapticValue(value)
  }, [value])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const scrollHandler = () => {
      if (!isDragging) {
        handleScroll()
      }
    }
    
    container.addEventListener('scroll', scrollHandler, { passive: true })
    return () => container.removeEventListener('scroll', scrollHandler)
  }, [handleScroll, isDragging])

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <label className="text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="relative">
        {/* Selection indicator - transparent with border only */}
        <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-10 border-2 border-blue-400 rounded-lg pointer-events-none z-10 bg-transparent" />
        <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-10 bg-blue-100/20 rounded-lg pointer-events-none z-5" />
        
        {/* Scrollable container */}
        <div
          ref={containerRef}
          className="h-32 w-20 overflow-y-scroll scrollbar-hide relative bg-white"
          style={{
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch'
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {paddedValues.map((val, index) => {
            const isSelected = val === value
            const actualIndex = index - paddingCount
            const normalizedIndex = actualIndex < 0 ? values.length + (actualIndex % values.length) : actualIndex % values.length
            const isActualValue = normalizedIndex >= 0 && normalizedIndex < values.length
            
            return (
              <div
                key={`${val}-${index}`}
                className={cn(
                  'h-10 flex items-center justify-center text-lg font-medium cursor-pointer transition-all duration-200 select-none',
                  'scroll-snap-align-center',
                  isSelected && isActualValue
                    ? 'text-blue-600 font-bold scale-110 z-20 relative'
                    : 'text-gray-500 hover:text-gray-700',
                  !isActualValue && 'opacity-60'
                )}
                style={{ scrollSnapAlign: 'center' }}
                onClick={() => {
                  if (isActualValue) {
                    onChange(val)
                    scrollToValue(val)
                    triggerHapticFeedback(true)
                    playSpinSound() // Play spinning sound when clicking on value
                  }
                }}
              >
                {val.toString().padStart(2, '0')}
              </div>
            )
          })}
        </div>
        
        {/* Fade gradients */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-30" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-30" />
      </div>
    </div>
  )
})

// Hide scrollbar styles
const scrollbarHideStyles = `
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style')
  styleElement.textContent = scrollbarHideStyles
  document.head.appendChild(styleElement)
}