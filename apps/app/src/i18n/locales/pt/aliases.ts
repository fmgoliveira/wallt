import type { Catalogue, Widen } from "../en";

export const aliases: Widen<Catalogue["aliases"]> = {
  page: {
    title: "Nomes de beneficiários",
    subtitle: "Transforme o texto confuso do banco em beneficiários limpos",
  },
  form: {
    editTitle: "Editar nome do beneficiário",
    newTitle: "Novo nome de beneficiário",
    pattern: "Quando a descrição corresponde a",
    patternExample: "ex.: pingo\\s*doce",
    patternRequired: "Introduza texto ou um padrão",
    regexHint:
      "Não distingue maiúsculas de minúsculas. Caracteres como . * + ( ) [ ] têm um significado especial nos padrões.",
    textHint:
      "Não é um padrão válido, por isso corresponde a este texto exato em qualquer parte da descrição.",
    payee: "Mostrar o beneficiário como",
    payeeExample: "ex.: Pingo Doce",
    payeeRequired: "O nome do beneficiário é obrigatório",
    typePattern: "Escreva um padrão para ver o que abrange.",
    matches_one: "Corresponde a {{count}} transação",
    matches_other: "Corresponde a {{count}} transações",
    wouldRename: "{{n}} seriam renomeadas ao aplicá-lo às transações existentes.",
    updated: "Nome do beneficiário atualizado",
    added: "Nome do beneficiário adicionado",
    deleted: "Nome do beneficiário eliminado",
    couldNotSave: "Não foi possível guardar",
    couldNotDelete: "Não foi possível eliminar",
    saveChanges: "Guardar alterações",
    add: "Adicionar",
    delete: "Eliminar",
    cancel: "Cancelar",
  },
  manager: {
    emptyTitle: "Ainda sem nomes de beneficiários",
    emptyDescription:
      "Os bancos escrevem a mesma loja de muitas formas. Ensine o Wallt que “PINGO DOCE LISBOA 4521” é apenas “Pingo Doce”, e todas as importações usarão o nome limpo.",
    addPayeeName: "Adicionar nome de beneficiário",
    listHeader: "A primeira correspondência vence, a mais antiga primeiro",
    applyExisting: "Aplicar às transações existentes",
    renamed_one: "{{count}} transação renomeada",
    renamed_other: "{{count}} transações renomeadas",
    wentWrong: "Algo correu mal",
    note: "As importações também removem números de cartão, datas e referências longas das descrições antes de tudo isto. As regras veem então o beneficiário limpo.",
  },
};
