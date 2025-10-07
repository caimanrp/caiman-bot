const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const { setupWhitelistButton, iniciarWhitelist, gerenciarWhitelist } = require("./whitelistHandler");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("🗄️ Conectado ao MongoDB"))
  .catch((err) => console.error("❌ Erro MongoDB:", err));

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await setupWhitelistButton(client);
});

// Interações com botões
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId === "iniciar_wl") return iniciarWhitelist(interaction, client);
  if (interaction.customId.startsWith("aprovar_") || interaction.customId.startsWith("reprovar_"))
    return gerenciarWhitelist(interaction, client);
});

// Servidor web keepalive
const app = express();
app.get("/", (req, res) => res.send("🤖 Caiman BOT está rodando!"));
app.listen(process.env.PORT || 3000, () => console.log(`🌐 Servidor ativo`));

client.login(process.env.TOKEN);
