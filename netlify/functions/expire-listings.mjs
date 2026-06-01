import { invokeCron } from './_shared/invoke-cron.mjs'

const handler = async () => {
  await invokeCron('/api/cron/expire-listings')
}

export default handler
