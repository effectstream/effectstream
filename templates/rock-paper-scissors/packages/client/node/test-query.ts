import { getConnection } from "@paimaexample/db";
import { createLobby } from "@rock-paper-scissors/db";

const dbConn = getConnection();

const params = {
  lobby_id: "test123",
  num_of_rounds: 3,
  round_length: 5,
  round_winner: "",
  created_at: new Date(),
  creation_block_height: 1,
  hidden: false,
  practice: false,
  lobby_creator: "0x0000000000000000000000000000000000000001",
  lobby_state: "open",
  latest_match_state: "{}",
};

console.log("createLobby type:", typeof createLobby);
console.log("createLobby.run type:", typeof createLobby.run);
console.log("createLobby.queryIR:", createLobby.queryIR);

try {
  const result = await createLobby.run(params, dbConn);
  console.log("Success!",result);
} catch (error) {
  console.error("Error:", error);
}

await dbConn.end();
