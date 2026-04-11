import type { ReactNode } from 'react'

interface TableBlockProps {
  children?: ReactNode
  [key: string]: unknown
}

export function TableBlock({ children, ...props }: TableBlockProps) {
  return (
    <div className="table-wrapper">
      <table {...props}>
        {children}
      </table>
    </div>
  )
}
