/**
 * Scanner Rule Engine
 *
 * Implements Chartink-style Rule:
 * Condition 1: Abs ( Daily Open ) > 100
 * AND
 * Condition 2: daily volume > 12 months ago high
 *
 * (Isolated logic function to allow easy verification and changes)
 */

export const RULE_NAME = 'VOLUME_BREAKOUT';

/**
 * Evaluates whether a stock meets the scanner condition
 *
 * @param {Object} params
 * @param {number} params.dailyOpen - Current daily open price
 * @param {number} params.dailyVolume - Current day cumulative traded volume
 * @param {number} params.referenceHigh - 12 months ago high price (chTradeHighPrice)
 * @returns {Object} { matched: boolean, ruleName: string, reason: string, details: Object }
 */
export function evaluateVolumeBreakoutRule({ dailyOpen, dailyVolume, referenceHigh }) {
    const absDailyOpen = Math.abs(Number(dailyOpen) || 0);
    const volume = Number(dailyVolume) || 0;
    const refHigh = Number(referenceHigh) || 0;

    // Condition 1: Abs ( Daily Open ) > 100
    const cond1 = absDailyOpen > 100;

    // Condition 2: daily volume > 12 months ago high
    // (exact semantic: current daily volume greater than the historical reference high value)
    const cond2 = volume > refHigh;

    const matched = cond1 && cond2;

    return {
        matched,
        ruleName: RULE_NAME,
        condition1: {
            description: 'Abs ( Daily Open ) > 100',
            actual: absDailyOpen,
            passed: cond1
        },
        condition2: {
            description: 'daily volume > 12 months ago high',
            actualVolume: volume,
            referenceHigh: refHigh,
            passed: cond2
        },
        details: {
            dailyOpen: absDailyOpen,
            dailyVolume: volume,
            referenceHigh: refHigh
        }
    };
}
