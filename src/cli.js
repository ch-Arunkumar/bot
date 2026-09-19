import readline from 'readline';
import chalk from 'chalk';
import { getMarketStatus, getEquityQuote, getGainersAndLosers, getAllIndices, getHistorical } from './nseService.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function formatPrice(val) {
    if (val === undefined || val === null) return 'N/A';
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function showMarketOverview() {
    console.log(chalk.bold.cyan('\n📊 [NSE Market Overview]'));
    const statusRes = await getMarketStatus();
    if (statusRes.success && statusRes.data && statusRes.data.marketState) {
        statusRes.data.marketState.forEach(m => {
            const statusColor = m.marketStatus === 'Open' ? chalk.green : chalk.yellow;
            console.log(`  • ${chalk.bold(m.market)}: ${statusColor(m.marketStatus)} (${m.tradeDate || ''})`);
        });
    }

    console.log(chalk.bold.cyan('\n📈 [Major Indices]'));
    const indicesRes = await getAllIndices();
    if (indicesRes.success && indicesRes.data) {
        const keyIndices = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY MIDCAP 50'];
        const matched = indicesRes.data.filter(i => keyIndices.includes(i.indexSymbol || i.index));
        matched.forEach(idx => {
            const change = idx.percentChange ?? idx.pChange ?? 0;
            const changeColor = change >= 0 ? chalk.green : chalk.red;
            const sign = change >= 0 ? '+' : '';
            console.log(`  • ${chalk.bold(idx.indexSymbol || idx.index)}: ₹${formatPrice(idx.last)} (${changeColor(`${sign}${formatPrice(change)}%`)})`);
        });
    }

    console.log(chalk.bold.cyan('\n🚀 [NIFTY 50 Top Movers]'));
    const movers = await getGainersAndLosers('NIFTY 50');
    if (movers.success) {
        console.log(chalk.green.bold('  Top Gainers:'));
        movers.gainers.forEach(g => {
            console.log(`    ▲ ${chalk.bold(g.symbol)}: ₹${formatPrice(g.lastPrice)} (+${g.pChange}%)`);
        });
        console.log(chalk.red.bold('  Top Losers:'));
        movers.losers.forEach(l => {
            console.log(`    ▼ ${chalk.bold(l.symbol)}: ₹${formatPrice(l.lastPrice)} (${l.pChange}%)`);
        });
    }
}

async function searchStock(symbol) {
    console.log(chalk.yellow(`\nFetching live quote for ${symbol.toUpperCase()}...`));
    const quote = await getEquityQuote(symbol);

    if (!quote.success) {
        console.log(chalk.red(`❌ Error: ${quote.error}`));
        return;
    }

    const { info, priceInfo, securityInfo } = quote;
    const change = priceInfo?.pChange || 0;
    const changeColor = change >= 0 ? chalk.green : chalk.red;
    const sign = change >= 0 ? '+' : '';

    console.log(chalk.bold.blue(`\n======================================================`));
    console.log(chalk.bold.white(`  ${info?.companyName || symbol.toUpperCase()} (${quote.symbol})`));
    console.log(chalk.gray(`  Industry: ${info?.industry || 'N/A'} | ISIN: ${info?.isin || 'N/A'}`));
    console.log(chalk.bold.blue(`======================================================`));
    console.log(`  • Current Price: ${chalk.bold.white(`₹${formatPrice(priceInfo?.lastPrice)}`)} [${changeColor(`${sign}${formatPrice(change)}%`)}]`);
    console.log(`  • Day Range:     ₹${formatPrice(priceInfo?.intraDayHighLow?.min)} - ₹${formatPrice(priceInfo?.intraDayHighLow?.max)}`);
    console.log(`  • 52-Week Range: ₹${formatPrice(priceInfo?.weekHighLow?.min)} - ₹${formatPrice(priceInfo?.weekHighLow?.max)}`);
    console.log(`  • Open / Prev:   ₹${formatPrice(priceInfo?.open)} / ₹${formatPrice(priceInfo?.previousClose)}`);
    console.log(`  • VWAP:          ₹${formatPrice(priceInfo?.vwap)}`);
    console.log(chalk.bold.blue(`======================================================\n`));
}

function printMenu() {
    console.log(chalk.cyan.bold('\n--- NSE INDIA BOT CLI ---'));
    console.log('1. View Market Overview & Top Movers');
    console.log('2. Search Stock Quote (e.g., RELIANCE, TCS, INFY, TATAMOTORS)');
    console.log('3. Exit');
}

function promptUser() {
    printMenu();
    rl.question(chalk.yellow('\nSelect an option [1-3] or type a Stock Symbol: '), async (answer) => {
        const input = answer.trim();
        if (input === '1') {
            await showMarketOverview();
            promptUser();
        } else if (input === '2') {
            rl.question(chalk.yellow('Enter NSE Stock Symbol: '), async (sym) => {
                if (sym.trim()) {
                    await searchStock(sym.trim());
                }
                promptUser();
            });
        } else if (input === '3' || input.toLowerCase() === 'exit') {
            console.log(chalk.green('Goodbye! Happy trading! 🚀'));
            rl.close();
            process.exit(0);
        } else if (input.length > 0) {
            // Treat directly as symbol
            await searchStock(input);
            promptUser();
        } else {
            promptUser();
        }
    });
}

promptUser();
