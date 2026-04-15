# How It Works: The VelumX Mechanism

VelumX removes the friction of "Gas Fees" on the Stacks blockchain through a sophisticated Paymaster and Sponsorship architecture. Here is the step-by-step breakdown of how we achieve gasless transactions.

## 1. The Challenge (The "STX Problem")
In standard Stacks transactions, the user must pay a fee in STX. If a new user just bridged USDC to Stacks, they have no STX, and therefore cannot use their USDC. They are "stuck."

## 2. The Solution (The "Sponsorship Pattern")
VelumX leverages Stacks' native **Sponsored Transactions**. In this model, the transaction has two roles:
*   **The Originator (User)**: Defines the intent (e.g., "Swap 10 USDC for STX").
*   **The Sponsor (VelumX Relayer)**: Pays the actual STX fee to the network.

## 3. The Step-by-Step Flow

### Step A: Intent & Estimation
The user initiates an action in the dApp. The VelumX SDK calls our Relayer to estimate the STX gas cost and converts it to **USDCx** (using real-time STX/USD price feeds + 8% markup).

### Step B: The Multi-Signature Handshake
1.  **User Signs**: The user signs the transaction payload. This signature confirms their intent but does *not* include the gas fee.
2.  **Relayer Signs**: The partially signed transaction is sent to the VelumX Relayer. The Relayer adds its own signature to the "Fee" section of the transaction.

### Step C: On-Chain Execution
The transaction is broadcast to the Stacks network. 
*   The **Network** sees that the Relayer is paying the gas.
*   The **Smart Contract** (simple-paymaster-v1) executes the logic.

### Step D: The Paymaster Settlement
Inside our Clarity smart contract, two things happen simultaneously:
1.  **Fee Collection**: The contract transfers the estimated USDCx from the User's wallet to the Relayer's Treasury.
2.  **Core Transaction**: The contract then executes the user's original intent (Bridge or Swap).

## 4. Why This Matters
*   **No Centralized Custody**: The Relayer never touches the user's main assets. It only receives the fee if the transaction succeeds.
*   **Atomic Success**: If the fee transfer fails, the entire transaction fails. The Relayer is never "cheated" out of gas.
*   **Web2 Experience**: Users experience the "Buy" button without ever worrying about the "Gas" button.

---

## Technical Summary
*   **Protocol**: Stacks Native Sponsorship (Auth Type 0x04)
*   **Contract**: `simple-paymaster-v1`
*   **Security**: Non-custodial, deterministic sub-key derivation for data isolation.
