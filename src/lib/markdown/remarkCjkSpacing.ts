import { visit } from 'unist-util-visit'
import type { Root, Text } from 'mdast'
import type { Plugin } from 'unified'

// CJK Unicode ranges
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/

// Insert spaces between CJK and Latin characters
function addCjkSpacing(text: string): string {
  // CJK followed by Latin/digit
  let result = text.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])([A-Za-z0-9])/g,
    '$1 $2'
  )
  // Latin/digit followed by CJK
  result = result.replace(
    /([A-Za-z0-9])([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g,
    '$1 $2'
  )
  return result
}

export const remarkCjkSpacing: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text) => {
      if (CJK_REGEX.test(node.value)) {
        node.value = addCjkSpacing(node.value)
      }
    })
  }
}
