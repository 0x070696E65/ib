// backend/routes/futures.ts
import { Router } from 'express'
import { FuturesClosePriceModel } from '../models/FuturesClosePrice'
import { IbService } from '../services/IbService'

const router = Router()
const ibService = IbService.getInstance()

/**
 * 契約月を YYYYMM形式 から YYYYMMDD形式 に変換
 * 例: '202509' → '20250917' (第3水曜日)
 */
function convertContractMonth(contractMonth: string): string {
  const year = parseInt(contractMonth.slice(0, 4))
  const month = parseInt(contractMonth.slice(4, 6))

  // 第3水曜日を計算
  const firstDay = new Date(year, month - 1, 1)
  const firstDayOfWeek = firstDay.getDay() // 0=日曜, 3=水曜

  let firstWednesday: number
  if (firstDayOfWeek <= 3) {
    firstWednesday = 3 - firstDayOfWeek + 1
  } else {
    firstWednesday = 7 - firstDayOfWeek + 3 + 1
  }

  const thirdWednesday = firstWednesday + 14
  const monthStr = month.toString().padStart(2, '0')
  const dayStr = thirdWednesday.toString().padStart(2, '0')

  return `${year}${monthStr}${dayStr}`
}

/**
 * 4時間足データを日足に変換
 * 同日のデータから最後の4時間足を日足として使用
 */
function convertToDaily(data: { date: Date; close: number }[]): { date: Date; close: number }[] {
  const dailyDataMap = new Map<string, { date: Date; close: number }>()

  data.forEach((bar) => {
    const dateKey = bar.date.toISOString().slice(0, 10) // YYYY-MM-DD
    // 同日の最後のデータを使用（時間が最も遅い4時間足）
    if (!dailyDataMap.has(dateKey) || bar.date > dailyDataMap.get(dateKey)!.date) {
      dailyDataMap.set(dateKey, bar)
    }
  })

  return Array.from(dailyDataMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * VIX先物データ取得・保存API
 * GET /api/futures?contractMonth=202509
 */
router.get('/', async (req, res) => {
  const contractMonth = typeof req.query.contractMonth === 'string' ? req.query.contractMonth : '202509'

  try {
    // 契約月を正しい形式に変換 (202509 → 20250917)
    const actualContractMonth = convertContractMonth(contractMonth)
    console.log(`契約月変換: ${contractMonth} → ${actualContractMonth}`)

    // 最新の保存済みデータを取得
    const latestRecord = await FuturesClosePriceModel.findOne({
      contract: contractMonth, // 保存時はYYYYMM形式で統一
    }).sort({ date: -1 })

    const latestDate = latestRecord?.date
    console.log(`最新保存データ: ${latestDate ? latestDate.toISOString().split('T')[0] : 'なし'}`)

    // 期間を決定（初回は長期、更新は短期）
    const durationDays = latestDate ? 30 : 720
    console.log(`取得期間: ${durationDays}日`)

    // IBから先物データを取得
    const newFuturesData = await ibService.fetchVixFutureBars(actualContractMonth, durationDays, latestDate)

    console.log(`取得データ: ${newFuturesData.data.length}件 (4時間足)`)

    // 4時間足を日足に変換
    const dailyData = convertToDaily(newFuturesData.data)
    console.log(`日足変換後: ${dailyData.length}件`)

    // データをMongoDBに保存
    let savedCount = 0
    for (const bar of dailyData) {
      try {
        await FuturesClosePriceModel.updateOne(
          {
            contract: contractMonth, // YYYYMM形式で保存
            date: bar.date,
          },
          { $set: { close: bar.close } },
          { upsert: true }
        )
        savedCount++
      } catch (saveError) {
        // 重複エラーは無視
        if (saveError.code !== 11000) {
          console.error('保存エラー:', saveError)
        }
      }
    }

    console.log(`保存完了: ${savedCount}件`)

    // 全データを返却
    const allData = await FuturesClosePriceModel.find({
      contract: contractMonth,
    }).sort({ date: 1 })

    res.json({
      success: true,
      contract: contractMonth,
      actualContract: actualContractMonth,
      newDataPoints: dailyData.length,
      savedCount,
      totalRecords: allData.length,
      data: allData,
    })
  } catch (err) {
    console.error('先物データ取得エラー:', err)
    res.status(500).json({
      success: false,
      error: String(err),
      contract: contractMonth,
    })
  }
})

/**
 * 複数契約の一括取得API
 * GET /api/futures/batch?contracts=202509,202510,202511
 */
router.get('/batch', async (req, res) => {
  const contractsParam = typeof req.query.contracts === 'string' ? req.query.contracts : '202509'
  const contractMonths = contractsParam.split(',').map((c) => c.trim())

  console.log(`一括取得開始: ${contractMonths.length}件`)

  try {
    const results: any[] = []

    for (const contractMonth of contractMonths) {
      try {
        // 各契約の処理（上記と同じロジック）
        const actualContractMonth = convertContractMonth(contractMonth)

        const latestRecord = await FuturesClosePriceModel.findOne({
          contract: contractMonth,
        }).sort({ date: -1 })

        const latestDate = latestRecord?.date
        const durationDays = latestDate ? 30 : 720

        console.log(`処理中: ${contractMonth} (${actualContractMonth}) - ${durationDays}日`)

        const newFuturesData = await ibService.fetchVixFutureBars(actualContractMonth, durationDays, latestDate)

        const dailyData = convertToDaily(newFuturesData.data)

        let savedCount = 0
        for (const bar of dailyData) {
          try {
            await FuturesClosePriceModel.updateOne(
              { contract: contractMonth, date: bar.date },
              { $set: { close: bar.close } },
              { upsert: true }
            )
            savedCount++
          } catch (saveError) {
            if (saveError.code !== 11000) {
              console.error('保存エラー:', saveError)
            }
          }
        }

        const totalRecords = await FuturesClosePriceModel.countDocuments({
          contract: contractMonth,
        })

        results.push({
          contract: contractMonth,
          actualContract: actualContractMonth,
          newDataPoints: dailyData.length,
          savedCount,
          totalRecords,
          success: true,
        })

        console.log(`完了: ${contractMonth} - 新規${savedCount}件, 合計${totalRecords}件`)

        // レート制限対策で少し待機
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (contractError) {
        console.error(`契約エラー ${contractMonth}:`, contractError)
        results.push({
          contract: contractMonth,
          error: String(contractError),
          success: false,
        })
      }
    }

    res.json({
      success: true,
      processed: contractMonths.length,
      results,
    })
  } catch (err) {
    console.error('一括取得エラー:', err)
    res.status(500).json({
      success: false,
      error: String(err),
    })
  }
})

/**
 * 保存済みデータの確認API
 * GET /api/futures/status?contract=202509
 */
router.get('/status', async (req, res) => {
  const contractMonth = typeof req.query.contract === 'string' ? req.query.contract : '202509'

  try {
    const count = await FuturesClosePriceModel.countDocuments({ contract: contractMonth })
    const latestRecord = await FuturesClosePriceModel.findOne({ contract: contractMonth }).sort({ date: -1 })
    const oldestRecord = await FuturesClosePriceModel.findOne({ contract: contractMonth }).sort({ date: 1 })

    res.json({
      contract: contractMonth,
      actualContract: convertContractMonth(contractMonth),
      totalRecords: count,
      latestDate: latestRecord?.date,
      oldestDate: oldestRecord?.date,
      latestClose: latestRecord?.close,
    })
  } catch (err) {
    console.error('ステータス取得エラー:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
