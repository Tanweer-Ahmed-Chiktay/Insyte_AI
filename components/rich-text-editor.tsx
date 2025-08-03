'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link,
  Image,
  Table,
  Palette,
  Type,
  Paperclip,
  X,
  Plus,
  Trash2,
  Download
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Attachment {
  id: string
  file: File
  name: string
  size: number
  type: string
}

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  placeholder?: string
  className?: string
}

const GOOGLE_FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Source Sans Pro',
  'Raleway',
  'Poppins',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'Inter',
  'Fira Sans',
  'Work Sans',
  'IBM Plex Sans',
  'Noto Sans',
  'Ubuntu',
  'Crimson Text',
  'Libre Baskerville',
  'PT Serif',
  'Oswald',
  'Quicksand',
  'Rubik',
  'DM Sans',
  'Space Grotesk'
]

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF6600', '#FFCC00', '#00FF00', '#0066FF', '#6600FF',
  '#FF3366', '#FF9933', '#FFFF33', '#33FF33', '#3366FF', '#9933FF',
  '#990000', '#CC3300', '#FF9900', '#009900', '#003399', '#330099'
]

export function RichTextEditor({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  placeholder = 'Write your email...',
  className
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [selectedFont, setSelectedFont] = useState('Arial')
  const [selectedFontSize, setSelectedFontSize] = useState('14')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [customColor, setCustomColor] = useState('#000000')
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?' +
      'family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&' +
      'family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&' +
      'family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&' +
      'family=Montserrat:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=Source+Sans+Pro:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700;1,900&' +
      'family=Raleway:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=Nunito:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;0,1000;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900;1,1000&' +
      'family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900&' +
      'family=Inter:wght@100;200;300;400;500;600;700;800;900&' +
      'family=Fira+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=Work+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&' +
      'family=Noto+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=Ubuntu:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&' +
      'family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&' +
      'family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&' +
      'family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&' +
      'family=Oswald:wght@200;300;400;500;600;700&' +
      'family=Quicksand:wght@300;400;500;600;700&' +
      'family=Rubik:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300;1,400;1,500;1,600;1,700;1,800;1,900&' +
      'family=DM+Sans:ital,opsz,wght@0,9..40,100;0,9..40,200;0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;0,9..40,1000;1,9..40,100;1,9..40,200;1,9..40,300;1,9..40,400;1,9..40,500;1,9..40,600;1,9..40,700;1,9..40,800;1,9..40,900;1,9..40,1000&' +
      'family=Space+Grotesk:wght@300;400;500;600;700&' +
      'display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link)
      }
    }
  }, [])

  // Handle external value changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      // Only update if the content is actually different and editor is not focused
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = value
      }
    }
  }, [value])

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const handleFontChange = (font: string) => {
    setSelectedFont(font)
    execCommand('fontName', font)
  }

  const handleFontSizeChange = (size: string) => {
    setSelectedFontSize(size)
    execCommand('fontSize', '3')
    // Apply custom font size via style
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      
      // Ensure the range is within the editor
      if (!editorRef.current?.contains(range.commonAncestorContainer)) {
        return
      }
      
      const span = document.createElement('span')
      span.style.fontSize = `${size}px`
      
      try {
        range.surroundContents(span)
      } catch {
        // If can't surround, try alternative approach
        try {
          const selectedText = range.toString()
          if (selectedText) {
            span.textContent = selectedText
            range.deleteContents()
            range.insertNode(span)
          }
        } catch (error) {
          // Fallback: use execCommand with inline style
          console.warn('Font size application failed, using fallback')
          execCommand('insertHTML', `<span style="font-size: ${size}px">${range.toString()}</span>`)
        }
      }
    }
  }

  const handleColorChange = (color: string) => {
    execCommand('foreColor', color)
    setShowColorPicker(false)
  }

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color)
    execCommand('foreColor', color)
  }

  const insertLink = () => {
    if (linkUrl && linkText) {
      const link = `<a href="${linkUrl}" target="_blank" style="color: #0066cc; text-decoration: underline;">${linkText}</a>`
      execCommand('insertHTML', link)
      setShowLinkDialog(false)
      setLinkUrl('')
      setLinkText('')
    }
  }

  const insertTable = () => {
    const table = `
      <table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;">
        <tr>
          <th style="padding: 8px; background-color: #f5f5f5; border: 1px solid #ddd;">Header 1</th>
          <th style="padding: 8px; background-color: #f5f5f5; border: 1px solid #ddd;">Header 2</th>
          <th style="padding: 8px; background-color: #f5f5f5; border: 1px solid #ddd;">Header 3</th>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">Cell 1</td>
          <td style="padding: 8px; border: 1px solid #ddd;">Cell 2</td>
          <td style="padding: 8px; border: 1px solid #ddd;">Cell 3</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">Cell 4</td>
          <td style="padding: 8px; border: 1px solid #ddd;">Cell 5</td>
          <td style="padding: 8px; border: 1px solid #ddd;">Cell 6</td>
        </tr>
      </table>
    `
    execCommand('insertHTML', table)
  }

  const handleFileAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      const newAttachments: Attachment[] = Array.from(files).map(file => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type
      }))
      onAttachmentsChange([...attachments, ...newAttachments])
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files[0]) {
      const file = files[0]
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = `<img src="${e.target?.result}" style="max-width: 100%; height: auto; margin: 10px 0;" alt="${file.name}" />`
        execCommand('insertHTML', img)
      }
      reader.readAsDataURL(file)
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    const otherFiles = files.filter(file => !file.type.startsWith('image/'))

    // Handle image files - insert inline
    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = `<img src="${event.target?.result}" style="max-width: 100%; height: auto; margin: 10px 0;" alt="${file.name}" />`
        execCommand('insertHTML', img)
      }
      reader.readAsDataURL(file)
    })

    // Handle other files - add as attachments
    if (otherFiles.length > 0) {
      const newAttachments: Attachment[] = otherFiles.map(file => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type
      }))
      onAttachmentsChange([...attachments, ...newAttachments])
    }
  }

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(att => att.id !== id))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleEditorChange = () => {
    if (editorRef.current) {
      // Save cursor position before updating
      const selection = window.getSelection()
      let cursorPosition = 0
      
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const preCaretRange = range.cloneRange()
        preCaretRange.selectNodeContents(editorRef.current)
        preCaretRange.setEnd(range.endContainer, range.endOffset)
        cursorPosition = preCaretRange.toString().length
      }
      
      const newContent = editorRef.current.innerHTML
      onChange(newContent)
      
      // Restore cursor position after a brief delay
      setTimeout(() => {
        if (editorRef.current && document.activeElement === editorRef.current) {
          const selection = window.getSelection()
          if (selection) {
            try {
              const range = document.createRange()
              const walker = document.createTreeWalker(
                 editorRef.current,
                 NodeFilter.SHOW_TEXT,
                 null
               )
              
              let currentPos = 0
              let node
              
              while (node = walker.nextNode()) {
                const nodeLength = node.textContent?.length || 0
                if (currentPos + nodeLength >= cursorPosition) {
                  range.setStart(node, cursorPosition - currentPos)
                  range.setEnd(node, cursorPosition - currentPos)
                  break
                }
                currentPos += nodeLength
              }
              
              selection.removeAllRanges()
              selection.addRange(range)
            } catch (e) {
              // Fallback: place cursor at end
              const range = document.createRange()
              range.selectNodeContents(editorRef.current)
              range.collapse(false)
              selection.removeAllRanges()
              selection.addRange(range)
            }
          }
        }
      }, 0)
    }
  }

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="bg-muted/30 border-b p-2 space-y-2">
        {/* First Row - Font and Size */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedFont}
            onChange={(e) => handleFontChange(e.target.value)}
            className="px-2 py-1 border rounded text-sm bg-background"
          >
            {GOOGLE_FONTS.map(font => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </select>
          
          <select
            value={selectedFontSize}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            className="px-2 py-1 border rounded text-sm bg-background w-16"
          >
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72].map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        {/* Second Row - Formatting */}
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('bold')}
            className="h-8 w-8 p-0"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('italic')}
            className="h-8 w-8 p-0"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('underline')}
            className="h-8 w-8 p-0"
          >
            <Underline className="h-4 w-4" />
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('justifyLeft')}
            className="h-8 w-8 p-0"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('justifyCenter')}
            className="h-8 w-8 p-0"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('justifyRight')}
            className="h-8 w-8 p-0"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('justifyFull')}
            className="h-8 w-8 p-0"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('insertUnorderedList')}
            className="h-8 w-8 p-0"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('insertOrderedList')}
            className="h-8 w-8 p-0"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="h-8 w-8 p-0"
            >
              <Palette className="h-4 w-4" />
            </Button>
            {showColorPicker && (
              <div className="absolute top-10 left-0 z-50 bg-background border rounded-lg p-3 shadow-lg">
                <div className="grid grid-cols-6 gap-1 mb-3">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => handleColorChange(color)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => handleCustomColorChange(e.target.value)}
                    className="w-8 h-8 rounded border"
                  />
                  <Input
                    type="text"
                    value={customColor}
                    onChange={(e) => handleCustomColorChange(e.target.value)}
                    placeholder="#000000"
                    className="w-20 h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLinkDialog(true)}
            className="h-8 w-8 p-0"
          >
            <Link className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            className="h-8 w-8 p-0"
          >
            <Image className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={insertTable}
            className="h-8 w-8 p-0"
          >
            <Table className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8 p-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        className={cn(
          "min-h-[300px] max-h-[500px] overflow-y-auto p-4 focus:outline-none prose prose-sm max-w-none bg-white border rounded-md transition-colors",
          isDragOver && "border-blue-500 bg-blue-50"
        )}
        style={{ fontFamily: selectedFont, fontSize: `${selectedFontSize}px` }}
        onInput={handleEditorChange}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        suppressContentEditableWarning={true}
      />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-t p-3 bg-muted/20">
          <h4 className="text-sm font-medium mb-2 flex items-center">
            <Paperclip className="h-4 w-4 mr-1" />
            Attachments ({attachments.length})
          </h4>
          <div className="space-y-2">
            {attachments.map(attachment => (
              <div key={attachment.id} className="flex items-center justify-between p-2 bg-background rounded border">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{attachment.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(attachment.id)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileAttachment}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg p-4 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Insert Link</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Link Text</label>
                <Input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Enter link text"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLinkDialog(false)
                  setLinkUrl('')
                  setLinkText('')
                }}
              >
                Cancel
              </Button>
              <Button onClick={insertLink} disabled={!linkUrl || !linkText}>
                Insert Link
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}