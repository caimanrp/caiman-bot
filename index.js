// === Dependências ===
require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} = require("discord.js");

// === Handlers ===
const {
  setupWhitelistButton,
  iniciarWhitelist,
  gerenciarWhitelist,
} = require("./whitelistHandler");

// === Configuração do cliente Discord ===
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

// === Função de log ===
function log(msg) {
  console.log(`[${new Date().toLocaleString("pt-BR")}] ${msg}`);
}

// === Conexão com o MongoDB (compatível com Square Cloud) ===
mongoose
  .connect(process.env.MONGO_URI, {
    tls: true,
    tlsInsecure: true,                // 🔧 aceita certificados internos da Square Cloud
    connectTimeoutMS: 20000,          // ⏱ tempo maior de tentativa de conexão
    serverSelectionTimeoutMS: 20000,  // ⏱ evita falhas rápidas de seleção de servidor
    socketTimeoutMS: 45000,           // 🔄 garante estabilidade da conexão
    family: 4,                        // 🌐 força IPv4 (evita falhas com IPv6)
  })
  .then(() => log("🗄️ Conectado ao MongoDB com sucesso"))
  .catch((err) => log(`❌ Erro ao conectar ao MongoDB: ${err.message}`));

// === Servidor web (mantém o bot ativo na Square Cloud) ===
const app = express();
app.get("/", (req, res) => res.send("🤖 Caiman BOT está rodando!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => log(`🌐 Servidor web ativo na porta ${PORT}`));

// === Quando o bot fica online ===
client.once(Events.ClientReady, async () => {
  log(`✅ Bot conectado como ${client.user.tag}`);
  try {
    await setupWhitelistButton(client);
    log("🟢 Sistema de whitelist inicializado com sucesso!");
  } catch (err) {
    log(`⚠️ Erro ao inicializar whitelist: ${err.message}`);
  }
});

// === Interações com botões ===
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const { customId } = interaction;
    if (!customId) {
      log("⚠️ Interação sem customId detectada.");
      if (!interaction.replied) {
        await interaction.reply({
          content: "⚠️ Erro interno — interação inválida.",
          ephemeral: true,
        });
      }
      return;
    }

    // 🟢 Início da whitelist
    if (customId === "iniciar_wl") {
      await iniciarWhitelist(interaction, client);
      return;
    }

    // 🟠 Aprovação / Reprovação
    if (customId.startsWith("aprovar_") || customId.startsWith("reprovar_")) {
      await gerenciarWhitelist(interaction, client);
      return;
    }
  } catch (err) {
    log(`❌ Erro ao processar interação (${interaction.customId}): ${err.stack}`);

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "⚠️ Ocorreu um erro ao processar esta ação.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "⚠️ Ocorreu um erro ao processar esta ação.",
          ephemeral: true,
        });
      }
    } catch (e) {
      log(`⚠️ Falha ao responder erro de interação: ${e.message}`);
    }
  }
});

// === Tratamento global de erros ===
process.on("unhandledRejection", (reason) => {
  log(`🚨 Rejeição não tratada: ${reason}`);
});

process.on("uncaughtException", (err) => {
  log(`💥 Exceção não tratada: ${err.stack}`);
});

// === Login do bot ===
client
  .login(process.env.TOKEN)
  .then(() => log("🔑 Login realizado com sucesso."))
  .catch((err) => log(`❌ Erro ao logar o bot: ${err.message}`));
