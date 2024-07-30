const express = require('express');
const ccxt = require('ccxt');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files (like HTML, CSS)
app.use(express.static(path.join(__dirname, 'public')));

// Initialize exchanges with timeout options
const exchanges = [
    new ccxt.binance({ timeout: 50000 }),  // Binance with 20 seconds timeout
    new ccxt.kraken({ timeout: 50000 }),   // Kraken with 20 seconds timeout
    new ccxt.bybit({ timeout: 50000 }),    // Bybit with 20 seconds timeout
    new ccxt.okx({ timeout: 50000 }),      // OKX with 20 seconds timeout
    new ccxt.huobi({ timeout: 50000 }),    // Huobi with 20 seconds timeout
    new ccxt.mexc({ timeout: 50000 })      // MEXC with 20 seconds timeout
];

async function fetchSymbols() {
    const promises = exchanges.map(async (exchange) => {
        try {
            const symbols = await exchange.loadMarkets();
            return { [exchange.id]: Object.keys(symbols) };
        } catch (e) {
            console.error(`Error fetching markets from ${exchange.id}:`, e);
            return { [exchange.id]: [] };
        }
    });

    const results = await Promise.all(promises);
    return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}

function findCommonSymbols(symbolsPerExchange) {
    let commonSymbols = new Set(Object.values(symbolsPerExchange)[0]);
    for (const symbols of Object.values(symbolsPerExchange)) {
        commonSymbols = new Set([...commonSymbols].filter(x => symbols.includes(x)));
    }
    return commonSymbols;
}

async function fetchPricesForCommonSymbols(commonSymbols) {
    const promises = [...commonSymbols].map(async (symbol) => {
        const prices = await Promise.all(exchanges.map(async (exchange) => {
            try {
                const ticker = await exchange.fetchTicker(symbol);
                return { [exchange.id]: ticker['last'] };
            } catch (e) {
                console.error(`Error fetching ticker for ${symbol} from ${exchange.id}:`, e);
                return { [exchange.id]: undefined };
            }
        }));
        return { [symbol]: Object.assign({}, ...prices) };
    });

    const results = await Promise.all(promises);
    return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}

function checkArbitrageOpportunities(commonSymbolPrices) {
    const arbitrageOpportunities = [];
    for (const [symbol, prices] of Object.entries(commonSymbolPrices)) {
        const exchangePrices = Object.entries(prices).filter(([_, price]) => price !== undefined);
        for (let i = 0; i < exchangePrices.length; i++) {
            for (let j = i + 1; j < exchangePrices.length; j++) {
                const [exchange1, price1] = exchangePrices[i];
                const [exchange2, price2] = exchangePrices[j];
                const priceDifference = Math.abs(price1 - price2);
                const percentageDifference = (priceDifference / ((price1 + price2) / 2)) * 100;
                if (percentageDifference > 0.5) {
                    arbitrageOpportunities.push({
                        symbol,
                        exchange1,
                        price1,
                        exchange2,
                        price2,
                        percentageDifference: percentageDifference.toFixed(2)
                    });
                }
            }
        }
    }
    return arbitrageOpportunities;
}

app.get('/arbitrage', async (req, res) => {
    try {
        const symbolsPerExchange = await fetchSymbols();
        const commonSymbols = findCommonSymbols(symbolsPerExchange);
        const commonSymbolPrices = await fetchPricesForCommonSymbols(commonSymbols);
        const arbitrageOpportunities = checkArbitrageOpportunities(commonSymbolPrices);
        res.json(arbitrageOpportunities);
    } catch (e) {
        console.error("Error in /arbitrage route:", e);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

module.exports = app; // Export the app for Vercel
