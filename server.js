import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import pg from "pg";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL db");
});

pool.on("error", (err) => {
  console.error("PostgreSQL connection error:", err);
});

const server = new Server({
  name: "hocuspocus-server",
  port: 1234,
  address: "0.0.0.0",

  onConnect: () => console.log("User connected"),
  onDisconnect: () => console.log("User disconnected"),
  onChange: () => console.log("Change detected"),

  async onAuthenticate({ token, documentName }) {
    if (!token) {
      throw new Error("No token provided");
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.documentUuid !== documentName) {
        throw new Error("Token document mismatch");
      }

      // Verify document exists and user has access
      const result = await pool.query(
        `SELECT d.id, d."authorId", d."teamId"
       FROM "Document" d
       WHERE d.uuid = $1
       AND (
         d."authorId" = $2 
         OR EXISTS (
           SELECT 1 FROM "Membership" m 
           WHERE m."teamId" = d."teamId" 
           AND m."userId" = $2
         )
       )`,
        [documentName, decoded.userId],
      );

      if (result.rows.length === 0) {
        throw new Error("Access denied");
      }

      const document = result.rows[0];

      return {
        user: {
          id: decoded.userId,
          teamId: document.teamId,
          documentId: document.id,
          documentUuid: documentName,
        },
      };
    } catch (error) {
      console.error("Authentication failed:", error.message);
      throw new Error("Authentication failed");
    }
  },

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
          console.log("Inside saving");
          const documentUuid = data.documentName;
          const state = data.state;

          await pool.query(
            `UPDATE "Document" 
             SET "yjsState" = $1, "updatedAt" = NOW() AT TIME ZONE 'UTC'
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
