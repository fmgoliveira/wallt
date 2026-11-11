import type { Catalogue, Widen } from "../en";

export const common: Widen<Catalogue["common"]> = {
  shell: {
    interim: "Provisório: os dados da web ficam apenas neste navegador",
    addTransaction: "Adicionar transação",
    expandSidebar: "Expandir barra lateral",
    collapseSidebar: "Recolher barra lateral",
    mainNav: "Principal",
  },
  colorPicker: {
    colour: "Cor",
    noColour: "Sem cor",
  },
  reorder: {
    done: "Concluir",
    reorder: "Reordenar",
    doneLabel: "Concluir reordenação",
  },
  ui: {
    close: "Fechar",
    hiddenAmount: "Montante oculto",
    dragToReorder: "Arraste para reordenar",
    selectPlaceholder: "Selecionar…",
    today: "Hoje",
    yesterday: "Ontem",
    pickDate: "Escolher uma data",
    clear: "Limpar",
    previousMonth: "Mês anterior",
    nextMonth: "Mês seguinte",
    skipToContent: "Saltar para o conteúdo",
  },
  dataGate: {
    errorTitle: "Não é possível abrir os seus dados",
  },
};
