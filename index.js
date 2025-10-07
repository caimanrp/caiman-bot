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

const {
  setupWhitelistButton,
  iniciarWhitelist,
  gerenciarWhitelist,
} = require("./whitelistHandler");

// === Função de log formatado ===
function log(msg) {
  console.log(`[${new Date().toLocaleString("pt-BR")}] ${msg}`);
}

// === Verificação das variáveis de ambiente ===
if (!process.env.TOKEN) {
  console.error("❌ ERRO: TOKEN do bot não foi definido no ambiente!");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("❌ ERRO: Variável MONGO_URI não foi carregada!");
  console.error("Verifique se ela está configurada no painel da Square Cloud.");
  process.exit(1);
}

// === Inicialização do cliente Discord ===
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

// === Conexão com o MongoDB Atlas ===
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
  })
  .then(() => log("🗄️ Conectado ao MongoDB Atlas com sucesso"))
  .catch((err) => {
    log(`❌ Erro ao conectar ao MongoDB Atlas: ${err.message}`);
  });

// === Servidor Web (mantém o bot ativo na Square Cloud) ===
const app = express();
app.get("/", (req, res) => res.send("🤖 Caiman BOT está rodando!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => log(`🌐 Servidor web ativo na porta ${PORT}`));

// === Evento: Quando o bot ficar online ===
client.once(Events.ClientReady, async () => {
  log(`✅ Bot conectado como ${client.user.tag}`);
  try {
    await setupWhitelistButton(client);
    log("🟢 Sistema de whitelist inicializado com sucesso!");
  } catch (err) {
    log(`⚠️ Erro ao inicializar whitelist: ${err.message}`);
  }
});

// === Evento: Interações (botões) ===
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