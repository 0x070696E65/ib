// backend/database/connection.ts
import mongoose from 'mongoose'

export async function connectToDatabase(): Promise<void> {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ib-trading-analysis'

    await mongoose.connect(mongoUri, {
      // 現在のMongoose版では以下のオプションは不要だが、古い版の場合は追加
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    })

    console.log('✅ MongoDB に接続しました')
  } catch (error) {
    console.error('❌ MongoDB 接続エラー:', error)
    process.exit(1)
  }
}

// 接続イベントリスナー
mongoose.connection.on('error', (error) => {
  console.error('MongoDB エラー:', error)
})

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB から切断されました')
})

// アプリ終了時の処理
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close()
    console.log('MongoDB 接続をクローズしました')
    process.exit(0)
  } catch (error) {
    console.error('MongoDB クローズエラー:', error)
    process.exit(1)
  }
})
