/**
 * Seed de CEDEARs activos en BYMA. Decisión §11.1 del SPEC: tabla estática
 * actualizable manualmente. Si cambia un ratio (split / reverse split),
 * editar acá.
 *
 * Ratio = cuántos CEDEARs equivalen a 1 acción del subyacente.
 *
 * Cómo verificar un ratio:
 *   ratio = precio_subyacente_USD × CCL / precio_CEDEAR_ARS
 *   (usar precio actual del broker como referencia)
 *
 * Última revisión: 2026-05-13 (verificar antes de releases).
 * Cambios: MELI 4→150, SPY 20→15 (back-calculados de precios reales BYMA).
 */

export interface CedearSeed {
  ticker: string; // ticker BYMA (suele coincidir con NYSE)
  underlyingTicker: string;
  name: string;
  ratio: number;
  exchange: 'NASDAQ' | 'NYSE' | 'OTHER';
}

export const CEDEARS: readonly CedearSeed[] = [
  // Tecnología
  { ticker: 'AAPL', underlyingTicker: 'AAPL', name: 'Apple Inc.', ratio: 10, exchange: 'NASDAQ' },
  { ticker: 'MSFT', underlyingTicker: 'MSFT', name: 'Microsoft Corp.', ratio: 10, exchange: 'NASDAQ' },
  { ticker: 'GOOGL', underlyingTicker: 'GOOGL', name: 'Alphabet Inc. (Class A)', ratio: 20, exchange: 'NASDAQ' },
  { ticker: 'AMZN', underlyingTicker: 'AMZN', name: 'Amazon.com Inc.', ratio: 4, exchange: 'NASDAQ' },
  { ticker: 'META', underlyingTicker: 'META', name: 'Meta Platforms', ratio: 5, exchange: 'NASDAQ' },
  { ticker: 'NFLX', underlyingTicker: 'NFLX', name: 'Netflix Inc.', ratio: 20, exchange: 'NASDAQ' },
  { ticker: 'NVDA', underlyingTicker: 'NVDA', name: 'NVIDIA Corp.', ratio: 5, exchange: 'NASDAQ' },
  { ticker: 'TSLA', underlyingTicker: 'TSLA', name: 'Tesla Inc.', ratio: 30, exchange: 'NASDAQ' },
  { ticker: 'AMD', underlyingTicker: 'AMD', name: 'Advanced Micro Devices', ratio: 5, exchange: 'NASDAQ' },
  { ticker: 'INTC', underlyingTicker: 'INTC', name: 'Intel Corp.', ratio: 5, exchange: 'NASDAQ' },
  { ticker: 'ADBE', underlyingTicker: 'ADBE', name: 'Adobe Inc.', ratio: 4, exchange: 'NASDAQ' },
  { ticker: 'PYPL', underlyingTicker: 'PYPL', name: 'PayPal Holdings', ratio: 4, exchange: 'NASDAQ' },
  { ticker: 'ORCL', underlyingTicker: 'ORCL', name: 'Oracle Corp.', ratio: 4, exchange: 'NYSE' },
  { ticker: 'CRM', underlyingTicker: 'CRM', name: 'Salesforce Inc.', ratio: 5, exchange: 'NYSE' },
  { ticker: 'IBM', underlyingTicker: 'IBM', name: 'IBM Corp.', ratio: 5, exchange: 'NYSE' },

  // Mercado financiero
  { ticker: 'BRKB', underlyingTicker: 'BRK.B', name: 'Berkshire Hathaway (B)', ratio: 50, exchange: 'NYSE' },
  { ticker: 'JPM', underlyingTicker: 'JPM', name: 'JPMorgan Chase', ratio: 5, exchange: 'NYSE' },
  { ticker: 'BAC', underlyingTicker: 'BAC', name: 'Bank of America', ratio: 4, exchange: 'NYSE' },
  { ticker: 'C', underlyingTicker: 'C', name: 'Citigroup', ratio: 5, exchange: 'NYSE' },
  { ticker: 'GS', underlyingTicker: 'GS', name: 'Goldman Sachs', ratio: 20, exchange: 'NYSE' },
  { ticker: 'V', underlyingTicker: 'V', name: 'Visa Inc.', ratio: 4, exchange: 'NYSE' },
  { ticker: 'MA', underlyingTicker: 'MA', name: 'Mastercard Inc.', ratio: 10, exchange: 'NYSE' },

  // Consumo
  { ticker: 'KO', underlyingTicker: 'KO', name: 'Coca-Cola Company', ratio: 5, exchange: 'NYSE' },
  { ticker: 'PEP', underlyingTicker: 'PEP', name: 'PepsiCo Inc.', ratio: 4, exchange: 'NASDAQ' },
  { ticker: 'MCD', underlyingTicker: 'MCD', name: "McDonald's Corp.", ratio: 10, exchange: 'NYSE' },
  { ticker: 'SBUX', underlyingTicker: 'SBUX', name: 'Starbucks Corp.', ratio: 4, exchange: 'NASDAQ' },
  { ticker: 'NKE', underlyingTicker: 'NKE', name: 'Nike Inc.', ratio: 5, exchange: 'NYSE' },
  { ticker: 'WMT', underlyingTicker: 'WMT', name: 'Walmart Inc.', ratio: 5, exchange: 'NYSE' },
  { ticker: 'COST', underlyingTicker: 'COST', name: 'Costco Wholesale', ratio: 20, exchange: 'NASDAQ' },
  { ticker: 'DIS', underlyingTicker: 'DIS', name: 'Walt Disney Co.', ratio: 5, exchange: 'NYSE' },
  { ticker: 'PG', underlyingTicker: 'PG', name: 'Procter & Gamble', ratio: 5, exchange: 'NYSE' },
  { ticker: 'JNJ', underlyingTicker: 'JNJ', name: 'Johnson & Johnson', ratio: 5, exchange: 'NYSE' },
  { ticker: 'PFE', underlyingTicker: 'PFE', name: 'Pfizer Inc.', ratio: 4, exchange: 'NYSE' },

  // Energía & industrial
  { ticker: 'XOM', underlyingTicker: 'XOM', name: 'Exxon Mobil', ratio: 5, exchange: 'NYSE' },
  { ticker: 'CVX', underlyingTicker: 'CVX', name: 'Chevron Corp.', ratio: 10, exchange: 'NYSE' },
  { ticker: 'BA', underlyingTicker: 'BA', name: 'Boeing Co.', ratio: 5, exchange: 'NYSE' },
  { ticker: 'CAT', underlyingTicker: 'CAT', name: 'Caterpillar Inc.', ratio: 10, exchange: 'NYSE' },
  { ticker: 'GE', underlyingTicker: 'GE', name: 'General Electric', ratio: 10, exchange: 'NYSE' },

  // LATAM & emergentes
  // MELI: acción ~$2,057 USD, CDR BYMA ~$19,200 ARS → ratio = 2057×1400/19200 ≈ 150
  { ticker: 'MELI', underlyingTicker: 'MELI', name: 'MercadoLibre Inc.', ratio: 150, exchange: 'NASDAQ' },
  { ticker: 'BABA', underlyingTicker: 'BABA', name: 'Alibaba Group', ratio: 4, exchange: 'NYSE' },
  { ticker: 'JD', underlyingTicker: 'JD', name: 'JD.com', ratio: 4, exchange: 'NASDAQ' },
  { ticker: 'TSM', underlyingTicker: 'TSM', name: 'Taiwan Semiconductor', ratio: 5, exchange: 'NYSE' },

  // ETFs populares
  // SPY: ETF ~$590 USD, CDR BYMA ~$55,175 ARS → ratio = 590×1400/55175 ≈ 15
  { ticker: 'SPY', underlyingTicker: 'SPY', name: 'SPDR S&P 500 ETF', ratio: 15, exchange: 'NYSE' },
  { ticker: 'QQQ', underlyingTicker: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq 100)', ratio: 15, exchange: 'NASDAQ' },
  { ticker: 'EWZ', underlyingTicker: 'EWZ', name: 'iShares MSCI Brazil', ratio: 5, exchange: 'NYSE' },
  { ticker: 'XLE', underlyingTicker: 'XLE', name: 'Energy Select Sector SPDR', ratio: 4, exchange: 'NYSE' },
  { ticker: 'GLD', underlyingTicker: 'GLD', name: 'SPDR Gold Shares', ratio: 10, exchange: 'NYSE' },
  // ETFs cripto — cotizan en BYMA como CEDEARs
  // IBIT: ETF ~$44 USD, CDR BYMA ~$6,515 ARS → ratio = 44×1400/6515 ≈ 9
  { ticker: 'IBIT', underlyingTicker: 'IBIT', name: 'iShares Bitcoin Trust ETF', ratio: 9, exchange: 'NASDAQ' },
  { ticker: 'FBTC', underlyingTicker: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', ratio: 9, exchange: 'NYSE' },
  { ticker: 'ARKB', underlyingTicker: 'ARKB', name: 'ARK 21Shares Bitcoin ETF', ratio: 9, exchange: 'NYSE' },

  // Healthcare / pharma
  { ticker: 'UNH', underlyingTicker: 'UNH', name: 'UnitedHealth Group', ratio: 30, exchange: 'NYSE' },
  { ticker: 'ABBV', underlyingTicker: 'ABBV', name: 'AbbVie Inc.', ratio: 5, exchange: 'NYSE' },
  { ticker: 'MRK', underlyingTicker: 'MRK', name: 'Merck & Co.', ratio: 5, exchange: 'NYSE' },

  // Comunicaciones
  { ticker: 'VZ', underlyingTicker: 'VZ', name: 'Verizon Communications', ratio: 5, exchange: 'NYSE' },
  { ticker: 'T', underlyingTicker: 'T', name: 'AT&T Inc.', ratio: 5, exchange: 'NYSE' },
] as const;

/** Lookup rápido por ticker (case-insensitive). */
export function findCedear(ticker: string): CedearSeed | undefined {
  const upper = ticker.toUpperCase();
  return CEDEARS.find((c) => c.ticker === upper);
}
