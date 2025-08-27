import mongoose from 'mongoose'
import { ExpirationService } from '../services/ExpirationService'
const expirationService = ExpirationService.getInstance()

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://127.0.0.1:27017/vixdb', {})
    console.log('MongoDB接続完了')
  }
}

async function getExpirationTest() {
  await connectDB()
  const expirations = await expirationService.getFutureExpirations()
  console.log(expirations)
  await mongoose.disconnect()
}

if (require.main === module) {
  getExpirationTest()
    .then(() => {
      console.log('\n🎉 テスト成功!')
      process.exit(0)
    })
    .catch((error) => {
      console.log('\n💥 テスト失敗')
      console.error('エラー:', error.message)
      process.exit(1)
    })
}
