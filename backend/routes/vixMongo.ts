// backend/routes/vixMongo.ts
import { Router } from 'express'
import { OptionClosePriceModel } from '../models/OptionClosePrice'

const router = Router()

// 指定満期日のデータ
router.get('/:contract', async (req, res) => {
  const { contract } = req.params
  try {
    const docs = await OptionClosePriceModel.find({ contract }).sort({ strike: 1, date: 1 })
    res.json(docs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB fetch error' })
  }
})

export default router
