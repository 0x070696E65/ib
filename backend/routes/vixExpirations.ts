import { Router } from 'express'
import { IbServiceManager } from '../services/ibService'
import { VixExpirationModel, ExpirationCacheStateModel } from '../models/VixExpiration'

const router = Router()
const ibService = IbServiceManager.getInstance()

// VIX 満期日の取得＆保存
router.get('/', async (req, res) => {
  try {
    const cache = await ExpirationCacheStateModel.findOne()
    const now = new Date()

    // 28日以内ならキャッシュ利用
    if (cache && now.getTime() - cache.lastUpdated.getTime() < 28 * 24 * 60 * 60 * 1000) {
      const expirations = await VixExpirationModel.find().sort({ expiration: 1 })
      return res.json({ data: expirations.map((e) => e.expiration) })
    }

    // IBから取得
    const expirations = await ibService.getAvailableExpirations()

    // DB更新（重複は無視）
    for (const exp of expirations) {
      await VixExpirationModel.updateOne({ expiration: exp }, { $set: { expiration: exp } }, { upsert: true })
    }

    // キャッシュ更新
    if (cache) {
      cache.lastUpdated = now
      await cache.save()
    } else {
      await ExpirationCacheStateModel.create({ lastUpdated: now })
    }

    res.json({ data: expirations })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
