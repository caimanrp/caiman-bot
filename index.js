const mongoose = require("mongoose");
require("dotenv").config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("🗄️ Conectado ao banco MongoDB da Square Cloud"))
  .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err));

// === Importações ===
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");
const fs = require("fs");

// === Configurações do cliente Discord ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// === Variáveis de ambiente ===
const {
  TOKEN,
  CHANNEL_ID,
  ROLE_ID,
  MASTER_ROLE_ID,
  PORT,
  REQUIRED_ROLE_ID, // cargo obrigatório para ganhar XP
} = process.env;

// === Arquivo de XP ===
const XP_FILE = "./xp.json";
let xpData = fs.existsSync(XP_FILE)
  ? JSON.parse(fs.readFileSync(XP_FILE, "utf8"))
  : {};

// === Função para XP necessário por nível ===
function getRequiredXP(level) {
  return Math.floor(50 * Math.pow(level, 2));
}

// === Quando o bot inicia ===
client.on("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// === Sistema de XP e menções ===
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;

  // --- SISTEMA DE MENÇÃO (dar cargo específico) ---
  if (message.channel.id === CHANNEL_ID && message.mentions.users.size > 0) {
    for (const [_, user] of message.mentions.users) {
      try {
        const member = await message.guild.members.fetch(user.id);
        await member.roles.add(ROLE_ID);
        console.log(`🎯 Cargo por menção adicionado para ${member.user.tag}`);
      } catch (err) {
        console.error("Erro ao adicionar cargo por menção:", err);
      }
    }
  }

  // --- Busca o membro e verifica se ele tem o cargo obrigatório ---
  const member = await message.guild.members.fetch(userId).catch(() => null);
  const temCargoObrigatorio = REQUIRED_ROLE_ID
    ? member?.roles.cache.has(REQUIRED_ROLE_ID)
    : true; // se não definido, todos ganham XP

  // --- COMANDO !meuxp ---
  if (message.content.toLowerCase() === "!meuxp") {
    if (!xpData[userId]) xpData[userId] = { xp: 0, level: 1 };
    const dados = xpData[userId];
    const requiredXP = getRequiredXP(dados.level);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📊 Progresso de ${message.author.username}`)
      .addFields(
        { name: "🏅 Nível atual", value: `${dados.level}`, inline: true },
        { name: "⚡ XP atual", value: `${dados.xp}/${requiredXP}`, inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }

  // --- COMANDO !rank ---
  if (message.content.toLowerCase() === "!rank") {
    try {
      const ranking = Object.entries(xpData)
        .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp)
        .slice(0, 10);

      if (ranking.length === 0) {
        return message.channel.send("📊 Ninguém tem XP ainda!");
      }

      let descricao = "";
      let posicao = 1;

      for (const [id, dados] of ranking) {
        let user;
        try {
          user = await client.users.fetch(id);
        } catch {
          console.log(`⚠️ Usuário ${id} não pôde ser carregado, ignorando.`);
          continue;
        }

        descricao += `**${posicao}. ${user.username}** — 🏅 Nível ${dados.level} • ${dados.xp} XP\n`;
        posicao++;
      }

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("🏆 Ranking dos mais ativos 🏆")
        .setDescription(descricao)
        .setFooter({ text: "Continue participando para subir no ranking!" })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      console.log("✅ Ranking enviado com sucesso!");
    } catch (err) {
      console.error("Erro no comando !rank:", err);
      message.channel.send("⚠️ Ocorreu um erro ao gerar o ranking.");
    }
    return;
  }

  // --- Se o usuário não tiver o cargo obrigatório, não ganha XP ---
  if (!temCargoObrigatorio) {
    console.log(`⛔ ${message.author.tag} não tem o cargo obrigatório — XP bloqueado.`);
    return; // permite comandos, mas bloqueia ganho de XP
  }

  // --- SISTEMA DE XP ---
  if (!xpData[userId]) xpData[userId] = { xp: 0, level: 1 };
  const xpGanho = Math.floor(Math.random() * 6) + 3;
  xpData[userId].xp += xpGanho;

  const requiredXP = getRequiredXP(xpData[userId].level);
  if (xpData[userId].xp >= requiredXP) {
    xpData[userId].level++;
    xpData[userId].xp = 0;

    message.channel.send(
      `🎉 Parabéns ${message.author}, você subiu para o nível ${xpData[userId].level}!`
    );

    // Cargo Mestre da Comunidade no nível 10
    if (xpData[userId].level === 10 && MASTER_ROLE_ID) {
      try {
        await member.roles.add(MASTER_ROLE_ID);

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("👑 Novo Mestre da Comunidade! 👑")
          .setDescription(
            `Parabéns ${message.author}, você alcançou o **Nível 10** e agora é um **MESTRE DA COMUNIDADE**! 🎉`
          )
          .setFooter({ text: "Obrigado por manter nossa comunidade viva!" })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
      } catch (err) {
        console.error("Erro ao dar cargo Mestre:", err);
      }
    }
  }

  // --- Salva XP no arquivo ---
  fs.writeFileSync(XP_FILE, JSON.stringify(xpData, null, 2));
}); // 👈 fecha o evento messageCreate aqui!

// === Servidor web (mantém vivo no Square Cloud) ===
const app = express();
app.get("/", (req, res) => res.send("🤖 Caiman BOT está rodando!"));
app.listen(PORT || 3000, () => console.log(`🌐 Servidor web ativo na porta ${PORT}`));

// === Login do bot ===
client.login(TOKEN);
