import type { Catalogue, Widen } from "../en";

export const onboarding: Widen<Catalogue["onboarding"]> = {
  title: "Bem-vindo ao Wallt",
  subtitle: "Dois passos rápidos e o seu painel ganha vida.",
  skip: "Saltar por agora",
  skipLabel: "Esconder o guia de início",
  done: "Concluído",
  stepCount: "Passo {{n}} de {{total}}",
  account: {
    title: "Crie uma conta",
    description:
      "Uma conta bancária, cartão ou carteira de dinheiro. Pode adicionar mais quando quiser.",
    action: "Criar conta",
  },
  transactions: {
    title: "Traga as suas transações",
    description: "Importe um extrato do seu banco ou adicione uma primeira transação à mão.",
    import: "Importar um ficheiro",
    add: "Adicionar manualmente",
    needAccount: "Crie primeiro uma conta.",
  },
  optional: {
    title: "Opcional: defina um orçamento",
    description: "Defina um limite de gastos e acompanhe o progresso no painel.",
    action: "Definir orçamento",
  },
};
