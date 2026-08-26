import { createServer } from "./server.js";
import dotenv from "dotenv";

dotenv.config();

const port = parseInt(process.env.PORT || "4000", 10);
const app = createServer();

app.listen(port, () => 
  console.log("Backend is working")
);
