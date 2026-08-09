/**
 * sanitize.ts — 会话落盘前的敏感信息脱敏。
 *
 * 原先住在 `memoryCore.ts` 里。memoryCore 的其余部分（RAG 记忆、用户偏好、
 * 模式抽取）在 PrismMD 的运行时不可达，随 pi 迁移一并删除，但这个函数是活的：
 * `sessionCore.saveSession` 每次写盘都会过它，所以单独抽出来。
 */

/** `key: value` 形态的凭据。只覆盖赋值语法，不做全文扫描 —— 宁可漏也别误伤正文。 */
const SENSITIVE_PATTERNS: [RegExp, string][] = [
    [/\b(api[_-]?key|apikey)\s*[:=]\s*[\w\-]+/gi, '***'],
    [/\b(password|passwd|pwd)\s*[:=]\s*\S+/gi, '***'],
    [/\b(token|secret|auth)\s*[:=]\s*[\w\-.]+/gi, '***'],
    [/\b(credit[_\s]?card|card\s*#?)\s*[:=]?\s*\d[\d\s\-]+/gi, '***'],
];

/** 递归遍历，把字符串里的凭据替换成 `***`。非字符串原样返回。 */
export function sanitizeForStorage(data: any): any {
    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) return data.map(sanitizeForStorage);
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(data)) {
            result[k] = sanitizeForStorage(v);
        }
        return result;
    }
    if (typeof data === 'string') {
        let out = data;
        for (const [pat, repl] of SENSITIVE_PATTERNS) {
            out = out.replace(pat, repl);
        }
        return out;
    }
    return data;
}
