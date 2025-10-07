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
  ],
  partials: [Partials.Channel],
});

// === Função de log ===
function log(msg) {
  console.log(`[${new Date().toLocaleString("pt-BR")}] ${msg}`);
}

// === Conexão com o MongoDB Atlas ===
if (!process.env.MONGO_URI) {
  console.error("❌ ERRO: Variável MONGO_URI não foi carregada!");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => log("🗄️ Conectado ao MongoDB Atlas com sucesso"))
  .catch((err) => log(`❌ Erro ao conectar ao MongoDB Atlas: ${err.message}`));

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

// === Interações (botões da whitelist) ===
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const { customId } = interaction;
    if (!customId) return;

    if (customId === "iniciar_wl") {
      await iniciarWhitelist(interaction, client);
      return;
    }

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

// === Sistema: atribuir cargo quando alguém é mencionado no canal de aprovados ===
client.on(Events.MessageCreate, async (message) => {
  try {
    // Ignorar bots
    if (message.author.bot) return;

    const aprovadosChannelId = process.env.WL_APPROVED_CHANNEL_ID;
    const cargoSobreviventeId = process.env.APPROVED_ROLE_ID;

    if (!aprovadosChannelId || !cargoSobreviventeId) return;

    // Apenas mensagens no canal de aprovados
    if (message.channel.id !== aprovadosChannelId) return;

    // Procurar menções na mensagem
    const mencionados = message.mentions.users;
    if (!mencionados.size) return;

    const guild = message.guild;
    for (const [id, user] of mencionados) {
      try {
        const membro = await guild.members.fetch(id);
        if (membro.roles.cache.has(cargoSobreviventeId)) {
          log(`⚙️ ${membro.user.tag} já possui o cargo de sobrevivente.`);
          continue;
        }
        await membro.roles.add(cargoSobreviventeId);
        log(`✅ Cargo de sobrevivente adicionado a ${membro.user.tag}`);
      } catch (err) {
        log(`❌ Erro ao adicionar cargo para ${user.tag}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`❌ Erro no sistema de atribuição de cargo: ${err.message}`);
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
