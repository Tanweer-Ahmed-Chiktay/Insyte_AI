'use client'

import React, { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { 
  X, 
  SplitSquareHorizontal, 
  SplitSquareVertical,
  Maximize2,
  GripVertical
} from 'lucide-react'
import { cn } from '@/lib/utils'
// Email interfaces
interface Email {
  id: string
  subject: string
  from: string
  snippet: string
  receivedAt: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  threadId?: string
  labelIds?: string[]
  summary?: EmailSummary | null
}

interface FullEmail extends Email {
  to: string
  cc: string
  bcc: string
  htmlBody: string
  textBody: string
  attachments: Array<{
    filename: string
    mimeType: string
    attachmentId: string
    size: number
  }>
}

interface EmailSummary {
  id: string
  summary: string
  keyPoints: string[]
  actionItems: string[]
  createdAt: string
  updatedAt: string
}

interface EmailPane {
  id: string
  email: Email | null
  fullEmail: FullEmail | null
  width: number // percentage
  isLoading: boolean
}

interface PaneManagerProps {
  emails: Email[]
  onEmailSelect: (email: Email) => Promise<FullEmail | null>
  children: (panes: EmailPane[], onPaneUpdate: (paneId: string, updates: Partial<EmailPane>) => void, dragHandlers: { onDragStart: (email: Email) => void, onDragEnd: () => void }, currentPaneId: string, activePane: string) => React.ReactNode
}

export function PaneManager({ emails, onEmailSelect, children }: PaneManagerProps) {
  const [panes, setPanes] = useState<EmailPane[]>([
    { id: 'main', email: null, fullEmail: null, width: 100, isLoading: false }
  ])
  const [draggedEmail, setDraggedEmail] = useState<Email | null>(null)
  const [dragOverPane, setDragOverPane] = useState<string | null>(null)
  const [activePane, setActivePane] = useState<string>('main')
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizePaneIndex, setResizePaneIndex] = useState(-1)
  const dragCounter = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleEmailDragStart = useCallback((email: Email) => {
    setDraggedEmail(email)
  }, [])

  const handleEmailDragEnd = useCallback(() => {
    setDraggedEmail(null)
    setDragOverPane(null)
    dragCounter.current = 0
  }, [])

  const handlePaneDragOver = useCallback((e: React.DragEvent, paneId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handlePaneDragEnter = useCallback((e: React.DragEvent, paneId: string) => {
    e.preventDefault()
    dragCounter.current++
    setDragOverPane(paneId)
  }, [])

  const handlePaneDragLeave = useCallback((e: React.DragEvent, paneId: string) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragOverPane(null)
    }
  }, [])

  const splitPane = useCallback(async (paneId: string, email?: Email) => {    
    const paneIndex = panes.findIndex(p => p.id === paneId)
    if (paneIndex === -1) return

    const currentPane = panes[paneIndex]
    const newPaneWidth = currentPane.width / 2
    const newPaneId = `pane-${Date.now()}`

    const newPane: EmailPane = {
      id: newPaneId,
      email: email || null,
      fullEmail: null,
      width: newPaneWidth,
      isLoading: !!email
    }

    setPanes(prev => {
      const updated = [...prev]
      updated[paneIndex] = { ...currentPane, width: newPaneWidth }
      updated.splice(paneIndex + 1, 0, newPane)
      return updated
    })

    // Load the email if provided
    if (email) {
      try {
        const fullEmail = await onEmailSelect(email)
        setPanes(prev => prev.map(p => 
          p.id === newPaneId 
            ? { ...p, fullEmail, isLoading: false }
            : p
        ))
      } catch (error) {
        setPanes(prev => prev.map(p => 
          p.id === newPaneId 
            ? { ...p, email: null, isLoading: false }
            : p
        ))
      }
    }
  }, [panes, onEmailSelect])

  const handlePaneDrop = useCallback(async (e: React.DragEvent, paneId: string) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragOverPane(null)
    
    // Get email from either draggedEmail state or dataTransfer
    let emailToDrop = draggedEmail
    
    // If no draggedEmail state, try to get email ID from dataTransfer
    if (!emailToDrop) {
      const emailId = e.dataTransfer.getData('text/plain')
      if (emailId) {
        emailToDrop = emails.find(email => email.id === emailId) || null
      }
    }
    
    if (!emailToDrop) {
      console.log('No email to drop found')
      return
    }

    console.log('Dropping email:', emailToDrop.id, emailToDrop.subject, 'into pane:', paneId)
    
    const targetPane = panes.find(p => p.id === paneId)
    if (!targetPane) return

    // If there's only one pane, always split to create a new pane
    if (panes.length === 1) {
      splitPane(paneId, emailToDrop)
    } else {
      // If there are multiple panes, load the email into the target pane
      setPanes(prev => prev.map(p => 
        p.id === paneId 
          ? { ...p, email: emailToDrop, isLoading: true }
          : p
      ))
      
      try {
        const fullEmail = await onEmailSelect(emailToDrop)
        setPanes(prev => prev.map(p => 
          p.id === paneId 
            ? { ...p, fullEmail, isLoading: false }
            : p
        ))
      } catch (error) {
        console.error('Error loading email into pane:', error)
        setPanes(prev => prev.map(p => 
          p.id === paneId 
            ? { ...p, email: null, isLoading: false }
            : p
        ))
      }
    }
    
    setDraggedEmail(null)
  }, [draggedEmail, panes, onEmailSelect, splitPane, emails])

  const closePane = useCallback((paneId: string) => {
    if (panes.length <= 1) return // Don't close the last pane

    const paneIndex = panes.findIndex(p => p.id === paneId)
    if (paneIndex === -1) return

    const closingPane = panes[paneIndex]
    const remainingPanes = panes.filter(p => p.id !== paneId)
    
    // Redistribute the width of the closed pane
    const redistributedWidth = closingPane.width / remainingPanes.length
    
    setPanes(remainingPanes.map(pane => ({
      ...pane,
      width: pane.width + redistributedWidth
    })))
  }, [panes])

  const maximizePane = useCallback((paneId: string) => {
    setPanes(prev => prev.map(pane => ({
      ...pane,
      width: pane.id === paneId ? 100 : 0
    })))
  }, [])

  const resetPanes = useCallback(() => {
    const equalWidth = 100 / panes.length
    setPanes(prev => prev.map(pane => ({ ...pane, width: equalWidth })))
  }, [panes.length])

  const updatePane = useCallback((paneId: string, updates: Partial<EmailPane>) => {
    setPanes(prev => prev.map(p => 
      p.id === paneId ? { ...p, ...updates } : p
    ))
  }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent, paneIndex: number) => {
    e.preventDefault()
    setIsResizing(true)
    setResizeStartX(e.clientX)
    setResizePaneIndex(paneIndex)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || resizePaneIndex === -1 || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const deltaX = e.clientX - resizeStartX
    const deltaPercent = (deltaX / containerRect.width) * 100

    setPanes(prev => {
      const newPanes = [...prev]
      const currentPane = newPanes[resizePaneIndex]
      const nextPane = newPanes[resizePaneIndex + 1]

      if (currentPane && nextPane) {
        const newCurrentWidth = Math.max(10, Math.min(90, currentPane.width + deltaPercent))
        const newNextWidth = Math.max(10, Math.min(90, nextPane.width - deltaPercent))
        
        newPanes[resizePaneIndex] = { ...currentPane, width: newCurrentWidth }
        newPanes[resizePaneIndex + 1] = { ...nextPane, width: newNextWidth }
      }

      return newPanes
    })

    setResizeStartX(e.clientX)
  }, [isResizing, resizePaneIndex, resizeStartX])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
    setResizePaneIndex(-1)
  }, [])

  // Add mouse event listeners
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div ref={containerRef} className="flex h-full relative">
      {panes.map((pane, index) => (
        <motion.div
          key={pane.id}
          className={cn(
            "relative border-r border-border last:border-r-0 flex flex-col cursor-pointer min-h-0",
            dragOverPane === pane.id && "bg-blue-50 dark:bg-blue-900/20",
            activePane === pane.id && "ring-2 ring-blue-500 shadow-lg shadow-blue-500/20",
            pane.width === 0 && "hidden"
          )}
          style={{ width: `${pane.width}%` }}
          onDragOver={(e) => handlePaneDragOver(e, pane.id)}
          onDragEnter={(e) => handlePaneDragEnter(e, pane.id)}
          onDragLeave={(e) => handlePaneDragLeave(e, pane.id)}
          onDrop={(e) => handlePaneDrop(e, pane.id)}
          onClick={() => setActivePane(pane.id)}
        >
          {/* Pane Header */}
          <div className="flex items-center justify-between p-2 border-b border-border bg-muted/30">
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium truncate">
                {pane.email ? pane.email.subject : 'Empty Pane'}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => splitPane(pane.id)}
                className="h-6 w-6 p-0"
                title="Split Pane"
              >
                <SplitSquareVertical className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => maximizePane(pane.id)}
                className="h-6 w-6 p-0"
                title="Maximize Pane"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
              {panes.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => closePane(pane.id)}
                  className="h-6 w-6 p-0"
                  title="Close Pane"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Pane Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar" data-pane-id={pane.id}>
            {children(panes, updatePane, { onDragStart: handleEmailDragStart, onDragEnd: handleEmailDragEnd }, pane.id, activePane)}
          </div>

          {/* Resize Handle */}
          {index < panes.length - 1 && (
            <div 
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-blue-500 transition-colors z-10"
              onMouseDown={(e) => handleResizeStart(e, index)}
            />
          )}
        </motion.div>
      ))}



      {/* Global Controls */}
      {panes.length > 1 && (
        <div className="absolute top-2 right-2 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={resetPanes}
            className="h-7 text-xs"
          >
            Reset Layout
          </Button>
        </div>
      )}
    </div>
  )
}

// Hook for drag and drop functionality
export function useEmailDragDrop() {
  const handleDragStart = useCallback((e: React.DragEvent, email: Email) => {
    e.dataTransfer.setData('application/json', JSON.stringify(email))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // Clean up any drag state
  }, [])

  return {
    handleDragStart,
    handleDragEnd
  }
}