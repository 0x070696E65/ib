import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import vixOptionRoutes from './routes/vixOption'
import vixExpirationsRoutes from './routes/vixExpirations'

const app = express()
const port = 3001
app.use(cors())
app.use(express.json())

mongoose.connect('mongodb://127.0.0.1:27017/vixdb', {})

// ルート統一
app.use('/api/vix-option', vixOptionRoutes)
app.use('/api/vix/expirations', vixExpirationsRoutes)

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`)
})
