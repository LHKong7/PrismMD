interface ResultData {
  type: 'text' | 'table' | 'chart'
  data: unknown
}

interface TableData {
  headers: string[]
  rows: string[][]
}

interface ChartData {
  type: 'bar' | 'line' | 'pie'
  labels: string[]
  values: number[]
  title?: string
}

interface Props {
  result: ResultData
}

export function ExecutableResult({ result }: Props) {
  if (result.type === 'table') {
    return <TableView data={result.data as TableData} />
  }
  if (result.type === 'chart') {
    return <ChartView data={result.data as ChartData} />
  }
  // text fallback
  return (
    <pre
      className="px-3 py-2 text-xs whitespace-pre-wrap"
      style={{ color: 'var(--text-primary)' }}
    >
      {String(result.data ?? '')}
    </pre>
  )
}

function TableView({ data }: { data: TableData }) {
  if (!data.headers || !data.rows) return null

  return (
    <div className="overflow-x-auto px-3 py-2">
      <table
        className="w-full text-xs border-collapse"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <thead>
          <tr>
            {data.headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-1.5 text-left font-semibold border-b"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-1.5 border-b"
                  style={{
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartView({ data }: { data: ChartData }) {
  if (!data.labels || !data.values || data.labels.length === 0) return null

  const maxVal = Math.max(...data.values, 1)
  const width = 400
  const height = 200
  const barWidth = Math.min(40, (width - 40) / data.labels.length - 4)
  const chartLeft = 40
  const chartBottom = height - 30

  if (data.type === 'pie') {
    return <PieChart data={data} />
  }

  // Bar or line chart
  return (
    <div className="px-3 py-2 flex justify-center">
      <svg width={width} height={height} className="overflow-visible">
        {data.title && (
          <text
            x={width / 2}
            y={14}
            textAnchor="middle"
            fontSize="12"
            fill="var(--text-primary)"
            fontWeight="600"
          >
            {data.title}
          </text>
        )}

        {/* Y axis */}
        <line
          x1={chartLeft}
          y1={20}
          x2={chartLeft}
          y2={chartBottom}
          stroke="var(--border-color)"
          strokeWidth="1"
        />

        {/* X axis */}
        <line
          x1={chartLeft}
          y1={chartBottom}
          x2={width}
          y2={chartBottom}
          stroke="var(--border-color)"
          strokeWidth="1"
        />

        {data.values.map((val, i) => {
          const x = chartLeft + 10 + i * ((width - chartLeft - 10) / data.labels.length)
          const barH = ((val / maxVal) * (chartBottom - 30))
          const y = chartBottom - barH

          if (data.type === 'line') {
            const nextVal = data.values[i + 1]
            const nextX = chartLeft + 10 + (i + 1) * ((width - chartLeft - 10) / data.labels.length)
            const nextY = nextVal != null ? chartBottom - ((nextVal / maxVal) * (chartBottom - 30)) : 0
            return (
              <g key={i}>
                <circle cx={x + barWidth / 2} cy={y} r="3" fill="var(--accent-color)" />
                {nextVal != null && (
                  <line
                    x1={x + barWidth / 2}
                    y1={y}
                    x2={nextX + barWidth / 2}
                    y2={nextY}
                    stroke="var(--accent-color)"
                    strokeWidth="2"
                  />
                )}
                <text
                  x={x + barWidth / 2}
                  y={chartBottom + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-muted)"
                >
                  {data.labels[i]}
                </text>
              </g>
            )
          }

          // Bar
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx="2"
                fill="var(--accent-color)"
                opacity="0.8"
              />
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-muted)"
              >
                {val}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartBottom + 14}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-muted)"
              >
                {data.labels[i]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function PieChart({ data }: { data: ChartData }) {
  const total = data.values.reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const cx = 120
  const cy = 100
  const r = 70
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

  let cumAngle = -Math.PI / 2

  return (
    <div className="px-3 py-2 flex justify-center">
      <svg width={320} height={220}>
        {data.title && (
          <text x={160} y={14} textAnchor="middle" fontSize="12" fill="var(--text-primary)" fontWeight="600">
            {data.title}
          </text>
        )}
        {data.values.map((val, i) => {
          const angle = (val / total) * Math.PI * 2
          const startAngle = cumAngle
          const endAngle = cumAngle + angle
          cumAngle = endAngle

          const x1 = cx + r * Math.cos(startAngle)
          const y1 = cy + r * Math.sin(startAngle)
          const x2 = cx + r * Math.cos(endAngle)
          const y2 = cy + r * Math.sin(endAngle)
          const large = angle > Math.PI ? 1 : 0

          const midAngle = startAngle + angle / 2
          const lx = cx + (r + 16) * Math.cos(midAngle)
          const ly = cy + (r + 16) * Math.sin(midAngle)

          return (
            <g key={i}>
              <path
                d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`}
                fill={colors[i % colors.length]}
                opacity="0.85"
                stroke="var(--bg-primary)"
                strokeWidth="2"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fill="var(--text-secondary)"
              >
                {data.labels[i]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
