export async function invokeCron(path) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL
  const secret = process.env.CRON_SECRET

  if (!siteUrl || !secret) {
    throw new Error('Missing NEXT_PUBLIC_SITE_URL or CRON_SECRET')
  }

  const response = await fetch(new URL(path, siteUrl), {
    headers: {
      authorization: `Bearer ${secret}`,
    },
  })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${await response.text()}`)
  }
}
