const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// === Schema MongoDB ===
const whitelistSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  respostas: Array,
  status: String,
  aprovadoPor: String,
  data: { type: Date, default: Date.now },
  canalLog: String,
});
const Whitelist = mongoose.model("Whitelist", whitelistSchema);

// === Configurações ===
const WL_START_CHANNEL_ID = process.env.WL_START_CHANNEL_ID;
const WL_REVIEW_CHANNEL_ID = process.env.WL_REVIEW_CHANNEL_ID;
const WL_APPROVED_CHANNEL_ID = process.env.WL_APPROVED_CHANNEL_ID;
const WL_REJECTED_CHANNEL_ID = process.env.WL_REJECTED_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

// === Função de log formatada ===
function log(msg) {
  console.log(`[${new Date().toLocaleString("pt-BR")}] ${msg}`);
}

// === Perguntas ===
const perguntas = [
  {
    chave: "nome_personagem",
    texto: "1️⃣ **Nome do personagem**\nEx: Nome e sobrenome do seu personagem no RP (este também será o seu usuário para fazer login no servidor).",
  },
  {
    chave: "idade_personagem",
    texto: "2️⃣ **Idade do personagem**\nQuantos anos seu personagem tem? A idade deve ser coerente com a história que se passa no servidor.",
  },
  {
    chave: "senha_servidor",
    texto: "3️⃣ **Senha de acesso ao servidor**\nEssa será sua senha para fazer login no servidor.",
  },
  {
    chave: "historia",
    texto: "4️⃣ **História do personagem**\nConte a história do seu personagem. Ela deve ser coerente com a lore do servidor.",
  },
  {
    chave: "steam_id",
    texto: "5️⃣ **Steam ID**\nInforme seu Steam ID.",
  },
  {
    chave: "discord_nick",
    texto: "6️⃣ **Discord Nick**\nSeu nick no Discord, exatamente como aparece (sem @).",
  },
  {
    chave: "origem",
    texto: "7️⃣ **Como você conheceu nosso servidor?**\nEx: pesquisando na internet, convite de um amigo etc.",
  },
];

// === Verificação de conexão Mongo ===
async function checkMongoConnection() {
  if (mongoose.connection.readyState !== 1) {
    log("⚠️ Banco de dados não está conectado. Tentando reconectar...");
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        tls: true,
        tlsAllowInvalidCertificates: true,
        authSource: "admin",
      });
      log("✅ Reconectado ao MongoDB com sucesso!");
    } catch (err) {
      log(`❌ Falha ao reconectar MongoDB: ${err.message}`);
      return false;
    }
  }
  return true;
}

// === Função para salvar no MongoDB com retry ===
async function salvarComRetry(dados, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      await Whitelist.create(dados);
      log(`💾 WL salva com sucesso no MongoDB (tentativa ${i}).`);
      return true;
    } catch (err) {
      log(`⚠️ Erro ao salvar WL (tentativa ${i}): ${err.message}`);
      if (i < tentativas) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      log("❌ Todas as tentativas de salvar no banco falharam.");
      return false;
    }
  }
}

// === Criação do botão inicial ===
async function setupWhitelistButton(client) {
  try {
    const canal = await client.channels.fetch(WL_START_CHANNEL_ID);
    if (!canal) return log("❌ Canal de whitelist não encontrado!");

    const mensagens = await canal.messages.fetch();
    if (mensagens.size > 0) {
      log("⚠️ Mensagem de início de whitelist já existe, não será recriada.");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle("📜 Sistema de Whitelist")
      .setDescription(
        "Clique no botão abaixo para iniciar seu processo de **Whitelist**. Um canal privado será criado para você responder as perguntas."
      )
      .setFooter({ text: "Caiman RP | Project Zomboid" });

    const botao = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("iniciar_wl")
        .setLabel("Iniciar Whitelist")
        .setStyle(ButtonStyle.Success)
    );

    await canal.send({ embeds: [embed], components: [botao] });
    log("📩 Mensagem de início de whitelist enviada com sucesso!");
  } catch (err) {
    log(`❌ Erro ao criar botão de whitelist: ${err.message}`);
  }
}

// === Início do fluxo de whitelist ===
async function iniciarWhitelist(interaction, client) {
  const guild = interaction.guild;
  const usuario = interaction.user;
  const nomeCanal = `wl-${usuario.username.toLowerCase()}`;

  try {
    const canal = await guild.channels.create({
      name: nomeCanal,
      type: 0,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: usuario.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel] },
      ],
    });

    log(`📁 Canal criado: #${nomeCanal}`);

    await interaction.reply({ content: "📩 Canal privado criado para você responder sua whitelist!", ephemeral: true });

    const respostas = {};
    let perguntaIndex = 0;

    const enviarPergunta = async () => {
      if (perguntaIndex >= perguntas.length) {
        const respostasArray = perguntas.map((p) => ({
          pergunta: p.texto,
          resposta: respostas[p.chave] || "Não respondido",
        }));

        const txtPath = path.join(__dirname, `WL_${usuario.username}.txt`);
        fs.writeFileSync(
          txtPath,
          respostasArray.map((r) => `${r.pergunta}\n${r.resposta}\n`).join("\n")
        );

        // Enviar embed + arquivo para canal da staff
        const canalStaff = await client.channels.fetch(WL_REVIEW_CHANNEL_ID);
        if (canalStaff) {
          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("📜 Nova Whitelist Recebida")
            .addFields(
              { name: "👤 Jogador", value: `<@${usuario.id}>`, inline: false },
              ...respostasArray.map((r) => ({
                name: r.pergunta.replace(/\*\*/g, ""),
                value: r.resposta,
              }))
            )
            .setFooter({ text: `${usuario.username} • ${new Date().toLocaleString("pt-BR")}` });

          const botoes = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`aprovar_${usuario.id}`)
              .setLabel("🟢 Aprovar WL")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`reprovar_${usuario.id}`)
              .setLabel("🔴 Reprovar WL")
              .setStyle(ButtonStyle.Danger)
          );

          await canalStaff.send({
            embeds: [embed],
            files: [txtPath],
            components: [botoes],
          });

          log(`📤 WL enviada para staff: ${usuario.username}`);
          fs.unlinkSync(txtPath);
        }

        // Salvar no MongoDB
        const dbOk = await checkMongoConnection();
        if (dbOk) {
          await salvarComRetry({
            userId: usuario.id,
            userName: respostas.nome_personagem || "Desconhecido",
            respostas: respostasArray,
            status: "pendente",
            data: new Date(),
            canalLog: WL_REVIEW_CHANNEL_ID,
          });
        }

        // Apagar canal do jogador
        await canal.delete().catch(() => {});
        log(`🧹 Canal #${nomeCanal} removido após envio da WL de ${usuario.username}`);

        return;
      }

      const pergunta = perguntas[perguntaIndex];
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("proxima").setLabel("Próxima").setStyle(ButtonStyle.Primary)
      );

      await canal.send({ content: pergunta.texto, components: [row] });

      const coletor = canal.createMessageCollector({ filter: (m) => m.author.id === usuario.id, max: 1, time: 300000 });

      coletor.on("collect", async (m) => {
        respostas[pergunta.chave] = m.content;
        perguntaIndex++;
        await enviarPergunta();
      });
    };

    await enviarPergunta();
  } catch (err) {
    log(`❌ Erro ao iniciar WL para ${usuario.username}: ${err.message}`);
    await interaction.reply({ content: "⚠️ Erro ao iniciar whitelist.", ephemeral: true });
  }
}

// === Gerenciar aprovação / reprovação ===
async function gerenciarWhitelist(interaction, client) {
  const { customId, user } = interaction;
  const [, userId] = customId.split("_");
  const membro = await client.users.fetch(userId);
  const whl = await Whitelist.findOne({ userId });

  if (!whl) {
    await interaction.reply({ content: "⚠️ WL não encontrada.", ephemeral: true });
    return;
  }

  if (customId.startsWith("aprovar_")) {
    const canalAprov = await client.channels.fetch(WL_APPROVED_CHANNEL_ID);
    const msg = [
      `> ✅ **Whitelist Aprovada**`,
      `> ════════════════════════`,
      `> **Jogador:** <@${userId}>`,
      `> **Personagem:** *${whl.userName}*`,
      `> ════════════════════════`,
      `> 🎉 Parabéns! Sua whitelist foi aprovada.`,
      `> Este é apenas o início do seu fim...`,
    ].join("\n");

    await canalAprov.send(msg);
    await interaction.reply({ content: "✅ WL aprovada e publicada!", ephemeral: true });
    whl.status = "aprovado";
    whl.aprovadoPor = user.username;
    await whl.save();

    log(`🟢 WL aprovada: ${whl.userName} por ${user.username}`);
  }

  if (customId.startsWith("reprovar_")) {
    await interaction.reply({ content: "✏️ Digite o motivo da reprovação no chat.", ephemeral: true });

    const coletor = interaction.channel.createMessageCollector({
      filter: (m) => m.author.id === user.id,
      max: 1,
      time: 300000,
    });

    coletor.on("collect", async (m) => {
      const motivo = m.content;
      const canalReprov = await client.channels.fetch(WL_REJECTED_CHANNEL_ID);
      const msg = [
        `> ❌ **Whitelist Reprovada**`,
        `> ════════════════════════`,
        `> **Jogador:** <@${userId}>`,
        `> ⚠️ Sua whitelist foi reprovada por: ${motivo}`,
        `> Corrija esses detalhes e envie sua WL novamente 😊`,
      ].join("\n");

      await canalReprov.send(msg);
      await interaction.followUp({ content: "❌ WL reprovada e publicada.", ephemeral: true });
      whl.status = "reprovado";
      whl.aprovadoPor = user.username;
      await whl.save();

      log(`🔴 WL reprovada: ${whl.userName} por ${user.username}`);
    });
  }
}

module.exports = {
  setupWhitelistButton,
  iniciarWhitelist,
  gerenciarWhitelist,
};