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
    const symbolsPerExchange = {};
    for (const exchange of exchanges) {
        try {
            const symbols = await exchange.loadMarkets();
            symbolsPerExchange[exchange.id] = Object.keys(symbols);
        } catch (e) {
            console.error(`Error fetching markets from ${exchange.id}:`, e);
            symbolsPerExchange[exchange.id] = [];
        }
    }
    return symbolsPerExchange;
}

function findCommonSymbols(symbolsPerExchange) {
    let commonSymbols = new Set(symbolsPerExchange[exchanges[0].id]);
    for (const symbols of Object.values(symbolsPerExchange)) {
        commonSymbols = new Set([...commonSymbols].filter(x => symbols.includes(x)));
    }
    return commonSymbols;
}

async function fetchPricesForCommonSymbols(commonSymbols) {
    const commonSymbolPrices = {};
    for (const symbol of commonSymbols) {
        commonSymbolPrices[symbol] = {};
        for (const exchange of exchanges) {
            try {
                const ticker = await exchange.fetchTicker(symbol);
                commonSymbolPrices[symbol][exchange.id] = ticker['last'];
            } catch (e) {
                console.error(`Error fetching ticker for ${symbol} from ${exchange.id}:`, e);
                // Remove symbol for the current exchange to avoid issues later
                delete commonSymbolPrices[symbol][exchange.id];
            }
        }
    }
    return commonSymbolPrices;
}

function checkArbitrageOpportunities(commonSymbolPrices) {
    const arbitrageOpportunities = [];
    for (const [symbol, prices] of Object.entries(commonSymbolPrices)) {
        const exchangePrices = Object.entries(prices);
        for (let i = 0; i < exchangePrices.length; i++) {
            for (let j = i + 1; j < exchangePrices.length; j++) {
                const [exchange1, price1] = exchangePrices[i];
                const [exchange2, price2] = exchangePrices[j];
                if (price1 !== undefined && price2 !== undefined) {
                    const priceDifference = Math.abs(price1 - price2);
                    const percentageDifference = (priceDifference / ((price1 + price2) / 2)) * 100;
                    if (percentageDifference > 0.5) {
                        arbitrageOpportunities.push({
                            symbol: symbol,
                            exchange1: exchange1,
                            price1: price1,
                            exchange2: exchange2,
                            price2: price2,
                            percentageDifference: percentageDifference.toFixed(2)
                        });
                    }
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
