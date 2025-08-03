'use client'

import React, { useEffect, useState } from 'react'
import { Mic, Volume2, MicOff, Phone, PhoneOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceOverlayProps {
  isListening: boolean
  isSpeaking: boolean
  audioLevel: number
  onClose: () => void
  onStartListening?: () => void
  onStopListening?: () => void
  isVoiceDetected?: boolean
  continuousMode?: boolean
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export function VoiceOverlay({ 
  isListening, 
  isSpeaking, 
  audioLevel, 
  onClose, 
  onStartListening, 
  onStopListening,
  isVoiceDetected = false,
  continuousMode = false,
  connectionStatus = 'connected'
}: VoiceOverlayProps) {
  const [pulseIntensity, setPulseIntensity] = useState(0)
  const [volumeBars, setVolumeBars] = useState<number[]>([])
  const [showRipples, setShowRipples] = useState(false)

  // Enhanced volume visualization
  useEffect(() => {
    if (isListening || isSpeaking) {
      const interval = setInterval(() => {
        // More realistic audio visualization
        const baseLevel = audioLevel * 0.8
        const randomVariation = 0.2
        
        const bars = Array.from({ length: 12 }, (_, index) => {
          const angleVariation = Math.sin((Date.now() * 0.01) + (index * 0.5)) * 0.3
          const randomFactor = (Math.random() - 0.5) * randomVariation
          return Math.max(10, (baseLevel + angleVariation + randomFactor) * 80 + 15)
        })
        
        setVolumeBars(bars)
        setPulseIntensity(audioLevel)
        setShowRipples(audioLevel > 0.1)
      }, 80) // Smooth 60fps-like updates
      
      return () => clearInterval(interval)
    } else {
      setVolumeBars([])
      setPulseIntensity(0)
      setShowRipples(false)
    }
  }, [isListening, isSpeaking, audioLevel])

  const getMainIcon = () => {
    if (connectionStatus === 'connecting') {
      return <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
    }
    if (connectionStatus === 'error') {
      return <PhoneOff className="h-8 w-8 text-white" />
    }
    if (isSpeaking) return <Volume2 className="h-8 w-8 text-white" />
    if (isListening) return <Mic className="h-8 w-8 text-white" />
    return continuousMode ? <Phone className="h-8 w-8 text-white" /> : <MicOff className="h-8 w-8 text-white" />
  }

  const getStatusText = () => {
    if (connectionStatus === 'connecting') return 'Connecting...'
    if (connectionStatus === 'error') return 'Connection Error'
    if (isSpeaking) return 'Speaking...'
    if (isListening && isVoiceDetected) return 'Voice detected...'
    if (isListening) return continuousMode ? 'Listening (Phone Mode)...' : 'Listening...'
    return continuousMode ? 'Voice Assistant (Phone Mode)' : 'Voice Assistant'
  }

  const getSubtitle = () => {
    if (connectionStatus === 'connecting') return 'Setting up microphone...'
    if (connectionStatus === 'error') return 'Please check your microphone'
    if (continuousMode) return 'Speak naturally - I\'ll respond like a phone call'
    return 'Speak your message'
  }

  const getCircleScale = () => {
    const baseScale = 1
    const audioScale = audioLevel * 0.4
    const pulseScale = showRipples ? Math.sin(Date.now() * 0.01) * 0.1 : 0
    return Math.max(0.8, baseScale + audioScale + pulseScale)
  }

  const getGlowIntensity = () => {
    return Math.min(audioLevel * 60 + 20, 50)
  }

  const getCircleColor = () => {
    if (connectionStatus === 'error') return 'from-red-500 to-red-700'
    if (connectionStatus === 'connecting') return 'from-yellow-500 to-orange-500'
    if (isSpeaking) return 'from-green-500 to-green-700'
    if (isListening && isVoiceDetected) return 'from-yellow-400 to-orange-500'
    if (isListening) return 'from-blue-500 to-blue-700'
    return 'from-gray-600 to-gray-800'
  }

  const getGlowColor = () => {
    if (connectionStatus === 'error') return 'rgba(239, 68, 68, 0.8)'
    if (connectionStatus === 'connecting') return 'rgba(245, 158, 11, 0.8)'
    if (isSpeaking) return 'rgba(34, 197, 94, 0.8)'
    if (isListening && isVoiceDetected) return 'rgba(245, 158, 11, 0.8)'
    if (isListening) return 'rgba(59, 130, 246, 0.8)'
    return 'rgba(107, 114, 128, 0.8)'
  }

  const handleMainButtonClick = () => {
    if (connectionStatus === 'error') {
      onClose()
      return
    }
    
    if (continuousMode) {
      onClose() // End continuous mode
    } else if (isListening) {
      onStopListening?.()
    } else if (!isSpeaking) {
      onStartListening?.()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="relative">
        {/* Outer glow effect */}
        <div 
          className={cn(
            "absolute inset-0 rounded-full opacity-60",
            connectionStatus === 'error' && "bg-red-400/30",
            connectionStatus === 'connecting' && "bg-yellow-400/30",
            isSpeaking && "bg-green-400/30",
            isListening && isVoiceDetected && "bg-yellow-400/30",
            isListening && !isVoiceDetected && "bg-blue-400/30",
            !isListening && !isSpeaking && connectionStatus === 'connected' && "bg-gray-400/20"
          )}
          style={{
            transform: `scale(${getCircleScale() * 2.5})`,
            filter: `blur(${getGlowIntensity()}px)`,
            transition: 'all 0.15s ease-out'
          }}
        />
        
        {/* Animated ripple circles */}
        {showRipples && [1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "absolute inset-0 rounded-full border opacity-20",
              connectionStatus === 'error' && "border-red-400",
              connectionStatus === 'connecting' && "border-yellow-400", 
              isSpeaking && "border-green-400",
              isListening && isVoiceDetected && "border-yellow-400",
              isListening && !isVoiceDetected && "border-blue-400",
              !isListening && !isSpeaking && "border-white"
            )}
            style={{
              transform: `scale(${getCircleScale() * (1 + i * 0.4)})`,
              animation: `pulse ${1.5 + i * 0.3}s infinite ease-out`,
              transition: 'transform 0.15s ease-out',
              borderWidth: `${Math.max(1, 3 - i)}px`
            }}
          />
        ))}
        
        {/* Volume bars around the circle */}
        {(isListening || isSpeaking) && volumeBars.length > 0 && volumeBars.map((height, index) => (
          <div
            key={index}
            className={cn(
              "absolute rounded-full opacity-80",
              connectionStatus === 'error' && "bg-red-400",
              connectionStatus === 'connecting' && "bg-yellow-400",
              isSpeaking && "bg-green-400", 
              isListening && isVoiceDetected && "bg-yellow-400",
              isListening && !isVoiceDetected && "bg-blue-400"
            )}
            style={{
              width: '3px',
              height: `${Math.min(height, 100)}px`,
              left: '50%',
              top: '50%',
              transform: `
                translate(-50%, -50%) 
                rotate(${index * 30}deg) 
                translateY(-80px)
              `,
              transition: 'height 0.1s ease-out'
            }}
          />
        ))}
        
        {/* Main circle with icon */}
        <button 
          className={cn(
            "w-28 h-28 rounded-full flex items-center justify-center relative",
            "bg-gradient-to-br shadow-2xl cursor-pointer transition-all duration-300",
            "hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/40",
            "active:scale-95",
            getCircleColor()
          )}
          style={{
            transform: `scale(${getCircleScale()})`,
            boxShadow: `0 0 ${getGlowIntensity()}px ${getGlowColor()}`,
            transition: 'all 0.15s ease-out'
          }}
          onClick={handleMainButtonClick}
          disabled={connectionStatus === 'connecting'}
        >
          {getMainIcon()}
          
          {/* Inner pulse effect */}
          <div 
            className={cn(
              "absolute inset-0 rounded-full opacity-30 pointer-events-none",
              connectionStatus === 'error' && "bg-red-300",
              connectionStatus === 'connecting' && "bg-yellow-300",
              isSpeaking && "bg-green-300",
              isListening && isVoiceDetected && "bg-yellow-300", 
              isListening && !isVoiceDetected && "bg-blue-300"
            )}
            style={{
              transform: `scale(${Math.max(0.5, pulseIntensity * 1.2)})`,
              transition: 'transform 0.1s ease-out'
            }}
          />
          
          {/* Connection status indicator */}
          {connectionStatus !== 'connected' && (
            <div className={cn(
              "absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center",
              connectionStatus === 'connecting' && "bg-yellow-500 animate-pulse",
              connectionStatus === 'error' && "bg-red-500"
            )}>
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          )}
        </button>
        
        {/* Status text with enhanced styling */}
        <div className="absolute -bottom-28 left-1/2 transform -translate-x-1/2 text-center min-w-max">
          <p className="text-white text-xl font-semibold mb-2 drop-shadow-lg">
            {getStatusText()}
          </p>
          <p className="text-white/80 text-sm mb-3 drop-shadow">
            {getSubtitle()}
          </p>
          
          {/* Audio level indicator */}
          {(isListening || isSpeaking) && (
            <div className="flex items-center justify-center space-x-1 mb-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 h-3 rounded-full transition-all duration-150",
                    i < Math.floor(audioLevel * 8) 
                      ? cn(
                          connectionStatus === 'error' && "bg-red-400",
                          isSpeaking && "bg-green-400",
                          isListening && isVoiceDetected && "bg-yellow-400",
                          isListening && !isVoiceDetected && "bg-blue-400"
                        )
                      : "bg-white/30"
                  )}
                  style={{
                    height: i < Math.floor(audioLevel * 8) 
                      ? `${12 + (audioLevel * 8)}px` 
                      : '12px'
                  }}
                />
              ))}
            </div>
          )}
          
          {/* Instructions */}
          <div className="text-xs text-white/70 space-y-1">
            {continuousMode ? (
              <p>Click to end phone call mode</p>
            ) : (
              <>
                <p>Click to {isListening ? 'stop listening' : 'start listening'}</p>
                {!isListening && !isSpeaking && (
                  <p>Or press and hold spacebar</p>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Close button with enhanced styling */}
        <button
          onClick={onClose}
          className={cn(
            "absolute -top-10 -right-10 w-12 h-12 rounded-full flex items-center justify-center",
            "text-white hover:bg-white/20 transition-all duration-200 text-2xl font-bold",
            "backdrop-blur-sm border border-white/30 hover:border-white/50 hover:scale-110",
            "focus:outline-none focus:ring-2 focus:ring-white/50"
          )}
          title="Close voice assistant"
        >
          ×
        </button>
        
        {/* Keyboard shortcut indicator */}
        {!continuousMode && (
          <div className="absolute -bottom-40 left-1/2 transform -translate-x-1/2">
            <div className="bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white/80 text-xs">
              Hold <kbd className="bg-white/20 px-2 py-1 rounded text-xs">Space</kbd> to talk
            </div>
          </div>
        )}
      </div>
    </div>
  )
}