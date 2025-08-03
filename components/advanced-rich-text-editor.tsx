'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontSize } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { createLowlight } from 'lowlight'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Quote,
  Minus,
  Heading1,
  Heading2,
  Heading3,
  Type,
  Palette,
  Highlighter,
  Undo,
  Redo,
  MoreHorizontal,
  Plus,
  Trash2,
  Edit,
  Eye,
  Sparkles,
  RotateCcw,
  Languages,
  Volume2,
  Save,
  FileText,
  Calendar,
  X,
  ChevronDown,
  TableProperties,
  RowsIcon,
  Columns,
  SplitSquareHorizontal,
  Merge,
  Monitor,
  Moon,
  Sun,
  Paperclip
} from 'lucide-react'

interface Attachment {
  id: string
  file: File
  name: string
  size: number
  type: string
}

interface Template {
  id: string
  name: string
  content: string
}

interface AdvancedRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  attachments?: Attachment[]
  onAttachmentsChange?: (attachments: Attachment[]) => void
  placeholder?: string
  className?: string
  composeData?: {
    to: string
    subject: string
    body: string
  }
  onAutoSave?: (draft: any) => void
}

const FONT_FAMILIES = [
  'Inter', 'SF Pro Display', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 
  'Source Sans Pro', 'Raleway', 'Poppins', 'Nunito', 'Work Sans',
  'IBM Plex Sans', 'DM Sans', 'Space Grotesk', 'Fira Sans',
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'
]

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72]

const COLORS = [
  '#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#ffffff',
  '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#16a34a', '#059669', '#0891b2',
  '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#e11d48',
  '#fef2f2', '#fef3c7', '#ecfdf5', '#eff6ff', '#f3e8ff', '#fdf2f8'
]

const HIGHLIGHT_COLORS = [
  '#fef08a', '#bfdbfe', '#ddd6fe', '#bbf7d0', '#fed7aa', '#fecaca',
  '#a7f3d0', '#93c5fd', '#c4b5fd', '#fde68a', '#fca5a5', '#86efac'
]

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'ghost' | 'default' | 'outline' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  [key: string]: any
}

function Button({ 
  children, 
  onClick, 
  variant = 'ghost', 
  size = 'sm', 
  disabled = false, 
  className = '',
  ...props 
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
  
  const variants = {
    ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
    default: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
    destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
  }
  
  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-6 text-base'
  }
  
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

interface InputProps {
  className?: string
  [key: string]: any
}

function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 ${className}`}
      {...props}
    />
  )
}

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

function Separator({ orientation = 'horizontal', className = '' }: SeparatorProps) {
  return (
    <div
      className={`bg-slate-200 dark:bg-slate-700 ${
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full'
      } ${className}`}
    />
  )
}

export function AdvancedRichTextEditor({
  value = '',
  onChange,
  attachments = [],
  onAttachmentsChange,
  placeholder = 'Start writing...',
  className = '',
  composeData,
  onAutoSave
}: AdvancedRichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDark, setIsDark] = useState(false)
  const [isMarkdownMode, setIsMarkdownMode] = useState(false)
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [templates, setTemplates] = useState([
    { id: '1', name: 'Meeting Follow-up', content: '<h2>Meeting Follow-up</h2><p>Hi [Name],</p><p>Thank you for taking the time to meet with me today. I wanted to follow up on our discussion about:</p><ul><li>Key point 1</li><li>Key point 2</li><li>Key point 3</li></ul><p>Next steps:</p><ul><li>Action item 1</li><li>Action item 2</li></ul><p>Best regards,<br>[Your Name]</p>' },
    { id: '2', name: 'Project Update', content: '<h2>Project Status Update</h2><p>Dear Team,</p><p>Here\'s the latest update on our project:</p><h3>Completed</h3><ul><li>Task 1 ✓</li><li>Task 2 ✓</li></ul><h3>In Progress</h3><ul><li>Task 3</li><li>Task 4</li></ul><h3>Upcoming</h3><ul><li>Task 5</li><li>Task 6</li></ul><p>Let me know if you have any questions.</p><p>Best,<br>[Your Name]</p>' }
  ])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [showFontSizePicker, setShowFontSizePicker] = useState(false)

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@300;400;500;700&family=Open+Sans:wght@300;400;500;600;700&family=Lato:wght@300;400;700&family=Montserrat:wght@300;400;500;600;700&family=Source+Sans+Pro:wght@300;400;600;700&family=Raleway:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&family=Nunito:wght@300;400;500;600;700&family=Work+Sans:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link)
      }
    }
  }, [])

  // Configure lowlight
  const lowlight = createLowlight()

  // Configure Tiptap editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-blue-100 text-blue-800 px-1 rounded',
        },
        suggestion: {
          items: ({ query }) => {
            return [
              'John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Brown', 'Charlie Wilson'
            ].filter(item => item.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5)
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer hover:text-blue-800',
        },
      }),
      HorizontalRule,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection
      const text = editor.state.doc.textBetween(from, to, '')
      setSelectedText(text)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-6',
      },
    },
  })

  // Auto-save functionality
  useEffect(() => {
    if (!editor || !composeData || !onAutoSave) return

    const autoSaveInterval = setInterval(() => {
      const content = editor.getHTML()
      if (content.trim() && (composeData.to || composeData.subject)) {
        onAutoSave({
          to: composeData.to,
          subject: composeData.subject,
          body: content,
          attachments: attachments.map(att => att.name)
        })
      }
    }, 10000)

    return () => clearInterval(autoSaveInterval)
  }, [editor, composeData, attachments, onAutoSave])

  // AI Assistant Functions
  const callAI = async (prompt: string, selectedText: string) => {
    setAiLoading(true)
    try {
      const response = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'compose',
          context: selectedText ? `${prompt}: "${selectedText}"` : prompt,
          tone: 'professional',
          length: 'medium'
        })
      })
      
      if (!response.ok) throw new Error('AI request failed')
      
      const data = await response.json()
      return data.content || 'Unable to generate content'
    } catch (error) {
      console.error('AI Error:', error)
      return 'AI service temporarily unavailable. Please try again later.'
    } finally {
      setAiLoading(false)
    }
  }

  const rewriteText = async (tone: string) => {
    if (!selectedText || !editor) return
    
    setAiLoading(true)
    try {
      const response = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'compose',
          context: `Rewrite this text in a ${tone} tone: "${selectedText}"`,
          tone: tone,
          length: 'medium'
        })
      })
      
      if (!response.ok) throw new Error('AI request failed')
      
      const data = await response.json()
      const result = data.content || 'Unable to rewrite text'
      
      if (result) {
        editor.chain().focus().deleteSelection().insertContent(result).run()
      }
    } catch (error) {
      console.error('Rewrite Error:', error)
    } finally {
      setAiLoading(false)
    }
  }

  const summarizeText = async () => {
    if (!selectedText || !editor) return
    
    setAiLoading(true)
    try {
      const response = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'compose',
          context: `Summarize this text concisely: "${selectedText}"`,
          tone: 'professional',
          length: 'short'
        })
      })
      
      if (!response.ok) throw new Error('AI request failed')
      
      const data = await response.json()
      const result = data.content || 'Unable to summarize text'
      
      if (result) {
        editor.chain().focus().deleteSelection().insertContent(result).run()
      }
    } catch (error) {
      console.error('Summarize Error:', error)
    } finally {
      setAiLoading(false)
    }
  }

  const translateText = async (language: string) => {
    if (!selectedText || !editor) return
    
    const result = await callAI(`Translate this text to ${language}`, selectedText)
    
    if (result) {
      editor.chain().focus().deleteSelection().insertContent(result).run()
    }
  }

  // File handling
  const handleFileUpload = (files: FileList | null) => {
    if (!files) return

    Array.from(files).forEach((file: File) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e: ProgressEvent<FileReader>) => {
          if (editor && e.target?.result && typeof e.target.result === 'string') {
            editor.chain().focus().setImage({ src: e.target.result }).run()
          }
        }
        reader.readAsDataURL(file)
      } else {
        const attachment: Attachment = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          file,
          name: file.name,
          size: file.size,
          type: file.type
        }
        onAttachmentsChange?.([...attachments, attachment])
      }
    })
  }

  // Table functions
  const insertTable = () => {
    if (editor) {
      editor.chain().focus().insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true }).run()
      setShowTableDialog(false)
    }
  }

  // Link functions
  const setLink = () => {
    if (linkUrl && editor) {
      if (linkText) {
        editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run()
      } else {
        editor.chain().focus().setLink({ href: linkUrl }).run()
      }
      setShowLinkDialog(false)
      setLinkUrl('')
      setLinkText('')
    }
  }

  // Template functions
  const saveAsTemplate = () => {
    if (!editor) return
    
    const content = editor.getHTML()
    const name = prompt('Template name:')
    
    if (name && content) {
      const newTemplate = {
        id: Date.now().toString(),
        name,
        content
      }
      setTemplates([...templates, newTemplate])
    }
  }

  const insertTemplate = (template: Template) => {
    if (editor) {
      editor.chain().focus().insertContent(template.content).run()
      setShowTemplates(false)
    }
  }

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-slate-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className={`${isDark ? 'dark' : ''} ${className}`}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden transition-colors duration-200">
        {/* Main Toolbar */}
        <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDark(!isDark)}
              className="mr-2"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            
            {/* Undo/Redo */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            >
              <Redo className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Text Formatting */}
            <Button
              variant={editor.isActive('bold') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('italic') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('underline') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('strike') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Headings */}
            <Button
              variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('heading', { level: 3 }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Font Family */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFontPicker(!showFontPicker)}
              >
                <Type className="h-4 w-4 mr-1" />
                <ChevronDown className="h-3 w-3" />
              </Button>
              {showFontPicker && (
                <div className="absolute top-full left-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 w-52 max-h-64 overflow-y-auto mt-1">
                  {FONT_FAMILIES.map(font => (
                    <button
                      key={font}
                      className="block w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-sm transition-colors"
                      style={{ fontFamily: font }}
                      onClick={() => {
                        editor.chain().focus().setFontFamily(font).run()
                        setShowFontPicker(false)
                      }}
                    >
                      {font}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Font Size */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFontSizePicker(!showFontSizePicker)}
                className="min-w-[60px]"
              >
                <span className="text-xs mr-1">{editor?.getAttributes('textStyle')?.fontSize?.replace('px', '') || '16'}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
              {showFontSizePicker && (
                <div className="absolute top-full left-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 w-20 max-h-64 overflow-y-auto mt-1">
                  {FONT_SIZES.map(size => (
                    <button
                      key={size}
                      className="block w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-sm transition-colors"
                      onClick={() => {
                        editor.chain().focus().setFontSize(`${size}px`).run()
                        setShowFontSizePicker(false)
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Text Color */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowColorPicker(!showColorPicker)}
              >
                <Palette className="h-4 w-4" />
              </Button>
              {showColorPicker && (
                <div className="absolute top-full left-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3 mt-1">
                  <div className="grid grid-cols-8 gap-1 w-48">
                    {COLORS.map(color => (
                      <button
                        key={color}
                        className="w-6 h-6 rounded border border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          editor.chain().focus().setColor(color).run()
                          setShowColorPicker(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Highlight */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHighlightPicker(!showHighlightPicker)}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
              {showHighlightPicker && (
                <div className="absolute top-full left-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3 mt-1">
                  <div className="grid grid-cols-6 gap-1 w-40">
                    {HIGHLIGHT_COLORS.map(color => (
                      <button
                        key={color}
                        className="w-6 h-6 rounded border border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          editor.chain().focus().setHighlight({ color }).run()
                          setShowHighlightPicker(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Alignment */}
            <Button
              variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            >
              <AlignRight className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Lists */}
            <Button
              variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('taskList') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Insert Elements */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkDialog(true)}
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files
                  if (files) {
                    Array.from(files).forEach((file: File) => {
                      const attachment: Attachment = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        file,
                        name: file.name,
                        size: file.size,
                        type: file.type
                      }
                      onAttachmentsChange?.([...attachments, attachment])
                    })
                  }
                }
                input.click()
              }}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTableDialog(true)}
            >
              <TableIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* AI Assistant */}
            <Button
              variant={showAIAssistant ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowAIAssistant(!showAIAssistant)}
              disabled={aiLoading}
              className="relative"
            >
              <Sparkles className="h-4 w-4" />
              {aiLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                </div>
              )}
            </Button>
            
            {/* Templates */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <FileText className="h-4 w-4" />
            </Button>
            
            {/* More Options */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMoreOptions(!showMoreOptions)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* AI Assistant Panel */}
        {showAIAssistant && (
          <div className="border-b border-slate-200 dark:border-slate-700 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
            <div className="flex flex-wrap gap-2 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={summarizeText}
                disabled={!selectedText || aiLoading}
              >
                Summarize
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => translateText('Spanish')}
                disabled={!selectedText || aiLoading}
              >
                <Languages className="h-4 w-4 mr-1" />
                Translate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => callAI('Generate email from bullet points', editor?.getText())}
                disabled={aiLoading}
              >
                Generate Email
              </Button>
            </div>
            {selectedText && (
              <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg p-3 border border-slate-200/50 dark:border-slate-700/50">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Selected text:</span> "{selectedText.substring(0, 100)}{selectedText.length > 100 ? '...' : ''}"
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Templates Panel */}
        {showTemplates && (
          <div className="border-b border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">Templates</h4>
              <Button size="sm" variant="outline" onClick={saveAsTemplate}>
                <Save className="h-4 w-4 mr-1" />
                Save Current
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(template => (
                <button
                  key={template.id}
                  className="p-4 text-left border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all duration-200 group"
                  onClick={() => insertTemplate(template)}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {template.name}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {template.content.replace(/<[^>]*>/g, '').substring(0, 80)}...
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* More Options Panel */}
        {showMoreOptions && (
          <div className="border-b border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsMarkdownMode(!isMarkdownMode)}
              >
                {isMarkdownMode ? <Eye className="h-4 w-4 mr-1" /> : <Edit className="h-4 w-4 mr-1" />}
                {isMarkdownMode ? 'Preview' : 'Markdown'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => editor?.chain().focus().clearContent().run()}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Clear All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const content = editor?.getHTML()
                  navigator.clipboard.writeText(content || '')
                }}
              >
                <Save className="h-4 w-4 mr-1" />
                Copy HTML
              </Button>
            </div>
          </div>
        )}
        
        {/* Editor Content */}
        <div className="relative bg-white">
          <EditorContent 
            editor={editor} 
            className="prose prose-slate max-w-none min-h-[400px] p-6 focus-within:bg-slate-50/30 transition-colors duration-200 [&_.ProseMirror]:bg-white [&_.ProseMirror]:text-black [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none"
          />
          
          {/* Floating Selection Toolbar */}
          {selectedText && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-sm text-white rounded-lg p-2 shadow-xl border border-slate-700/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className="text-white hover:bg-slate-700/50"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className="text-white hover:bg-slate-700/50"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLinkDialog(true)}
                className="text-white hover:bg-slate-700/50"
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
              <Separator orientation="vertical" className="h-4 bg-slate-600" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => rewriteText('formal')}
                disabled={aiLoading}
                className="text-white hover:bg-slate-700/50"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* Word Count */}
          <div className="absolute bottom-4 right-4 text-sm text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg px-3 py-1 border border-slate-200/50 dark:border-slate-700/50">
            {editor?.storage.characterCount?.characters() || 0} characters
          </div>
        </div>
        
        {/* Table Context Menu */}
        {editor?.isActive('table') && (
          <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().addColumnBefore().run()}>
                <Plus className="h-3 w-3 mr-1" />
                Col Before
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().addColumnAfter().run()}>
                <Plus className="h-3 w-3 mr-1" />
                Col After
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().deleteColumn().run()}>
                <Trash2 className="h-3 w-3 mr-1" />
                Del Col
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().addRowBefore().run()}>
                <Plus className="h-3 w-3 mr-1" />
                Row Before
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().addRowAfter().run()}>
                <Plus className="h-3 w-3 mr-1" />
                Row After
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().deleteRow().run()}>
                <Trash2 className="h-3 w-3 mr-1" />
                Del Row
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().mergeCells().run()}>
                <Merge className="h-3 w-3 mr-1" />
                Merge
              </Button>
              <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().splitCell().run()}>
                <SplitSquareHorizontal className="h-3 w-3 mr-1" />
                Split
              </Button>
              <Button size="sm" variant="destructive" onClick={() => editor?.chain().focus().deleteTable().run()}>
                <Trash2 className="h-3 w-3 mr-1" />
                Delete Table
              </Button>
            </div>
          </div>
        )}
        
        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/50">
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Attachments</h4>
            <div className="flex flex-wrap gap-2">
              {attachments.map(attachment => (
                <div key={attachment.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{attachment.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const newAttachments = attachments.filter(a => a.id !== attachment.id)
                      onAttachmentsChange?.(newAttachments)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,*/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />
      
      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Add Link</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowLinkDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">URL</label>
                <Input
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Link text (optional)</label>
                <Input
                  placeholder="Click here"
                  value={linkText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkText(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
                Cancel
              </Button>
              <Button onClick={setLink} disabled={!linkUrl}>
                Add Link
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Table Dialog */}
      {showTableDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Insert Table</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTableDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rows</label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={tableRows}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTableRows(parseInt(e.target.value) || 3)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Columns</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={tableCols}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTableCols(parseInt(e.target.value) || 3)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowTableDialog(false)}>
                Cancel
              </Button>
              <Button onClick={insertTable}>
                Insert Table
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}