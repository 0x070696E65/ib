import { Router } from 'express'
import { ExpirationService } from '../services/ExpirationService'

const router = Router()

// VIX 満期日の取得＆保存
router.get('/options', async (req, res) => {
  try {
    const isEnded = req.query.isEnded === 'true'
    const expirationService = ExpirationService.getInstance()
    const data = await expirationService.getOptionExpirations(isEnded)
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

router.get('/futures', async (req, res) => {
  try {
    const isEnded = req.query.isEnded === 'true'
    const expirationService = ExpirationService.getInstance()
    const data = await expirationService.getFutureExpirations(isEnded)
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

router.get('/update', async (req, res) => {
  try {
    const expirationService = ExpirationService.getInstance()
    await expirationService.updateExpirations()
    res.json({ message: '満期日が更新されました' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
