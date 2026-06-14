// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title InstitutionalPool — per-user credits + TEE-attested Uniswap V3 settlement (Base Sepolia)
contract InstitutionalPool {
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event OwnerWithdrawn(address indexed token, address indexed to, uint256 amount);
    event AttestationRecorded(bytes32 indexed vcHash, address indexed submitter);
    event ShadowFill(
        bytes32 indexed routeId,
        bytes32 indexed vcHash,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 feeTier
    );

    address public immutable owner;
    address public immutable router;
    address public immutable swapRouter;

    mapping(bytes32 => bool) public usedAttestations;
    mapping(address => mapping(address => uint256)) public credits;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "not router");
        _;
    }

    constructor(address router_, address swapRouter_) {
        require(router_ != address(0) && swapRouter_ != address(0), "zero address");
        owner = msg.sender;
        router = router_;
        swapRouter = swapRouter_;
    }

    function creditOf(address user, address token) external view returns (uint256) {
        return credits[user][token];
    }

    /// @notice Deposit ERC20 and credit the caller for dark-pool swaps.
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "zero amount");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        credits[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Withdraw unused credited balance back to the user wallet.
    function withdraw(address token, uint256 amount) external {
        require(amount > 0, "zero amount");
        require(credits[msg.sender][token] >= amount, "insufficient credit");
        credits[msg.sender][token] -= amount;
        require(IERC20(token).transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Owner sweeps stray tokens not tracked in user credits (emergency only).
    function ownerWithdraw(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "zero amount");
        require(IERC20(token).transfer(msg.sender, amount), "transfer failed");
        emit OwnerWithdrawn(token, msg.sender, amount);
    }

    /// @notice Router relay: debit user credit, swap via Uniswap, deliver WETH to user wallet.
    function executeWithAttestation(
        bytes32 vcHash,
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 feeTier
    ) external onlyRouter returns (bytes32 routeId) {
        require(vcHash != bytes32(0), "empty attestation");
        require(!usedAttestations[vcHash], "attestation replay");
        require(user != address(0), "zero user");
        require(amountIn > 0 && minAmountOut > 0, "zero amount");
        require(credits[user][tokenIn] >= amountIn, "insufficient user credit");
        require(IERC20(tokenIn).balanceOf(address(this)) >= amountIn, "insufficient pool balance");

        usedAttestations[vcHash] = true;
        credits[user][tokenIn] -= amountIn;

        routeId = keccak256(abi.encodePacked(vcHash, user, tokenIn, tokenOut, amountIn, feeTier, block.timestamp));

        emit AttestationRecorded(vcHash, msg.sender);

        require(IERC20(tokenIn).approve(swapRouter, amountIn), "approve failed");

        uint256 amountOut = ISwapRouter02(swapRouter).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: feeTier,
                recipient: user,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        require(amountOut >= minAmountOut, "slippage exceeded");

        emit ShadowFill(routeId, vcHash, user, tokenIn, tokenOut, amountIn, amountOut, feeTier);
    }
}
