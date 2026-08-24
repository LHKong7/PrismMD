/**
 * The engine runs against a real SQLite database rather than a mock: FTS5
 * behaviour, bm25 ordering and the join-on-normalized-title trick are exactly
 * the parts a mock would get wrong, and they are the parts that break.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildRetrievalContext,
  getBacklinks,
  getKnowledgeStats,
  getNotesByTag,
  getOrphanNotes,
  getOutgoingLinks,
  getRelatedNotes,
  getUnresolvedLinks,
  indexPage,
  listTags,
  resetKnowledgeIndex,
  removePageFromIndex,
  searchNotes,
  syncIndex,
  type IndexablePage,
} from './engine'

let db: Database.Database
let clock = 1_700_000_000_000

/** The columns of the real `pages` table the engine actually reads. */
function createPagesTable(database: Database.Database) {
  database.exec(`
    CREATE TABLE pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'md',
      parent_id TEXT,
      position INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      icon TEXT,
      is_folder INTEGER NOT NULL DEFAULT 0
    );
  `)
}

function makePage(
  id: string,
  title: string,
  content: string,
  overrides: Partial<IndexablePage> = {},
): IndexablePage {
  const page: IndexablePage = {
    id,
    title,
    content,
    format: 'md',
    updatedAt: (clock += 1000),
    isFolder: false,
    ...overrides,
  }
  db.prepare(
    `INSERT OR REPLACE INTO pages (id, title, content, format, created_at, updated_at, is_deleted, is_folder)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(page.id, page.title, page.content, page.format, page.updatedAt, page.updatedAt, page.isFolder ? 1 : 0)
  return page
}

function add(id: string, title: string, content: string, overrides: Partial<IndexablePage> = {}) {
  const page = makePage(id, title, content, overrides)
  indexPage(db, page)
  return page
}

beforeEach(() => {
  db = new Database(':memory:')
  createPagesTable(db)
})

afterEach(() => {
  db.close()
})

describe('indexPage', () => {
  it('indexes a note and reports whether it did work', () => {
    const page = add('p1', 'Retry Policy', '# Retry Policy\n\nWe use exponential backoff for retries.\n')
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks').get()).toEqual({ n: 1 })

    // Re-indexing unchanged content must be a no-op: PrismMD autosaves while
    // you type, and re-chunking on every keystroke is the failure mode.
    expect(indexPage(db, page)).toBe(false)
    expect(indexPage(db, page, { force: true })).toBe(true)
  })

  it('re-indexes when the content changes and leaves no stale chunks behind', () => {
    add('p1', 'Note', '# Note\n\napple apple apple\n')
    expect(searchNotes(db, 'apple')).toHaveLength(1)

    add('p1', 'Note', '# Note\n\nbanana banana banana\n')
    // The old text must be gone from FTS too, not just from note_chunks —
    // a stale FTS row keeps matching a passage that no longer exists.
    expect(searchNotes(db, 'apple')).toHaveLength(0)
    expect(searchNotes(db, 'banana')).toHaveLength(1)
  })

  it('skips folders and removes them if they were indexed before', () => {
    add('f1', 'Folder', 'text that used to be indexed')
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks').get()).toEqual({ n: 1 })

    indexPage(db, makePage('f1', 'Folder', '', { isFolder: true }))
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_index_state').get()).toEqual({ n: 0 })
  })

  it('indexes a note with no body so its title still resolves links', () => {
    add('p1', 'Stub', '')
    add('p2', 'Source', 'see [[Stub]]')
    expect(getOutgoingLinks(db, 'p2')[0].resolved).toBe(true)
  })

  it('does not record a note linking to itself', () => {
    add('p1', 'Self', 'see [[Self]] and [[self]]')
    expect(getOutgoingLinks(db, 'p1')).toEqual([])
  })
})

describe('removePageFromIndex', () => {
  it('drops every derived row for the note', () => {
    add('p1', 'Gone', '# Gone\n\ncontent here #tagged and [[Elsewhere]]\n')
    removePageFromIndex(db, 'p1')

    for (const table of ['note_chunks', 'note_links', 'note_tags', 'note_titles', 'note_index_state']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
    }
    expect(searchNotes(db, 'content')).toHaveLength(0)
  })
})

describe('syncIndex', () => {
  it('indexes new notes, skips unchanged ones, and drops deleted ones', () => {
    const a = makePage('p1', 'A', '# A\n\nalpha content here\n')
    const b = makePage('p2', 'B', '# B\n\nbravo content here\n')

    expect(syncIndex(db, [a, b])).toEqual({ indexed: 2, skipped: 0, removed: 0 })
    expect(syncIndex(db, [a, b])).toEqual({ indexed: 0, skipped: 2, removed: 0 })

    // Deletion in PrismMD is a soft delete, so nothing cascades: syncIndex
    // noticing the page is gone from its input is the only thing that
    // evicts it from the index.
    db.prepare('UPDATE pages SET is_deleted = 1 WHERE id = ?').run('p2')
    expect(syncIndex(db, [a])).toEqual({ indexed: 0, skipped: 1, removed: 1 })
    expect(searchNotes(db, 'bravo')).toHaveLength(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks WHERE page_id = ?').get('p2'))
      .toEqual({ n: 0 })
  })

  it('re-indexes everything when forced', () => {
    const a = makePage('p1', 'A', '# A\n\nalpha content here\n')
    syncIndex(db, [a])
    expect(syncIndex(db, [a], { force: true })).toEqual({ indexed: 1, skipped: 0, removed: 0 })
  })
})

describe('resetKnowledgeIndex', () => {
  it('empties the index and lets a fresh sync rebuild it', () => {
    const a = makePage('p1', 'A', '# A\n\nalpha content here #tagged and [[B]]\n')
    syncIndex(db, [a])

    resetKnowledgeIndex(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks').get()).toEqual({ n: 0 })
    expect(searchNotes(db, 'alpha')).toEqual([])

    expect(syncIndex(db, [a])).toEqual({ indexed: 1, skipped: 0, removed: 0 })
    expect(searchNotes(db, 'alpha')).toHaveLength(1)
  })

  it('clears an orphaned FTS row that a forced re-index would leave behind', () => {
    add('p1', 'A', '# A\n\nalpha content here\n')
    // Simulate a crash between the two writes in clearPageRows: the chunk is
    // gone but its FTS entry survives, so search keeps returning a passage
    // that no longer exists. This is the failure Rebuild exists to fix.
    db.prepare('DELETE FROM note_chunks').run()
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks_fts').get()).toEqual({ n: 1 })

    resetKnowledgeIndex(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_chunks_fts').get()).toEqual({ n: 0 })
  })
})

describe('searchNotes', () => {
  beforeEach(() => {
    add(
      'p1',
      'Scheduler',
      '# Scheduler\n\nThe scheduler dispatches queued work to idle agents once per tick, '
        + 'and skips a tick entirely when the previous round has not finished.\n\n'
        + '## Retry\n\nThe scheduler retries with exponential backoff, three attempts, '
        + 'and gives up after the third rather than holding the queue open forever.\n',
    )
    add('p2', 'Deployment', '# Deployment\n\nWe deploy with a single docker compose command.\n')
    add('p3', '检索笔记', '# 检索笔记\n\n用 SQLite 做全文检索,中文也要能搜到。\n')
  })

  it('finds a passage by its words and says where it came from', () => {
    const [hit] = searchNotes(db, 'exponential backoff')
    expect(hit.pageId).toBe('p1')
    expect(hit.headingPath).toEqual(['Scheduler', 'Retry'])
    expect(hit.snippet).toContain('backoff')
    expect(hit.matchedOn).toContain('body')
  })

  it('finds Chinese notes, which is the whole reason for the custom tokenizer', () => {
    // With FTS5's stock tokenizer this returns nothing at all: a run of CJK
    // has no word boundary, so the entire sentence indexes as one token.
    expect(searchNotes(db, '全文检索').map((h) => h.pageId)).toEqual(['p3'])
    expect(searchNotes(db, '中文').map((h) => h.pageId)).toEqual(['p3'])
  })

  it('offsets point at the passage inside the note content', () => {
    const page = db.prepare('SELECT content FROM pages WHERE id = ?').get('p1') as { content: string }
    const [hit] = searchNotes(db, 'exponential backoff')
    expect(page.content.slice(hit.startOffset, hit.endOffset)).toContain('exponential backoff')
  })

  it('ranks a title match above a passing mention', () => {
    add('p4', 'Docker Compose', '# Docker Compose\n\nNotes on running the stack locally.\n')
    expect(searchNotes(db, 'docker compose')[0].pageId).toBe('p4')
  })

  it('lets a tag match retrieve a note that never spells the word out', () => {
    add('p5', 'Weekly log', '# Weekly log\n\nShipped the thing. #retrospective\n')
    expect(searchNotes(db, 'retrospective').map((h) => h.pageId)).toContain('p5')
  })

  it('honours excludePageIds so the note you are reading is not its own answer', () => {
    expect(searchNotes(db, 'scheduler', { excludePageIds: ['p1'] }).map((h) => h.pageId))
      .not.toContain('p1')
  })

  it('caps how many passages one note can contribute', () => {
    const long = Array.from({ length: 8 }, (_, i) => `## Section ${i}\n\nwidget ${'w'.repeat(300)}`).join('\n\n')
    add('p6', 'Widgets', long)
    expect(searchNotes(db, 'widget', { maxPerNote: 2 }).filter((h) => h.pageId === 'p6')).toHaveLength(2)
  })

  it('returns nothing rather than everything for an empty query', () => {
    expect(searchNotes(db, '')).toEqual([])
    expect(searchNotes(db, '   !!! ')).toEqual([])
  })

  it('never matches a soft-deleted note', () => {
    db.prepare('UPDATE pages SET is_deleted = 1 WHERE id = ?').run('p1')
    expect(searchNotes(db, 'exponential backoff')).toEqual([])
  })

  it('treats FTS5 operators in a query as literal text', () => {
    // Unquoted these would be parsed as query syntax; the user would get a
    // SQLite error dialog instead of results.
    expect(() => searchNotes(db, 'retry AND NOT "backoff" OR *')).not.toThrow()
  })

  it('lifts linked neighbours when given the note you are reading', () => {
    add('p7', 'Runbook', '# Runbook\n\nGeneral operational notes about the system.\n')
    add('p8', 'Oncall', '# Oncall\n\nGeneral operational notes. See [[Runbook]].\n')
    const withContext = searchNotes(db, 'general operational notes', { contextPageId: 'p8' })
    expect(withContext.find((h) => h.pageId === 'p7')!.matchedOn).toContain('link')
  })
})

describe('link graph', () => {
  it('resolves a link written before its target exists', () => {
    // Links target titles, not ids, precisely so this works: you write the
    // link when you think of it, and it wires itself up later.
    add('p1', 'Source', 'I should read about [[Kalman Filter]].')
    expect(getOutgoingLinks(db, 'p1')[0].resolved).toBe(false)
    expect(getUnresolvedLinks(db).map((u) => u.target)).toEqual(['Kalman Filter'])

    add('p2', 'Kalman Filter', '# Kalman Filter\n\nA recursive estimator.\n')
    expect(getOutgoingLinks(db, 'p1')[0]).toMatchObject({ resolved: true, pageId: 'p2' })
    expect(getUnresolvedLinks(db)).toEqual([])
  })

  it('matches links case- and whitespace-insensitively', () => {
    add('p1', 'Kalman Filter', 'body')
    add('p2', 'Source', 'see [[kalman   filter]]')
    expect(getBacklinks(db, 'p1').map((b) => b.pageId)).toEqual(['p2'])
  })

  it('counts repeated mentions as one weighted edge', () => {
    add('p1', 'Target', 'body')
    add('p2', 'Source', '[[Target]] and [[Target]] and [[target|again]]')
    expect(getBacklinks(db, 'p1')).toHaveLength(1)
    expect(getBacklinks(db, 'p1')[0].occurrences).toBe(3)
  })

  it('gives a backlink enough context to be read without opening the note', () => {
    add('p1', 'Target', 'body')
    add('p2', 'Source', `${'padding '.repeat(60)}the decision hinged on [[Target]] ${'tail '.repeat(60)}`)
    expect(getBacklinks(db, 'p1')[0].context).toContain('Target')
  })

  it('drops a backlink when the linking note is deleted', () => {
    add('p1', 'Target', 'body')
    add('p2', 'Source', 'see [[Target]]')
    db.prepare('UPDATE pages SET is_deleted = 1 WHERE id = ?').run('p2')
    expect(getBacklinks(db, 'p1')).toEqual([])
  })

  it('groups unresolved links by target and ranks by how many notes want them', () => {
    add('p1', 'A', 'see [[Ghost]]')
    add('p2', 'B', 'see [[Ghost]] and [[Wisp]]')
    const unresolved = getUnresolvedLinks(db)
    expect(unresolved.map((u) => [u.normalized, u.sources.length])).toEqual([['ghost', 2], ['wisp', 1]])
  })

  it('reports orphans, and stops reporting a note once it is connected', () => {
    add('p1', 'Island', '# Island\n\nnothing points here')
    add('p2', 'Hub', '# Hub\n\nnothing here either')
    expect(getOrphanNotes(db).map((o) => o.pageId).sort()).toEqual(['p1', 'p2'])

    add('p2', 'Hub', '# Hub\n\nsee [[Island]]')
    expect(getOrphanNotes(db).map((o) => o.pageId)).toEqual([])
  })
})

describe('tags', () => {
  it('collects tags across notes and counts the notes carrying each', () => {
    add('p1', 'A', 'work #project/apos #inbox')
    add('p2', 'B', 'more #inbox')
    expect(listTags(db)).toEqual([
      { tag: 'inbox', notes: 2 },
      { tag: 'project/apos', notes: 1 },
    ])
  })

  it('lists the notes behind a tag', () => {
    add('p1', 'A', '#inbox')
    add('p2', 'B', '#inbox')
    expect(getNotesByTag(db, 'INBOX').map((n) => n.pageId).sort()).toEqual(['p1', 'p2'])
  })
})

describe('getRelatedNotes', () => {
  it('ranks a linked note above one that merely shares words', () => {
    add('p1', 'Home', '# Home\n\nA note about caching strategies. See [[Cache Invalidation]].\n')
    add('p2', 'Cache Invalidation', '# Cache Invalidation\n\nHow to know when to drop a cache entry.\n')
    add('p3', 'Caching Notes', '# Caching Notes\n\nA note about caching strategies in general.\n')

    const related = getRelatedNotes(db, 'p1')
    expect(related[0].pageId).toBe('p2')
    expect(related[0].reasons).toContain('link')
    expect(related.map((r) => r.pageId)).toContain('p3')
  })

  it('surfaces a note that only shares a tag', () => {
    add('p1', 'A', '# A\n\nentirely unrelated words #shared\n')
    add('p2', 'B', '# B\n\ncompletely different prose #shared\n')
    const related = getRelatedNotes(db, 'p1')
    expect(related[0].pageId).toBe('p2')
    expect(related[0].sharedTags).toEqual(['shared'])
  })

  it('never returns the note itself', () => {
    add('p1', 'A', '# A\n\nsome words about a topic\n')
    add('p2', 'B', '# B\n\nsome words about a topic\n')
    expect(getRelatedNotes(db, 'p1').map((r) => r.pageId)).not.toContain('p1')
  })

  it('returns nothing for a lone note instead of failing', () => {
    add('p1', 'Only', '# Only\n\nalone in the workspace\n')
    expect(getRelatedNotes(db, 'p1')).toEqual([])
  })
})

describe('buildRetrievalContext', () => {
  beforeEach(() => {
    add(
      'p1',
      'Retry Policy',
      '# Retry Policy\n\nEvery outbound call in the system is subject to this policy, '
        + 'including the ones the agent makes on your behalf.\n\n'
        + '## Backoff\n\nWe retry three times with exponential backoff before surfacing '
        + 'the failure to the caller, doubling the delay after each attempt.\n',
    )
    add('p2', 'Deploy', '# Deploy\n\nDeployment is a single docker compose command.\n')
  })

  it('numbers passages and maps each number back to a real note', () => {
    // Note the plural: the stemmer is what makes "retries" find "retry".
    const { context, citations } = buildRetrievalContext(db, 'how many retries and what backoff?')
    expect(context).toContain('[1]')
    expect(citations[0]).toMatchObject({ index: 1, pageId: 'p1', title: 'Retry Policy' })
    // The passage that actually answers the question has to be in there, and
    // it has to carry the heading path that makes the citation addressable.
    expect(citations.map((c) => c.headingPath)).toContainEqual(['Retry Policy', 'Backoff'])
    // The contract with the UI: citation N is at citations[N - 1].
    citations.forEach((c, i) => expect(c.index).toBe(i + 1))
  })

  it('returns empty context rather than unrelated passages when nothing matches', () => {
    expect(buildRetrievalContext(db, 'zzzzqqq')).toEqual({ context: '', citations: [] })
  })

  it('caps passage length so retrieval cannot blow the prompt budget', () => {
    add('p3', 'Wall', `# Wall\n\n${'word '.repeat(2000)}\n`)
    const { citations } = buildRetrievalContext(db, 'word', { maxCharsPerPassage: 100 })
    for (const citation of citations) expect(citation.text.length).toBeLessThanOrEqual(100)
  })

  it('honours the passage cap', () => {
    const { citations } = buildRetrievalContext(db, 'retry deploy docker', { maxPassages: 1 })
    expect(citations).toHaveLength(1)
  })
})

describe('getKnowledgeStats', () => {
  it('counts notes, links, tags and orphans', () => {
    add('p1', 'A', '# A\n\nsee [[B]] and [[Ghost]] #tag\n')
    add('p2', 'B', '# B\n\nplain content\n')
    add('p3', 'C', '# C\n\nnobody links here\n')

    expect(getKnowledgeStats(db)).toMatchObject({
      notes: 3,
      links: 2,
      resolvedLinks: 1,
      unresolvedLinks: 1,
      tags: 1,
      orphans: 1,
      fullTextSearch: true,
    })
  })

  it('reports an empty index without dividing by zero', () => {
    expect(getKnowledgeStats(db)).toMatchObject({ notes: 0, chunks: 0, links: 0, orphans: 0 })
  })
})
