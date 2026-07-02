function leven(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = new Array(m + 1).fill(null).map(() => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i][j - 1], Math.min(dp[i - 1][j], dp[i - 1][j - 1]));
            }
        }
    }
    return dp[m][n];
}
function replace(content, searchText, newText) {
    const len = searchText.length;
    if (len === 0 || len > content.length) {
        return false;
    }
    let bestPos = -1;
    let bestDist = Infinity;
    for (let i = 0; i <= content.length - len; i++) {
        const window = content.slice(i, i + len);
        const dist = leven(window, searchText);
        if (dist < bestDist) {
            bestDist = dist;
            bestPos = i;
        }
        if (dist === 0) break;
    }
    const threshold = Math.floor(len * 0.25);
    if (bestPos === -1 || bestDist > threshold) {
        return false;
    }
    const updated = content.slice(0, bestPos) + newText + content.slice(bestPos + len);
    return updated;
}
module.exports = { replace };