import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }

  return createClient(url, anonKey)
}

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from('analysis_history')
      .select('id, repository_name, files_analyzed, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return NextResponse.json({ history: data ?? [] })
  } catch (error) {
    console.error('[analysis-history] list failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load analysis history.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const repositoryName = typeof body.repositoryName === 'string' ? body.repositoryName.trim() : ''
    const filesAnalyzed = body.filesAnalyzed

    if (!repositoryName || repositoryName.length > 255 || !Number.isInteger(filesAnalyzed) || filesAnalyzed < 0) {
      return NextResponse.json({ error: 'Provide a repository name and a non-negative integer file count.' }, { status: 400 })
    }

    const { data, error } = await getSupabase()
      .from('analysis_history')
      .insert({ repository_name: repositoryName, files_analyzed: filesAnalyzed })
      .select('id, repository_name, files_analyzed, created_at')
      .single()

    if (error) throw error
    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (error) {
    console.error('[analysis-history] save failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save analysis history.' }, { status: 500 })
  }
}
