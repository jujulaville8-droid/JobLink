import { invokeCron } from './_shared/invoke-cron.mjs'

const handler = async () => {
  await invokeCron('/api/cron/resume-nudge')
}

export default handler
