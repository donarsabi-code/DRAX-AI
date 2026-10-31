'use client'

/**
 * Rendu Markdown sécurisé — DRAX IA Chat
 * - react-markdown (pas de HTML brut : XSS-safe par défaut)
 * - remark-gfm : tableaux, listes de tâches, barré
 * - Blocs de code colorés (react-syntax-highlighter) + bouton copier
 */

import { memo, useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback pour contextes non sécurisés
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }, [text])

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copié' : label}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copié !' : label}
    </button>
  )
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border bg-zinc-950 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">
          {language || 'texte'}
        </span>
        <CopyButton text={code} label="Copier le code" />
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '0.9rem 1rem',
          background: 'transparent',
          fontSize: '0.8125rem',
          lineHeight: 1.6,
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' } }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Les blocs de code sont rendus par "code", on neutralise "pre"
          pre({ children }) {
            return <>{children}</>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const text = String(children).replace(/\n$/, '')
            if (!match && !text.includes('\n')) {
              return (
                <code
                  className="rounded-md bg-muted px-[0.35em] py-[0.15em] font-mono text-[0.85em]"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return <CodeBlock language={match?.[1] ?? ''} code={text} />
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2 hover:opacity-80"
              >
                {children}
              </a>
            )
          },
          img({ src, alt }) {
            const href = typeof src === 'string' ? src : ''
            // Sécurité : seules les images servies par notre API (contrôle
            // d'accès par session) sont rendues. Toute source externe est ignorée.
            if (!href.startsWith('/api/images/file/')) {
              return (
                <span className="text-xs italic text-muted-foreground">[image externe non affichée]</span>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="my-2 block" title="Ouvrir l'image en plein écran">
                <img
                  src={href}
                  alt={alt || 'Image générée'}
                  loading="lazy"
                  className="max-h-[420px] w-auto max-w-full rounded-xl border bg-muted/20 object-contain"
                />
              </a>
            )
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border-b bg-muted/60 px-3 py-2 text-left font-semibold">{children}</th>
            )
          },
          td({ children }) {
            return <td className="border-b px-3 py-2 align-top">{children}</td>
          },
          ul({ children }) {
            return <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>
          },
          ol({ children }) {
            return <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            )
          },
          h1({ children }) {
            return <h1 className="mb-3 mt-5 text-xl font-bold first:mt-0">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="mb-2.5 mt-5 text-lg font-bold first:mt-0">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>
          },
          p({ children }) {
            return <p className="my-2 first:mt-0 last:mb-0">{children}</p>
          },
          hr() {
            return <hr className="my-4 border-border" />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

export { CopyButton }
