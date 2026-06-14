require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
require("@nomicfoundation/hardhat-toolbox");

const deployerKey =
  process.env.ROUTER_PRIVATE_KEY ??
  "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      accounts: [deployerKey],
      chainId: 84532,
    },
  },
};
