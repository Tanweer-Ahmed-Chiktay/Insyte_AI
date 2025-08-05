import { marked } from 'marked'
import hljs from 'highlight.js'

// Gmail-safe color palette
const COLORS = {
  primary: '#1a1a1a',      // Near black for text
  secondary: '#666666',     // Gray for secondary text
  accent: '#0066cc',        // Blue for links and accents
  success: '#008000',       // Green for strings
  warning: '#ff6600',       // Orange for variables
  danger: '#cc0000',        // Red for keywords
  info: '#6600cc',          // Purple for functions/classes
  muted: '#888888',         // Light gray for comments
  background: '#f8f9fa',    // Light background
  border: '#e1e4e8',        // Border color
  codeBackground: '#ffffff' // White background for code
}

// Comprehensive syntax highlighting class-to-style mapping
const SYNTAX_MAPPINGS = new Map([
  // Keywords and control flow
  ['hljs-keyword', `color: ${COLORS.danger}; font-weight: bold;`],
  ['hljs-built_in', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-type', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-literal', `color: ${COLORS.danger};`],
  ['hljs-symbol', `color: ${COLORS.danger};`],
  ['hljs-operator', `color: ${COLORS.danger};`],
  
  // Strings and characters
  ['hljs-string', `color: ${COLORS.success};`],
  ['hljs-char', `color: ${COLORS.success};`],
  ['hljs-template-string', `color: ${COLORS.success};`],
  ['hljs-template-variable', `color: ${COLORS.success};`],
  ['hljs-regexp', `color: ${COLORS.success};`],
  
  // Numbers
  ['hljs-number', `color: ${COLORS.accent};`],
  
  // Comments and documentation
  ['hljs-comment', `color: ${COLORS.muted}; font-style: italic;`],
  ['hljs-doctag', `color: ${COLORS.muted}; font-weight: bold;`],
  ['hljs-meta', `color: ${COLORS.muted};`],
  
  // Functions and methods
  ['hljs-function', `color: ${COLORS.info};`],
  ['hljs-title', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-title function_', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-title class_', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-title class_ inherited__', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-params', `color: ${COLORS.primary};`],
  
  // Classes and interfaces
  ['hljs-class', `color: ${COLORS.info}; font-weight: bold;`],
  
  // Variables and properties
  ['hljs-variable', `color: ${COLORS.warning};`],
  ['hljs-variable language_', `color: ${COLORS.warning}; font-weight: bold;`],
  ['hljs-property', `color: ${COLORS.accent};`],
  ['hljs-attr', `color: ${COLORS.info};`],
  ['hljs-attribute', `color: ${COLORS.info};`],
  
  // HTML/XML specific
  ['hljs-tag', `color: ${COLORS.accent};`],
  ['hljs-name', `color: ${COLORS.success};`],
  ['hljs-selector-tag', `color: ${COLORS.success}; font-weight: bold;`],
  ['hljs-selector-id', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-selector-class', `color: ${COLORS.info};`],
  ['hljs-selector-attr', `color: ${COLORS.warning};`],
  ['hljs-selector-pseudo', `color: ${COLORS.info};`],
  
  // CSS specific
  ['hljs-value', `color: ${COLORS.success};`],
  ['hljs-unit', `color: ${COLORS.accent};`],
  
  // Language specific
  ['hljs-subst', `color: ${COLORS.primary};`],
  ['hljs-formula', `color: ${COLORS.muted};`],
  ['hljs-addition', `color: ${COLORS.success}; background-color: #e6ffed;`],
  ['hljs-deletion', `color: ${COLORS.danger}; background-color: #ffeef0;`],
  
  // Generic highlighting
  ['hljs-emphasis', `font-style: italic;`],
  ['hljs-strong', `font-weight: bold;`],
  ['hljs-quote', `color: ${COLORS.muted}; font-style: italic;`],
  ['hljs-section', `color: ${COLORS.info}; font-weight: bold;`],
  ['hljs-bullet', `color: ${COLORS.accent};`],
  ['hljs-code', `color: ${COLORS.danger}; background-color: #f6f6f6;`],
])

/**
 * Apply syntax highlighting by converting hljs classes to inline styles
 */
function applySyntaxHighlighting(highlightedCode: string): string {
  let styledCode = highlightedCode
  
  // Sort mappings by specificity (longer class names first to avoid partial matches)
  const sortedMappings = Array.from(SYNTAX_MAPPINGS.entries())
    .sort((a, b) => b[0].length - a[0].length)
  
  for (const [className, style] of sortedMappings) {
    const regex = new RegExp(`class="${className.replace(/\s+/g, '\\s+')}"`, 'g')
    styledCode = styledCode.replace(regex, `style="${style}"`)
  }
  
  // Clean up any remaining class attributes that weren't mapped
  styledCode = styledCode.replace(/\s*class="[^"]*"/g, '')
  
  return styledCode
}

/**
 * Auto-detect programming language from code content
 */
function detectLanguage(code: string): string {
  const patterns = {
    java: [
      /\b(public|private|protected)\s+(static\s+)?(void|class|int|String|boolean)\b/,
      /\bSystem\.out\.println\b/,
      /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s*\)/,
      /\bimport\s+java\./,
      /\b(extends|implements|interface)\b/
    ],
    javascript: [
      /\b(function|const|let|var)\s+\w+/,
      /\b(console\.log|document\.getElementById|window\.)/,
      /=>\s*{/,
      /\bimport\s+.*\bfrom\b/,
      /\brequire\s*\(/
    ],
    typescript: [
      /:\s*(string|number|boolean|any|void)\b/,
      /\binterface\s+\w+/,
      /\btype\s+\w+\s*=/,
      /\bas\s+\w+/,
      /<.*>/
    ],
    python: [
      /\bdef\s+\w+\s*\(/,
      /\bimport\s+\w+/,
      /\bfrom\s+\w+\s+import/,
      /\bprint\s*\(/,
      /\bif\s+__name__\s*==\s*['"']__main__['"']/
    ],
    css: [
      /{\s*[\w-]+\s*:\s*[^}]+}/,
      /\.[a-zA-Z][\w-]*\s*{/,
      /#[a-zA-Z][\w-]*\s*{/,
      /@media\s+/,
      /\b(display|margin|padding|color|background)\s*:/
    ],
    html: [
      /<\/?[a-zA-Z][\w-]*[^>]*>/,
      /<!DOCTYPE\s+html>/i,
      /<html[^>]*>/i,
      /<(head|body|div|span|p|a|img)[^>]*>/i
    ],
    json: [
      /^\s*{[\s\S]*}\s*$/,
      /^\s*\[[\s\S]*\]\s*$/,
      /"[^"]*"\s*:\s*("[^"]*"|\d+|true|false|null)/
    ],
    xml: [
      /<\?xml\s+version/i,
      /<\w+[^>]*xmlns/,
      /<\/\w+>/
    ]
  }
  
  for (const [lang, langPatterns] of Object.entries(patterns)) {
    if (langPatterns.some(pattern => pattern.test(code))) {
      return lang
    }
  }
  
  return 'plaintext'
}

// Configure marked with custom renderer
const renderer = new marked.Renderer()

// Enhanced code block renderer
renderer.code = function(token: any) {
  const code = token.text
  let language = token.lang
  
  // Auto-detect language if not specified
  if (!language || language === 'plaintext') {
    language = detectLanguage(code)
  }
  
  // Validate language with highlight.js
  const validLanguage = language && hljs.getLanguage(language) ? language : 'plaintext'
  
  try {
    const highlighted = hljs.highlight(code, { language: validLanguage })
    const styledCode = applySyntaxHighlighting(highlighted.value)
    
    return `
      <div style="background-color: ${COLORS.background}; border: 2px solid ${COLORS.border}; border-radius: 8px; margin: 16px 0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background-color: #f1f3f4; padding: 8px 16px; font-size: 12px; font-weight: 600; color: ${COLORS.secondary}; border-bottom: 1px solid ${COLORS.border}; text-transform: uppercase;">
          ${validLanguage}
        </div>
        <pre style="margin: 0; padding: 16px; overflow-x: auto; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; font-size: 14px; line-height: 1.5; background-color: ${COLORS.codeBackground}; color: ${COLORS.primary};">
          <code style="background: none; padding: 0; border-radius: 0; color: inherit; font-family: inherit;">${styledCode}</code>
        </pre>
      </div>
    `.trim()
  } catch (error) {
    console.error(`Error highlighting ${validLanguage} code:`, error)
    // Fallback to plain code block
    return `
      <div style="background-color: ${COLORS.background}; border: 2px solid ${COLORS.border}; border-radius: 8px; margin: 16px 0; overflow: hidden;">
        <div style="background-color: #f1f3f4; padding: 8px 16px; font-size: 12px; font-weight: 600; color: ${COLORS.secondary}; border-bottom: 1px solid ${COLORS.border};">
          CODE
        </div>
        <pre style="margin: 0; padding: 16px; overflow-x: auto; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; font-size: 14px; line-height: 1.5; background-color: ${COLORS.codeBackground}; color: ${COLORS.primary}; white-space: pre-wrap;">
          <code style="background: none; padding: 0; border-radius: 0; color: inherit; font-family: inherit;">${code}</code>
        </pre>
      </div>
    `.trim()
  }
}

// Enhanced inline code renderer
renderer.codespan = function(token: any) {
  const code = token.text
  return `<code style="background-color: #f3f4f6; color: ${COLORS.danger}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; font-size: 0.875em; border: 1px solid #e5e7eb;">${code}</code>`
}

// Enhanced blockquote renderer
renderer.blockquote = function(token: any) {
  const quote = this.parser.parse(token.tokens)
  return `<blockquote style="border-left: 4px solid ${COLORS.accent}; margin: 16px 0; padding: 4px 16px; color: ${COLORS.secondary}; font-style: italic; background-color: #f8f9fa; border-radius: 0 4px 4px 0;">${quote}</blockquote>`
}

// Enhanced table renderer
renderer.table = function(token: any) {
  const header = token.header.map((cell: any) => this.tablecell(cell)).join('')
  const body = token.rows.map((row: any) => {
    const cells = row.map((cell: any) => this.tablecell(cell)).join('')
    return `<tr style="border-bottom: 1px solid ${COLORS.border};">${cells}</tr>`
  }).join('')
  
  return `
    <div style="overflow-x: auto; margin: 16px 0;">
      <table style="border-collapse: collapse; width: 100%; border: 1px solid ${COLORS.border}; border-radius: 6px; overflow: hidden;">
        <thead style="background-color: ${COLORS.background};"><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

renderer.tablerow = function(token: any) {
  const content = token.text
  return `<tr style="border-bottom: 1px solid ${COLORS.border};">${content}</tr>`
}

renderer.tablecell = function(token: any) {
  const content = this.parser.parseInline(token.tokens)
  const type = token.header ? 'th' : 'td'
  const style = token.header 
    ? `padding: 12px 16px; text-align: left; font-weight: 600; color: ${COLORS.primary}; border-right: 1px solid ${COLORS.border};`
    : `padding: 12px 16px; border-right: 1px solid ${COLORS.border}; color: ${COLORS.primary};`
  return `<${type} style="${style}">${content}</${type}>`
}

// Enhanced heading renderer with better hierarchy
renderer.heading = function(token: any) {
  const text = this.parser.parseInline(token.tokens)
  const level = token.depth
  
  const headingStyles = {
    1: `font-size: 28px; font-weight: 700; margin: 32px 0 20px 0; color: ${COLORS.primary}; border-bottom: 2px solid ${COLORS.border}; padding-bottom: 12px;`,
    2: `font-size: 22px; font-weight: 600; margin: 28px 0 16px 0; color: ${COLORS.primary}; border-bottom: 1px solid ${COLORS.border}; padding-bottom: 8px;`,
    3: `font-size: 18px; font-weight: 600; margin: 24px 0 12px 0; color: ${COLORS.primary};`,
    4: `font-size: 16px; font-weight: 600; margin: 20px 0 10px 0; color: ${COLORS.primary};`,
    5: `font-size: 14px; font-weight: 600; margin: 16px 0 8px 0; color: ${COLORS.secondary}; text-transform: uppercase; letter-spacing: 0.5px;`,
    6: `font-size: 12px; font-weight: 600; margin: 16px 0 8px 0; color: ${COLORS.secondary}; text-transform: uppercase; letter-spacing: 0.5px;`
  }
  
  return `<h${level} style="${headingStyles[level as keyof typeof headingStyles]}">${text}</h${level}>`
}

// Enhanced list renderers
renderer.list = function(token: any) {
  const body = token.items.map((item: any) => this.listitem(item)).join('')
  const tag = token.ordered ? 'ol' : 'ul'
  const style = token.ordered 
    ? `margin: 16px 0; padding-left: 28px; list-style-type: decimal; color: ${COLORS.primary};`
    : `margin: 16px 0; padding-left: 28px; list-style-type: disc; color: ${COLORS.primary};`
  return `<${tag} style="${style}">${body}</${tag}>`
}

renderer.listitem = function(token: any) {
  const text = this.parser.parse(token.tokens)
  return `<li style="margin: 6px 0; line-height: 1.6; color: ${COLORS.primary};">${text}</li>`
}

// Enhanced paragraph renderer
renderer.paragraph = function(token: any) {
  const text = this.parser.parseInline(token.tokens)
  return `<p style="margin: 16px 0; line-height: 1.7; color: ${COLORS.primary};">${text}</p>`
}

// Enhanced link renderer
renderer.link = function(token: any) {
  const href = token.href
  const title = token.title
  const text = this.parser.parseInline(token.tokens)
  const titleAttr = title ? ` title="${title}"` : ''
  return `<a href="${href}"${titleAttr} style="color: ${COLORS.accent}; text-decoration: underline; text-decoration-color: #93c5fd;">${text}</a>`
}

// Enhanced text formatting renderers
renderer.strong = function(token: any) {
  const text = this.parser.parseInline(token.tokens)
  return `<strong style="font-weight: 700; color: ${COLORS.primary};">${text}</strong>`
}

renderer.em = function(token: any) {
  const text = this.parser.parseInline(token.tokens)
  return `<em style="font-style: italic; color: ${COLORS.primary};">${text}</em>`
}

// Horizontal rule renderer
renderer.hr = function() {
  return `<hr style="border: none; height: 2px; background-color: ${COLORS.border}; margin: 32px 0; border-radius: 1px;" />`
}

// Configure marked options
marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
  pedantic: false
})

/**
 * Convert Markdown to HTML with enhanced syntax highlighting and Gmail compatibility
 */
export async function markdownToHtmlWithSyntaxHighlighting(markdown: string): Promise<string> {
  try {
    const html = await marked(markdown)
    
    // Wrap in a container with comprehensive base styles
    const styledHtml = `
      <div style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; 
        font-size: 14px; 
        line-height: 1.6; 
        color: ${COLORS.primary}; 
        max-width: 100%; 
        margin: 0; 
        padding: 20px;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      ">
        ${html}
      </div>
    `
    
    return styledHtml
  } catch (error) {
    console.error('Error converting markdown to HTML:', error)
    return `<pre style="font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; white-space: pre-wrap; background-color: ${COLORS.background}; padding: 16px; border-radius: 6px; border: 1px solid ${COLORS.border}; color: ${COLORS.primary};">${markdown}</pre>`
  }
}

/**
 * Enhanced markdown detection with more patterns
 */
export function containsMarkdown(content: string): boolean {
  const markdownPatterns = [
    /```[\s\S]*?```/,           // Code blocks
    /`[^`\n]+`/,                // Inline code (not spanning lines)
    /^#{1,6}\s+.+$/m,           // Headers
    /\*\*[^*\n]+\*\*/,          // Bold
    /\*[^*\n]+\*/,              // Italic
    /__[^_\n]+__/,              // Bold (underscore)
    /_[^_\n]+_/,                // Italic (underscore)
    /^\s*[-*+]\s+.+$/m,         // Unordered lists
    /^\s*\d+\.\s+.+$/m,         // Ordered lists
    /^>\s+.+$/m,                // Blockquotes
    /\[[^\]]+\]\([^)]+\)/,      // Links
    /^\s*\|.+\|\s*$/m,          // Tables
    /^---+$/m,                  // Horizontal rules
    /~~[^~\n]+~~/,              // Strikethrough
  ]
  
  return markdownPatterns.some(pattern => pattern.test(content))
}

/**
 * Enhanced auto-conversion with better error handling and debugging
 */
export async function autoConvertMarkdown(content: string): Promise<string> {
  let processedContent = content
  
  // Handle custom markdown blocks (from rich text editors)
  const markdownBlockRegex = /<div[^>]*data-markdown-content="([^"]*?)"[^>]*>([\s\S]*?)<\/div>/g
  const markdownMatches = Array.from(content.matchAll(markdownBlockRegex))
  
  for (const match of markdownMatches) {
    const markdownContent = match[1]
    if (markdownContent?.trim()) {
      try {
        const convertedHtml = await markdownToHtmlWithSyntaxHighlighting(markdownContent)
        const styledBlock = `<div style="border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; background: ${COLORS.background}; margin: 16px 0;">${convertedHtml}</div>`
        processedContent = processedContent.replace(match[0], styledBlock)
      } catch (error) {
        console.error('Error converting markdown block:', error)
        const fallbackBlock = `<div style="border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; background: ${COLORS.background}; margin: 16px 0; font-family: monospace; white-space: pre-wrap; color: ${COLORS.primary};">${markdownContent}</div>`
        processedContent = processedContent.replace(match[0], fallbackBlock)
      }
    }
  }
  
  // Handle pre-existing code blocks with enhanced language detection
  const codeBlockRegex = /<pre><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g
  const codeMatches = Array.from(processedContent.matchAll(codeBlockRegex))
  
  for (const match of codeMatches) {
    let language = match[1] || 'plaintext'
    const codeContent = match[2]
    
    if (codeContent?.trim()) {
      // Auto-detect language if not specified or is plaintext
      if (language === 'plaintext' || !language) {
        language = detectLanguage(codeContent)
      }
      
      try {
        const validLanguage = language && hljs.getLanguage(language) ? language : 'plaintext'
        const highlighted = hljs.highlight(codeContent, { language: validLanguage })
        const styledCode = applySyntaxHighlighting(highlighted.value)
        
        const styledBlock = `
          <div style="border: 1px solid ${COLORS.border}; border-radius: 8px; margin: 16px 0; overflow: hidden; background: ${COLORS.background};">
            <div style="background-color: #f1f3f4; padding: 8px 16px; font-size: 12px; font-weight: 600; color: ${COLORS.secondary}; border-bottom: 1px solid ${COLORS.border}; text-transform: uppercase;">
              ${validLanguage}
            </div>
            <pre style="margin: 0; padding: 16px; overflow-x: auto; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; font-size: 14px; line-height: 1.5; background-color: ${COLORS.codeBackground}; color: ${COLORS.primary};">
              <code style="background: none; padding: 0; border-radius: 0; font-family: inherit; color: inherit;">${styledCode}</code>
            </pre>
          </div>
        `
        processedContent = processedContent.replace(match[0], styledBlock)
      } catch (error) {
        console.error(`Error highlighting ${language} code:`, error)
        const fallbackBlock = `
          <div style="border: 1px solid ${COLORS.border}; border-radius: 8px; margin: 16px 0; overflow: hidden; background: ${COLORS.background};">
            <div style="background-color: #f1f3f4; padding: 8px 16px; font-size: 12px; font-weight: 600; color: ${COLORS.secondary}; border-bottom: 1px solid ${COLORS.border};">
              CODE
            </div>
            <pre style="margin: 0; padding: 16px; overflow-x: auto; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; font-size: 14px; line-height: 1.5; background-color: ${COLORS.codeBackground}; color: ${COLORS.primary}; white-space: pre-wrap;">
              <code style="background: none; padding: 0; border-radius: 0; font-family: inherit; color: inherit;">${codeContent}</code>
            </pre>
          </div>
        `
        processedContent = processedContent.replace(match[0], fallbackBlock)
      }
    }
  }
  
  // Convert remaining markdown content
  if (containsMarkdown(processedContent)) {
    return await markdownToHtmlWithSyntaxHighlighting(processedContent)
  }
  
  return processedContent
}

/**
 * Utility function to validate and sanitize HTML for email clients
 */
export function sanitizeForEmail(html: string): string {
  // Remove any remaining class attributes
  let sanitized = html.replace(/\s*class="[^"]*"/g, '')
  
  // Ensure all colors are in hex format (some email clients prefer this)
  sanitized = sanitized.replace(/color:\s*rgb\(([^)]+)\)/g, (match, rgb) => {
    const values = rgb.split(',').map((v: string) => parseInt(v.trim()))
    const hex = '#' + values.map((v: number) => v.toString(16).padStart(2, '0')).join('')
    return `color: ${hex}`
  })
  
  // Remove any CSS that might not be supported in email clients
  sanitized = sanitized.replace(/box-shadow:[^;]+;?/g, '')
  sanitized = sanitized.replace(/transform:[^;]+;?/g, '')
  sanitized = sanitized.replace(/transition:[^;]+;?/g, '')
  
  return sanitized
}

/**
 * Export configuration for external use
 */
export const config = {
  colors: COLORS,
  syntaxMappings: SYNTAX_MAPPINGS,
  supportedLanguages: hljs.listLanguages()
}