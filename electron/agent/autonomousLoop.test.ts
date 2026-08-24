/**
 * Horse Mode（`runTask` → AutonomousLoop）的端到端测试。
 *
 * 迁到 pi 之后这条路径只做过类型层验证 —— 它内部全靠 `agent.chat()`，
 * 而 chat 的实现整个换了底。这里用本地假 OpenAI 兼容端点真跑一遍循环。
 *
 * 假端点按**提示词内容**分派（而不是按调用次序），因为循环里每轮 4 个阶段、
 * 阶段数会随打分变化 —— 按内容分派才能精确控制「第 N 轮 evaluate 返回几分」。
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgentBuilder } from './index'
import type { IterationProgress, ToolDefinition } from './types'

type Phase = 'plan' | 'execute' | 'review' | 'evaluate'

/** 从请求体里认出这是哪个阶段 —— 依据 autonomousLoop.ts 里的提示词原文。 */
function detectPhase(body: any): Phase {
    const text = JSON.stringify(body.messages ?? [])
    if (text.includes('Break it into clear, numbered subtasks')) return 'plan'
    if (text.includes('Execute the following plan step by step')) return 'execute'
    if (text.includes('harsh but fair critic')) return 'review'
    if (text.includes('Score the current output quality')) return 'evaluate'
    // 工具结果回灌的那一轮不带阶段提示词，归到 execute。
    return 'execute'
}

let server: http.Server
let baseUrl: string
let phaseLog: Phase[] = []
let bodies: any[] = []
/** evaluate 阶段依次返回的分数；用尽后固定给 10。 */
let scores: number[] = []
/** execute 阶段第一次是否发一个工具调用。 */
let executeCallsTool = false
let executeToolFired = false
/** evaluate 阶段的回复格式：JSON（默认）或纯文本的 `score: N`。 */
let evalFormat: 'json' | 'plain' = 'json'

function sse(res: http.ServerResponse, blocks: () => void) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    blocks()
    res.write('data: [DONE]\n\n')
    res.end()
}

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
            const body = JSON.parse(raw || '{}')
            bodies.push(body)
            const phase = detectPhase(body)
            phaseLog.push(phase)

            const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
            const base = { id: 'c', object: 'chat.completion.chunk', model: 'm' }
            const usage = { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }

            sse(res, () => {
                const alreadyHasToolResult = JSON.stringify(body.messages).includes('probe-result')
                if (phase === 'execute' && executeCallsTool && !executeToolFired && !alreadyHasToolResult) {
                    executeToolFired = true
                    send({
                        ...base,
                        choices: [{
                            index: 0,
                            delta: {
                                role: 'assistant',
                                tool_calls: [{
                                    index: 0, id: 'tc1', type: 'function',
                                    function: { name: 'probe', arguments: '{}' },
                                }],
                            },
                        }],
                    })
                    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage })
                    return
                }

                const text =
                    phase === 'plan' ? '1. do the thing\n2. verify it'
                    : phase === 'execute' ? 'EXECUTED OUTPUT'
                    : phase === 'review' ? 'Gaps: needs more detail.'
                    : (() => {
                          const score = scores.length ? scores.shift()! : 10
                          return evalFormat === 'plain'
                              ? `After careful consideration, score: ${score} — solid but improvable.`
                              : JSON.stringify({
                                    score,
                                    reasoning: 'because',
                                    improvements: ['add detail', 'cite sources'],
                                })
                      })()

                send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: text } }] })
                send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })
            })
        })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
})

beforeEach(() => {
    phaseLog = []
    bodies = []
    scores = []
    executeCallsTool = false
    executeToolFired = false
    evalFormat = 'json'
})

function agent(tools: ToolDefinition[] = []) {
    return new AgentBuilder()
        .setProvider('custom', { apiKey: 'sk-t', model: 'm', baseUrl })
        .setSystemPrompt('You are an autonomous writer.')
        .enableContext(false)
        .addTools(tools)
        .build()
}

describe('Horse Mode — 阶段流转', () => {
    it('一轮就达标时跑满 plan → execute → review → evaluate 四个阶段', async () => {
        scores = [9]
        const result = await agent().runTask({ task: 'write something', qualityThreshold: 7, maxIterations: 5 })

        expect(phaseLog).toEqual(['plan', 'execute', 'review', 'evaluate'])
        expect(result.thresholdMet).toBe(true)
        expect(result.iterations).toBe(1)
        expect(result.qualityScore).toBe(9)
        expect(result.result).toBe('EXECUTED OUTPUT')
    })

    it('分数不达标时进入下一轮，且把 review 和改进项带进新的 plan', async () => {
        scores = [4, 8]
        const result = await agent().runTask({ task: 'write something', qualityThreshold: 7, maxIterations: 5 })

        expect(phaseLog).toEqual([
            'plan', 'execute', 'review', 'evaluate',
            'plan', 'execute', 'review', 'evaluate',
        ])
        expect(result.thresholdMet).toBe(true)
        expect(result.iterations).toBe(2)
        expect(result.qualityScore).toBe(8)

        // 第二轮的 plan 请求里必须带上第一轮的 review 与改进项。
        const secondPlan = bodies[4]
        const text = JSON.stringify(secondPlan.messages)
        expect(text).toContain('Previous Iteration 1')
        expect(text).toContain('needs more detail')
        expect(text).toContain('add detail')
    })

    it('一直不达标时被 maxIterations 刹住，返回 thresholdMet=false 和最后一次输出', async () => {
        scores = [3, 3, 3, 3, 3]
        const result = await agent().runTask({ task: 't', qualityThreshold: 9, maxIterations: 3 })

        expect(phaseLog.filter((p) => p === 'evaluate').length).toBe(3)
        expect(result.thresholdMet).toBe(false)
        expect(result.iterations).toBe(3)
        expect(result.qualityScore).toBe(3)
        expect(result.result).toBe('EXECUTED OUTPUT')
    })
})

describe('Horse Mode — 进度回调', () => {
    it('每个阶段都回调一次，带 iteration 和 phase', async () => {
        scores = [8]
        const seen: IterationProgress[] = []
        await agent().runTask({
            task: 't', qualityThreshold: 7, maxIterations: 3,
            onProgress: (p) => { seen.push(p) },
        })

        expect(seen.map((p) => p.phase)).toEqual(['plan', 'execute', 'review', 'evaluate'])
        expect(seen.every((p) => p.iteration === 1)).toBe(true)
        // evaluate 那次带上分数 —— worker 靠它推 progress 消息给渲染层。
        expect(seen[3].qualityScore).toBe(8)
    })

    it('onProgress 返回 false 立即中止，不再发请求', async () => {
        scores = [8]
        const result = await agent().runTask({
            task: 't', qualityThreshold: 7, maxIterations: 5,
            onProgress: (p) => (p.phase === 'plan' ? false : undefined),
        })

        // plan 之后就停，execute 那一发请求不该出现。
        expect(phaseLog).toEqual(['plan'])
        expect(result.thresholdMet).toBe(false)
    })

    it('onProgress 抛异常不影响循环继续', async () => {
        scores = [8]
        const result = await agent().runTask({
            task: 't', qualityThreshold: 7, maxIterations: 2,
            onProgress: () => { throw new Error('ui blew up') },
        })

        expect(result.thresholdMet).toBe(true)
        expect(result.qualityScore).toBe(8)
    })
})

describe('Horse Mode — 打分解析', () => {
    it('JSON 格式：读 score 字段', async () => {
        scores = [8]
        const result = await agent().runTask({ task: 't', qualityThreshold: 7, maxIterations: 2 })
        expect(result.qualityScore).toBe(8)
        expect(result.thresholdMet).toBe(true)
    })

    it('模型没按要求回 JSON 时，退回解析纯文本里的 "score: N"', async () => {
        // 真实模型经常无视「只回 JSON」的指令，这条兜底路径必须能用。
        evalFormat = 'plain'
        scores = [6]
        const result = await agent().runTask({ task: 't', qualityThreshold: 9, maxIterations: 1 })

        expect(result.qualityScore).toBe(6)
        expect(result.thresholdMet).toBe(false)
    })

    it('纯文本达标时同样能提前结束', async () => {
        evalFormat = 'plain'
        scores = [9]
        const result = await agent().runTask({ task: 't', qualityThreshold: 7, maxIterations: 3 })

        expect(result.qualityScore).toBe(9)
        expect(result.thresholdMet).toBe(true)
        expect(result.iterations).toBe(1)
    })
})

describe('Horse Mode — 工具可用性', () => {
    it('execute 阶段能真正调用工具，结果回灌后继续', async () => {
        executeCallsTool = true
        scores = [9]
        let probed = 0
        const probe: ToolDefinition = {
            name: 'probe',
            description: 'probe something',
            parameters: {},
            execute: async () => { probed++; return 'probe-result' },
        }

        const result = await agent([probe]).runTask({ task: 't', qualityThreshold: 7, maxIterations: 2 })

        expect(probed).toBe(1)
        expect(result.thresholdMet).toBe(true)
        // 工具结果必须回灌给模型，否则 execute 阶段拿不到工具产出。
        expect(bodies.some((b) => JSON.stringify(b.messages).includes('probe-result'))).toBe(true)
    })
})
