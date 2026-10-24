import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  files: z.array(z.object({
    path: z.string(),
    language: z.string(),
    imports: z.array(z.string()),
    exports: z.array(z.string()),
    code: z.string(),
  })).max(500),
  edges: z.array(z.object({ source: z.string(), target: z.string() })).max(2000),
})

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
    if (!apiKey) {
      return Response.json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY is not configured on the server.' }, { status: 503 })
    }

    const google = createGoogleGenerativeAI({ apiKey })
    const configuredModel = process.env.GEMINI_MODEL?.trim().replace(/^models\//, '')
    const model = configuredModel === 'gemini-2.5-flash' || !configuredModel
      ? 'gemini-3.8-flash'
      : configuredModel

    const parsed = requestSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: 'Please provide a question and valid indexed repository context.' }, { status: 400 })
    if (!parsed.data.files.length) return Response.json({ error: 'No indexed repository context is available. Upload or scan a repository first.' }, { status: 400 })

    const context = parsed.data.files.map(file => [
      `FILE: ${file.path}`,
      `LANGUAGE: ${file.language}`,
      `IMPORTS: ${file.imports.join(', ') || 'none'}`,
      `EXPORTS: ${file.exports.join(', ') || 'none'}`,
      'CONTENT:',
      file.code.slice(0, 12000),
    ].join('\n')).join('\n\n')
    const dependencies = parsed.data.edges.map(edge => `${edge.source} -> ${edge.target}`).join('\n') || 'No dependency edges were resolved.'

    const result = await generateText({
      model: google(model),
      system: 'You are RepoMind, a codebase intelligence assistant. Answer only from the indexed file contents and dependency graph provided below. If the context does not support an answer, say that the indexed repository context does not contain enough information. Do not invent files, symbols, behavior, or changes. Cite relevant file paths inline.\n\nINDEXED FILES:\n' + context + '\n\nDEPENDENCY GRAPH:\n' + dependencies,
      prompt: parsed.data.question,
      maxOutputTokens: 900,
    })

    return Response.json({ answer: result.text })
  } catch (error) {
    console.error('[codebase-chat] request failed', error instanceof Error ? error.message : 'unknown error')
    return Response.json({ error: 'The codebase assistant could not answer right now. Check the server configuration and try again.' }, { status: 500 })
  }
}
