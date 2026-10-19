import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

// 成稿是 Markdown（SDD 0037）：排版显示，表格照画；不认原始 HTML（react-markdown 默认就不渲染）。
// 与 knowbench 网页端的 components/common/markdown.tsx 同一做法。
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'min-w-0 text-sm leading-7 wrap-break-word',
        '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold',
        '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold',
        '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold',
        '[&_a]:underline [&_a]:underline-offset-3',
        '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
        '[&_pre]:bg-muted [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-x-auto [&_table]:text-[13px]',
        '[&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:border-b [&_td]:px-2 [&_td]:py-1',
        '[&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-3',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
