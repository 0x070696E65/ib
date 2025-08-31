// server.ts
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import vixOptionRoutes from './routes/vixOption'
import vixExpirationsRoutes from './routes/vixExpirations'
import vixFutureRoutes from './routes/vixFuture'
import positionRoutes from './routes/positions'
import tradeRoutes from './routes/trades'

// データベース接続
import { connectToDatabase } from './database/connection'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// ミドルウェア
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// データベース接続
connectToDatabase()

// CORS設定
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://macbook-pro.local:5173'],
    credentials: true,
  })
)

// API ルート
app.use('/api/positions', positionRoutes)
app.use('/api/vix-expirations', vixExpirationsRoutes)
app.use('/api/vix-future', vixFutureRoutes)
app.use('/api/vix-option', vixOptionRoutes)
app.use('/api/trades', tradeRoutes)

// 静的ファイル配信（本番環境用）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')))

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'))
  })
}

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'VIX Data & Position monitoring API is running',
  })
})

// エラーハンドリング
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  })
})

app.listen(PORT, () => {
  console.log(`🚀 サーバーがポート ${PORT} で起動しました`)
})
