/**
 * contextCore 的行为测试。
 *
 * 这三个函数是清理后仅存的活逻辑，且都在每一轮对话的关键路径上：
 * 预算算错会让请求超窗被端点拒绝，历史裁剪错会丢上下文，观察折叠错会
 * 让一次工具输出吃掉整个窗口。之前没有任何覆盖 —— 借这次清理补上。
 */

import { describe, expect, it } from 'vitest'
import { estimateTokens, foldObservation, getBudget, selectHistory } from './contextCore'

describe('estimateTokens', () => {
    it('空串是 0，非空至少 1', () => {
        expect(estimateTokens('')).toBe(0)
        expect(estimateTokens('a')).toBe(1)
    })

    it('大致按 3 字符 1 token', () => {
        expect(estimateTokens('a'.repeat(300))).toBe(100)
    })
})

describe('getBudget', () => {
    it('各段之和不超过总窗口', () => {
        const b = getBudget({ model: 'gpt-4o' })
        expect(b.system + b.rag + b.history + b.output_reserve).toBeLessThanOrEqual(b.total)
    })

    it('默认窗口 200k，输出预留从总量里扣', () => {
        const b = getBudget({ model: 'gpt-4o' })
        expect(b.total).toBe(200_000)
        expect(b.output_reserve).toBeGreaterThan(0)
        // history 拿输入预算的一半。
        expect(b.history).toBe(Math.floor((b.total - b.output_reserve) * 0.5))
    })

    it('模型名带 [1m] 时放宽到 1M 窗口', () => {
        expect(getBudget({ model: 'claude-sonnet-4[1m]' }).total).toBe(1_000_000)
    })

    it('CONTEXT_1M feature + sonnet-4 也放宽', () => {
        const b = getBudget({
            model: 'claude-sonnet-4-20250514',
            enabledFeatures: ['context-1m-2025-08-07'],
        })
        expect(b.total).toBe(1_000_000)
        // 同一个 feature 挂在非 sonnet-4 上不生效。
        expect(getBudget({ model: 'gpt-4o', enabledFeatures: ['context-1m-2025-08-07'] }).total)
            .toBe(200_000)
    })

    it('显式 total 覆盖模型推断', () => {
        expect(getBudget({ total: 8_000, model: 'gpt-4o' }).total).toBe(8_000)
    })

    it('窗口小于输出预留时输入预算夹到 0，不出负数', () => {
        const b = getBudget({ total: 100, model: 'gpt-4o' })
        expect(b.rag).toBeGreaterThanOrEqual(0)
        expect(b.history).toBeGreaterThanOrEqual(0)
    })
})

describe('selectHistory', () => {
    const msg = (role: string, text: string) => ({ role, content: text })

    it('空历史返回空', () => {
        expect(selectHistory([], 'q', 1000)).toEqual([])
    })

    it('装得下就原样返回', () => {
        const h = [msg('user', 'hi'), msg('assistant', 'hello')]
        expect(selectHistory(h, 'q', 10_000)).toEqual(h)
    })

    it('装不下时从最早的开始丢，保住最近的', () => {
        const h = Array.from({ length: 10 }, (_, i) => msg('user', 'x'.repeat(300) + i))
        const out = selectHistory(h, 'q', 300) // 约 100 token，只放得下少数几条

        expect(out.length).toBeLessThan(h.length)
        // 留下的必须是尾部连续的一段。
        expect(out[out.length - 1]).toEqual(h[h.length - 1])
        expect(h.slice(h.length - out.length)).toEqual(out)
    })

    it('预算极小时返回空数组 —— 保底由调用方负责', () => {
        // 循环最后一次 slice(len) 得到 []，0 <= maxTokens 恒真，所以这里会清空。
        // 「至少留最后两条」的兜底在 agentInstance._run 里，不在这个函数里。
        const h = Array.from({ length: 6 }, (_, i) => msg('user', 'y'.repeat(3000) + i))
        expect(selectHistory(h, 'q', 1)).toEqual([])
    })

    it('超过 maxTurns 时先按轮数硬截断', () => {
        const h = Array.from({ length: 100 }, (_, i) => msg('user', String(i)))
        const out = selectHistory(h, 'q', 10_000_000, 5)
        expect(out.length).toBe(10) // maxTurns * 2
        expect(out[out.length - 1]).toEqual(h[99])
    })
})

describe('foldObservation', () => {
    it('短文本原样返回', () => {
        expect(foldObservation('short')).toBe('short')
    })

    it('超长文本折成摘要，且不超过上限', () => {
        const raw = 'z'.repeat(50_000)
        const out = foldObservation(raw)

        expect(out.length).toBeLessThanOrEqual(3500)
        expect(out).toContain('Data too long')
        expect(out).toContain('50000 chars')
    })

    it('自定义上限生效', () => {
        const out = foldObservation('w'.repeat(5000), 200)
        expect(out.length).toBeLessThanOrEqual(200)
    })

    it('恰好等于上限时不折叠', () => {
        const raw = 'q'.repeat(3500)
        expect(foldObservation(raw)).toBe(raw)
    })
})
