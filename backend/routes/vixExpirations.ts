import { Router } from 'express'
import { IbServiceManager } from '../ibService'

const router = Router()
const ibService = IbServiceManager.getInstance()

router.get('/', async (req, res) => {
  try {
    const expirations = await ibService.getAvailableExpirations()
    res.json({ data: expirations })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
