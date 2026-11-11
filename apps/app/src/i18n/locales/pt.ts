import type { Catalogue } from "./en";
import { accounts } from "./pt/accounts";
import { aliases } from "./pt/aliases";
import { budgets } from "./pt/budgets";
import { categories } from "./pt/categories";
import { common } from "./pt/common";
import { dashboard } from "./pt/dashboard";
import { goals } from "./pt/goals";
import { importing } from "./pt/importing";
import { notifications } from "./pt/notifications";
import { recurring } from "./pt/recurring";
import { reports } from "./pt/reports";
import { review } from "./pt/review";
import { rules } from "./pt/rules";
import { security } from "./pt/security";
import { sync } from "./pt/sync";
import { transactions } from "./pt/transactions";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export const pt: Catalogue = {
  nav: {
    dashboard: "Painel",
    transactions: "Transações",
    transactionsShort: "Atividade",
    accounts: "Contas",
    budgets: "Orçamentos",
    recurring: "Recorrentes",
    goals: "Metas e dívidas",
    goalsShort: "Metas",
    reports: "Relatórios",
    import: "Importar",
    settings: "Definições",
    more: "Mais",
  },
  settings: {
    title: "Definições",
    subtitle: "Idioma, segurança, categorias, regras; tema, moeda e cópias de segurança mais tarde",
    categories: "Categorias",
    categoriesHint: "Nomes, ícones, cores e ordem",
    rules: "Regras",
    rulesHint: "Categorizar transações automaticamente",
    payeeNames: "Nomes de beneficiários",
    payeeNamesHint: "Limpar a forma como lojas e pessoas são nomeadas",
    importFormats: "Formatos de importação",
    importFormatsHint: "Como é lido o ficheiro exportado de cada banco",
  },
  language: {
    title: "Idioma",
    hint: "Aplica-se a menus e mensagens. Os nomes que escreveu (contas, categorias) não são traduzidos.",
    system: "Dispositivo",
    en: "English",
    pt: "Português",
  },
  transactions,
  importing,
  review,
  rules,
  aliases,
  dashboard,
  reports,
  budgets,
  accounts,
  categories,
  goals,
  recurring,
  security,
  notifications,
  sync,
  common,
};
