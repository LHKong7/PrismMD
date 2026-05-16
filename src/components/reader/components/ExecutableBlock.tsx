import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { baseLanguage, isSandboxable } from '../../../lib/sandbox/sandboxLanguages'
import { buildSrcdoc } from '../../../lib/sandbox/buildSrcdoc'
import { SandboxConsole, type ConsoleEntry } from './SandboxConsole'
import { ExecutableResult } from './ExecutableResult'

interface Props {
  code: string
  language?: string
}

type Phase = 'idle' | 'running' | 'done' | 'error'

interface AgentResult {
  stdout?: string
  stderr?: string
  exitCode?: number
  result?: {
    type: 'text' | 'table' | 'chart'
    data: unknown
  }
}

const AGENT_SYSTEM_PROMPT = `You are a code execution engine. The user gives you a code snippet. Execute it mentally and return the exact output it would produce.

Return a JSON object with this exact shape:
{
  "stdout": "all printed output as a single string",
  "stderr": "error output if any, or empty string",
  "exitCode": 0,
  "result": {
    "type": "text" | "table" | "chart",
    "data": ...
  }
}

Rules for "result":
- If the code produces tabular data (DataFrames, dicts of lists, 2D arrays), use type "table" with data: { "headers": ["col1", "col2"], "rows": [["val1", "val2"]] }
- If the code produces numerical data suitable for visualization (arrays, series, counts), use type "chart" with data: { "type": "bar"|"line"|"pie", "labels": ["a","b"], "values": [1,2], "title": "optional" }
- Otherwise use type "text" with data being the string representation of the final expression value, or empty string if none.

Always include stdout from all print() calls. Be precise with numerical results. For Python, execute as Python 3.`

const AGENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    exitCode: { type: 'number' },
    result: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['text', 'table', 'chart'] },
        data: {},
      },
      required: ['type', 'data'],
    },
  },
  required: ['stdout', 'stderr', 'exitCode', 'result'],
}

export function ExecutableBlock({ code, language }: Props) {
  const lang = language ?? ''
  const base = baseLanguage(lang)
  const isWebLang = isSandboxable(base)

  const [phase, setPhase] = useState<Phase>('idle')
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // For JS/HTML sandbox execution
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [iframeKey, setIframeKey] = useState(0)
  const [sandboxActive, setSandboxActive] = useState(false)

  // Listen for sandbox console messages
  useEffect(() => {
    if (!sandboxActive) return
    const handleMessage = (e: MessageEvent) => {
      if (
        e.source === iframeRef.current?.contentWindow &&
        e.data?.type === 'sandbox-console'
      ) {
        const { level, args } = e.data as { level: ConsoleEntry['level']; args: string[] }
        setConsoleEntries((prev) => {
          if (prev.length >= 100) return prev
          return [...prev, { level, args, timestamp: Date.now() }]
        })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sandboxActive, iframeKey])

  const runWeb = useCallback(() => {
    setPhase('done')
    setSandboxActive(true)
    setConsoleEntries([])
    setIframeKey((k) => k + 1)
  }, [])

  const runAgent = useCallback(async () => {
    setPhase('running')
    setAgentResult(null)
    setErrorMsg('')
    try {
      const res = await window.electronAPI.sendAgentOneShot({
        systemPrompt: AGENT_SYSTEM_PROMPT,
        prompt: `Execute this ${base} code:\n\n\`\`\`${base}\n${code}\n\`\`\``,
        jsonSchema: AGENT_JSON_SCHEMA,
      })
      if (res.ok) {
        const parsed = (res.result.json ?? JSON.parse(res.result.reply)) as AgentResult
        setAgentResult(parsed)
        setPhase('done')
      } else {
        setErrorMsg(res.error)
        setPhase('error')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [code, base])

  const handleRun = () => {
    if (isWebLang) runWeb()
    else void runAgent()
  }

  const handleClear = () => {
    setPhase('idle')
    setAgentResult(null)
    setErrorMsg('')
    setSandboxActive(false)
    setConsoleEntries([])
  }

  const srcdoc = isWebLang && sandboxActive ? buildSrcdoc(code, base) : ''

  return (
    <div
      className="rounded-lg overflow-hidden my-6 border"
      style={{ backgroundColor: 'var(--code-bg)', borderColor: 'var(--border-color)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          {phase === 'running' ? (
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--color-success)' }}
              title="Run"
            >
              <Play size={12} />
              Run
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {base}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {phase === 'done' && (
            <button
              onClick={handleRun}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
              title="Re-run"
            >
              <RotateCcw size={11} />
            </button>
          )}
          {phase !== 'idle' && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              title="Clear"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Code content */}
      <pre className="px-4 py-3 text-xs overflow-x-auto" style={{ color: 'var(--text-primary)' }}>
        <code>{code}</code>
      </pre>

      {/* Results */}
      {phase === 'running' && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t text-xs"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        >
          <Loader2 size={12} className="animate-spin" />
          Executing...
        </div>
      )}

      {phase === 'error' && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t text-xs"
          style={{ borderColor: 'var(--color-error-border)', color: 'var(--color-error)', backgroundColor: 'var(--color-error-bg)' }}
        >
          <AlertCircle size={12} />
          {errorMsg}
        </div>
      )}

      {phase === 'done' && isWebLang && sandboxActive && (
        <div className="border-t" style={{ borderColor: 'var(--border-color)' }}>
          <iframe
            key={iframeKey}
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={srcdoc}
            className="w-full border-0"
            style={{ minHeight: 150, maxHeight: 300, backgroundColor: '#fff' }}
            title="Code output"
          />
          <SandboxConsole entries={consoleEntries} onClear={() => setConsoleEntries([])} />
        </div>
      )}

      {phase === 'done' && !isWebLang && agentResult && (
        <div className="border-t" style={{ borderColor: 'var(--border-color)' }}>
          {/* Stdout */}
          {agentResult.stdout && (
            <pre
              className="px-3 py-2 text-xs whitespace-pre-wrap border-b"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
            >
              {agentResult.stdout}
            </pre>
          )}

          {/* Structured result (table / chart / text) */}
          {agentResult.result && agentResult.result.type && (
            <ExecutableResult result={agentResult.result} />
          )}

          {/* Stderr */}
          {agentResult.stderr && (
            <pre
              className="px-3 py-2 text-xs whitespace-pre-wrap"
              style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-error-bg)' }}
            >
              {agentResult.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
