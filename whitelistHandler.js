const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const mongoose = require("mongoose");

// === Schema do MongoDB ===
const whitelistSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  respostas: Array,
  status: String,
  aprovadoPor: String,
  data: Date,
  canalLog: String,
});
const Whitelist = mongoose.model("Whitelist", whitelistSchema);

// === Variáveis de ambiente ===
const WL_START_CHANNEL_ID = process.env.WL_START_CHANNEL_ID;
const WL_REVIEW_CHANNEL_ID = process.env.WL_REVIEW_CHANNEL_ID;
const WL_APPROVED_CHANNEL_ID = process.env.WL_APPROVED_CHANNEL_ID;
const WL_REJECTED_CHANNEL_ID = process.env.WL_REJECTED_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const RCON_CHANNEL_ID = process.env.RCON_CHANNEL_ID;
const APPROVED_ROLE_ID = process.env.APPROVED_ROLE_ID; // 🆕 cargo que o usuário deve receber ao ser aprovado

// === Lista de perguntas ===
const perguntas = [
  {
    pergunta: "Nome do personagem",
    descricao:
      "Ex: Nome e sobrenome do seu personagem no RP (este também será o seu usuário para login no servidor).",
  },
  {
    pergunta: "Idade do personagem",
    descricao:
      "Quantos anos seu personagem tem? A idade deve ser coerente com a história do servidor. Leia o canal #📖・lore-servidor.",
  },
  {
    pergunta: "Senha de acesso ao servidor",
    descricao: "Essa será sua senha para fazer login no servidor.",
  },
  {
    pergunta: "História do personagem",
    descricao:
      "Conte a história do seu personagem. Ela deve ser coerente com a lore do servidor.",
  },
  {
    pergunta: "Steam ID",
    descricao: "Informe seu SteamID.",
  },
  {
    pergunta: "Como você conheceu nosso servidor?",
    descricao: "Pesquisando, convite de amigo, etc.",
  },
];

// === Setup inicial ===
async function setupWhitelistButton(client) {
  const channel = await client.channels.fetch(WL_START_CHANNEL_ID);
  if (!channel) return console.error("❌ Canal de whitelist não encontrado.");

  const mensagens = await channel.messages.fetch();
  if (mensagens.size > 0) {
    console.log("⚠️ Mensagem de início de whitelist já existe, não será recriada.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle("📝 Iniciar Whitelist")
    .setDescription(
      "Clique no botão abaixo para iniciar sua whitelist.\n\nO bot criará um canal privado onde você responderá às perguntas."
    );

  const botao = new ButtonBuilder()
    .setCustomId("iniciar_wl")
    .setLabel("📜 Iniciar Whitelist")
    .setStyle(ButtonStyle.Success);

  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(botao)],
  });

  console.log("📩 Mensagem de início de whitelist enviada com sucesso!");
}

// === Iniciar whitelist ===
async function iniciarWhitelist(interaction, client) {
  try {
    const user = interaction.user;
    const guild = interaction.guild;

    const canalPrivado = await guild.channels.create({
      name: `wl-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel] },
      ],
    });

    await interaction.reply({
      content: `📩 Canal privado criado: <#${canalPrivado.id}>`,
      ephemeral: true,
    });

    console.log(`📁 Canal criado: #${canalPrivado.name}`);

    let respostas = [];

    const fazerPergunta = async (i = 0) => {
      if (i >= perguntas.length) {
        const arquivo = `./wl_${user.username}_${Date.now()}.txt`;
        const conteudo = respostas.map((r) => `${r.pergunta}: ${r.resposta}`).join("\n\n");
        fs.writeFileSync(arquivo, conteudo);

        const canalStaff = await client.channels.fetch(WL_REVIEW_CHANNEL_ID);
        if (!canalStaff) throw new Error("Canal de revisão não encontrado.");

        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("📜 Nova Whitelist Recebida")
          .setDescription(`**Jogador:** ${user.username}\n**ID:** ${user.id}`)
          .addFields(
            respostas.map((r) => ({
              name: r.pergunta,
              value: r.resposta || "Não respondido.",
            }))
          )
          .setFooter({
            text: `Enviada em ${new Date().toLocaleString("pt-BR")}`,
          });

        const aprovar = new ButtonBuilder()
          .setCustomId(`aprovar_${user.id}`)
          .setLabel("🟢 Aprovar WL")
          .setStyle(ButtonStyle.Success);

        const reprovar = new ButtonBuilder()
          .setCustomId(`reprovar_${user.id}`)
          .setLabel("🔴 Reprovar WL")
          .setStyle(ButtonStyle.Danger);

        await canalStaff.send({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(aprovar, reprovar)],
          files: [arquivo],
        });

        fs.unlinkSync(arquivo);

        await new Whitelist({
          userId: user.id,
          userName: respostas[0]?.resposta || "Desconhecido",
          respostas,
          status: "pendente",
          data: new Date(),
          canalLog: canalStaff.id,
        }).save();

        await canalPrivado.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("📤 Whitelist Enviada!")
              .setDescription("Sua whitelist foi enviada para análise.\nA equipe da staff revisará em breve."),
          ],
        });

        await new Promise((r) => setTimeout(r, 8000));
        await canalPrivado.delete().catch(() => {});
        console.log(`🧹 Canal ${canalPrivado.name} removido após envio da WL de ${user.username}`);
        return;
      }

      const perguntaAtual = perguntas[i];
      const embedPergunta = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📝 ${perguntaAtual.pergunta}`)
        .setDescription(perguntaAtual.descricao)
        .setFooter({ text: `Pergunta ${i + 1} de ${perguntas.length}` });

      await canalPrivado.send({ embeds: [embedPergunta] });

      const coletor = canalPrivado.createMessageCollector({
        filter: (m) => m.author.id === user.id,
        max: 1,
        time: 300000,
      });

      coletor.on("collect", async (msg) => {
        respostas.push({ pergunta: perguntaAtual.pergunta, resposta: msg.content });
        await fazerPergunta(i + 1);
      });

      coletor.on("end", (c, reason) => {
        if (reason === "time") {
          canalPrivado.send("⏰ Tempo esgotado. Reinicie a whitelist se desejar tentar novamente.");
          canalPrivado.delete().catch(() => {});
        }
      });
    };

    await canalPrivado.send({
      content: `👋 Olá ${user.username}! Vamos começar sua whitelist. Responda cada pergunta abaixo.`,
    });

    await fazerPergunta(0);
  } catch (err) {
    console.error("❌ Erro ao iniciar whitelist:", err);
  }
}

// === Gerenciar whitelist (aprovar/reprovar) ===
async function gerenciarWhitelist(interaction, client) {
  try {
    const admin = interaction.user;
    const userId = interaction.customId.split("_")[1];
    const aprovando = interaction.customId.startsWith("aprovar_");

    const wl = await Whitelist.findOne({ userId, status: "pendente" }).sort({ data: -1 });
    if (!wl) return interaction.reply({ content: "⚠️ Nenhuma WL pendente encontrada.", ephemeral: true });

    const user = await client.users.fetch(userId);
    const guild = client.guilds.cache.first();

    if (aprovando) {
      const canalAprovados = await client.channels.fetch(WL_APPROVED_CHANNEL_ID);
      await canalAprovados.send({
        content:
          `> ✅ **Whitelist Aprovada**\n` +
          `> ════════════════════════\n` +
          `> **Jogador:** <@${userId}>\n` +
          `> **Personagem:** *${wl.userName}*\n` +
          `> ════════════════════════\n` +
          `> 🎉 Parabéns! Sua whitelist foi aprovada.\n` +
          `> Este é apenas o início do seu fim...`,
      });

      // 🟢 Atribuir cargo aprovado
      if (APPROVED_ROLE_ID) {
        try {
          const membro = await guild.members.fetch(userId);
          await membro.roles.add(APPROVED_ROLE_ID);
          console.log(`✅ Cargo de aprovado adicionado a ${membro.user.tag}`);
        } catch (err) {
          console.error(`⚠️ Erro ao atribuir cargo aprovado: ${err.message}`);
        }
      }

      // 🟢 Registrar aprovação
      wl.status = "aprovado";
      wl.aprovadoPor = admin.username;
      await wl.save();

      // 🟢 Enviar comando RCON
      const senha = wl.respostas.find((r) => r.pergunta.includes("Senha"))?.resposta || "sem_senha";
      const comandoRcon = `/rcon adduser nick:${wl.userName} senha:${senha}`;
      const canalRcon = await client.channels.fetch(RCON_CHANNEL_ID);
      if (canalRcon) {
        await canalRcon.send(comandoRcon);
        console.log(`⚙️ Comando RCON enviado: ${comandoRcon}`);
      }

      await interaction.reply({ content: `✅ WL aprovada por ${admin.username}.`, ephemeral: true });
    } else {
      await interaction.reply({ content: "✏️ Digite o motivo da reprovação (você tem 2 minutos):", ephemeral: true });

      const filtro = (m) => m.author.id === admin.id;
      const coletor = interaction.channel.createMessageCollector({ filter: filtro, time: 120000, max: 1 });

      coletor.on("collect", async (msg) => {
        const motivo = msg.content;
        const canalReprovados = await client.channels.fetch(WL_REJECTED_CHANNEL_ID);

        await canalReprovados.send({
          content:
            `> ❌ **Whitelist Reprovada**\n` +
            `> ════════════════════════\n` +
            `> **Jogador:** <@${userId}>\n\n` +
            `> ⚠️ Sua whitelist foi reprovada por: ${motivo}\n` +
            `> Corrija esses detalhes e envie sua WL novamente 😊`,
        });

        wl.status = "reprovado";
        wl.aprovadoPor = admin.username;
        await wl.save();

        await msg.reply(`❌ WL reprovada e motivo enviado para <@${userId}>`);
      });
    }
  } catch (err) {
    console.error("❌ Erro ao gerenciar whitelist:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "⚠️ Ocorreu um erro ao processar esta ação.", ephemeral: true });
    }
  }
}

module.exports = { setupWhitelistButton, iniciarWhitelist, gerenciarWhitelist };
