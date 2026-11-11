import type { Catalogue, Widen } from "../en";

export const notifications: Widen<Catalogue["notifications"]> = {
  off: "Desligado",
  on: "Ligado",
  bell: {
    title: "Notificações",
    label: "Notificações",
    labelUnread: "Notificações, {{count}} por ler",
    emptyTitle: "Ainda nada",
    emptyDescription:
      "Os alertas de orçamento, as contas a vencer e as transações por rever aparecem aqui.",
    close: "Fechar",
    subtitle: "{{type}} · {{when}}",
    subtitleNew: "{{type}} · {{when}} · nova",
  },
  type: {
    budget: "Orçamento",
    bill: "Conta",
    review: "Revisão",
  },
  settings: {
    title: "Notificações",
    hintSystem: "Mostradas neste dispositivo e listadas no sino. Nunca incluem valores.",
    hintWeb: "Listadas no sino, no topo de cada página.",
    permissionDenied:
      "Permita as notificações da Wallt nas definições do sistema para receber alertas.",
    budgetTitle: "Alertas de orçamento",
    budgetHint: "Quando um orçamento atinge 80% e 100%.",
    billTitle: "Contas a vencer",
    billHint: "Alguns dias antes de um item recorrente vencer.",
    reviewTitle: "Lembretes de revisão",
    reviewHint: "Uma vez por dia enquanto houver transações por rever.",
  },
};
