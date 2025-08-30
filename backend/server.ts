// server.ts
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import vixOptionRoutes from './routes/vixOption'
import vixExpirationsRoutes from './routes/vixExpirations'
import vixFutureRoutes from './routes/vixFuture'
import positionRoutes from './routes/positions'

const app = express()
const port = 3001

// CORS設定
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://macbook-pro.local:5173'],
    credentials: true,
  })
)

app.use(express.json())

// MongoDB接続
mongoose.connect('mongodb://127.0.0.1:27017/vixdb', {})

// 既存のルート
app.use('/api/vix-option', vixOptionRoutes)
app.use('/api/vix-expirations', vixExpirationsRoutes)
app.use('/api/vix-future', vixFutureRoutes)

// 新しいポジション監視ルート
app.use('/api/positions', positionRoutes)

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

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`)
  console.log(`Position SSE endpoint: http://localhost:${port}/api/positions/stream`)
  console.log(`Position API: http://localhost:${port}/api/positions/current`)
})
