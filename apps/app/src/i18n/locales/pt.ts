import type { Catalogue } from "./en";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export const pt: Widen<Catalogue> = {
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
};
