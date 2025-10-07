const mongoose = require("mongoose");

const WhitelistSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  respostas: [
    {
      pergunta: String,
      resposta: String,
    },
  ],
  status: { type: String, enum: ["pendente", "aprovado", "reprovado"], default: "pendente" },
  aprovadoPor: { type: String, default: null },
  motivoReprovacao: { type: String, default: null },
  data: { type: Date, default: Date.now },
  canalLog: { type: String, default: null },
});

module.exports = mongoose.model("Whitelist", WhitelistSchema);
