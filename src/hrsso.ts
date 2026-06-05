let access_token: string | undefined
let expires_at = 0

function rhssoTokenUrl(): string {
  const host = process.env.RHSSO_HOST?.trim() ?? ''
  const base = host.startsWith('http://') || host.startsWith('https://')
    ? host.replace(/\/$/, '')
    : `https://${host.replace(/\/$/, '')}`


  console.log(`SSO HOST: [${base}]`);
  return `${base}`
}

export async function obterAccessToken(): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)

  if (access_token && agora < expires_at - 30) {
    return access_token
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.RHSSO_CLIENT_ID ?? '',
    client_secret: process.env.RHSSO_CLIENT_SECRET ?? '',
  })

  const res = await fetch(rhssoTokenUrl(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal:  AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`Falha ao obter token RHSSO: ${res.status}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  access_token = data.access_token
  expires_at   = agora + data.expires_in

  return data.access_token
}
