/**
 * Set environment variables for borderless-agent storage paths.
 *
 * borderless-agent resolves session/memory/context directories from
 * process.cwd() at module load time. In a packaged Electron app, cwd is '/'
 * which causes ENOENT errors. This module redirects all storage to the
 * Electron userData directory.
 *
 * MUST be imported before borderless-agent so the env vars are set before
 * its top-level constants read them.
 */
import { app } from 'electron'
import path from 'path'

const agentDataDir = path.join(app.getPath('userData'), 'agent')

process.env.AGENT_SESSION_DIR ??= path.join(agentDataDir, 'sessions')
process.env.AGENT_MEMORY_DIR ??= path.join(agentDataDir, 'memory')
process.env.AGENT_CONTEXT_DIR ??= path.join(agentDataDir, 'context')
process.env.AGENT_SKILLS_DIR ??= path.join(agentDataDir, 'skills')
