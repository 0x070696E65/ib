import { Router } from 'express'
import { IbService } from '../ibService'

const router = Router()
const ibService = new IbService()

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
