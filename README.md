# Avalanche deployment of Alchemix

- /contracts : contracts for the Alchemix protocol
- /tests : tests for the contracts

This repo is a fork of [Alchemix](https://github.com/alchemix-finance/alchemix-protocol)

## Development

Environment Variables:
copy the .env.example file and create a file called .env
```
cp .env.example .env
```

Install dependencies:
```
yarn
```

Run Hardhat Network that forks Avalanche Mainnet:
```
npx hardhat node
```

Test
```
yarn test
```

