/**
 * pi/tools.ts — PrismMD 的 `ToolDefinition` → pi 的 `AgentTool`。
 *
 * 两边的差异只有三处：
 *  1. 参数 schema：PrismMD 用 `Record<name, {type, description?, enum?}>` +
 *     单独的 `required: string[]`；pi 用一份完整 JSON Schema（标成 typebox 的
 *     `TSchema`，运行时就是 JSON Schema 对象）。
 *  2. 返回值：PrismMD 的 execute 返回字符串；pi 要 `AgentToolResult`
 *     （content 块数组 + details）。
 *  3. 错误：PrismMD 的工具把错误编码进返回字符串（上层不区分）；pi 要求抛异常。
 *     这里刻意**不**改成抛 —— 保持「错误也是一段观察文本」的既有行为，
 *     否则工具失败会中断整个循环，而现在是让模型看到错误自己决定下一步。
 */

import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import type { ToolDefinition } from '../types'

/** PrismMD 的扁平参数表 → JSON Schema。 */
function toJsonSchema(def: ToolDefinition): Record<string, unknown> {
    return {
        type: 'object',
        properties: { ...(def.parameters ?? {}) },
        required: def.required ?? [],
    }
}

/** 工具产出的纯文本结果。 */
function textResult(text: string): AgentToolResult<null> {
    return { content: [{ type: 'text', text }], details: null }
}

/**
 * 观察文本的后处理钩子：guardrails 标注 + 折叠超长输出。
 * 由 AgentInstance 注入，这样转换层不用知道这两件事的存在。
 */
export type ObservationTransform = (raw: string) => Promise<string> | string

export function toAgentTool(
    def: ToolDefinition,
    transformObservation?: ObservationTransform,
): AgentTool<any> {
    return {
        name: def.name,
        label: def.name,
        description: def.description,
        parameters: toJsonSchema(def) as any,
        // 有共享可变状态的工具标成串行；其余跟随全局设置（默认并行）。
        ...(def.concurrencySafe === false ? { executionMode: 'sequential' as const } : {}),
        execute: async (_toolCallId, params) => {
            let raw: string
            try {
                raw = await def.execute((params ?? {}) as Record<string, any>)
            } catch (e: any) {
                // 见文件头注释 3：错误当观察文本回给模型，不中断循环。
                raw = `[Tool error] ${def.name}: ${e?.message ?? String(e)}`
            }
            const out = transformObservation ? await transformObservation(raw) : raw
            return textResult(out)
        },
    }
}

export function toAgentTools(
    defs: ToolDefinition[],
    transformObservation?: ObservationTransform,
): AgentTool<any>[] {
    return defs.map((d) => toAgentTool(d, transformObservation))
}
