/**
 * One-time Google OAuth2 setup script.
 * Run: node scripts/oauth-setup.js
 * Follow the instructions to get a refresh token for Google Calendar.
 */

import { google } from "googleapis";
import * as readline from "readline";
import dotenv from "dotenv";
dotenv.config();

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n=== Google OAuth2 Setup ===");
console.log("1. Ouvre cette URL dans ton navigateur (connecté au compte DigiCitoyen) :");
console.log("\n" + authUrl + "\n");
console.log("2. Autorise l'accès, puis copie le code depuis l'URL de redirection.");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("3. Colle le code ici : ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\n=== Tokens obtenus ===");
    console.log("Ajoute dans ton .env :");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    if (!tokens.refresh_token) {
      console.log("\nATTENTION: Pas de refresh_token. Assure-toi d'avoir révoqué l'accès précédent sur https://myaccount.google.com/permissions");
    }
  } catch (err) {
    console.error("Erreur:", err.message);
  }
});
