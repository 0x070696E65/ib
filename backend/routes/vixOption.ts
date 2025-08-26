import { Router } from 'express'
import { OptionClosePriceModel, OptionLastFetchedModel } from '../models/OptionClosePrice'
import { IbServiceManager } from '../services/ibService'

const router = Router()
const ibService = IbServiceManager.getInstance()

router.get('/', async (req, res) => {
  const strike = Number(req.query.strike) || 18
  const contractMonth = typeof req.query.contractMonth === 'string' ? req.query.contractMonth : '20250916'

  try {
    const latestRecord = await OptionClosePriceModel.findOne({ contract: contractMonth, strike }).sort({ date: -1 })
    const latestDate = latestRecord?.date

    const newOptionData = await ibService.fetchVixOptionBars(contractMonth, strike, latestDate)

    const dailyDataMap = new Map<string, (typeof newOptionData.data)[0]>()

    newOptionData.data.forEach((bar) => {
      const dateKey = bar.date.toISOString().slice(0, 10)
      if (!dailyDataMap.has(dateKey) || bar.date > dailyDataMap.get(dateKey)!.date) {
        dailyDataMap.set(dateKey, bar)
      }
    })

    for (const bar of dailyDataMap.values()) {
      await OptionClosePriceModel.updateOne(
        { contract: contractMonth, strike, date: bar.date },
        { $set: { close: bar.close } },
        { upsert: true }
      )
    }

    await OptionLastFetchedModel.updateOne({}, { fetchedDate: new Date() }, { upsert: true })
    const allData = await OptionClosePriceModel.find({ contract: contractMonth, strike }).sort({ date: 1 })
    res.json({ data: allData })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
