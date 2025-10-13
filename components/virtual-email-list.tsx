import React from 'react'
import { FixedSizeList as List } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Paperclip, GripVertical, MoreHorizontal } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Clean noisy headers and quoted blocks from Gmail-style snippets (conservative)
const cleanSnippetText = (text: string): string => {
  if (!text) return ''
  let s = text.replace(/\s+/g, ' ').trim()

  // Remove common forwarded/reply markers only if they appear at the start
  s = s.replace(/^\s*-+\s*forwarded message\s*-+\s*/i, '')
  s = s.replace(/^\s*on .*?wrote:\s*/i, '')

  // Strip header tokens only when they appear at the start
  s = s.replace(/^\s*(from|sent|subject|to):\s[^•\n]+/gi, '').trim()

  // Remove quote markers at line starts but keep content
  s = s.replace(/^>+\s*/gm, '')

  return s.replace(/\s{2,}/g, ' ').trim()
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Prefer summary, then snippet; strip duplicated subject prefix; fallback if too short
const getDisplaySnippet = (subject?: string, summary?: string, snippet?: string): string => {
  const base = (summary && summary.trim().length > 0) ? summary : (snippet || '')
  let cleaned = cleanSnippetText(base)

  if (subject && cleaned) {
    const sub = subject.trim()
    const pattern = new RegExp("^\\s*" + escapeRegex(sub) + "\\s*[:,\\-–—]*\\s*", 'i')
    cleaned = cleaned.replace(pattern, '').trim()
  }

  if (!cleaned || cleaned.length < 10) {
    let fallback = cleanSnippetText(snippet || '')
    if (subject && fallback) {
      const pattern = new RegExp("^\\s*" + escapeRegex(subject.trim()) + "\\s*[:,\\-–—]*\\s*", 'i')
      fallback = fallback.replace(pattern, '').trim()
    }
    cleaned = fallback
  }

  return cleaned || (snippet || '')
}

export interface Email {
  id: string
  subject: string
  from: string
  snippet: string
  date: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  hasAttachments: boolean
  summary?: {
    summary: string
    keyPoints: string[]
  }
}

interface VirtualEmailListProps {
  emails: Email[]
  onEmailSelect: (email: Email) => void
  selectedEmailId?: string
  onEmailDrop?: (emailId: string, targetPane: string) => void
}

interface EmailRowProps {
  index: number
  style: React.CSSProperties
  data: {
    emails: Email[]
    onEmailSelect: (email: Email) => void
    selectedEmailId?: string
    onEmailDrop?: (emailId: string, targetPane: string) => void
  }
}

interface DraggableEmailRowProps {
  email: Email
  onEmailSelect: (email: Email) => void
  selectedEmailId?: string
  onEmailDrop?: (emailId: string, targetPane: string) => void
}

const DraggableEmailRow: React.FC<DraggableEmailRowProps> = ({ 
  email, 
  onEmailSelect, 
  selectedEmailId,
  onEmailDrop 
}) => {
  const [isDragging, setIsDragging] = React.useState(false)
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const menuRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.setData('text/plain', email.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mx-0 my-1 px-4 py-3 rounded-md box-border border cursor-pointer transition-all duration-150 ease-in-out h-28 overflow-hidden",
        "bg-white dark:bg-card hover:shadow-sm",
        email.id === selectedEmailId
          ? "border-[3px] border-blue-600"
          : (!email.isRead ? "border-[2px] border-blue-500" : "border-slate-200 hover:border-slate-300"),
        isDragging && "shadow-md z-50 border-blue-600 opacity-50"
      )}
      draggable
      onDragStartCapture={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => {
        console.log('Email row clicked:', email.id, email.subject)
        onEmailSelect(email)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // Position the menu at the cursor and clamp to viewport
        const MENU_WIDTH = 176 // ~w-44
        const MENU_HEIGHT = 240 // approximate height
        const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8)
        const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 8)
        setMenuPosition({ x, y })
        setIsMenuOpen(true)
      }}
      whileHover={{ scale: isDragging ? 1 : 1.02 }}
      whileTap={{ scale: isDragging ? 1 : 0.98 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div 
            className="cursor-grab active:cursor-grabbing p-[2px] hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground truncate">
            {email.from.split('<')[0].trim() || email.from}
          </div>
          <div className="flex items-center space-x-1">
            {email.isImportant && (
              <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0" />
            )}
            {email.hasAttachments && (
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-xs text-muted-foreground font-medium">
            {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
          </div>
          <button
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted"
            aria-label="Email actions"
          onClick={(e) => {
            e.stopPropagation()
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
            const MENU_WIDTH = 176
            const MENU_HEIGHT = 240
            const x = Math.min(rect.right, window.innerWidth - MENU_WIDTH - 8)
            const y = Math.min(rect.bottom, window.innerHeight - MENU_HEIGHT - 8)
            setMenuPosition({ x, y })
            setIsMenuOpen((o) => !o)
          }}
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      </div>
      
      <div>
        <div className={cn(
          "text-sm text-foreground mb-1 truncate leading-tight",
          !email.isRead ? "font-semibold" : "font-medium"
        )}>
          {email.subject || '(No Subject)'}
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {getDisplaySnippet(email.subject, email.summary?.summary, email.snippet)}
        </div>
      </div>

      {isMenuOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[1000] bg-popover border border-border rounded-md shadow-md w-44 overflow-hidden"
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <ul className="text-sm">
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => {
                setIsMenuOpen(false)
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action: 'reply', email } }))
              }}>Reply</button>
            </li>
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => {
                setIsMenuOpen(false)
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action: 'forward', email } }))
              }}>Forward</button>
            </li>
            <li className="border-t border-border" />
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => {
                setIsMenuOpen(false)
                const action = email.isRead ? 'markUnread' : 'markRead'
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action, email } }))
              }}>{email.isRead ? 'Mark as unread' : 'Mark as read'}</button>
            </li>
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => {
                setIsMenuOpen(false)
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action: 'archive', email } }))
              }}>Archive</button>
            </li>
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted text-red-600" onClick={() => {
                setIsMenuOpen(false)
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action: 'delete', email } }))
              }}>Delete</button>
            </li>
            <li className="border-t border-border" />
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => {
                setIsMenuOpen(false)
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action: 'moveTo', email } }))
              }}>Move to…</button>
            </li>
            <li>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => {
                setIsMenuOpen(false)
                window.dispatchEvent(new CustomEvent('email-row-action', { detail: { action: 'label', email } }))
              }}>Label…</button>
            </li>
          </ul>
        </div>,
        document.body
      )}
    </motion.div>
  )
}

const EmailRow: React.FC<EmailRowProps> = ({ index, style, data }) => {
  const { emails, onEmailSelect, selectedEmailId, onEmailDrop } = data
  const email = emails[index]

  if (!email) return null

  return (
    <div style={style}>
      <DraggableEmailRow
        email={email}
        onEmailSelect={onEmailSelect}
        selectedEmailId={selectedEmailId}
        onEmailDrop={onEmailDrop}
      />
    </div>
  )
}

export const VirtualEmailList: React.FC<VirtualEmailListProps> = ({
  emails,
  onEmailSelect,
  selectedEmailId,
  onEmailDrop
}) => {
  const itemData = {
    emails,
    onEmailSelect,
    selectedEmailId,
    onEmailDrop
  }

  return (
    <div className="h-full w-full">
      <AutoSizer>
        {({ height, width }) => (
          <div className="relative z-10 bg-white dark:bg-background">
            <List
              height={height}
              width={width}
              itemCount={emails.length}
              itemSize={120} // Row height (h-28 = 112) + vertical margin (~8px)
              itemData={itemData}
              overscanCount={5} // Render 5 extra items for smooth scrolling
            >
              {EmailRow}
            </List>
          </div>
        )}
      </AutoSizer>
    </div>
  )
}

export default VirtualEmailList