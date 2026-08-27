import { createServer } from "./server.js";
import dotenv from "dotenv";

dotenv.config();

const port = parseInt(process.env.PORT || "5000", 10);
const app = createServer();

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
