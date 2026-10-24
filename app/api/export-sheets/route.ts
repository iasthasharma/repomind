import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabase(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization')
  if (!url || !anonKey || !authorization?.startsWith('Bearer ')) return null
  return createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabase(request)
    if (!supabase) return NextResponse.json({ error: 'Sign in and configure Supabase before exporting.' }, { status: 401 })
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return NextResponse.json({ error: 'Sign in before exporting an analysis.' }, { status: 401 })

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!spreadsheetId || !clientEmail || !privateKey) {
      return NextResponse.json({ error: 'Google Sheets export is not configured on the server.' }, { status: 503 })
    }

    const body = await request.json()
    const repositoryName = typeof body.repositoryName === 'string' ? body.repositoryName.trim() : ''
    const filesAnalyzed = body.filesAnalyzed
    const dependencySummary = typeof body.dependencySummary === 'string' ? body.dependencySummary.trim() : ''
    const impactSummary = typeof body.impactSummary === 'string' ? body.impactSummary.trim() : ''
    if (!repositoryName || !Number.isInteger(filesAnalyzed) || filesAnalyzed < 0) {
      return NextResponse.json({ error: 'No complete analysis is available to export.' }, { status: 400 })
    }

    const auth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
    const sheets = google.sheets({ version: 'v4', auth })
    const timestamp = new Date().toISOString()
    const values = [[repositoryName, timestamp, filesAnalyzed, dependencySummary || 'Not available', impactSummary || 'Not available']]
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A1:E1' })
    const hasHeader = Boolean(existing.data.values?.length)
    if (!hasHeader) {
      await sheets.spreadsheets.values.update({ spreadsheetId, range: 'Sheet1!A1:E1', valueInputOption: 'USER_ENTERED', requestBody: { values: [['Repository name', 'Analysis timestamp', 'Files analyzed', 'Dependency summary', 'Impact / risk summary']] } })
    }
    await sheets.spreadsheets.values.append({ spreadsheetId, range: 'Sheet1!A:E', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values } })
    return NextResponse.json({ ok: true, spreadsheetId })
  } catch (error) {
    console.error('[export-sheets] export failed', error)
    return NextResponse.json({ error: 'Unable to export this analysis to Google Sheets.' }, { status: 502 })
  }
}
