import React from 'react'
import { FixedSizeList as List } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Paperclip, GripVertical } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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
        "mx-2 my-[2px] p-2 rounded-md border cursor-pointer transition-all duration-150 ease-in-out h-12",
        "bg-white dark:bg-card hover:shadow-sm",
        email.id === selectedEmailId
          ? "border-blue-500 ring-2 ring-blue-200"
          : "border-blue-200 hover:border-blue-300",
        !email.isRead && "border-blue-400",
        isDragging && "shadow-md z-50 border-blue-600 opacity-50"
      )}
      draggable
      onDragStartCapture={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => {
        console.log('Email row clicked:', email.id, email.subject)
        onEmailSelect(email)
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
        <div className="text-xs text-muted-foreground flex-shrink-0 font-medium">
          {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
        </div>
      </div>
      
      <div>
        <div className={cn(
          "text-sm text-foreground mb-[2px] truncate leading-tight",
          !email.isRead ? "font-semibold" : "font-medium"
        )}>
          {email.subject || '(No Subject)'}
        </div>
        <div className="text-xs text-muted-foreground truncate leading-tight">
          {email.snippet}
        </div>
      </div>
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
          <List
            height={height}
            width={width}
            itemCount={emails.length}
            itemSize={52} // Compact row height (h-12 = 48) + margins (~4px)
            itemData={itemData}
            overscanCount={5} // Render 5 extra items for smooth scrolling
          >
            {EmailRow}
          </List>
        )}
      </AutoSizer>
    </div>
  )
}

export default VirtualEmailList