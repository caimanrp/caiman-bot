const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const Whitelist = require("./models/WhitelistSchema");

const perguntas = [
  {
    titulo: "Nome do personagem",
    descricao: "Nome e sobrenome do seu personagem no RP (este também será o seu usuário para fazer login no servidor)",
  },
  {
    titulo: "Idade do personagem",
    descricao: "Quantos anos seu personagem tem? A idade dele deve ser coerente com a história que se passa no servidor.",
  },
  {
    titulo: "Senha de acesso ao servidor",
    descricao: "Essa será sua senha para fazer login no servidor.",
  },
  {
    titulo: "História do personagem",
    descricao: "Conte a história do seu personagem. Seja coerente com a lore do servidor.",
  },
  {
    titulo: "Steam ID",
    descricao: "Informe seu SteamID (exemplo: 76561198012345678).",
  },
  {
    titulo: "Discord Nick",
    descricao: "Seu nick no Discord, exatamente como aparece e sem '@'.",
  },
  {
    titulo: "Como você conheceu nosso servidor?",
    descricao: "Pesquisando na internet, convite de um amigo, etc.",
  },
];

// === MENSAGENS PADRÃO ===
function formatarAprovada(discordId, nomePersonagem) {
  return (
    `> ✅ **Whitelist Aprovada**  \n` +
    `> ════════════════════════  \n` +
    `> **Jogador:** <@${discordId}>  \n` +
    `> **Personagem:** *${nomePersonagem}*  \n` +
    `> ════════════════════════  \n` +
    `> 🎉 Parabéns! Sua whitelist foi aprovada.  \n` +
    `> Este é apenas o início do seu fim...`
  );
}

function formatarReprovada(discordId, motivo) {
  return (
    `> ❌ **Whitelist Reprovada**  \n` +
    `> ════════════════════════  \n` +
    `> **Jogador:** <@${discordId}>  \n` +
    `> ⚠️ Sua whitelist foi reprovada por: ${motivo}  \n` +
    `> Corrija esses detalhes e envie sua WL novamente 😊`
  );
}

// === CONFIG ===
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const WL_REVIEW_CHANNEL_ID = process.env.WL_REVIEW_CHANNEL_ID;
const WL_APPROVED_CHANNEL_ID = process.env.WL_APPROVED_CHANNEL_ID;
const WL_REJECTED_CHANNEL_ID = process.env.WL_REJECTED_CHANNEL_ID;

// === INICIALIZA O BOTÃO NO CANAL DE INÍCIO ===
async function setupWhitelistButton(client) {
  const startChannel = await client.channels.fetch(process.env.WL_START_CHANNEL_ID);
  if (!startChannel) return console.error("❌ Canal de início de whitelist não encontrado.");

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("📝 Sistema de Whitelist")
    .setDescription(
      "Clique no botão abaixo para iniciar sua whitelist.\nUm canal privado será criado para você responder as perguntas."
    )
    .setFooter({ text: "Caiman RP — Project Zomboid" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("iniciar_wl").setLabel("Iniciar Whitelist").setStyle(ButtonStyle.Primary)
  );

  await startChannel.send({ embeds: [embed], components: [row] });
}

// === COLETA DAS RESPOSTAS ===
async function iniciarWhitelist(interaction, client) {
  const guild = interaction.guild;
  const membro = interaction.user;

  // Cria canal privado
  const canal = await guild.channels.create({
    name: `wl-${membro.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: membro.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel],
      },
    ],
  });

  await interaction.reply({ content: "📩 Seu canal de whitelist foi criado!", ephemeral: true });

  const respostas = [];

  for (let i = 0; i < perguntas.length; i++) {
    const p = perguntas[i];
    const perguntaEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📜 Pergunta ${i + 1}/${perguntas.length}`)
      .setDescription(`**${p.titulo}**\n${p.descricao}`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`proxima_${i}`).setLabel("Próxima").setStyle(ButtonStyle.Success).setDisabled(true)
    );

    const msg = await canal.send({ embeds: [perguntaEmbed], components: [row] });

    const coletor = await canal.awaitMessages({
      filter: (m) => m.author.id === membro.id,
      max: 1,
      time: 300000,
    });

    if (!coletor.size) {
      await canal.send("⏰ Tempo esgotado. Reinicie sua whitelist quando estiver pronto.");
      return canal.delete();
    }

    const resposta = coletor.first().content;
    respostas.push({ pergunta: p.titulo, resposta });

    await msg.edit({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`proxima_${i}`).setLabel("Respondido ✅").setStyle(ButtonStyle.Success).setDisabled(true)
        ),
      ],
    });
  }

  // Envia confirmação
  await canal.send("✅ Whitelist enviada com sucesso. Aguarde análise da equipe.");

  // === ENVIA AO CANAL DE STAFF ===
  const reviewChannel = await client.channels.fetch(WL_REVIEW_CHANNEL_ID);
  const arquivoTxt = path.join(__dirname, `WL-${respostas[0].resposta}-${Date.now()}.txt`);

  const conteudo = respostas
    .map((r) => `Pergunta: ${r.pergunta}\nResposta: ${r.resposta}`)
    .join("\n\n");

  fs.writeFileSync(arquivoTxt, conteudo);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("📜 Nova Whitelist Recebida")
    .setDescription(respostas.map((r) => `**${r.pergunta}:** ${r.resposta}`).join("\n\n"))
    .setFooter({ text: `Enviado por ${membro.username} • ${new Date().toLocaleString()}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`aprovar_${membro.id}`).setLabel("Aprovar WL").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reprovar_${membro.id}`).setLabel("Reprovar WL").setStyle(ButtonStyle.Danger)
  );

  await reviewChannel.send({
    embeds: [embed],
    files: [arquivoTxt],
    components: [row],
  });

  fs.unlinkSync(arquivoTxt);

  // Salva no MongoDB
  await Whitelist.create({
    userId: membro.id,
    userName: respostas[0].resposta,
    respostas,
    status: "pendente",
    canalLog: reviewChannel.id,
  });

  setTimeout(() => canal.delete().catch(() => {}), 3000);
}

// === GERENCIA APROVAÇÃO / REPROVAÇÃO ===
async function gerenciarWhitelist(interaction, client) {
  const [acao, userId] = interaction.customId.split("_");
  const wl = await Whitelist.findOne({ userId });

  if (!wl) return interaction.reply({ content: "❌ WL não encontrada.", ephemeral: true });

  const membro = await client.users.fetch(userId);
  const nomePersonagem = wl.respostas.find((r) => r.pergunta === "Nome do personagem")?.resposta || "Desconhecido";
  const senhaServidor = wl.respostas.find((r) => r.pergunta === "Senha de acesso ao servidor")?.resposta || "sem_senha";

  if (acao === "aprovar") {
    await interaction.reply({ content: "✅ WL aprovada!", ephemeral: true });
    const canalAprovados = await client.channels.fetch(WL_APPROVED_CHANNEL_ID);
    await canalAprovados.send(formatarAprovada(userId, nomePersonagem));
    await interaction.channel.send(`/rcon adduser nick:${nomePersonagem} senha:${senhaServidor}`);

    wl.status = "aprovado";
    wl.aprovadoPor = interaction.user.username;
    await wl.save();
  }

  if (acao === "reprovar") {
    await interaction.reply({ content: "✏️ Digite o motivo da reprovação:", ephemeral: true });

    const coletor = interaction.channel.createMessageCollector({
      filter: (m) => m.author.id === interaction.user.id,
      max: 1,
      time: 180000,
    });

    coletor.on("collect", async (msg) => {
      const motivo = msg.content;
      const canalReprovados = await client.channels.fetch(WL_REJECTED_CHANNEL_ID);
      await canalReprovados.send(formatarReprovada(userId, motivo));

      wl.status = "reprovado";
      wl.aprovadoPor = interaction.user.username;
      wl.motivoReprovacao = motivo;
      await wl.save();

      await interaction.followUp({ content: "❌ WL reprovada com motivo registrado.", ephemeral: true });
    });
  }
}

module.exports = { setupWhitelistButton, iniciarWhitelist, gerenciarWhitelist };
