import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("PostgreSQL connection error:", err);
});

const server = new Server({
  name: "hocuspocus-server",
  port: 1234,

  onConnect: () => console.log("User connected"),
  onDisconnect: () => console.log("User disconnected"),

  extensions: [
    new Database({
      fetch: async (data) => {
        const documentUuid = data.documentName;
        console.log(`Loading document: ${documentUuid}`);

        try {
          const result = await pool.query(
            'SELECT "yjsState" FROM "Document" WHERE uuid = $1',
            [documentUuid],
          );

          if (result.rows[0]?.yjsState) {
            console.log(`Document found: ${documentUuid}`);
            return result.rows[0].yjsState;
          }

          console.log(`Document not found (will create new): ${documentUuid}`);
          return null;
        } catch (error) {
          console.error("Error loading document:", error);
          return null;
        }
      },

      store: async (data) => {
        try {
          const documentUuid = data.documentName;
          const state = data.state;

          await pool.query(
            `UPDATE "Document" 
             SET "yjsState" = $1
             WHERE uuid = $2`,
            [state, documentUuid],
          );

          console.log(`Document saved: ${documentUuid}`);
        } catch (error) {
          console.error("Error saving document:", error);
        }
      },
    }),
  ],
});

server.listen();
