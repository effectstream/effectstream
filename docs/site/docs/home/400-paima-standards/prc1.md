# PRC-1: Paima Achievement Interface

*   **Core Idea**: An open standard API for exposing in-game achievements in a universal format.
*   **Problem Solved**: Most games have their own proprietary achievement systems, making it difficult for third-party tools and community platforms to create cross-game experiences. PRC-1 provides a single, consistent format that any dApp can adopt, enabling interoperability.
*   **How it Works (High Level)**: A Paima Engine node that implements PRC-1 exposes a set of standardized HTTP `GET` endpoints. These endpoints serve JSON data describing all available achievements in a game, as well as the specific progress of individual players.
*   **Key Components**:
    *   **Endpoint `/achievements/public/list`**: Returns a list of all possible achievements, their names, descriptions, and global completion stats.
    *   **Endpoint `/achievements/wallet/:wallet`**: Returns the progress for a specific player, detailing which achievements they have unlocked, the completion date, and their progress towards others (e.g., 7/10 battles won).

