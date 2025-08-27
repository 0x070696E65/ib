import { IbService } from '../services/IbService'

const ibService = new IbService(4001, '127.0.0.1', 101)

async function test(): Promise<void> {
  const result = await ibService.fetchVixOptionBars('20250916', 15, 30)
  console.log(result)
}

test()
