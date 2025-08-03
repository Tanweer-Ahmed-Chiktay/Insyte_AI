'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { 
  Bot, 
  Send, 
  Mic, 
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VoiceOverlay } from './voice-overlay'
import { useVoiceAssistant } from '@/hooks/use-voice-assistant'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isVoiceOnly?: boolean
}

// Enhanced cache management
const CACHE_KEYS = {
  CONVERSATIONS: 'insyte_conversations',
  VOICE_SETTINGS: 'insyte_voice_settings'
}

const saveToCache = (key: string, data: any) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    }
  } catch (error) {
    console.error('Failed to save to cache:', error)
  }
}

const loadFromCache = (key: string, maxAge?: number) => {
  try {
    if (typeof window === 'undefined') return null
    
    const cached = localStorage.getItem(key)
    if (!cached) return null
    
    const { data, timestamp } = JSON.parse(cached)
    
    if (maxAge && Date.now() - timestamp > maxAge) {
      localStorage.removeItem(key)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Failed to load from cache:', error)
    return null
  }
}

export function AIAssistant() {
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true)
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false)
  const [voiceOnlyMode, setVoiceOnlyMode] = useState(false)
  const conversationHistoryRef = useRef<Message[]>([])
  const lastTranscriptRef = useRef<string>('')
  const isProcessingRef = useRef<boolean>(false)
  
  // Enhanced voice assistant with phone call-like experience
  const { 
    voiceState, 
    startListening, 
    stopListening, 
    playAudio, 
    stopAudio, 
    setContinuousMode,
    resetFallback,
    useBrowserSTT
  } = useVoiceAssistant({
    onTranscript: (text: string) => {
      // Prevent duplicate processing
      if (isProcessingRef.current || text === lastTranscriptRef.current) {
        return
      }
      
      lastTranscriptRef.current = text
      isProcessingRef.current = true
      
      // Use setTimeout to defer state updates and avoid render-time updates
      setTimeout(async () => {
        try {
          // In voice-only mode, process immediately without showing in UI
          if (voiceOnlyMode) {
            await handleVoiceMessage(text)
          } else {
            // In regular mode, show transcript and allow manual sending
            setInput(text)
            if (text.trim()) {
              await handleSendMessage(text)
            }
          }
        } finally {
          isProcessingRef.current = false
          // Clear transcript reference after a delay to allow for new input
          setTimeout(() => {
            lastTranscriptRef.current = ''
          }, 1000)
        }
      }, 0)
    },
    onError: (error: string) => {
      // Defer toast to avoid render-time updates
      setTimeout(() => {
        toast({
          title: 'Voice Error',
          description: error,
          variant: 'destructive'
        })
      }, 0)
      
      // In voice-only mode, try to recover automatically
      if (voiceOnlyMode && !voiceState.isSpeaking) {
        setTimeout(() => {
          if (voiceOnlyMode && !voiceState.isListening) {
            startListening()
          }
        }, 2000)
      }
    },
    onVoiceActivityDetected: () => {
      // Immediate interruption when user starts speaking
      if (voiceState.isSpeaking) {
        stopAudio()
        // Small delay before starting to listen to avoid feedback
        setTimeout(() => {
          if (voiceOnlyMode && !voiceState.isListening) {
            startListening()
          }
        }, 200)
      }
    },
    onSilenceDetected: () => {
      // Handle silence detection - this triggers transcript processing
      // In voice-only mode, silence detection should trigger immediate processing
      if (voiceOnlyMode && voiceState.isListening) {
        // The MediaRecorder will automatically stop and trigger transcript processing
        // This ensures speech is processed during the call, not just at the end
        console.log('Silence detected in voice call mode - processing speech')
      }
    },
    isEnabled: isVoiceEnabled,
    silenceThreshold: 1500, // 1.5 seconds for responsive experience
    voiceThreshold: 0.01 // Sensitive voice detection
  })

  // Toggle voice-only mode (phone call experience)
  const toggleVoiceOnlyMode = async () => {
    if (!voiceState.isSupported) {
      // Defer toast to avoid render-time updates
      setTimeout(() => {
        toast({
          title: 'Not Supported',
          description: 'Speech recognition is not supported in this browser.',
          variant: 'destructive'
        })
      }, 0)
      return
    }
    
    setVoiceOnlyMode(prev => {
      const newMode = !prev
      
      if (newMode) {
        // Enter voice-only mode
        setShowVoiceOverlay(true)
        setContinuousMode(true)
        startListening()
        
        // Clear visible messages to focus on voice interaction
        setMessages([])
        
        // Defer toast to avoid render-time updates
        setTimeout(() => {
          toast({
            title: 'Voice Mode Active',
            description: 'Speak naturally - I\'ll respond automatically like a phone call.',
            duration: 2000
          })
        }, 0)
      } else {
        // Exit voice-only mode
        setShowVoiceOverlay(false)
        setContinuousMode(false)
        stopListening()
        stopAudio()
        
        // Restore messages from conversation history
        setMessages(conversationHistoryRef.current.filter(msg => !msg.isVoiceOnly))
        
        // Defer toast to avoid render-time updates
        setTimeout(() => {
          toast({
            title: 'Voice Mode Disabled',
            description: 'Returned to text chat mode.',
            duration: 2000
          })
        }, 0)
      }
      
      return newMode
    })
  }

  // Keyboard shortcuts for voice control
  useKeyboardShortcuts({
    onSpacebarHold: () => {
      if (isVoiceEnabled && !voiceState.isListening && !voiceOnlyMode) {
        startListening()
      }
    },
    onSpacebarRelease: () => {
      if (isVoiceEnabled && voiceState.isListening && !voiceOnlyMode) {
        stopListening()
      }
    },
    onEscape: () => {
      if (voiceOnlyMode) {
        toggleVoiceOnlyMode()
      } else if (voiceState.isListening) {
        stopListening()
      } else if (voiceState.isSpeaking) {
        stopAudio()
      }
    },
    isEnabled: isVoiceEnabled
  })

  // Load cached data on mount
  useEffect(() => {
    const cachedMessages = loadFromCache(CACHE_KEYS.CONVERSATIONS, 7 * 24 * 60 * 60 * 1000)
    if (cachedMessages) {
      const messagesWithDates = cachedMessages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
      setMessages(messagesWithDates)
      conversationHistoryRef.current = messagesWithDates
    }
    
    const voiceSettings = loadFromCache(CACHE_KEYS.VOICE_SETTINGS)
    if (voiceSettings) {
      setIsVoiceEnabled(voiceSettings.enabled ?? true)
    }
  }, [])

  // Save conversations and settings to cache
  useEffect(() => {
    if (messages.length > 0) {
      saveToCache(CACHE_KEYS.CONVERSATIONS, messages)
      conversationHistoryRef.current = messages
    }
  }, [messages])

  useEffect(() => {
    saveToCache(CACHE_KEYS.VOICE_SETTINGS, { enabled: isVoiceEnabled })
  }, [isVoiceEnabled])

  // Enhanced message handling for voice-only mode
  const handleVoiceMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      isVoiceOnly: true
    }
    
    // Add to conversation history but not visible messages in voice-only mode
    conversationHistoryRef.current = [...conversationHistoryRef.current, userMessage]
    
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: messageText,
          includeVoice: true,
          conversationHistory: conversationHistoryRef.current.slice(-10) // Last 10 messages for context
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        isVoiceOnly: true
      }
      
      // Add to conversation history
      conversationHistoryRef.current = [...conversationHistoryRef.current, assistantMessage]
      
      // Play voice response immediately
      if (data.audioUrl) {
        if (data.audioUrl === 'USE_BROWSER_TTS') {
          // Use browser speech synthesis as fallback
          await synthesizeAndPlay(data.response)
        } else {
          await playAudio(data.audioUrl)
        }
      } else {
        // Fallback: synthesize speech if no audio provided
        await synthesizeAndPlay(data.response)
      }
      
    } catch (error: any) {
      console.error('Voice chat error:', error)
      
      const errorMessage = getErrorMessage(error)
      
      // Speak error message in voice-only mode
      if (voiceOnlyMode) {
        await synthesizeAndPlay(`Sorry, I encountered an error: ${errorMessage}`)
      } else {
        // Defer toast to avoid render-time updates
        setTimeout(() => {
          toast({
            title: 'Error',
            description: errorMessage,
            variant: 'destructive'
          })
        }, 0)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Enhanced regular message handling
  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input
    if (!textToSend.trim() || isLoading) return
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    conversationHistoryRef.current = [...conversationHistoryRef.current, userMessage]
    
    if (!messageText) setInput('')
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: textToSend,
          includeVoice: isVoiceEnabled,
          conversationHistory: conversationHistoryRef.current.slice(-10)
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, assistantMessage])
      conversationHistoryRef.current = [...conversationHistoryRef.current, assistantMessage]
      
      // Play voice response if available and enabled
      if (isVoiceEnabled && data.audioUrl) {
        if (data.audioUrl === 'USE_BROWSER_TTS') {
          // Use browser speech synthesis as fallback
          await synthesizeAndPlay(data.response)
        } else {
          await playAudio(data.audioUrl)
        }
      }
      
    } catch (error: any) {
      const errorMessage = getErrorMessage(error)
      // Defer toast to avoid render-time updates
      setTimeout(() => {
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        })
      }, 0)
    } finally {
      setIsLoading(false)
    }
  }

  // Enhanced speech synthesis with automatic fallback
  const synthesizeAndPlay = async (text: string) => {
    try {
      const response = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      
      if (response.ok) {
        const contentType = response.headers.get('content-type')
        
        // Check if response is JSON (browser TTS fallback)
        if (contentType?.includes('application/json')) {
          const data = await response.json()
          
          if (data.useBrowserTTS) {
            console.log('Using browser TTS:', data.message)
            
            // Use browser speech synthesis
            if ('speechSynthesis' in window) {
              const utterance = new SpeechSynthesisUtterance(data.text)
              utterance.rate = 0.9
              utterance.pitch = 1
              utterance.volume = 0.8
              
              // Enhanced voice selection for better quality
              const voices = speechSynthesis.getVoices()
              const preferredVoice = voices.find(voice => 
                voice.name.includes('Google') || 
                voice.name.includes('Microsoft') ||
                voice.name.includes('Alex') ||
                voice.name.includes('Samantha')
              )
              if (preferredVoice) {
                utterance.voice = preferredVoice
              }
              
              speechSynthesis.speak(utterance)
              return
            } else {
              throw new Error('Browser speech synthesis not supported')
            }
          }
        } else {
          // Handle audio blob response (ElevenLabs)
          const audioBlob = await response.blob()
          const audioUrl = URL.createObjectURL(audioBlob)
          await playAudio(audioUrl)
          URL.revokeObjectURL(audioUrl)
          return
        }
      }
      
      throw new Error('Speech synthesis failed')
    } catch (error) {
      console.error('Speech synthesis error:', error)
      
      // Final fallback to browser speech synthesis
      if ('speechSynthesis' in window) {
        console.log('Using browser TTS as final fallback')
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.volume = 0.8
        speechSynthesis.speak(utterance)
      } else {
        // Defer toast to avoid render-time updates
        setTimeout(() => {
          toast({
            title: 'Speech Unavailable',
            description: 'Text-to-speech is not available in this browser.',
            variant: 'destructive'
          })
        }, 0)
      }
    }
  }

  // Enhanced error message handling
  const getErrorMessage = (error: any): string => {
    if (error.message?.includes('Rate limit exceeded')) {
      return 'Rate limit exceeded. Please wait a moment before trying again.'
    } else if (error.message?.includes('authentication failed')) {
      return 'AI service is temporarily unavailable. Please try again later.'
    } else if (error.message?.includes('network')) {
      return 'Network error. Please check your connection and try again.'
    }
    return error.message || 'An unexpected error occurred. Please try again.'
  }

  // Quick voice interaction (single message)
  const handleQuickVoiceMessage = async () => {
    if (!voiceState.isSupported) {
      // Defer toast to avoid render-time updates
      setTimeout(() => {
        toast({
          title: 'Not Supported',
          description: 'Speech recognition is not supported in this browser.',
          variant: 'destructive'
        })
      }, 0)
      return
    }
    
    if (voiceState.isListening) {
      stopListening()
      return
    }
    
    // Quick voice message mode
    setShowVoiceOverlay(true)
    setContinuousMode(false)
    await startListening()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Clear conversation
  const clearConversation = () => {
    setMessages([])
    conversationHistoryRef.current = []
    localStorage.removeItem(CACHE_KEYS.CONVERSATIONS)
    toast({
      title: 'Conversation Cleared',
      description: 'Chat history has been cleared.'
    })
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Enhanced Header */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">AI Assistant</h1>
              {voiceOnlyMode && (
                <p className="text-sm text-muted-foreground flex items-center">
                  <Phone className="h-3 w-3 mr-1" />
                  Voice Call Mode Active
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Voice Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              className={cn(
                "transition-colors",
                isVoiceEnabled ? "bg-green-50 border-green-200 text-green-700" : ""
              )}
            >
              {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            
            {/* Clear Chat */}
            <Button
              variant="outline"
              size="sm"
              onClick={clearConversation}
              disabled={messages.length === 0 && conversationHistoryRef.current.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
      
      {/* Voice-Only Mode Interface */}
      {voiceOnlyMode ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mb-8">
              <div className={cn(
                "w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center transition-all duration-300",
                "bg-gradient-to-br shadow-2xl",
                voiceState.isSpeaking 
                  ? "from-green-500 to-green-600 shadow-green-500/30" 
                  : voiceState.isListening
                    ? voiceState.isVoiceDetected
                      ? "from-yellow-500 to-orange-600 shadow-yellow-500/30"
                      : "from-blue-500 to-blue-600 shadow-blue-500/30"
                    : "from-gray-500 to-gray-600 shadow-gray-500/30"
              )}
              style={{
                transform: `scale(${1 + voiceState.audioLevel * 0.2})`,
                filter: `blur(${voiceState.audioLevel * 2}px)`
              }}
              >
                {voiceState.isSpeaking ? (
                  <Volume2 className="w-16 h-16 text-white" />
                ) : voiceState.isListening ? (
                  <Mic className="w-16 h-16 text-white" />
                ) : (
                  <Bot className="w-16 h-16 text-white" />
                )}
              </div>
              
              <h2 className="text-2xl font-bold mb-2">Voice Assistant</h2>
              <p className="text-muted-foreground text-lg mb-4">
                {voiceState.isSpeaking 
                  ? "I'm speaking..." 
                  : voiceState.isListening 
                    ? voiceState.isVoiceDetected 
                      ? "I hear you..." 
                      : "Listening..."
                    : "Ready to chat"
                }
              </p>
              
              {isLoading && (
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Speak naturally - I'll respond automatically like a phone call
              </p>
              
              <Button
                onClick={toggleVoiceOnlyMode}
                size="lg"
                variant="outline"
                className="bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
              >
                <PhoneOff className="h-5 w-5 mr-2" />
                End Voice Call
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Regular Chat Messages */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Welcome to AI Assistant</h3>
                  <p className="text-muted-foreground mb-6">
                    Ask me anything or start a voice conversation!
                  </p>
                  
                  <div className="flex justify-center space-x-4 mb-6">
                    <Button
                      onClick={toggleVoiceOnlyMode}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Start Voice Call
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleQuickVoiceMessage}
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Quick Voice Message
                    </Button>
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Try asking:</p>
                    <p>• "Summarize my recent emails"</p>
                    <p>• "Help me write a professional email"</p>
                    <p>• "What are my most important messages?"</p>
                    <p>• "Search for latest news about AI"</p>
                    <p>• "What's the weather like today?"</p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div key={message.id} className={cn(
                      "flex",
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}>
                      <div className={cn(
                        "max-w-[70%] rounded-lg p-4",
                        message.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      )}>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <p className="text-xs opacity-70 mt-2">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg p-4">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Enhanced Input Area */}
          <div className="p-6 border-t border-border">
            <div className="max-w-4xl mx-auto">
              <div className="flex space-x-2">
                <Input
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                  className="flex-1"
                />
                
                {/* Voice Call Button */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleVoiceOnlyMode}
                  disabled={isLoading}
                  className={cn(
                    "transition-all duration-200",
                    voiceOnlyMode && "bg-blue-100 border-blue-300 text-blue-700"
                  )}
                  title="Start voice call mode"
                >
                  <Phone className="h-4 w-4" />
                </Button>
                
                {/* Quick Voice Button */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleQuickVoiceMessage}
                  disabled={isLoading || !voiceState.isSupported}
                  className={cn(
                    "transition-all duration-200",
                    voiceState.isListening && !voiceOnlyMode && "bg-blue-100 border-blue-300 text-blue-700"
                  )}
                  title="Quick voice message"
                >
                  {voiceState.isListening && !voiceOnlyMode ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Voice Status Indicator */}
              {(voiceState.isListening || voiceState.isSpeaking) && !voiceOnlyMode && (
                <div className="flex items-center justify-center mt-2">
                  <div className={cn(
                    "inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium",
                    voiceState.isSpeaking 
                      ? "bg-green-100 text-green-800" 
                      : "bg-blue-100 text-blue-800"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-pulse",
                      voiceState.isSpeaking ? "bg-green-500" : "bg-blue-500"
                    )}></div>
                    <span>
                      {voiceState.isSpeaking 
                        ? "Speaking..." 
                        : voiceState.isVoiceDetected 
                          ? "Voice detected..." 
                          : "Listening..."
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      
      {/* Enhanced Voice Overlay */}
      {showVoiceOverlay && !voiceOnlyMode && (
        <VoiceOverlay
          isListening={voiceState.isListening}
          isSpeaking={voiceState.isSpeaking}
          audioLevel={voiceState.audioLevel}
          isVoiceDetected={voiceState.isVoiceDetected}
          continuousMode={voiceState.continuousMode}
          onClose={() => {
            setShowVoiceOverlay(false)
            setContinuousMode(false)
            stopListening()
            stopAudio()
          }}
          onStartListening={startListening}
          onStopListening={stopListening}
        />
      )}
    </div>
  )
}