'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createCSRFHeaders } from '@/lib/utils/csrf-client'

interface UseVoiceAssistantProps {
  onTranscript: (text: string) => void
  onError: (error: string) => void
  isEnabled: boolean
  onVoiceActivityDetected?: () => void
  onSilenceDetected?: () => void
  silenceThreshold?: number // in milliseconds
  voiceThreshold?: number // audio level threshold for voice detection
}

interface VoiceState {
  isListening: boolean
  isSpeaking: boolean
  audioLevel: number
  isSupported: boolean
  isVoiceDetected: boolean
  continuousMode: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export function useVoiceAssistant({ 
  onTranscript, 
  onError, 
  isEnabled, 
  onVoiceActivityDetected,
  onSilenceDetected,
  silenceThreshold = 1500, // Reduced to 1.5 seconds for more responsive experience
  voiceThreshold = 0.01 // Lower threshold for better voice detection
}: UseVoiceAssistantProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isSpeaking: false,
    audioLevel: 0,
    isSupported: false,
    isVoiceDetected: false,
    continuousMode: false,
    connectionStatus: 'disconnected'
  })
  
  // Refs for managing audio and recognition
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number>()
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const [useBrowserSTT, setUseBrowserSTT] = useState(false)
  const [rateLimitCount, setRateLimitCount] = useState(0)
  const lastVoiceTimeRef = useRef<number>(0)
  const isVoiceActiveRef = useRef<boolean>(false)
  const isInitializingRef = useRef<boolean>(false)
  const continuousListeningRef = useRef<boolean>(false)
  const interruptedRef = useRef<boolean>(false)

  // Enhanced browser compatibility check
  useEffect(() => {
    const checkSupport = () => {
      const hasMediaDevices = !!(typeof navigator !== 'undefined' && navigator.mediaDevices)
      const hasGetUserMedia = !!(hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
      const hasMediaRecorder = !!(typeof window !== 'undefined' && window.MediaRecorder)
      const hasSpeechRecognition = !!(typeof window !== 'undefined' && 
        (window.SpeechRecognition || window.webkitSpeechRecognition))
      
      const isSupported = hasGetUserMedia && (hasMediaRecorder || hasSpeechRecognition)
      
      setVoiceState(prev => ({ ...prev, isSupported }))
      
      // Auto-select browser STT if MediaRecorder is not available
      if (!hasMediaRecorder && hasSpeechRecognition) {
        setUseBrowserSTT(true)
      }
    }
    
    checkSupport()
  }, [])

  // Enhanced MediaRecorder initialization with better error handling
  const initializeMediaRecorder = useCallback(async () => {
    if (isInitializingRef.current) return false
    isInitializingRef.current = true
    
    try {
      setVoiceState(prev => ({ ...prev, connectionStatus: 'connecting' }))
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1 // Mono for better processing
        } 
      })
      
      streamRef.current = stream
      audioChunksRef.current = []
      
      // Setup audio context with enhanced processing
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      })
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)
      
      // Enhanced analyzer settings for better voice detection
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.3
      analyser.minDecibels = -90
      analyser.maxDecibels = -10
      
      microphone.connect(analyser)
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      microphoneRef.current = microphone
      
      // Enhanced MediaRecorder with better format selection
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4'
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '' // Let browser choose
          }
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped - processing audio chunks:', audioChunksRef.current.length)
        if (audioChunksRef.current.length === 0) return
        
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType || 'audio/webm' 
        })
        
        console.log('Audio blob size:', audioBlob.size, 'bytes')
        
        // Enhanced audio validation
        if (audioBlob.size > 500) { // Minimum viable audio size
          console.log('Transcribing audio blob...')
          await transcribeAudio(audioBlob)
        } else {
          console.log('Audio blob too small, skipping transcription')
        }
        
        audioChunksRef.current = []
        
        // Auto-restart listening in continuous mode if not interrupted
        console.log('Checking auto-restart conditions - continuous mode:', continuousListeningRef.current, 'interrupted:', interruptedRef.current)
        if (continuousListeningRef.current && !interruptedRef.current) {
          console.log('Auto-restarting listening in continuous mode')
          setTimeout(() => {
            if (continuousListeningRef.current && !currentAudioRef.current) {
              console.log('Restarting listening...')
              startListening()
            } else {
              console.log('Not restarting - continuous mode:', continuousListeningRef.current, 'audio playing:', !!currentAudioRef.current)
            }
          }, 200) // Short delay for smoother transitions
        } else {
          console.log('Not auto-restarting - continuous mode:', continuousListeningRef.current, 'interrupted:', interruptedRef.current)
        }
      }
      
      mediaRecorderRef.current = mediaRecorder
      setVoiceState(prev => ({ ...prev, connectionStatus: 'connected' }))
      return true
      
    } catch (error) {
      console.error('Error accessing microphone:', error)
      setVoiceState(prev => ({ ...prev, connectionStatus: 'error' }))
      
      let errorMessage = 'Could not access microphone.'
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone permissions.'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone.'
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is busy or unavailable.'
        }
      }
      
      onError(errorMessage)
      return false
    } finally {
      isInitializingRef.current = false
    }
  }, [onError, voiceState.isSpeaking])

  // Enhanced browser Speech Recognition with better continuous handling
  const initializeBrowserSTT = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      onError('Browser speech recognition not supported')
      return false
    }
    
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.continuous = true
      recognition.interimResults = true // Enable interim results for more responsive feedback
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1
      
      let finalTranscript = ''
      let isProcessing = false
      
      recognition.onstart = () => {
        console.log('Browser STT started')
        setVoiceState(prev => ({ ...prev, isListening: true, connectionStatus: 'connected' }))
        finalTranscript = ''
        isProcessing = false
      }
      
      recognition.onresult = (event: any) => {
        if (isProcessing) return
        
        let interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }
        
        // Process final results immediately
        if (finalTranscript.trim() && !isProcessing) {
          isProcessing = true
          const textToProcess = finalTranscript.trim()
          finalTranscript = ''
          
          // Stop recognition before processing to avoid conflicts
          try {
            recognition.stop()
          } catch (e) {
            console.warn('Error stopping recognition:', e)
          }
          
          onTranscript(textToProcess)
        }
      }
      
      recognition.onerror = (event: any) => {
        console.error('Browser STT error:', event.error)
        setVoiceState(prev => ({ ...prev, connectionStatus: 'error' }))
        
        if (event.error === 'not-allowed') {
          onError('Microphone permission denied')
        } else if (event.error === 'no-speech') {
          // Handle no-speech gracefully in continuous mode
          if (continuousListeningRef.current && !currentAudioRef.current) {
            setTimeout(() => restartBrowserSTT(), 500)
          }
        } else {
          onError('Speech recognition error: ' + event.error)
        }
      }
      
      recognition.onend = () => {
        console.log('Browser STT ended')
        setVoiceState(prev => ({ ...prev, isListening: false }))
        
        // Auto-restart in continuous mode
        if (continuousListeningRef.current && !interruptedRef.current && !currentAudioRef.current) {
          setTimeout(() => restartBrowserSTT(), 300)
        }
      }
      
      const restartBrowserSTT = () => {
        if (continuousListeningRef.current && !currentAudioRef.current && speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.start()
          } catch (error) {
            console.warn('Error restarting STT:', error)
          }
        }
      }
      
      speechRecognitionRef.current = recognition
      setVoiceState(prev => ({ ...prev, connectionStatus: 'connected' }))
      return true
      
    } catch (error) {
      console.error('Error initializing browser STT:', error)
      setVoiceState(prev => ({ ...prev, connectionStatus: 'error' }))
      onError('Failed to initialize speech recognition')
      return false
    }
  }, [onTranscript, onError])

  // Enhanced audio transcription with better retry logic
  const transcribeAudio = useCallback(async (audioBlob: Blob, retryCount = 0) => {
    console.log('transcribeAudio called with blob size:', audioBlob?.size, 'retryCount:', retryCount)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      
      console.log(`Transcription attempt ${retryCount + 1}`)
      const headers = await createCSRFHeaders()
      // Remove Content-Type for FormData to let browser set it with boundary
      delete headers['Content-Type']
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        
        // Enhanced rate limiting handling
        if (response.status === 429 && retryCount < 2) {
          const delay = Math.min(Math.pow(2, retryCount) * 1000, 5000) // Max 5 second delay
          console.log(`Rate limited, retrying in ${delay}ms`)
          
          setTimeout(() => {
            transcribeAudio(audioBlob, retryCount + 1)
          }, delay)
          return
        }
        
        // Switch to browser STT after rate limits
        if (response.status === 429) {
          setRateLimitCount(prev => prev + 1)
          if (rateLimitCount >= 1) {
            console.log('Switching to browser STT due to rate limits')
            setUseBrowserSTT(true)
            if (!speechRecognitionRef.current) {
              initializeBrowserSTT()
            }
            return
          }
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Transcription result:', data.text)
      
      if (data.text && data.text.trim()) {
        console.log('Calling onTranscript with:', data.text.trim())
        onTranscript(data.text.trim())
      } else {
        console.log('No text in transcription result')
      }
      
    } catch (error: any) {
      console.error('Transcription error:', error)
      
      if (error.name === 'AbortError') {
        onError('Request timeout. Please try again.')
      } else if (error.message.includes('Rate limit')) {
        // Don't show error for rate limits, just switch to browser STT
        if (!useBrowserSTT) {
          setUseBrowserSTT(true)
          if (!speechRecognitionRef.current) {
            initializeBrowserSTT()
          }
        }
      } else {
        onError('Transcription failed. Please try again.')
      }
    }
  }, [onTranscript, onError, rateLimitCount, useBrowserSTT, initializeBrowserSTT])

  // Enhanced voice activity detection with better sensitivity
  const detectVoiceActivity = useCallback((audioLevel: number) => {
    const currentTime = Date.now()
    const isVoiceActive = audioLevel > voiceThreshold
    
    if (isVoiceActive) {
      lastVoiceTimeRef.current = currentTime
      
      if (!isVoiceActiveRef.current) {
        isVoiceActiveRef.current = true
        setVoiceState(prev => ({ ...prev, isVoiceDetected: true }))
        console.log('Voice activity detected - level:', audioLevel)
        onVoiceActivityDetected?.()
        
        // Clear any existing silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }
    } else if (isVoiceActiveRef.current) {
      // Start silence detection timer
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          const silenceDuration = Date.now() - lastVoiceTimeRef.current
          
          if (silenceDuration >= silenceThreshold) {
            console.log('Silence detected after', silenceDuration, 'ms - stopping recording')
            isVoiceActiveRef.current = false
            setVoiceState(prev => ({ ...prev, isVoiceDetected: false }))
            onSilenceDetected?.()
            
            // Stop current recording to process speech
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              console.log('Stopping MediaRecorder due to silence')
              mediaRecorderRef.current.stop()
            }
          }
          
          silenceTimerRef.current = null
        }, silenceThreshold)
      }
    }
  }, [voiceThreshold, silenceThreshold, onVoiceActivityDetected, onSilenceDetected])

  // Enhanced audio level monitoring with better performance
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    
    const updateLevel = () => {
      if (!analyserRef.current || !voiceState.isListening) return
      
      analyserRef.current.getByteFrequencyData(dataArray)
      
      // Enhanced RMS calculation with frequency weighting
      let sum = 0
      const frequencyWeight = 0.7 // Weight lower frequencies more (voice range)
      
      for (let i = 0; i < dataArray.length; i++) {
        const weight = i < dataArray.length * frequencyWeight ? 1.5 : 0.5
        sum += dataArray[i] * dataArray[i] * weight
      }
      
      const rms = Math.sqrt(sum / dataArray.length)
      const normalizedLevel = Math.min(rms / 100, 1) // Adjusted normalization
      
      setVoiceState(prev => {
        const smoothedLevel = prev.audioLevel * 0.6 + normalizedLevel * 0.4
        return { ...prev, audioLevel: smoothedLevel }
      })
      
      // Voice activity detection
      detectVoiceActivity(normalizedLevel)
      
      if (voiceState.isListening) {
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
    }
    
    updateLevel()
  }, [voiceState, detectVoiceActivity])

  // Enhanced start listening with better state management
  const startListening = useCallback(async () => {
    console.log('startListening called - enabled:', isEnabled, 'supported:', voiceState.isSupported, 'already listening:', voiceState.isListening)
    if (!isEnabled || !voiceState.isSupported || voiceState.isListening) return
    
    // Only reset interrupted flag if we're not in continuous mode or if we're explicitly starting fresh
    if (!continuousListeningRef.current) {
      interruptedRef.current = false
    }
    
    // Interrupt any ongoing speech
    if (voiceState.isSpeaking && currentAudioRef.current) {
      console.log('Interrupting ongoing speech')
      currentAudioRef.current.pause()
      currentAudioRef.current = null
      setVoiceState(prev => ({ ...prev, isSpeaking: false }))
      // Don't set interrupted to true in continuous mode - this is just pausing for speech
      if (!continuousListeningRef.current) {
        interruptedRef.current = true
      }
    }
    
    // Use browser STT or MediaRecorder based on preference/availability
    if (useBrowserSTT) {
      console.log('Using browser STT')
      if (!speechRecognitionRef.current && !initializeBrowserSTT()) {
        return
      }
      
      try {
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.start()
        }
      } catch (error: any) {
        if (error.name !== 'InvalidStateError') { // Ignore if already started
          console.error('Browser STT start error:', error)
          onError('Failed to start speech recognition')
        }
      }
    } else {
      console.log('Using MediaRecorder')
      const initialized = await initializeMediaRecorder()
      if (!initialized) return
      
      if (mediaRecorderRef.current) {
        try {
          console.log('Starting MediaRecorder with 1-second chunks')
          mediaRecorderRef.current.start(1000) // Record in 1-second chunks
          monitorAudioLevel()
        } catch (error) {
          console.error('MediaRecorder start error:', error)
          onError('Failed to start recording')
        }
      }
    }
    
    setVoiceState(prev => ({ ...prev, isListening: true }))
  }, [isEnabled, voiceState.isSupported, voiceState.isListening, voiceState.isSpeaking, 
      useBrowserSTT, initializeBrowserSTT, initializeMediaRecorder, monitorAudioLevel, onError])

  // Enhanced stop listening with proper cleanup
  const stopListening = useCallback(() => {
    interruptedRef.current = true
    
    // Clear timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    // Stop browser STT
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch (error) {
        console.warn('Error stopping browser STT:', error)
      }
    }
    
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop()
      } catch (error) {
        console.warn('Error stopping MediaRecorder:', error)
      }
    }
    
    // Clean up media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    // Clean up audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.warn)
      audioContextRef.current = null
    }
    
    // Reset refs
    mediaRecorderRef.current = null
    analyserRef.current = null
    microphoneRef.current = null
    isVoiceActiveRef.current = false
    
    setVoiceState(prev => ({ 
      ...prev, 
      isListening: false, 
      isVoiceDetected: false,
      audioLevel: 0,
      connectionStatus: 'disconnected'
    }))
  }, [])

  // Enhanced stop audio with immediate interruption
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setVoiceState(prev => ({ ...prev, isSpeaking: false, audioLevel: 0 }))
  }, [])

  // Enhanced play audio with better state management and interruption handling
  const playAudio = useCallback(async (audioUrl: string) => {
    console.log('🔊 playAudio called with URL:', audioUrl)
    try {
      // Stop any current audio
      if (currentAudioRef.current) {
        console.log('🔊 Stopping current audio')
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      
      // Stop listening while speaking
      if (voiceState.isListening) {
        console.log('🔊 Stopping listening while speaking')
        stopListening()
      }
      
      console.log('🔊 Setting voice state to speaking')
      setVoiceState(prev => ({ ...prev, isSpeaking: true }))
      
      // Enhanced audio URL handling
      let audioSrc = audioUrl
      console.log('🔊 Processing audio URL, starts with data:', audioUrl.startsWith('data:audio/'))
      if (audioUrl.startsWith('data:audio/')) {
        try {
          console.log('🔊 Converting data URL to blob without network fetch')
          const dataUrlToBlob = (dataUrl: string): Blob => {
            const [header, base64] = dataUrl.split(',')
            const match = header.match(/data:(.*?);base64/)
            const mime = match ? match[1] : 'application/octet-stream'
            const binary = atob(base64)
            const len = binary.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
              bytes[i] = binary.charCodeAt(i)
            }
            return new Blob([bytes], { type: mime })
          }
          const blob = dataUrlToBlob(audioUrl)
          audioSrc = URL.createObjectURL(blob)
          console.log('🔊 Created blob URL:', audioSrc)
        } catch (error) {
          console.warn('🔊 Failed to convert audio data URL:', error)
        }
      }
      
      console.log('🔊 Creating Audio element with src:', audioSrc)
      const audio = new Audio(audioSrc)
      audio.preload = 'auto'
      currentAudioRef.current = audio
      
      // Enhanced audio level simulation
      let speakingInterval: NodeJS.Timeout
      const simulateAudioLevels = () => {
        speakingInterval = setInterval(() => {
          if (!currentAudioRef.current || currentAudioRef.current.paused) {
            clearInterval(speakingInterval)
            return
          }
          
          // More realistic speech pattern simulation
          const time = Date.now() * 0.01
          const baseLevel = 0.4 + Math.sin(time * 0.5) * 0.2
          const speechPattern = Math.sin(time * 2) * 0.3
          const randomVariation = (Math.random() - 0.5) * 0.2
          
          const simulatedLevel = Math.max(0, Math.min(1, baseLevel + speechPattern + randomVariation))
          
          setVoiceState(prev => ({ 
            ...prev, 
            audioLevel: prev.audioLevel * 0.7 + simulatedLevel * 0.3
          }))
        }, 80) // Faster updates for smoother animation
      }
      
      audio.oncanplaythrough = () => {
        console.log('🔊 Audio can play through, starting level simulation')
        simulateAudioLevels()
      }
      
      audio.onended = () => {
        console.log('🔊 Audio playback ended')
        clearInterval(speakingInterval)
        setVoiceState(prev => ({ ...prev, isSpeaking: false, audioLevel: 0 }))
        currentAudioRef.current = null
        
        if (audioSrc !== audioUrl && audioSrc.startsWith('blob:')) {
          URL.revokeObjectURL(audioSrc)
        }
        
        // Auto-restart listening in continuous mode
        if (continuousListeningRef.current) {
          console.log('🔊 Auto-restarting listening in continuous mode')
          setTimeout(() => {
            if (continuousListeningRef.current) {
              startListening()
            }
          }, 300)
        }
      }
      
      audio.onerror = (error) => {
        console.error('🔊 Audio playback error:', error)
        clearInterval(speakingInterval)
        setVoiceState(prev => ({ ...prev, isSpeaking: false, audioLevel: 0 }))
        currentAudioRef.current = null
        
        if (audioSrc !== audioUrl && audioSrc.startsWith('blob:')) {
          URL.revokeObjectURL(audioSrc)
        }
        
        onError('Audio playback failed')
      }
      
      console.log('🔊 Starting audio playback')
      await audio.play()
      console.log('🔊 Audio play() completed successfully')
      
    } catch (error) {
      console.error('🔊 Audio playback error in catch block:', error)
      setVoiceState(prev => ({ ...prev, isSpeaking: false, audioLevel: 0 }))
      onError('Audio playback failed')
    }
  }, [voiceState.isListening, stopListening, onError])

  // Enhanced continuous mode management
  const setContinuousMode = useCallback((enabled: boolean) => {
    console.log('setContinuousMode called with enabled:', enabled)
    continuousListeningRef.current = enabled
    setVoiceState(prev => ({ ...prev, continuousMode: enabled }))
    
    if (enabled) {
      // Reset interrupted flag when entering continuous mode
      interruptedRef.current = false
      console.log('Continuous mode enabled - reset interrupted flag to false')
    } else {
      console.log('Continuous mode disabled - stopping listening')
      stopListening()
    }
  }, [stopListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      continuousListeningRef.current = false
      stopListening()
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
    }
  }, [stopListening])

  // Reset fallback mechanism
  const resetFallback = useCallback(() => {
    setUseBrowserSTT(false)
    setRateLimitCount(0)
  }, [])

  return {
    voiceState,
    startListening,
    stopListening,
    playAudio,
    stopAudio,
    setContinuousMode,
    resetFallback,
    useBrowserSTT
  }
}

// Enhanced type declarations
declare global {
  interface Window {
    AudioContext: typeof AudioContext
    webkitAudioContext: typeof AudioContext
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
  
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null
    onresult: ((this: SpeechRecognition, ev: any) => any) | null
    onerror: ((this: SpeechRecognition, ev: any) => any) | null
    onend: ((this: SpeechRecognition, ev: Event) => any) | null
  }
  
  var SpeechRecognition: {
    prototype: SpeechRecognition
    new(): SpeechRecognition
  }
}