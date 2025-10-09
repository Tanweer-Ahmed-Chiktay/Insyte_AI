'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Star, 
  Reply, 
  ReplyAll, 
  Forward, 
  Archive, 
  Trash2,
  MoreHorizontal,
  Paperclip,
  Mail,
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatEmailDate, formatFullDateTime } from '@/lib/date-utils'

// Email interfaces (duplicated for now, should be shared)
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

interface EmailPaneProps {
  email: Email | null
  fullEmail: FullEmail | null
  isLoading: boolean
  onEmailAction?: (action: string, email: Email) => void
  onClose?: () => void
}

export function EmailPane({ 
  email, 
  fullEmail, 
  isLoading, 
  onEmailAction,
  onClose 
}: EmailPaneProps) {
  const [showRawHtml, setShowRawHtml] = useState(false)

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="rounded-full bg-muted p-6 mb-4">
          <Mail className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Email Selected</h3>
        <p className="text-muted-foreground mb-4">
          Drag an email here to view it in this pane
        </p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Drag emails from the list to create side-by-side views</p>
          <p>• Use the split button to create new panes</p>
          <p>• Resize panes by dragging the borders</p>
        </div>
      </div>
    )
  }

  const handleAction = (action: string) => {
    if (onEmailAction && email) {
      onEmailAction(action, email)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Email Header */}
      <div className="border-b border-border p-4 space-y-4">
        {/* Subject and Actions */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold leading-tight mb-2">
              {email.subject}
            </h1>
            {/* Email Details */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-foreground min-w-[60px]">From:</span>
                <span className="text-muted-foreground">{email.from}</span>
              </div>
              {fullEmail && fullEmail.to && (
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-foreground min-w-[60px]">To:</span>
                  <span className="text-muted-foreground">{fullEmail.to}</span>
                </div>
              )}
              {fullEmail && fullEmail.cc && (
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-foreground min-w-[60px]">Cc:</span>
                  <span className="text-muted-foreground">{fullEmail.cc}</span>
                </div>
              )}
              {fullEmail && fullEmail.bcc && (
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-foreground min-w-[60px]">Bcc:</span>
                  <span className="text-muted-foreground">{fullEmail.bcc}</span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <span className="font-medium text-foreground min-w-[60px]">Date:</span>
                <span className="text-muted-foreground">{formatFullDateTime(email.receivedAt).date}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-foreground min-w-[60px]">Time:</span>
                <span className="text-muted-foreground">{formatFullDateTime(email.receivedAt).time}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAction('star')}
              className={cn(
                "h-8 w-8 p-0",
                email.isStarred && "text-yellow-500"
              )}
            >
              <Star className={cn("h-4 w-4", email.isStarred && "fill-current")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAction('reply')}
              className="h-8 w-8 p-0"
            >
              <Reply className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAction('forward')}
              className="h-8 w-8 p-0"
            >
              <Forward className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAction('archive')}
              className="h-8 w-8 p-0"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAction('delete')}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {formatEmailDate(email.receivedAt)}
              </span>
            </div>
            {fullEmail?.attachments && fullEmail.attachments.length > 0 && (
              <div className="flex items-center space-x-1 text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                <span>{fullEmail.attachments.length} attachment{fullEmail.attachments.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {email.isImportant && (
              <Badge variant="destructive" className="text-xs">
                Important
              </Badge>
            )}
            {!email.isRead && (
              <Badge variant="secondary" className="text-xs">
                Unread
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6">
          {/* AI Summary */}
          {email.summary && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800"
            >
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                AI Summary
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm mb-3">
                {email.summary.summary}
              </p>
              
              {email.summary.keyPoints.length > 0 && (
                <div className="mb-3">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-1">
                    Key Points:
                  </h4>
                  <ul className="list-disc list-inside text-blue-800 dark:text-blue-200 text-sm space-y-1">
                    {email.summary.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {email.summary.actionItems.length > 0 && (
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-1">
                    Action Items:
                  </h4>
                  <ul className="list-disc list-inside text-blue-800 dark:text-blue-200 text-sm space-y-1">
                    {email.summary.actionItems.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* Email Body */}
          <div className="space-y-4">
            {fullEmail ? (
              <div className="space-y-4">
                {/* Toggle for HTML/Text view */}
                {fullEmail.htmlBody && fullEmail.textBody && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant={showRawHtml ? "outline" : "default"}
                      size="sm"
                      onClick={() => setShowRawHtml(false)}
                    >
                      Formatted
                    </Button>
                    <Button
                      variant={showRawHtml ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowRawHtml(true)}
                    >
                      Plain Text
                    </Button>
                  </div>
                )}

                {/* Email Content */}
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {showRawHtml || !fullEmail.htmlBody ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {fullEmail.textBody || fullEmail.htmlBody}
                    </pre>
                  ) : (
                    <div 
                      dangerouslySetInnerHTML={{ __html: fullEmail.htmlBody }}
                      className="email-content"
                    />
                  )}
                </div>

                {/* Attachments */}
                {fullEmail.attachments && fullEmail.attachments.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <h4 className="font-medium mb-2 flex items-center">
                      <Paperclip className="h-4 w-4 mr-2" />
                      Attachments ({fullEmail.attachments.length})
                    </h4>
                    <div className="space-y-2">
                      {fullEmail.attachments.map((attachment, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 border border-border rounded-md"
                        >
                          <div className="flex items-center space-x-2">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {attachment.filename}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({(attachment.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/emails/${email.id}/attachments/${attachment.attachmentId}?mode=inline&filename=${encodeURIComponent(attachment.filename)}&mimeType=${encodeURIComponent(attachment.mimeType)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm px-2 py-1 rounded border hover:bg-muted"
                            >
                              Preview
                            </a>
                            <a
                              href={`/api/emails/${email.id}/attachments/${attachment.attachmentId}?mode=attachment&filename=${encodeURIComponent(attachment.filename)}&mimeType=${encodeURIComponent(attachment.mimeType)}`}
                              className="text-sm px-2 py-1 rounded border hover:bg-muted"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-muted-foreground">
                  Loading email content...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// CSS for email content styling
export const emailPaneStyles = `
.email-content {
  font-family: inherit;
  line-height: 1.6;
}

.email-content img {
  max-width: 100%;
  height: auto;
}

.email-content table {
  border-collapse: collapse;
  width: 100%;
}

.email-content td,
.email-content th {
  border: 1px solid #e2e8f0;
  padding: 8px;
  text-align: left;
}

.email-content blockquote {
  border-left: 4px solid #e2e8f0;
  margin: 16px 0;
  padding-left: 16px;
  color: #64748b;
}
`