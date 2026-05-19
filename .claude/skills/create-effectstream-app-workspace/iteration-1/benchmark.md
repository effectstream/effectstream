# Benchmark: create-effectstream-app — iteration-1

## create-effectstream-app (with skill)

- Pass rate: 100.0% ± 0.0%
- Duration: 371.9s ± 65.9s
- Tokens: 93518 ± 4482

### Per-eval breakdown

| eval | passed | total | rate | tokens | duration |
|---|---|---|---|---|---|
| migrate-paimaexample-chess | 19 | 19 | 100% | 88,363 | 308.0s |
| new-evm-minimal | 20 | 20 | 100% | 95,699 | 439.7s |
| new-multichain-evm-midnight | 18 | 18 | 100% | 96,492 | 367.9s |

## Baseline (no skill)

- Pass rate: 89.9% ± 13.2%
- Duration: 310.6s ± 58.0s
- Tokens: 66842 ± 18299

### Per-eval breakdown

| eval | passed | total | rate | tokens | duration |
|---|---|---|---|---|---|
| migrate-paimaexample-chess | 18 | 19 | 95% | 84,293 | 360.8s |
| new-evm-minimal | 15 | 20 | 75% | 68,433 | 323.8s |
| new-multichain-evm-midnight | 18 | 18 | 100% | 47,799 | 247.2s |
