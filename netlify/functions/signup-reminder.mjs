import { invokeCron } from './_shared/invoke-cron.mjs'

const handler = async () => {
  await invokeCron('/api/cron/signup-reminder')
}

export default handler
