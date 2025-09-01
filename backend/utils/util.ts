export type OptionInfo = {
  strike: number | null
  expiry: string | null
  optionType: 'PUT' | 'CALL' | null
}

/**
 * LocalSymbol からオプション情報を抽出
 * 例: "SPY   250917C00500000" → { strike: 5.0, expiry: "2025-09-17", optionType: "CALL" }
 */
export function extractOptionInfo(localSymbol: string): OptionInfo {
  if (!localSymbol) {
    return { strike: null, expiry: null, optionType: null }
  }

  // expiry (YYMMDD)
  const expiryMatch = localSymbol.match(/(\d{6})[CP]/)
  const expiry = expiryMatch
    ? `${'20' + expiryMatch[1].slice(0, 2)}-${expiryMatch[1].slice(2, 4)}-${expiryMatch[1].slice(4, 6)}`
    : null

  // strike (末尾8桁)
  const strikeMatch = localSymbol.match(/([CP])(\d{8})$/)
  const strike = strikeMatch ? parseInt(strikeMatch[2]) / 1000 : null

  // option type (C/P)
  const optionType = strikeMatch ? (strikeMatch[1] === 'P' ? 'PUT' : 'CALL') : null

  return { strike, expiry, optionType }
}
